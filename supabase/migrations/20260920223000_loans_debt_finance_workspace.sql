-- Loans & Debt: opening balances, external authorized NTE deductions,
-- document evidence, and designated Finance approval.
set local lock_timeout='5s';
set local statement_timeout='60s';

alter table public.payroll_debts drop constraint if exists payroll_debts_debt_kind_check;
alter table public.payroll_debts add constraint payroll_debts_debt_kind_check
  check(debt_kind in('existing_loan','previous_debt','external_nte_deduction','nte_deduction'));
alter table public.payroll_debts drop constraint if exists payroll_debts_status_check;
alter table public.payroll_debts add constraint payroll_debts_status_check
  check(status in('Draft','Pending Approval','Pending Finance approval','Returned for correction','Rejected','Approved','Active','Paused','Completed','Paid or closed','Cancelled'));
alter table public.payroll_debts
 add column if not exists record_number text unique default ('LD-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
 add column if not exists amount_already_paid numeric(20,2) not null default 0 check(amount_already_paid>=0),
 add column if not exists installments_paid integer not null default 0 check(installments_paid>=0),
 add column if not exists deduction_basis text not null default 'remaining_cutoffs' check(deduction_basis in('fixed_per_cutoff','fixed_per_month','remaining_cutoffs','remaining_months')),
 add column if not exists signed_on date,
 add column if not exists notes text,
 add column if not exists finance_reviewer_id uuid references public.hris_users(id),
 add column if not exists submitted_by uuid references public.hris_users(id),
 add column if not exists submitted_at timestamptz,
 add column if not exists approval_comments text,
 add column if not exists returned_reason text;

update public.payroll_debts set amount_already_paid=greatest(original_amount-opening_balance,0) where amount_already_paid=0;

create table public.payroll_debt_documents(
 id uuid primary key default gen_random_uuid(), debt_id uuid not null references public.payroll_debts(id),
 source_type text not null check(source_type in('Upload','Link')), storage_path text, file_name text,
 document_title text, secure_url text, link_provider text, signed_on date,
 status text not null check(status in('Missing','Uploaded','Link added','Needs review','Accepted','Rejected','Link unavailable')),
 is_primary boolean not null default false, added_by uuid not null references public.hris_users(id), added_at timestamptz not null default clock_timestamp(),
 reviewed_by uuid references public.hris_users(id), reviewed_at timestamptz, review_result text, approval_comments text,
 check((source_type='Upload' and storage_path is not null and file_name is not null and secure_url is null) or
       (source_type='Link' and secure_url is not null and document_title is not null and storage_path is null))
);
create unique index payroll_debt_primary_document on public.payroll_debt_documents(debt_id) where is_primary;
create index payroll_debt_documents_record on public.payroll_debt_documents(debt_id,added_at desc);
alter table public.payroll_debt_documents enable row level security;
revoke all on public.payroll_debt_documents from public,anon,authenticated;

create or replace function private.payroll_debt_designated_finance() returns uuid language plpgsql stable security definer set search_path='' as $$
declare reviewer uuid; matches integer;begin
 select count(*),min(h.id) into matches,reviewer from public.hris_users h
 where h.employee_id='TNG-067' and lower(h.status)='active' and h.auth_user_id is not null
 and private.workflow_user_has_role(h.id,'Finance Staff');
 if matches<>1 then raise exception 'Finance routing is unavailable. Configure Lenny Rose Casas · Finance before submitting this record.';end if;
 return reviewer;
end$$;

create or replace function private.payroll_debt_is_designated_finance() returns boolean language plpgsql stable security definer set search_path='' as $$
begin return public.current_hris_user_id()=private.payroll_debt_designated_finance();exception when others then return false;end$$;

create or replace function private.payroll_debt_creator(p_scope uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.payroll_debt_manager(p_scope) or (
   (private.workflow_user_has_role(public.current_hris_user_id(),'Manager') or private.workflow_user_has_role(public.current_hris_user_id(),'Business Unit Manager'))
   and exists(select 1 from public.payroll_access_scopes s join public.hris_users h on h.id=public.current_hris_user_id()
              where s.id=p_scope and s.kind='business_unit' and s.business_unit_id=h.business_unit_id)
 )
$$;

create or replace function private.payroll_debt_rebuild_schedule(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.payroll_debts;remaining numeric;regular numeric;amount numeric;i integer;paydate date;posted_count integer;planned integer;begin
 select * into strict d from public.payroll_debts where id=p_id for update;
 select count(*) into posted_count from public.payroll_debt_schedule where debt_id=p_id and status='Posted';
 delete from public.payroll_debt_schedule where debt_id=p_id and status<>'Posted';
 remaining:=case when posted_count=0 then d.opening_balance else d.current_balance end;
 if d.deduction_basis='fixed_per_cutoff' then regular:=d.installment;planned:=ceil(remaining/regular)::int;
 elsif d.deduction_basis='fixed_per_month' then regular:=round(d.installment/2,2);planned:=ceil(remaining/regular)::int;
 else planned:=d.cutoff_count;regular:=round(remaining/planned,2);end if;
 planned:=greatest(1,least(planned,240));
 for i in 1..planned loop
  paydate:=private.payroll_debt_paydate(d.first_deduction_date,i-1);amount:=case when i=planned then remaining else least(regular,remaining) end;remaining:=greatest(round(remaining-amount,2),0);
  insert into public.payroll_debt_schedule(debt_id,sequence_no,payroll_date,scheduled_amount,balance_after) values(d.id,posted_count+i,paydate,amount,remaining);
 end loop;
 update public.payroll_debts set cutoff_count=planned,installment=regular,expected_final_date=private.payroll_debt_paydate(first_deduction_date,planned-1),updated_at=clock_timestamp() where id=d.id;
end$$;

create or replace function private.payroll_debt_view(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d public.payroll_debts; own boolean;begin
 select * into d from public.payroll_debts where id=p_id;own:=d.employee_id=public.current_hris_user_id();
 if d.id is null or not(private.payroll_debt_creator(d.scope_id) or private.payroll_debt_oversight_view(d.scope_id) or private.payroll_debt_is_designated_finance() or (own and d.status in('Active','Paused','Completed','Paid or closed'))) then raise exception 'Loan details are outside your authorized scope.' using errcode='42501';end if;
 return to_jsonb(d)||jsonb_build_object(
  'employeeName',(select full_name from public.hris_users where id=d.employee_id),'employeeCode',(select employee_id from public.hris_users where id=d.employee_id),
  'businessUnit',(select name from public.payroll_access_scopes where id=d.scope_id),'financeReviewer','Lenny Rose Casas · Finance',
  'totalPaid',d.original_amount-d.current_balance,'remainingCutoffs',(select count(*) from public.payroll_debt_schedule where debt_id=d.id and status='Scheduled' and scheduled_amount>0),
  'nextDeductionDate',(select min(payroll_date) from public.payroll_debt_schedule where debt_id=d.id and status='Scheduled' and scheduled_amount>0),
  'schedule',(select coalesce(jsonb_agg(to_jsonb(s) order by sequence_no),'[]') from public.payroll_debt_schedule s where debt_id=d.id),
  'documents',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('addedBy',a.full_name,'reviewer',r.full_name) order by x.added_at desc),'[]') from public.payroll_debt_documents x join public.hris_users a on a.id=x.added_by left join public.hris_users r on r.id=x.reviewed_by where x.debt_id=d.id),
  'audit',(select coalesce(jsonb_agg(jsonb_build_object('action',a.action,'reason',a.reason,'before',a.before_value,'after',a.after_value,'at',a.occurred_at,'actor',h.full_name) order by a.occurred_at desc),'[]') from public.payroll_debt_audit a join public.hris_users h on h.id=a.actor_id where a.debt_id=d.id));
end$$;

create or replace function public.get_payroll_debt_context(p_scope uuid default null,p_payroll_date date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare own uuid:=public.current_hris_user_id();manager boolean;oversight boolean;finance boolean;reviewer uuid;route_error text;begin
 if own is null then raise exception 'Active HRIS login required.' using errcode='42501';end if;
 begin reviewer:=private.payroll_debt_designated_finance();exception when others then route_error:=sqlerrm;end;
 manager:=p_scope is not null and private.payroll_debt_creator(p_scope);oversight:=p_scope is not null and private.payroll_debt_oversight_view(p_scope);finance:=own=reviewer;
 if p_scope is null or not(manager or oversight or finance) then return jsonb_build_object('canManage',false,'canApprove',false,'canViewScope',false,'financeReviewer','Lenny Rose Casas · Finance','routingError',route_error,'scopes','[]','employees','[]','debts',(select coalesce(jsonb_agg(private.payroll_debt_view(d.id) order by d.created_at desc),'[]') from public.payroll_debts d where d.employee_id=own and d.status in('Active','Paused','Completed','Paid or closed')));end if;
 return jsonb_build_object('canManage',manager,'canApprove',finance,'canViewScope',true,'financeReviewer','Lenny Rose Casas · Finance','routingError',route_error,
  'scopes',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name),'[]') from public.payroll_access_scopes s where s.kind='business_unit' and (private.payroll_debt_creator(s.id) or private.payroll_debt_oversight_view(s.id) or finance)),
  'employees',case when manager then (select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.full_name,'code',h.employee_id) order by h.full_name),'[]') from public.hris_users h join public.payroll_access_scopes s on s.business_unit_id=h.business_unit_id and s.id=p_scope where lower(h.status)='active' and not coalesce(h.is_duplicate,false) and private.payroll_package_permission(h.id,p_scope,'view')) else '[]' end,
  'debts',(select coalesce(jsonb_agg(private.payroll_debt_view(d.id) order by d.created_at desc),'[]') from public.payroll_debts d where d.scope_id=p_scope),
  'payrollDate',p_payroll_date,'locked',case when p_payroll_date is null then false else private.payroll_debt_locked(p_scope,p_payroll_date) end);
end$$;

create function public.create_payroll_debt_record(p_id uuid,p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare employee uuid:=(p_payload->>'employeeId')::uuid;scope uuid:=private.payroll_employee_bu_scope(employee);actor uuid:=public.current_hris_user_id();kind text:=p_payload->>'kind';orig numeric;opening numeric;paid numeric;installment numeric;basis text:=p_payload->>'deductionBasis';term integer:=coalesce((p_payload->>'term')::integer,0);cutoffs integer;first_date date:=(p_payload->>'firstDate')::date;issued date:=(p_payload->>'issuedOn')::date;begin
 if p_id is null or not private.payroll_debt_creator(scope) or not private.payroll_package_permission(employee,scope,'view') or employee=actor then raise exception 'Scoped HR or authorized Manager access is required; own-debt entry is prohibited.' using errcode='42501';end if;
 if kind not in('existing_loan','previous_debt','external_nte_deduction') then raise exception 'Choose Loan, Debt, or authorized NTE deduction.';end if;
 orig:=private.payroll_net_money(jsonb_build_object('amount',p_payload->>'originalAmount'),'amount');opening:=private.payroll_net_money(jsonb_build_object('amount',p_payload->>'openingBalance'),'amount');paid:=private.payroll_net_money(jsonb_build_object('amount',coalesce(p_payload->>'amountPaid','0')),'amount');installment:=private.payroll_net_money(jsonb_build_object('amount',p_payload->>'installment'),'amount');
 if opening<=0 or opening>orig or abs((orig-opening)-paid)>.01 then raise exception 'Current balance plus amount already paid must equal the original amount.';end if;
 if basis not in('fixed_per_cutoff','fixed_per_month','remaining_cutoffs','remaining_months') or installment<=0 then raise exception 'Choose a repayment method and valid deduction amount.';end if;
 if basis like 'remaining_%' and term not between 1 and 120 then raise exception 'Enter a valid number of remaining cutoffs or months.';end if;
 cutoffs:=case when basis='remaining_months' then term*2 when basis='remaining_cutoffs' then term else ceil(opening/case when basis='fixed_per_month' then installment/2 else installment end)::int end;
 if first_date is null or extract(day from first_date) not in(5,20) then raise exception 'Select a standard payroll cycle released on the 5th or 20th.';end if;
 if kind='external_nte_deduction' and length(btrim(coalesce(p_payload->>'authorityReference','')))<3 then raise exception 'A signed authority-to-deduct reference is required.';end if;
 insert into public.payroll_debts(id,scope_id,employee_id,debt_kind,debt_source,original_amount,opening_balance,current_balance,issued_on,repayment_method,term_count,cutoff_count,installment,first_deduction_date,expected_final_date,authority_reference,status,created_by,updated_by,amount_already_paid,installments_paid,deduction_basis,signed_on,notes)
 values(p_id,scope,employee,kind,btrim(p_payload->>'source'),orig,opening,opening,issued,case when basis like '%month%' then 'months' else 'cutoffs' end,greatest(term,1),greatest(cutoffs,1),installment,first_date,first_date,nullif(btrim(p_payload->>'authorityReference'),''),'Draft',actor,actor,paid,coalesce((p_payload->>'installmentsPaid')::integer,0),basis,(p_payload->>'signedOn')::date,nullif(btrim(p_payload->>'notes'),''));
 perform private.payroll_debt_rebuild_schedule(p_id);
 insert into public.payroll_debt_audit(debt_id,action,actor_id,reason,after_value) values(p_id,'Created draft',actor,case when kind='external_nte_deduction' then 'NTE record unavailable — signed authority to deduct provided' else 'Existing balance recorded' end,(select to_jsonb(d) from public.payroll_debts d where d.id=p_id));return p_id;
end$$;

create or replace function public.attach_payroll_debt_document(p_id uuid,p_path text,p_name text) returns void language plpgsql security definer set search_path='' as $$
declare d public.payroll_debts;actor uuid:=public.current_hris_user_id();begin select * into strict d from public.payroll_debts where id=p_id for update;if not private.payroll_debt_creator(d.scope_id) then raise exception 'Not authorized.' using errcode='42501';end if;
 if p_path not like p_id::text||'/%' or length(btrim(p_name))<1 then raise exception 'Invalid secured document path.';end if;
 update public.payroll_debt_documents set is_primary=false where debt_id=p_id;
 insert into public.payroll_debt_documents(debt_id,source_type,storage_path,file_name,signed_on,status,is_primary,added_by) values(p_id,'Upload',p_path,btrim(p_name),d.signed_on,'Uploaded',true,actor);
 update public.payroll_debts set document_path=p_path,document_name=p_name,updated_by=actor,updated_at=clock_timestamp() where id=p_id;
 insert into public.payroll_debt_audit(debt_id,action,actor_id,reason,after_value) values(p_id,'Supporting document uploaded',actor,'Supporting authority document uploaded',jsonb_build_object('fileName',p_name,'sourceType','Upload'));
end$$;

create function public.add_payroll_debt_document_link(p_id uuid,p_title text,p_url text,p_provider text,p_signed_on date,p_primary boolean default true) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.payroll_debts;actor uuid:=public.current_hris_user_id();new_id uuid;begin select * into strict d from public.payroll_debts where id=p_id for update;if not private.payroll_debt_creator(d.scope_id) then raise exception 'Not authorized.' using errcode='42501';end if;
 if p_url !~* '^https://' or length(btrim(p_title))<2 or p_provider not in('Google Drive','SharePoint','Dropbox','Other approved secure storage') then raise exception 'Provide an HTTPS link from an approved secure document source.';end if;
 if p_primary then update public.payroll_debt_documents set is_primary=false where debt_id=p_id;end if;
 insert into public.payroll_debt_documents(debt_id,source_type,document_title,secure_url,link_provider,signed_on,status,is_primary,added_by) values(p_id,'Link',btrim(p_title),btrim(p_url),p_provider,p_signed_on,'Link added',p_primary,actor) returning id into new_id;
 insert into public.payroll_debt_audit(debt_id,action,actor_id,reason,after_value) values(p_id,'Supporting document link added',actor,'Secure authority document link added',jsonb_build_object('documentId',new_id,'title',p_title,'provider',p_provider));return new_id;
end$$;

create function public.review_payroll_debt_document(p_document uuid,p_status text,p_comments text) returns void language plpgsql security definer set search_path='' as $$
declare x public.payroll_debt_documents;d public.payroll_debts;actor uuid:=public.current_hris_user_id();begin select * into strict x from public.payroll_debt_documents where id=p_document for update;select * into strict d from public.payroll_debts where id=x.debt_id;
 if not private.payroll_debt_is_designated_finance() then raise exception 'Only Lenny Rose Casas · Finance may review supporting evidence.' using errcode='42501';end if;
 if p_status not in('Accepted','Rejected','Link unavailable','Needs review') or length(btrim(coalesce(p_comments,'')))<3 then raise exception 'Choose a document review result and enter comments.';end if;
 update public.payroll_debt_documents set status=p_status,reviewed_by=actor,reviewed_at=clock_timestamp(),review_result=p_status,approval_comments=btrim(p_comments) where id=p_document;
 insert into public.payroll_debt_audit(debt_id,action,actor_id,reason,after_value) values(d.id,'Document '||lower(p_status),actor,btrim(p_comments),jsonb_build_object('documentId',x.id,'status',p_status));
end$$;

create or replace function public.act_on_payroll_debt(p_id uuid,p_action text,p_reason text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.payroll_debts;before jsonb;actor uuid:=public.current_hris_user_id();reviewer uuid;begin
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'A reason is required for every loan action.';end if;perform pg_advisory_xact_lock(hashtextextended('payroll-debt:'||p_id,0));select * into strict d from public.payroll_debts where id=p_id for update;before:=to_jsonb(d);
 if p_action='submit' then
  if not private.payroll_debt_creator(d.scope_id) or d.status not in('Draft','Returned for correction') then raise exception 'Only an editable draft or returned record can be submitted.' using errcode='42501';end if;
  reviewer:=private.payroll_debt_designated_finance();
  if length(btrim(coalesce(d.authority_reference,'')))<3 or not exists(select 1 from public.payroll_debt_documents x where x.debt_id=d.id and x.status not in('Missing','Rejected','Link unavailable')) then raise exception 'Authority reference and an uploaded document or accessible document link are required before submission.';end if;
  update public.payroll_debts set status='Pending Finance approval',finance_reviewer_id=reviewer,submitted_by=actor,submitted_at=clock_timestamp(),returned_reason=null,updated_by=actor,updated_at=clock_timestamp() where id=p_id;
 elsif p_action='approve' then
  if d.status<>'Pending Finance approval' or not private.payroll_debt_is_designated_finance() or d.created_by=actor then raise exception 'Only Lenny Rose Casas · Finance can independently approve this submission.' using errcode='42501';end if;
  if not exists(select 1 from public.payroll_debt_documents x where x.debt_id=d.id and x.status='Accepted') then raise exception 'Finance approval is blocked until at least one authority document is accepted.';end if;
  update public.payroll_debts set status='Active',approved_by=actor,approved_at=clock_timestamp(),approval_comments=btrim(p_reason),updated_by=actor,updated_at=clock_timestamp() where id=p_id;
  insert into public.payroll_loan_ledger(employee_id,scope_id,account_ref,as_of,balance,installment,previous_id,source_ref,authorized_by) select employee_id,scope_id,'DEBT-'||id,first_deduction_date,current_balance,least(installment,current_balance),(select id from public.payroll_loan_ledger where employee_id=d.employee_id and account_ref='DEBT-'||d.id order by revision desc limit 1),authority_reference,actor from public.payroll_debts where id=p_id;
 elsif p_action in('return','request_document') then
  if d.status<>'Pending Finance approval' or not private.payroll_debt_is_designated_finance() then raise exception 'Only the designated Finance reviewer may return this record.' using errcode='42501';end if;
  update public.payroll_debts set status='Returned for correction',returned_reason=btrim(p_reason),approval_comments=btrim(p_reason),updated_by=actor,updated_at=clock_timestamp() where id=p_id;
 elsif p_action='reject' then
  if d.status<>'Pending Finance approval' or not private.payroll_debt_is_designated_finance() then raise exception 'Only the designated Finance reviewer may reject this record.' using errcode='42501';end if;
  update public.payroll_debts set status='Rejected',approval_comments=btrim(p_reason),updated_by=actor,updated_at=clock_timestamp() where id=p_id;
 elsif p_action='mark_paid' then
  if not private.payroll_debt_creator(d.scope_id) or d.status not in('Active','Paused') then raise exception 'Only an active record can be closed.';end if;
  update public.payroll_debts set current_balance=0,status='Paid or closed',updated_by=actor,updated_at=clock_timestamp() where id=p_id;
 else raise exception 'Unsupported loan workflow action.';end if;
 insert into public.payroll_debt_audit(debt_id,action,actor_id,reason,before_value,after_value) values(p_id,replace(initcap(p_action),'_',' '),actor,btrim(p_reason),before,(select to_jsonb(x) from public.payroll_debts x where x.id=p_id));
 return private.payroll_debt_view(p_id);
end$$;

do $$begin
 perform set_config('app.rbac_role_update','allowed',true);
 insert into public.role_permissions(role_id,resource_id,permissions,updated_at)
 select r.id,'Loans',array(select distinct x from unnest(coalesce(rp.permissions,'{}'::text[])||array['view','create']::text[]) x order by x),clock_timestamp()
 from public.roles r left join public.role_permissions rp on rp.role_id=r.id and rp.resource_id='Loans'
 where r.id in('Manager','Business Unit Manager') and r.is_active
 on conflict(role_id,resource_id) do update set permissions=excluded.permissions,updated_at=excluded.updated_at;
end$$;

create policy payroll_debt_document_upload_insert on storage.objects for insert to authenticated with check(bucket_id='payroll-debt-documents' and exists(select 1 from public.payroll_debts d where d.id=(storage.foldername(name))[1]::uuid and private.payroll_debt_creator(d.scope_id)));

revoke all on function private.payroll_debt_designated_finance(),private.payroll_debt_is_designated_finance(),private.payroll_debt_creator(uuid) from public,anon,authenticated;
revoke all on function public.create_payroll_debt_record(uuid,jsonb),public.add_payroll_debt_document_link(uuid,text,text,text,date,boolean),public.review_payroll_debt_document(uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_payroll_debt_record(uuid,jsonb),public.add_payroll_debt_document_link(uuid,text,text,text,date,boolean),public.review_payroll_debt_document(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
