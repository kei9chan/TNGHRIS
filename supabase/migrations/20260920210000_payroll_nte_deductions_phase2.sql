-- Phase 2: NTE-related payroll deductions only. Service-charge functionality is intentionally excluded.
set local lock_timeout='5s';
set local statement_timeout='60s';

alter table public.payroll_debts drop constraint payroll_debts_debt_kind_check;
alter table public.payroll_debts add constraint payroll_debts_debt_kind_check check(debt_kind in('existing_loan','nte_deduction'));
alter table public.payroll_debts add column resolution_id uuid references public.resolutions(id),
 add column workflow_status text,
 add column current_atd_version integer;
create unique index payroll_debts_nte_resolution_unique on public.payroll_debts(resolution_id) where resolution_id is not null;
alter table public.payroll_debts add constraint payroll_debts_nte_shape check(
 (debt_kind='existing_loan' and resolution_id is null and workflow_status is null and current_atd_version is null)
 or (debt_kind='nte_deduction' and resolution_id is not null and workflow_status in(
  'Decision Issued — ATD Pending','ATD Generated — Awaiting Employee Signature','Signed — Awaiting HR Verification',
  'HR Verified — Awaiting Finance Approval','Approved for Payroll','Blocked','Rejected','Completed') and current_atd_version is not null));

create table public.payroll_nte_atd_versions (
 id uuid primary key default gen_random_uuid(), debt_id uuid not null references public.payroll_debts(id),
 resolution_id uuid not null references public.resolutions(id), nte_id uuid not null references public.ntes(id),
 incident_report_id uuid not null references public.incident_reports(id), employee_id uuid not null references public.hris_users(id),
 scope_id uuid not null references public.payroll_access_scopes(id), version_no integer not null check(version_no>0),
 status text not null check(status in('Awaiting Employee Signature','Signed — Awaiting HR Verification','HR Verified — Awaiting Finance Approval','Approved for Payroll','Blocked','Rejected','Invalidated','Completed')),
 terms jsonb not null, generated_by uuid not null references public.hris_users(id), generated_at timestamptz not null default clock_timestamp(),
 generated_document_path text, generated_document_name text,
 signature_method text check(signature_method in('digital','upload')), employee_signature text,
 signed_document_path text, signed_document_name text, employee_signed_by uuid references public.hris_users(id), employee_signed_at timestamptz,
 hr_verified_by uuid references public.hris_users(id), hr_verified_at timestamptz, hr_verification_reason text,
 finance_approved_by uuid references public.hris_users(id), finance_approved_at timestamptz, finance_approval_reason text,
 invalidated_by uuid references public.hris_users(id), invalidated_at timestamptz, invalidation_reason text,
 rejected_by uuid references public.hris_users(id), rejected_at timestamptz, rejection_reason text,
 unique(debt_id,version_no), unique(resolution_id,version_no),
 check((employee_signed_at is null)=(employee_signed_by is null)),
 check(employee_signed_at is null or employee_signature is not null or signed_document_path is not null),
 check((hr_verified_at is null)=(hr_verified_by is null)),
 check((finance_approved_at is null)=(finance_approved_by is null))
);
create index payroll_nte_atd_scope_status on public.payroll_nte_atd_versions(scope_id,status);
create index payroll_nte_atd_employee on public.payroll_nte_atd_versions(employee_id,generated_at desc);

create table public.payroll_nte_deduction_audit (
 id bigint generated always as identity primary key, debt_id uuid not null references public.payroll_debts(id),
 resolution_id uuid not null references public.resolutions(id), nte_id uuid not null references public.ntes(id),
 incident_report_id uuid not null references public.incident_reports(id), employee_id uuid not null references public.hris_users(id),
 atd_version integer, action text not null, actor_id uuid not null references public.hris_users(id), actor_role text not null,
 previous_schedule jsonb, new_schedule jsonb, previous_amount numeric(20,2), new_amount numeric(20,2),
 signature_status text, hr_verification_status text, finance_approval_status text, payroll_cutoff date,
 reason text not null check(length(btrim(reason)) between 3 and 1000), occurred_at timestamptz not null default clock_timestamp()
);
create index payroll_nte_audit_history on public.payroll_nte_deduction_audit(debt_id,occurred_at desc);

alter table public.payroll_nte_atd_versions enable row level security;
alter table public.payroll_nte_deduction_audit enable row level security;
revoke all on public.payroll_nte_atd_versions,public.payroll_nte_deduction_audit from public,anon,authenticated;
create trigger payroll_nte_audit_immutable before update or delete on public.payroll_nte_deduction_audit for each row execute function private.payroll_audit_immutable();

create function private.payroll_nte_role() returns text language sql stable security definer set search_path='' as $$
 select case when private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff') then 'Finance Staff'
  when private.workflow_user_has_role(public.current_hris_user_id(),'HR Manager') then 'HR Manager'
  when private.workflow_user_has_role(public.current_hris_user_id(),'HR Staff') then 'HR Staff'
  else 'Employee' end
$$;
create function private.payroll_nte_hr(p_scope uuid) returns boolean language sql stable security definer set search_path='' as $$
 select (private.workflow_user_has_role(public.current_hris_user_id(),'HR Staff') or private.workflow_user_has_role(public.current_hris_user_id(),'HR Manager'))
 and (private.payroll_has_access('review_endorse',p_scope) or private.payroll_has_access('authorize_hr',p_scope))
$$;
create function private.payroll_nte_finance(p_scope uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff') and private.payroll_has_access('authorize_finance',p_scope)
$$;
create function private.payroll_nte_status(p_debt uuid) returns text language sql stable security definer set search_path='' as $$
 select case when d.current_balance=0 then 'Completed' else d.workflow_status end from public.payroll_debts d where d.id=p_debt
$$;
create function private.payroll_nte_audit(p_debt uuid,p_action text,p_reason text,p_before jsonb default null,p_after jsonb default null,p_cutoff date default null) returns void language plpgsql security definer set search_path='' as $$
declare d public.payroll_debts;v public.payroll_nte_atd_versions;r public.resolutions;begin
 select * into strict d from public.payroll_debts where id=p_debt;select * into strict r from public.resolutions where id=d.resolution_id;
 select * into v from public.payroll_nte_atd_versions where debt_id=d.id and version_no=d.current_atd_version;
 insert into public.payroll_nte_deduction_audit(debt_id,resolution_id,nte_id,incident_report_id,employee_id,atd_version,action,actor_id,actor_role,
 previous_schedule,new_schedule,previous_amount,new_amount,signature_status,hr_verification_status,finance_approval_status,payroll_cutoff,reason)
 values(d.id,r.id,r.nte_id,r.incident_report_id,d.employee_id,d.current_atd_version,p_action,public.current_hris_user_id(),private.payroll_nte_role(),
 p_before,p_after,case when p_before is null then null else nullif(coalesce(p_before->>'amount',p_before->>'total'),'')::numeric end,case when p_after is null then null else nullif(coalesce(p_after->>'amount',p_after->>'total'),'')::numeric end,
 case when v.employee_signed_at is null then 'Pending' else 'Signed' end,case when v.hr_verified_at is null then 'Pending' else 'Verified' end,
 case when v.finance_approved_at is null then 'Pending' else 'Approved' end,p_cutoff,btrim(p_reason));
 perform private.nte_event(r.nte_id,'NTE payroll deduction: '||p_action,jsonb_build_object('resolutionId',r.id,'atdVersion',d.current_atd_version,'payrollCutoff',p_cutoff,'reason',p_reason));
end$$;

create function private.payroll_nte_view(p_debt uuid,p_redacted boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d public.payroll_debts;r public.resolutions;n public.ntes;v public.payroll_nte_atd_versions;result jsonb;begin
 select * into strict d from public.payroll_debts where id=p_debt and debt_kind='nte_deduction';select * into strict r from public.resolutions where id=d.resolution_id;
 select * into strict n from public.ntes where id=r.nte_id;select * into strict v from public.payroll_nte_atd_versions where debt_id=d.id and version_no=d.current_atd_version;
 result:=jsonb_build_object('id',d.id,'resolutionId',r.id,'nteId',n.id,'incidentReportId',r.incident_report_id,'nteNumber',n.nte_number,
  'employeeId',d.employee_id,'employeeName',n.recipient_name_snapshot,'workflowStatus',private.payroll_nte_status(d.id),'atdVersion',v.version_no,
  'canViewSensitive',not p_redacted,'authorityStatus',v.status,'generatedAt',v.generated_at,'employeeSignedAt',v.employee_signed_at,
  'hrVerifiedAt',v.hr_verified_at,'financeApprovedAt',v.finance_approved_at,'generatedDocumentPath',v.generated_document_path,
  'generatedDocumentName',v.generated_document_name,'signedDocumentPath',case when p_redacted then null else v.signed_document_path end,
  'signedDocumentName',case when p_redacted then null else v.signed_document_name end);
 if p_redacted then return result;end if;
 return result||jsonb_build_object('approvedAmount',d.original_amount,'currentBalance',d.current_balance,'thisPayrollDeduction',
  (select scheduled_amount from public.payroll_debt_schedule where debt_id=d.id and status='Scheduled' order by payroll_date limit 1),
  'repaymentMethod',d.repayment_method,'termCount',d.term_count,'cutoffCount',d.cutoff_count,'installment',d.installment,
  'firstDeductionDate',d.first_deduction_date,'expectedFinalDate',d.expected_final_date,
  'finalInstallment',(select scheduled_amount from public.payroll_debt_schedule where debt_id=d.id order by sequence_no desc limit 1),
  'remainingCutoffs',(select count(*) from public.payroll_debt_schedule where debt_id=d.id and status='Scheduled' and scheduled_amount>0),
  'reason',r.details,'approvedBasis',r.review_fields->>'legalBasis','terms',v.terms,
  'schedule',(select coalesce(jsonb_agg(to_jsonb(s) order by sequence_no),'[]') from public.payroll_debt_schedule s where s.debt_id=d.id),
  'audit',(select coalesce(jsonb_agg(jsonb_build_object('action',a.action,'reason',a.reason,'actor',h.full_name,'role',a.actor_role,'at',a.occurred_at,
   'version',a.atd_version,'previousSchedule',a.previous_schedule,'newSchedule',a.new_schedule,'payrollCutoff',a.payroll_cutoff) order by a.occurred_at desc),'[]')
   from public.payroll_nte_deduction_audit a join public.hris_users h on h.id=a.actor_id where a.debt_id=d.id));
end$$;

create function public.get_nte_deduction_context(p_nte_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n public.ntes;r public.resolutions;d public.payroll_debts;scope uuid;actor uuid:=public.current_hris_user_id();own boolean;sensitive boolean;begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501';end if;
 select * into strict n from public.ntes where id=p_nte_id;select * into r from public.resolutions where nte_id=n.id;
 own:=actor=n.recipient_employee_id;scope:=private.payroll_employee_bu_scope(n.recipient_employee_id);
 sensitive:=own or private.payroll_nte_hr(scope) or private.payroll_nte_finance(scope);
 if not sensitive and not private.can_view_nte(n.id) then raise exception 'NTE deduction is outside your authorized scope.' using errcode='42501';end if;
 select * into d from public.payroll_debts where resolution_id=r.id and debt_kind='nte_deduction';
 return jsonb_build_object('nteId',n.id,'resolutionId',r.id,'employeeId',n.recipient_employee_id,'employeeName',n.recipient_name_snapshot,'nteNumber',n.nte_number,
  'incidentReportId',n.incident_report_id,'nodAcknowledged',r.employee_acknowledged_at is not null,'resolutionType',r.resolution_type,
  'workflowStatus',case when d.id is null then case when r.resolution_type='Salary Deduction' and r.employee_acknowledged_at is not null then 'Decision Issued — ATD Pending' else 'Blocked' end else private.payroll_nte_status(d.id) end,
  'canViewSensitive',sensitive,'isEmployee',own,'canGenerate',private.payroll_nte_finance(scope),
  'canHrVerify',private.payroll_nte_hr(scope) and not exists(select 1 from public.payroll_nte_atd_versions v where v.debt_id=d.id and v.version_no=d.current_atd_version and v.generated_by=actor),
  'canFinanceApprove',private.payroll_nte_finance(scope) and not exists(select 1 from public.payroll_nte_atd_versions v where v.debt_id=d.id and v.version_no=d.current_atd_version and actor in(v.generated_by,v.hr_verified_by)),
  'debt',case when d.id is null then null else private.payroll_nte_view(d.id,not sensitive) end);
end$$;

create function public.generate_nte_authority_to_deduct(p_nte_id uuid,p_method text,p_term integer,p_first date,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.ntes;r public.resolutions;d public.payroll_debts;oldv public.payroll_nte_atd_versions;scope uuid;actor uuid:=public.current_hris_user_id();amount numeric;cutoffs integer;version integer;snapshot jsonb;v_debt_id uuid;begin
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'A reason is required.';end if;
 perform pg_advisory_xact_lock(hashtextextended('nte-atd:'||p_nte_id,0));select * into strict n from public.ntes where id=p_nte_id for update;
 select * into strict r from public.resolutions where nte_id=n.id for update;scope:=private.payroll_employee_bu_scope(r.employee_id);
 if not private.payroll_nte_finance(scope) or actor=r.employee_id then raise exception 'Scoped Finance authorization is required.' using errcode='42501';end if;
 if r.resolution_type<>'Salary Deduction' or r.status<>'Acknowledged' or r.employee_acknowledged_at is null then raise exception 'An authorized and employee-acknowledged Notice of Decision is required before generating an ATD.';end if;
 if coalesce(r.review_fields->>'total','') !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'The approved NOD deduction amount is invalid.';end if;
 amount:=(r.review_fields->>'total')::numeric;if amount<=0 then raise exception 'The approved deduction must be above zero.';end if;
 if p_method not in('months','cutoffs') or p_term not between 1 and 120 then raise exception 'Choose months or payroll cutoffs and a valid term.';end if;
 if p_first is null or p_first<(r.review_fields->>'effectiveDate')::date then raise exception 'First deduction date must be on or after the approved effectivity.';end if;
 cutoffs:=case when p_method='months' then p_term*2 else p_term end;
 select * into d from public.payroll_debts where resolution_id=r.id for update;
 if d.id is null then
  v_debt_id:=gen_random_uuid();version:=1;
  insert into public.payroll_debts(id,scope_id,employee_id,debt_kind,resolution_id,debt_source,original_amount,opening_balance,current_balance,issued_on,repayment_method,term_count,cutoff_count,installment,first_deduction_date,expected_final_date,authority_reference,status,workflow_status,current_atd_version,created_by,updated_by)
  values(v_debt_id,scope,r.employee_id,'nte_deduction',r.id,'NTE '||coalesce(n.nte_number,n.id::text),amount,amount,amount,(r.decision_date at time zone 'Asia/Manila')::date,p_method,p_term,cutoffs,round(amount/cutoffs,2),p_first,private.payroll_debt_paydate(p_first,cutoffs-1),'ATD-'||coalesce(n.nte_number,n.id::text)||'-V1','Draft','ATD Generated — Awaiting Employee Signature',1,actor,actor);
 else
  v_debt_id:=d.id;if d.status='Completed' or exists(select 1 from public.payroll_debt_postings where debt_id=d.id) then raise exception 'Posted or completed NTE deductions cannot be rewritten; create a linked future adjustment.';end if;
  if exists(select 1 from public.payroll_debt_schedule where debt_id=d.id and private.payroll_debt_locked(d.scope_id,payroll_date)) then raise exception 'Locked payroll cannot be silently changed.';end if;
  select * into oldv from public.payroll_nte_atd_versions where debt_id=d.id and version_no=d.current_atd_version for update;
  update public.payroll_nte_atd_versions set status='Invalidated',invalidated_by=actor,invalidated_at=clock_timestamp(),invalidation_reason=p_reason where id=oldv.id;
  version:=d.current_atd_version+1;
  update public.payroll_debts set original_amount=amount,opening_balance=amount,current_balance=amount,repayment_method=p_method,term_count=p_term,cutoff_count=cutoffs,installment=round(amount/cutoffs,2),first_deduction_date=p_first,expected_final_date=private.payroll_debt_paydate(p_first,cutoffs-1),authority_reference='ATD-'||coalesce(n.nte_number,n.id::text)||'-V'||version,status='Draft',workflow_status='ATD Generated — Awaiting Employee Signature',current_atd_version=version,schedule_version=schedule_version+1,approved_by=null,approved_at=null,updated_by=actor,updated_at=clock_timestamp() where id=d.id;
 end if;
 perform private.payroll_debt_rebuild_schedule(v_debt_id);
 snapshot:=jsonb_build_object('employee',n.recipient_name_snapshot,'employeeId',r.employee_id,'nteNumber',n.nte_number,'incidentReportId',n.incident_report_id,
  'reason',r.details,'approvedBasis',r.review_fields->>'legalBasis','total',amount,'method',p_method,'term',p_term,'cutoffs',cutoffs,
  'perCutoff',(select installment from public.payroll_debts where id=v_debt_id),'firstDate',p_first,'finalDate',private.payroll_debt_paydate(p_first,cutoffs-1),
  'finalInstallment',(select scheduled_amount from public.payroll_debt_schedule s where s.debt_id=v_debt_id order by s.sequence_no desc limit 1),'version',version);
 insert into public.payroll_nte_atd_versions(debt_id,resolution_id,nte_id,incident_report_id,employee_id,scope_id,version_no,status,terms,generated_by)
 values(v_debt_id,r.id,n.id,n.incident_report_id,r.employee_id,scope,version,'Awaiting Employee Signature',snapshot,actor);
 update private.nte_implementation set atd=snapshot||jsonb_build_object('reference',(select authority_reference from public.payroll_debts where id=v_debt_id),'employeeName',n.recipient_name_snapshot,'employeeNumber',(select employee_id from public.hris_users where id=r.employee_id),'legalBasis',r.review_fields->>'legalBasis','installments',cutoffs),
  employee_signed_at=null,employee_signature=null,hr_verified_at=null,hr_verified_by=null,finance_approved_at=null,finance_approved_by=null,status='ATD Generated — Awaiting Employee Signature' where resolution_id=r.id;
 update public.ntes set response_stage='ATD Generated — Awaiting Employee Signature' where id=n.id;
 perform private.payroll_nte_audit(v_debt_id,case when version=1 then 'Authority to Deduct generated' else 'Authority to Deduct revised' end,p_reason,to_jsonb(oldv.terms),snapshot,null);
 perform private.nte_notify(n.id,'Authority to Deduct ready for signature','Review the separate Authority to Deduct. NOD acknowledgment is not consent. No payroll deduction begins until you sign and HR and Finance approve.',v_debt_id||':atd-v'||version);
 return private.payroll_nte_view(v_debt_id,false);
end$$;

create function public.attach_nte_atd_document(p_nte_id uuid,p_kind text,p_path text,p_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.ntes;r public.resolutions;d public.payroll_debts;v public.payroll_nte_atd_versions;actor uuid:=public.current_hris_user_id();begin
 select * into strict n from public.ntes where id=p_nte_id;select * into strict r from public.resolutions where nte_id=n.id;select * into strict d from public.payroll_debts where resolution_id=r.id;select * into strict v from public.payroll_nte_atd_versions where debt_id=d.id and version_no=d.current_atd_version for update;
 if p_path not like d.id::text||'/'||v.version_no||'/%' or length(btrim(coalesce(p_name,'')))<1 then raise exception 'Invalid secured ATD document path.';end if;
 if p_kind='generated' then
  if not private.payroll_nte_finance(d.scope_id) or v.status<>'Awaiting Employee Signature' then raise exception 'Only scoped Finance may attach the generated current ATD.' using errcode='42501';end if;
  update public.payroll_nte_atd_versions set generated_document_path=p_path,generated_document_name=p_name where id=v.id;
 elsif p_kind='signed' then
  if actor<>d.employee_id or v.status<>'Awaiting Employee Signature' or v.generated_document_path is null then raise exception 'Only the employee may upload the signed current generated ATD.' using errcode='42501';end if;
  update public.payroll_nte_atd_versions set signed_document_path=p_path,signed_document_name=p_name,signature_method='upload',employee_signed_by=actor,employee_signed_at=clock_timestamp(),status='Signed — Awaiting HR Verification' where id=v.id;
  update public.payroll_debts set workflow_status='Signed — Awaiting HR Verification',updated_by=actor,updated_at=clock_timestamp() where id=d.id;
  update private.nte_implementation set employee_signed_at=clock_timestamp(),employee_signature='uploaded:'||p_path,status='Signed — Awaiting HR Verification' where resolution_id=r.id;
  update public.ntes set response_stage='Signed — Awaiting HR Verification' where id=n.id;
  perform private.payroll_nte_audit(d.id,'Signed ATD uploaded','Employee uploaded the signed Authority to Deduct',null,v.terms,null);
 else raise exception 'Unsupported ATD document type.';end if;
 return private.payroll_nte_view(d.id,false);
end$$;

create function public.act_on_nte_deduction(p_nte_id uuid,p_action text,p_reason text default null,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.ntes;r public.resolutions;d public.payroll_debts;v public.payroll_nte_atd_versions;actor uuid:=public.current_hris_user_id();cutoff date;begin
 perform pg_advisory_xact_lock(hashtextextended('nte-deduction-action:'||p_nte_id,0));select * into strict n from public.ntes where id=p_nte_id;select * into strict r from public.resolutions where nte_id=n.id;select * into strict d from public.payroll_debts where resolution_id=r.id for update;select * into strict v from public.payroll_nte_atd_versions where debt_id=d.id and version_no=d.current_atd_version for update;
 if p_action='digital_sign' then
  if actor<>d.employee_id or v.status<>'Awaiting Employee Signature' or v.generated_document_path is null or p_payload->>'consent'<>'I authorize the stated deduction' or coalesce(p_payload->>'signature','') !~ '^data:image/png;base64,' or length(p_payload->>'signature')>1000000 then raise exception 'Only the employee may separately authorize and sign the current generated ATD.' using errcode='42501';end if;
  update public.payroll_nte_atd_versions set signature_method='digital',employee_signature=p_payload->>'signature',employee_signed_by=actor,employee_signed_at=clock_timestamp(),status='Signed — Awaiting HR Verification' where id=v.id;
  update public.payroll_debts set workflow_status='Signed — Awaiting HR Verification',updated_by=actor,updated_at=clock_timestamp() where id=d.id;
  update private.nte_implementation set employee_signed_at=clock_timestamp(),employee_signature=p_payload->>'signature',status='Signed — Awaiting HR Verification' where resolution_id=r.id;
  update public.ntes set response_stage='Signed — Awaiting HR Verification' where id=n.id;
  perform private.payroll_nte_audit(d.id,'Employee signed Authority to Deduct','Employee provided separate payroll deduction consent',null,v.terms,null);
 elsif p_action='verify' then
  if not private.payroll_nte_hr(d.scope_id) or actor=d.employee_id or actor=v.generated_by or v.status<>'Signed — Awaiting HR Verification' or v.employee_signed_at is null or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Independent scoped HR verification and a reason are required.' using errcode='42501';end if;
  update public.payroll_nte_atd_versions set hr_verified_by=actor,hr_verified_at=clock_timestamp(),hr_verification_reason=btrim(p_reason),status='HR Verified — Awaiting Finance Approval' where id=v.id;
  update public.payroll_debts set workflow_status='HR Verified — Awaiting Finance Approval',updated_by=actor,updated_at=clock_timestamp() where id=d.id;
  update private.nte_implementation set hr_verified_by=actor,hr_verified_at=clock_timestamp(),status='HR Verified — Awaiting Finance Approval' where resolution_id=r.id;
  update public.ntes set response_stage='HR Verified — Awaiting Finance Approval' where id=n.id;
  perform private.payroll_nte_audit(d.id,'Signed ATD verified',p_reason,null,v.terms,null);
 elsif p_action='finance_approve' then
  if not private.payroll_nte_finance(d.scope_id) or actor=d.employee_id or actor=v.generated_by or actor=v.hr_verified_by or v.status<>'HR Verified — Awaiting Finance Approval' or v.hr_verified_at is null or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Independent scoped Finance approval and a reason are required.' using errcode='42501';end if;
  update public.payroll_nte_atd_versions set finance_approved_by=actor,finance_approved_at=clock_timestamp(),finance_approval_reason=btrim(p_reason),status='Approved for Payroll' where id=v.id;
  update public.payroll_debts set status='Active',workflow_status='Approved for Payroll',approved_by=actor,approved_at=clock_timestamp(),updated_by=actor,updated_at=clock_timestamp() where id=d.id;
  update private.nte_implementation set finance_approved_by=actor,finance_approved_at=clock_timestamp(),status='Approved for Payroll' where resolution_id=r.id;
  update public.ntes set response_stage='Approved for Payroll' where id=n.id;
  perform private.payroll_nte_audit(d.id,'Finance approved deduction',p_reason,null,v.terms,null);
 elsif p_action='request_signature' then
  if not(private.payroll_nte_hr(d.scope_id) or private.payroll_nte_finance(d.scope_id)) or actor=d.employee_id or v.status<>'Awaiting Employee Signature' then raise exception 'Scoped HR or Finance may request the employee signature.' using errcode='42501';end if;
  perform private.nte_notify(n.id,'Signature required for Authority to Deduct','Review and sign the current Authority to Deduct. No deduction enters payroll until your signature, HR verification, and Finance approval are complete.',d.id||':signature-request-v'||d.current_atd_version||':'||actor);
  perform private.payroll_nte_audit(d.id,'Employee signature requested',coalesce(nullif(btrim(p_reason),''),'Current ATD sent for employee signature'),null,v.terms,null);
 elsif p_action in('return','reject') then
  if not(private.payroll_nte_hr(d.scope_id) or private.payroll_nte_finance(d.scope_id)) or actor=d.employee_id or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Authorized HR/Finance and a reason are required.' using errcode='42501';end if;
  update public.payroll_nte_atd_versions set status=case when p_action='return' then 'Blocked' else 'Rejected' end,rejected_by=actor,rejected_at=clock_timestamp(),rejection_reason=btrim(p_reason) where id=v.id;
  update public.payroll_debts set status='Draft',workflow_status=case when p_action='return' then 'Blocked' else 'Rejected' end,approved_by=null,approved_at=null,updated_by=actor,updated_at=clock_timestamp() where id=d.id;
  update private.nte_implementation set status=case when p_action='return' then 'Blocked' else 'Rejected' end,finance_approved_at=null,finance_approved_by=null where resolution_id=r.id;
  update public.ntes set response_stage=case when p_action='return' then 'Blocked' else 'Rejected' end where id=n.id;
  perform private.payroll_nte_audit(d.id,case when p_action='return' then 'Returned for correction' else 'Deduction rejected' end,p_reason,v.terms,null,null);
 elsif p_action='exclude' then
  cutoff:=nullif(p_payload->>'payrollDate','')::date;if cutoff is null or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Payroll cutoff and exclusion reason are required.';end if;
  if not(private.payroll_nte_hr(d.scope_id) or private.payroll_nte_finance(d.scope_id)) then raise exception 'Scoped payroll access is required.' using errcode='42501';end if;
  if private.payroll_debt_locked(d.scope_id,cutoff) then raise exception 'Locked payroll cannot be silently changed. Create a linked future adjustment.';end if;
  update public.payroll_debt_schedule set status='Excluded',scheduled_amount=0,excluded_reason=btrim(p_reason) where debt_id=d.id and payroll_date=cutoff and status='Scheduled';if not found then raise exception 'A scheduled current-cutoff deduction was not found.';end if;
  perform private.payroll_nte_audit(d.id,'Excluded from payroll cutoff',p_reason,v.terms,v.terms,cutoff);
 else raise exception 'Unsupported NTE deduction action.';end if;
 return private.payroll_nte_view(d.id,false);
end$$;

create function public.get_payroll_nte_deductions(p_scope uuid,p_payroll_date date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not(private.payroll_nte_hr(p_scope) or private.payroll_nte_finance(p_scope)) then raise exception 'Scoped HR or Finance payroll access is required.' using errcode='42501';end if;
 return jsonb_build_object('items',(select coalesce(jsonb_agg(item order by sort_at desc),'[]') from (
   select private.payroll_nte_view(d.id,false) item,d.updated_at sort_at from public.payroll_debts d where d.scope_id=p_scope and d.debt_kind='nte_deduction'
   union all
   select jsonb_build_object('id','pending:'||r.id,'resolutionId',r.id,'nteId',n.id,'incidentReportId',r.incident_report_id,'nteNumber',n.nte_number,
    'employeeId',r.employee_id,'employeeName',n.recipient_name_snapshot,'workflowStatus',case when r.employee_acknowledged_at is not null then 'Decision Issued — ATD Pending' else 'Blocked' end,
    'authorityStatus','Not generated','atdVersion',0,'canViewSensitive',true,'generatedAt',null,'employeeSignedAt',null,'hrVerifiedAt',null,'financeApprovedAt',null,
    'generatedDocumentPath',null,'signedDocumentPath',null,'approvedAmount',r.review_fields->>'total','currentBalance',r.review_fields->>'total','schedule','[]'::jsonb,'audit','[]'::jsonb) item,r.updated_at sort_at
   from public.resolutions r join public.ntes n on n.id=r.nte_id where r.resolution_type='Salary Deduction' and private.payroll_employee_bu_scope(r.employee_id)=p_scope
   and not exists(select 1 from public.payroll_debts d where d.resolution_id=r.id)
  )q),
  'payrollDate',p_payroll_date,'locked',case when p_payroll_date is null then false else private.payroll_debt_locked(p_scope,p_payroll_date) end);
end$$;

create function public.get_payroll_nte_deduction_queue(p_gross_id uuid,p_pay_date date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.payroll_gross_runs;begin select * into strict g from public.payroll_gross_runs where id=p_gross_id;
 if auth.uid() is null or not private.payroll_net_can_review(g.scope_id) then raise exception 'Finance review permission for this payroll scope is required.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(private.payroll_nte_view(d.id,false)||jsonb_build_object('payrollDate',p_pay_date,'scheduledThisPayroll',coalesce(s.scheduled_amount,0),'scheduleStatus',s.status) order by d.updated_at desc)
  from public.payroll_debts d left join public.payroll_debt_schedule s on s.debt_id=d.id and s.payroll_date=p_pay_date
  where d.scope_id=g.scope_id and d.debt_kind='nte_deduction' and exists(select 1 from jsonb_array_elements(g.result->'employees') e where e->>'employeeId'=d.employee_id::text)),'[]'::jsonb);
end$$;

create or replace function private.validate_atd_deduction(p_employee uuid,p_reference text,p_amount numeric,p_pay_date date) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;d public.resolutions;i private.nte_implementation;paid numeric;debt public.payroll_debts;s public.payroll_debt_schedule;v public.payroll_nte_atd_versions;begin
 if p_reference not like 'ATD:%' then return null;end if;rid:=substring(p_reference from 5)::uuid;
 select * into d from public.resolutions where id=rid;select * into i from private.nte_implementation where resolution_id=rid for update;
 select * into debt from public.payroll_debts where resolution_id=rid and debt_kind='nte_deduction' for update;
 if d.id is null or debt.id is null or d.employee_id<>p_employee or debt.employee_id<>p_employee or d.employee_acknowledged_at is null then raise exception 'The ATD does not belong to this employee or the NOD was not acknowledged.';end if;
 select * into v from public.payroll_nte_atd_versions where debt_id=debt.id and version_no=debt.current_atd_version;
 if debt.status<>'Active' or debt.workflow_status<>'Approved for Payroll' or v.status<>'Approved for Payroll' or v.employee_signed_at is null or v.hr_verified_at is null or v.finance_approved_at is null or i.employee_signed_at is null or i.hr_verified_at is null or i.finance_approved_at is null then raise exception 'ATD requires employee signature, HR verification, and Finance approval before payroll.';end if;
 if exists(select 1 from private.nte_atd_payment_exceptions where resolution_id=rid) then raise exception 'A returned ATD payment requires HR and Finance reconciliation.';end if;
 select * into s from public.payroll_debt_schedule where debt_id=debt.id and payroll_date=p_pay_date;
 select coalesce(sum(amount),0) into paid from private.nte_atd_postings where resolution_id=rid;
 if s.id is null or s.status<>'Scheduled' or p_amount is null or p_amount<=0 or p_amount>s.scheduled_amount or p_amount>debt.current_balance or paid+p_amount>debt.original_amount or exists(select 1 from private.nte_atd_postings where resolution_id=rid and pay_date=p_pay_date) then raise exception 'ATD is unscheduled, excessive, duplicated, or already fully paid.';end if;
 return rid;
end$$;

create function private.sync_nte_debt_posting() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.payroll_debts;s public.payroll_debt_schedule;post_id uuid;actor uuid:=public.current_hris_user_id();begin
 select * into strict d from public.payroll_debts where resolution_id=new.resolution_id and debt_kind='nte_deduction' for update;
 select * into strict s from public.payroll_debt_schedule where debt_id=d.id and payroll_date=new.pay_date for update;
 insert into public.payroll_debt_postings(debt_id,schedule_id,employee_id,payroll_date,payroll_run_id,scheduled_amount,actual_amount,opening_balance,remaining_balance,posted_by)
 select d.id,s.id,d.employee_id,new.pay_date,p.run_id,s.scheduled_amount,new.amount,d.current_balance,greatest(d.current_balance-new.amount,0),actor
 from public.payroll_disbursements p where p.id=new.disbursement_id returning id into post_id;
 update public.payroll_debt_schedule set status='Posted',actual_amount=new.amount,balance_after=greatest(d.current_balance-new.amount,0),posted_at=clock_timestamp() where id=s.id;
 update public.payroll_debts set current_balance=greatest(current_balance-new.amount,0),status=case when current_balance-new.amount<=0 then 'Completed' else status end,workflow_status=case when current_balance-new.amount<=0 then 'Completed' else workflow_status end,updated_by=actor,updated_at=clock_timestamp() where id=d.id;
 if d.current_balance-new.amount<=0 then update public.payroll_nte_atd_versions set status='Completed' where debt_id=d.id and version_no=d.current_atd_version;end if;
 perform private.payroll_nte_audit(d.id,'Payroll deduction posted','Approved NTE deduction posted from finalized payroll',jsonb_build_object('amount',d.current_balance),jsonb_build_object('amount',greatest(d.current_balance-new.amount,0)),new.pay_date);
 return new;
end$$;
create trigger sync_nte_debt_posting after insert on private.nte_atd_postings for each row execute function private.sync_nte_debt_posting();

-- Existing loan/debt screens remain Phase 1 only; NTE deductions have their own protected workflow.
create or replace function private.payroll_debt_view(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d public.payroll_debts;own boolean;begin select * into d from public.payroll_debts where id=p_id and debt_kind='existing_loan';own:=d.employee_id=public.current_hris_user_id();
 if d.id is null or not(private.payroll_debt_manager(d.scope_id) or (own and d.status in('Active','Paused','Completed'))) then raise exception 'Loan details are outside your authorized scope.' using errcode='42501';end if;
 return to_jsonb(d)||jsonb_build_object('employeeName',(select full_name from public.hris_users where id=d.employee_id),'employeeCode',(select employee_id from public.hris_users where id=d.employee_id),
 'totalPaid',d.opening_balance-d.current_balance,'remainingCutoffs',(select count(*) from public.payroll_debt_schedule where debt_id=d.id and status='Scheduled' and scheduled_amount>0),
 'schedule',(select coalesce(jsonb_agg(to_jsonb(s) order by sequence_no),'[]') from public.payroll_debt_schedule s where debt_id=d.id),
 'audit',(select coalesce(jsonb_agg(jsonb_build_object('action',a.action,'reason',a.reason,'before',a.before_value,'after',a.after_value,'at',a.occurred_at,'actor',h.full_name) order by a.occurred_at desc),'[]') from public.payroll_debt_audit a join public.hris_users h on h.id=a.actor_id where a.debt_id=d.id));
end$$;
create or replace function public.get_payroll_debt_context(p_scope uuid default null,p_payroll_date date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare own uuid:=public.current_hris_user_id();begin if own is null then raise exception 'Active HRIS login required.' using errcode='42501';end if;
 if p_scope is null or not private.payroll_debt_manager(p_scope) then
  return jsonb_build_object('canManage',false,'canApprove',false,'scopes','[]'::jsonb,'employees','[]'::jsonb,'debts',(select coalesce(jsonb_agg(private.payroll_debt_view(d.id) order by d.created_at desc),'[]') from public.payroll_debts d where d.employee_id=own and d.debt_kind='existing_loan' and d.status in('Active','Paused','Completed')));
 end if;
 return jsonb_build_object('canManage',true,'canApprove',private.payroll_debt_approver(p_scope),
 'scopes',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name),'[]') from public.payroll_access_scopes s where s.kind='business_unit' and private.payroll_debt_manager(s.id)),
 'employees',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.full_name,'code',h.employee_id) order by h.full_name),'[]') from public.hris_users h join public.payroll_access_scopes s on s.business_unit_id=h.business_unit_id and s.id=p_scope where lower(h.status)='active' and not coalesce(h.is_duplicate,false) and private.payroll_package_permission(h.id,p_scope,'view')),
 'debts',(select coalesce(jsonb_agg(private.payroll_debt_view(d.id) order by d.created_at desc),'[]') from public.payroll_debts d where d.scope_id=p_scope and d.debt_kind='existing_loan'),
 'payrollDate',p_payroll_date,'locked',case when p_payroll_date is null then false else private.payroll_debt_locked(p_scope,p_payroll_date) end);
end$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('payroll-nte-atd','payroll-nte-atd',false,10485760,array['application/pdf','image/png','image/jpeg']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy payroll_nte_atd_insert on storage.objects for insert to authenticated with check(bucket_id='payroll-nte-atd' and exists(
 select 1 from public.payroll_debts d join public.payroll_nte_atd_versions v on v.debt_id=d.id and v.version_no=d.current_atd_version
 where d.id=(storage.foldername(name))[1]::uuid and (public.current_hris_user_id()=d.employee_id or private.payroll_nte_finance(d.scope_id))));
create policy payroll_nte_atd_read on storage.objects for select to authenticated using(bucket_id='payroll-nte-atd' and exists(
 select 1 from public.payroll_debts d join public.payroll_nte_atd_versions v on v.debt_id=d.id
 where d.id=(storage.foldername(name))[1]::uuid and (public.current_hris_user_id()=d.employee_id or private.payroll_nte_hr(d.scope_id) or private.payroll_nte_finance(d.scope_id))));

do $$declare sig text;begin foreach sig in array array[
 'private.payroll_nte_role()','private.payroll_nte_hr(uuid)','private.payroll_nte_finance(uuid)','private.payroll_nte_status(uuid)',
 'private.payroll_nte_audit(uuid,text,text,jsonb,jsonb,date)','private.payroll_nte_view(uuid,boolean)','private.sync_nte_debt_posting()'] loop
 execute format('revoke all on function %s from public,anon,authenticated',sig);end loop;end$$;
revoke all on function public.get_nte_deduction_context(uuid),public.generate_nte_authority_to_deduct(uuid,text,integer,date,text),public.attach_nte_atd_document(uuid,text,text,text),public.act_on_nte_deduction(uuid,text,text,jsonb),public.get_payroll_nte_deductions(uuid,date),public.get_payroll_nte_deduction_queue(uuid,date) from public,anon,authenticated;
grant execute on function public.get_nte_deduction_context(uuid),public.generate_nte_authority_to_deduct(uuid,text,integer,date,text),public.attach_nte_atd_document(uuid,text,text,text),public.act_on_nte_deduction(uuid,text,text,jsonb),public.get_payroll_nte_deductions(uuid,date),public.get_payroll_nte_deduction_queue(uuid,date) to authenticated;
notify pgrst,'reload schema';
