-- Additive payroll self service. Released monetary snapshots and existing policies stay immutable.
create table public.payroll_payslip_identity (
 payslip_id uuid primary key references public.payroll_released_payslips(id), employee_number text, business_unit text,
 captured_at timestamptz not null default clock_timestamp()
);
create function private.capture_payslip_identity() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.payroll_payslip_identity(payslip_id,employee_number,business_unit)
 select new.id,h.employee_id,h.business_unit from public.hris_users h where h.id=new.employee_id;return new;
end $$;
create trigger capture_self_service_identity after insert on public.payroll_released_payslips for each row execute function private.capture_payslip_identity();
create table public.payroll_employee_issues (
 id uuid primary key default gen_random_uuid(),payslip_id uuid not null references public.payroll_released_payslips(id),
 employee_id uuid not null references public.hris_users(id),run_id uuid not null references public.payroll_approval_runs(id),
 category text not null check(category in('Missing overtime','Incorrect working hours','Incorrect leave deduction','Incorrect allowance','Incorrect salary or rate','Unexpected deduction','Missing payment','Other payroll issue')),
 item_key text not null,item_label text not null,affected_date date,explanation text not null check(length(trim(explanation)) between 3 and 2000),
 expected_correction text check(length(expected_correction)<=1000),submitted_at timestamptz not null default clock_timestamp(),
 request_id uuid not null unique
);
create table public.payroll_issue_events (
 id uuid primary key default gen_random_uuid(),issue_id uuid not null references public.payroll_employee_issues(id),revision integer not null,
 status text not null check(status in('Submitted','HR Review','Finance Verification','Needs Information','Resolved','Rejected')),
 return_to text,public_response text not null default '',internal_note text not null default '',
 actor_id uuid not null references public.hris_users(id),occurred_at timestamptz not null default clock_timestamp(),unique(issue_id,revision)
);
create table public.payroll_issue_attachments (
 id uuid primary key default gen_random_uuid(),issue_id uuid not null references public.payroll_employee_issues(id),
 object_path text not null unique,file_name text not null,uploaded_by uuid not null references public.hris_users(id),uploaded_at timestamptz not null default clock_timestamp()
);
create table public.payroll_issue_adjustments (
 id uuid primary key default gen_random_uuid(),issue_id uuid not null references public.payroll_employee_issues(id),
 description text not null,created_by uuid not null references public.hris_users(id),created_at timestamptz not null default clock_timestamp()
);
create table public.payroll_issue_corrections (
 issue_id uuid primary key references public.payroll_employee_issues(id),adjustment_id uuid not null references public.payroll_issue_adjustments(id),
 corrected_payslip_id uuid not null references public.payroll_released_payslips(id),
 correction_kind text not null check(correction_kind in('adjustment','revised')),linked_by uuid not null references public.hris_users(id),linked_at timestamptz not null default clock_timestamp()
);
create index payroll_issue_owner on public.payroll_employee_issues(employee_id,submitted_at desc);
create index payroll_issue_slip on public.payroll_employee_issues(payslip_id);
create index payroll_issue_run on public.payroll_employee_issues(run_id);
create index payroll_issue_attachment_issue on public.payroll_issue_attachments(issue_id);
create index payroll_issue_adjustment_issue on public.payroll_issue_adjustments(issue_id);
do $$declare t text;begin foreach t in array array['payroll_payslip_identity','payroll_employee_issues','payroll_issue_events','payroll_issue_attachments','payroll_issue_adjustments','payroll_issue_corrections'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('create trigger immutable before update or delete on public.%I for each row execute function private.payroll_audit_immutable()',t);
end loop;end $$;

-- All new reads/writes pass through bounded authenticated RPCs, following existing payroll access helpers.
create function private.payroll_issue_role(p_slip uuid,p_role text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.payroll_actor_id() is not null and s.employee_id<>public.current_hris_user_id()
 and private.payroll_package_permission(s.employee_id,r.scope_id,'view') and private.payroll_gross_permission(r.scope_id,'view') and
 case p_role when 'hr' then (private.workflow_user_has_role(public.current_hris_user_id(),'HR Staff') or private.workflow_user_has_role(public.current_hris_user_id(),'HR Manager'))
 and (private.payroll_has_access('review_endorse',r.scope_id) or private.payroll_has_access('authorize_hr',r.scope_id))
 when 'finance' then private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff') and
 (private.payroll_has_access('prepare_pr',r.scope_id) or private.payroll_has_access('authorize_finance',r.scope_id)) else false end,false)
 from public.payroll_released_payslips s join public.payroll_approval_runs r on r.id=s.run_id where s.id=p_slip
$$;
create function private.payroll_issue_can_read(p_issue uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.payroll_actor_id() is not null and (i.employee_id=public.current_hris_user_id() or private.payroll_issue_role(i.payslip_id,'hr') or private.payroll_issue_role(i.payslip_id,'finance')),false) from public.payroll_employee_issues i where i.id=p_issue
$$;
create function private.payroll_payslip_items(p jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_array(jsonb_build_object('key','whole','label','Whole payslip'),jsonb_build_object('key','tax','label','Withholding tax'),jsonb_build_object('key','payment','label','Payment')) ||
 coalesce((select jsonb_agg(jsonb_build_object('key',a.k||':'||(x.n-1),'label',coalesce(x.v->>'label','Loan · '||(x.v->>'account'))))
 from (values('lines'),('contributions'),('loans'),('otherDeductions')) a(k)
 cross join lateral jsonb_array_elements(coalesce(nullif(p->a.k,'null'),'[]')) with ordinality x(v,n)
 where a.k<>'contributions' or x.v->>'label' like '%EE'),'[]')
$$;
create function private.payroll_self_service_slip(p_id uuid,p_review boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.payroll_released_payslips;r public.payroll_approval_runs;p jsonb;meta public.payroll_payslip_identity;
begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS login required' using errcode='42501';end if;
 select * into s from public.payroll_released_payslips where id=p_id;
 if s.id is null or not (s.employee_id=public.current_hris_user_id() or (p_review and (coalesce(private.payroll_issue_role(p_id,'hr'),false) or coalesce(private.payroll_issue_role(p_id,'finance'),false)))) then raise exception 'Payslip unavailable' using errcode='42501';end if;
 select * into r from public.payroll_approval_runs where id=s.run_id;select * into meta from public.payroll_payslip_identity where payslip_id=s.id;
 p:=s.payload;
 if s.employee_id=public.current_hris_user_id() then p:=public.get_my_payroll_payslip(p_id);end if;
 return p||jsonb_build_object('id',s.id,'runId',s.run_id,'releasedAt',s.released_at,'employeeNumber',meta.employee_number,'businessUnit',meta.business_unit,
 'version',r.source_snapshot->>'version','payrollStatus','Released','items',private.payroll_payslip_items(s.payload),
 'correctionKind',(select correction_kind from public.payroll_issue_corrections where corrected_payslip_id=s.id limit 1),
 'originalPayslipId',(select i.payslip_id from public.payroll_issue_corrections c join public.payroll_employee_issues i on i.id=c.issue_id where c.corrected_payslip_id=s.id limit 1));
end $$;
create function public.get_payroll_self_service_payslip(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$select private.payroll_self_service_slip(p_id,false)$$;
create function public.list_payroll_self_service_payslips() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS login required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(private.payroll_self_service_slip(s.id,false) order by s.payload->>'to' desc,s.released_at desc),'[]') from public.payroll_released_payslips s where employee_id=public.current_hris_user_id());end $$;
create function public.submit_payroll_issue(p_slip uuid,p_category text,p_item text,p_date date,p_explanation text,p_expected text,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.payroll_released_payslips;v jsonb;k jsonb;i uuid;begin
 v:=private.payroll_self_service_slip(p_slip,false);select * into s from public.payroll_released_payslips where id=p_slip;
 if p_request is null then raise exception 'Request ID required';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-issue:'||p_request,0));
 select id into i from public.payroll_employee_issues where request_id=p_request and employee_id=public.current_hris_user_id() and payslip_id=p_slip;
 if i is not null then return i;end if;
 select value into k from jsonb_array_elements(v->'items') where value->>'key'=p_item;
 if k is null then raise exception 'Select an item from this payslip';end if;
 if p_date is not null and (p_date<(s.payload->>'from')::date or p_date>(s.payload->>'to')::date) then raise exception 'Affected date must fall in the pay period';end if;
 insert into public.payroll_employee_issues(payslip_id,employee_id,run_id,category,item_key,item_label,affected_date,explanation,expected_correction,request_id)
 values(s.id,s.employee_id,s.run_id,p_category,p_item,k->>'label',p_date,trim(p_explanation),nullif(trim(p_expected),''),p_request) returning id into i;
 insert into public.payroll_issue_events(issue_id,revision,status,actor_id) values(i,1,'Submitted',public.current_hris_user_id());return i;end $$;
create function public.get_payroll_issue(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare i public.payroll_employee_issues;v jsonb;own boolean;begin
 if not coalesce(private.payroll_issue_can_read(p_id),false) then raise exception 'Payroll issue unavailable' using errcode='42501';end if;
 select * into i from public.payroll_employee_issues where id=p_id;own:=i.employee_id=public.current_hris_user_id();
 select to_jsonb(e) into v from public.payroll_issue_events e where issue_id=i.id order by revision desc limit 1;
 return to_jsonb(i)||jsonb_build_object('status',v->>'status','revision',v->'revision','own',own,'canHR',coalesce(private.payroll_issue_role(i.payslip_id,'hr'),false),'canFinance',coalesce(private.payroll_issue_role(i.payslip_id,'finance'),false),
 'payslip',private.payroll_self_service_slip(i.payslip_id,true),'events',(select coalesce(jsonb_agg(case when own then to_jsonb(e)-'internal_note' else to_jsonb(e) end order by revision),'[]') from public.payroll_issue_events e where issue_id=i.id),
 'attachments',(select coalesce(jsonb_agg(to_jsonb(a) order by uploaded_at),'[]') from public.payroll_issue_attachments a where issue_id=i.id),
 'adjustments',(select coalesce(jsonb_agg(to_jsonb(a) order by created_at),'[]') from public.payroll_issue_adjustments a where issue_id=i.id),
 'correction',(select to_jsonb(c)||jsonb_build_object('approvals',(select jsonb_agg(jsonb_build_object('stage',private.payroll_approval_stage(a.step),'approvedBy',a.actor_id,'approvedAt',a.occurred_at)) from public.payroll_approval_actions a join public.payroll_released_payslips s on s.run_id=a.run_id where s.id=c.corrected_payslip_id and a.action='approve')) from public.payroll_issue_corrections c where issue_id=i.id));end $$;
create function public.list_payroll_issues(p_review boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS login required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'category',i.category,'submittedAt',i.submitted_at,'employeeName',s.payload->>'employeeName','from',s.payload->>'from','to',s.payload->>'to','status',(select status from public.payroll_issue_events where issue_id=i.id order by revision desc limit 1)) order by i.submitted_at desc),'[]')
 from public.payroll_employee_issues i join public.payroll_released_payslips s on s.id=i.payslip_id
 where case when p_review then coalesce(private.payroll_issue_role(s.id,'hr'),false) or coalesce(private.payroll_issue_role(s.id,'finance'),false) else i.employee_id=public.current_hris_user_id() end);end $$;
create function public.payroll_issue_review_available() returns boolean language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and exists(select 1 from public.payroll_access_scopes s where private.payroll_gross_permission(s.id,'view') and
 (((private.workflow_user_has_role(public.current_hris_user_id(),'HR Staff') or private.workflow_user_has_role(public.current_hris_user_id(),'HR Manager')) and (private.payroll_has_access('review_endorse',s.id) or private.payroll_has_access('authorize_hr',s.id))) or
 (private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff') and (private.payroll_has_access('prepare_pr',s.id) or private.payroll_has_access('authorize_finance',s.id)))))
$$;
create function public.act_payroll_issue(p_id uuid,p_revision int,p_action text,p_response text,p_internal text default '') returns void language plpgsql security definer set search_path='' as $$
declare i public.payroll_employee_issues;e public.payroll_issue_events;next_status text;resume text;own boolean;hr boolean;fin boolean;begin
 if not coalesce(private.payroll_issue_can_read(p_id),false) then raise exception 'Payroll issue unavailable' using errcode='42501';end if;
 select * into i from public.payroll_employee_issues where id=p_id for update;
 select * into e from public.payroll_issue_events where issue_id=p_id order by revision desc limit 1;
 if e.revision is distinct from p_revision then raise exception 'Issue changed. Refresh before continuing.' using errcode='40001';end if;
 own:=i.employee_id=public.current_hris_user_id();hr:=coalesce(private.payroll_issue_role(i.payslip_id,'hr'),false);fin:=coalesce(private.payroll_issue_role(i.payslip_id,'finance'),false);
 next_status:=e.status;resume:=e.return_to;
 if own then
 if p_action<>'reply' or e.status<>'Needs Information' or coalesce(p_internal,'')<>'' then raise exception 'Only requested supporting information may be submitted' using errcode='42501';end if;next_status:=e.return_to;
 elsif p_action='note' and (hr or fin) then null;
 elsif p_action='HR Review' and e.status='Submitted' and hr then next_status:=p_action;
 elsif p_action='Finance Verification' and e.status='HR Review' and hr then next_status:=p_action;
 elsif p_action='Needs Information' and ((e.status='HR Review' and hr) or (e.status='Finance Verification' and fin)) then next_status:=p_action;resume:=e.status;
 elsif p_action in('Resolved','Rejected') and e.status='Finance Verification' and fin then
 if p_action='Resolved' and exists(select 1 from public.payroll_issue_adjustments where issue_id=i.id) and not exists(select 1 from public.payroll_issue_corrections where issue_id=i.id) then raise exception 'Link the separately authorized and released correction before resolving';end if;next_status:=p_action;
 else raise exception 'Action outside current review stage or payroll scope' using errcode='42501';end if;
 if length(trim(coalesce(p_response,''))) not between 3 and 2000 and not (p_action='note' and length(trim(coalesce(p_internal,''))) between 3 and 2000) then raise exception 'Add a response or internal note';end if;
 if length(coalesce(p_internal,''))>2000 then raise exception 'Internal note too long';end if;
 insert into public.payroll_issue_events(issue_id,revision,status,return_to,public_response,internal_note,actor_id)
 values(i.id,e.revision+1,next_status,resume,trim(coalesce(p_response,'')),trim(coalesce(p_internal,'')),public.current_hris_user_id());end $$;
create function public.prepare_payroll_issue_adjustment(p_id uuid,p_description text) returns uuid language plpgsql security definer set search_path='' as $$declare i public.payroll_employee_issues;a uuid;begin
 select * into i from public.payroll_employee_issues where id=p_id for update;
 if not coalesce(private.payroll_issue_role(i.payslip_id,'finance'),false) then raise exception 'Scoped Finance required' using errcode='42501';end if;
 if (select status from public.payroll_issue_events where issue_id=i.id order by revision desc limit 1)<>'Finance Verification' or length(trim(p_description)) not between 3 and 2000 then raise exception 'Finance verification and correction description required';end if;
 insert into public.payroll_issue_adjustments(issue_id,description,created_by) values(i.id,trim(p_description),public.current_hris_user_id()) returning id into a;return a;end $$;
create function public.link_payroll_issue_correction(p_id uuid,p_adjustment uuid,p_slip uuid,p_kind text) returns void language plpgsql security definer set search_path='' as $$
declare i public.payroll_employee_issues;s public.payroll_released_payslips;r public.payroll_approval_runs;oldr public.payroll_approval_runs;begin
 select * into i from public.payroll_employee_issues where id=p_id for update;
 if not coalesce(private.payroll_issue_role(i.payslip_id,'finance'),false) then raise exception 'Scoped Finance required' using errcode='42501';end if;
 if (select status from public.payroll_issue_events where issue_id=i.id order by revision desc limit 1)<>'Finance Verification' then raise exception 'Finance verification required';end if;
 select * into s from public.payroll_released_payslips where id=p_slip;select * into r from public.payroll_approval_runs where id=s.run_id;select * into oldr from public.payroll_approval_runs where id=i.run_id;
 if s.id is null or s.id=i.payslip_id or s.employee_id<>i.employee_id or s.run_id=i.run_id or r.scope_id<>oldr.scope_id
 or not coalesce(private.payroll_issue_role(s.id,'finance'),false) or r.mode<>'live' or s.released_at<i.submitted_at
 or not exists(select 1 from public.payroll_issue_adjustments where id=p_adjustment and issue_id=i.id)
 or not (r.submission_ref like '%'||p_adjustment::text||'%' or r.source_snapshot::text like '%'||p_adjustment::text||'%')
 or (select count(*) from public.payroll_approval_actions where run_id=r.id and action='approve')<>6 then raise exception 'Select a separately approved, released correction for this employee carrying the adjustment reference';end if;
 if p_kind='revised' and (s.payload->>'from'<> (select payload->>'from' from public.payroll_released_payslips where id=i.payslip_id) or s.payload->>'to'<> (select payload->>'to' from public.payroll_released_payslips where id=i.payslip_id)) then raise exception 'Revised payslip must cover the original period';end if;
 insert into public.payroll_issue_corrections(issue_id,adjustment_id,corrected_payslip_id,correction_kind,linked_by) values(i.id,p_adjustment,s.id,p_kind,public.current_hris_user_id());end $$;

create function public.list_payroll_issue_correction_candidates(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare i public.payroll_employee_issues;begin
 select * into i from public.payroll_employee_issues where id=p_id;
 if not coalesce(private.payroll_issue_role(i.payslip_id,'finance'),false) then raise exception 'Scoped Finance required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'from',s.payload->>'from','to',s.payload->>'to','version',s.payload->>'version','net',s.payload->>'net') order by s.released_at desc),'[]') from public.payroll_released_payslips s join public.payroll_approval_runs r on r.id=s.run_id
 where s.employee_id=i.employee_id and s.id<>i.payslip_id and s.released_at>=i.submitted_at and r.mode='live' and private.payroll_issue_role(s.id,'finance')
 and exists(select 1 from public.payroll_issue_adjustments a where a.issue_id=i.id and (r.submission_ref like '%'||a.id::text||'%' or r.source_snapshot::text like '%'||a.id::text||'%')));end $$;

-- Private supporting files: immutable unique objects, own issue upload only; scoped reviewers can read.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('payroll-issue-support','payroll-issue-support',false,5242880,array['application/pdf','image/png','image/jpeg']);
create function public.payroll_issue_file_access(p_name text,p_upload boolean default false) returns boolean language plpgsql stable security definer set search_path='' as $$declare i public.payroll_employee_issues;begin
 if private.payroll_actor_id() is null or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg)$' then return false;end if;
 select * into i from public.payroll_employee_issues where id=split_part(p_name,'/',1)::uuid;
 if p_upload then return coalesce(i.employee_id=public.current_hris_user_id() and (select status from public.payroll_issue_events where issue_id=i.id order by revision desc limit 1) not in('Resolved','Rejected'),false);end if;
 return coalesce(private.payroll_issue_can_read(i.id),false) and exists(select 1 from public.payroll_issue_attachments where object_path=p_name and issue_id=i.id);
 exception when invalid_text_representation then return false;end $$;
create policy payroll_issue_support_insert on storage.objects for insert to authenticated with check(bucket_id='payroll-issue-support' and public.payroll_issue_file_access(name,true));
create policy payroll_issue_support_read on storage.objects for select to authenticated using(bucket_id='payroll-issue-support' and public.payroll_issue_file_access(name,false));
create function public.attach_payroll_issue_file(p_issue uuid,p_path text,p_name text) returns void language plpgsql security definer set search_path='' as $$begin
 if split_part(p_path,'/',1) is distinct from p_issue::text or not public.payroll_issue_file_access(p_path,true) or not exists(select 1 from storage.objects where bucket_id='payroll-issue-support' and name=p_path) then raise exception 'Supporting file unavailable' using errcode='42501';end if;
 if length(trim(p_name)) not between 1 and 200 then raise exception 'File name required';end if;
 insert into public.payroll_issue_attachments(issue_id,object_path,file_name,uploaded_by) values(p_issue,p_path,trim(p_name),public.current_hris_user_id()) on conflict(object_path) do nothing;end $$;
-- Explicit grants only for these new endpoints; do not replace existing policies or roles.
do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='private' and p.proname in('capture_payslip_identity','payroll_issue_role','payroll_issue_can_read','payroll_payslip_items','payroll_self_service_slip')) or
 (n.nspname='public' and p.proname in('list_payroll_issue_correction_candidates','get_payroll_self_service_payslip','list_payroll_self_service_payslips','submit_payroll_issue','get_payroll_issue','list_payroll_issues','payroll_issue_review_available','act_payroll_issue','prepare_payroll_issue_adjustment','link_payroll_issue_correction','payroll_issue_file_access','attach_payroll_issue_file')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.sig::text like 'private.%' then continue;end if;
 execute format('grant execute on function %s to authenticated',f.sig);
 end loop;end $$;
