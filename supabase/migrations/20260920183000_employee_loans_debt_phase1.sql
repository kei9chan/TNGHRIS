-- Phase 1: approved employee loans/debt. NTE and service-charge deductions are intentionally excluded.
set local lock_timeout='5s';
set local statement_timeout='45s';

create table public.payroll_debts (
 id uuid primary key, scope_id uuid not null references public.payroll_access_scopes(id),
 employee_id uuid not null references public.hris_users(id), debt_kind text not null default 'existing_loan' check(debt_kind='existing_loan'),
 debt_source text not null check(length(btrim(debt_source)) between 2 and 160),
 original_amount numeric(20,2) not null check(original_amount>0), opening_balance numeric(20,2) not null check(opening_balance between 0 and original_amount),
 current_balance numeric(20,2) not null check(current_balance between 0 and original_amount), issued_on date not null,
 repayment_method text not null check(repayment_method in('months','cutoffs')), term_count integer not null check(term_count between 1 and 120),
 cutoff_count integer not null check(cutoff_count between 1 and 240), installment numeric(20,2) not null check(installment>0),
 first_deduction_date date not null, expected_final_date date not null,
 authority_reference text, document_path text, document_name text,
 status text not null check(status in('Draft','Pending Approval','Active','Paused','Completed','Cancelled')),
 schedule_version integer not null default 1 check(schedule_version>0),
 created_by uuid not null references public.hris_users(id), created_at timestamptz not null default clock_timestamp(),
 updated_by uuid not null references public.hris_users(id), updated_at timestamptz not null default clock_timestamp(),
 approved_by uuid references public.hris_users(id), approved_at timestamptz,
 check((status not in('Active','Paused','Completed')) or (approved_by is not null and approved_at is not null)),
 check(current_balance=0 or status<>'Completed')
);
create table public.payroll_debt_schedule (
 id uuid primary key default gen_random_uuid(), debt_id uuid not null references public.payroll_debts(id),
 sequence_no integer not null check(sequence_no>0), payroll_date date not null, scheduled_amount numeric(20,2) not null check(scheduled_amount>=0),
 actual_amount numeric(20,2) check(actual_amount>=0), balance_after numeric(20,2) not null check(balance_after>=0),
 status text not null default 'Scheduled' check(status in('Scheduled','Excluded','Posted','Adjusted')),
 excluded_reason text, posted_at timestamptz, unique(debt_id,sequence_no), unique(debt_id,payroll_date)
);
create table public.payroll_debt_audit (
 id bigint generated always as identity primary key, debt_id uuid not null references public.payroll_debts(id),
 action text not null, actor_id uuid not null references public.hris_users(id), reason text not null check(length(btrim(reason)) between 3 and 1000),
 before_value jsonb, after_value jsonb, occurred_at timestamptz not null default clock_timestamp()
);
create table public.payroll_debt_postings (
 id uuid primary key default gen_random_uuid(), debt_id uuid not null references public.payroll_debts(id), schedule_id uuid not null references public.payroll_debt_schedule(id),
 employee_id uuid not null references public.hris_users(id), payroll_date date not null, payroll_run_id uuid references public.payroll_approval_runs(id),
 scheduled_amount numeric(20,2) not null, actual_amount numeric(20,2) not null check(actual_amount>0),
 adjustment numeric(20,2) not null default 0, opening_balance numeric(20,2) not null, remaining_balance numeric(20,2) not null check(remaining_balance>=0),
 posted_by uuid not null references public.hris_users(id), posted_at timestamptz not null default clock_timestamp(),
 unique(debt_id,payroll_date), unique(schedule_id)
);
create index payroll_debts_scope_status on public.payroll_debts(scope_id,status);
create index payroll_debts_employee on public.payroll_debts(employee_id,created_at desc);
create index payroll_debt_schedule_due on public.payroll_debt_schedule(payroll_date,status);
create index payroll_debt_audit_history on public.payroll_debt_audit(debt_id,occurred_at desc);

do $$declare t text;begin foreach t in array array['payroll_debts','payroll_debt_schedule','payroll_debt_audit','payroll_debt_postings'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;end$$;
create trigger payroll_debt_audit_immutable before update or delete on public.payroll_debt_audit for each row execute function private.payroll_audit_immutable();
create trigger payroll_debt_postings_immutable before update or delete on public.payroll_debt_postings for each row execute function private.payroll_audit_immutable();

create function private.payroll_debt_manager(p_scope uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.current_hris_user_id() is not null and
 (private.workflow_user_has_role(public.current_hris_user_id(),'HR Staff') or private.workflow_user_has_role(public.current_hris_user_id(),'HR Manager') or private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff')) and
 (private.payroll_has_access('review_endorse',p_scope) or private.payroll_has_access('authorize_hr',p_scope) or private.payroll_has_access('authorize_finance',p_scope) or private.payroll_has_access('prepare_pr',p_scope))
$$;
create function private.payroll_debt_approver(p_scope uuid) returns boolean language sql stable security definer set search_path='' as $$
 select (private.workflow_user_has_role(public.current_hris_user_id(),'HR Manager') and private.payroll_has_access('authorize_hr',p_scope))
 or (private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff') and private.payroll_has_access('authorize_finance',p_scope))
$$;
create function private.payroll_debt_paydate(p_start date,p_offset integer) returns date language plpgsql immutable set search_path='' as $$
declare d date:=p_start;i integer:=0;begin while i<p_offset loop d:=case when extract(day from d)<=5 then make_date(extract(year from d)::int,extract(month from d)::int,20) else (date_trunc('month',d)+interval '1 month'+interval '4 days')::date end;i:=i+1;end loop;return d;end$$;
create function private.payroll_debt_rebuild_schedule(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.payroll_debts;remaining numeric;regular numeric;amount numeric;i integer;paydate date;posted_count integer;begin
 select * into strict d from public.payroll_debts where id=p_id for update;
 select count(*) into posted_count from public.payroll_debt_schedule where debt_id=p_id and status='Posted';
 delete from public.payroll_debt_schedule where debt_id=p_id and status<>'Posted';remaining:=case when posted_count=0 then d.opening_balance else d.current_balance end;regular:=round(remaining/d.cutoff_count,2);
 for i in 1..d.cutoff_count loop paydate:=private.payroll_debt_paydate(d.first_deduction_date,i-1);amount:=case when i=d.cutoff_count then remaining else least(regular,remaining) end;remaining:=greatest(remaining-amount,0);
  insert into public.payroll_debt_schedule(debt_id,sequence_no,payroll_date,scheduled_amount,balance_after) values(d.id,posted_count+i,paydate,amount,remaining);
 end loop;
 update public.payroll_debts set installment=regular,expected_final_date=private.payroll_debt_paydate(first_deduction_date,cutoff_count-1),updated_at=clock_timestamp() where id=d.id;
end$$;
create function private.payroll_debt_locked(p_scope uuid,p_paydate date) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.payroll_approval_runs r where r.scope_id=p_scope and (r.source_snapshot->>'payDate')::date=p_paydate and
 (exists(select 1 from public.payroll_disbursements x where x.run_id=r.id) or (select count(*) from public.payroll_approval_actions a where a.run_id=r.id and a.action='approve')=6))
$$;
create function private.payroll_debt_view(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d public.payroll_debts;own boolean;begin select * into d from public.payroll_debts where id=p_id;own:=d.employee_id=public.current_hris_user_id();
 if d.id is null or not(private.payroll_debt_manager(d.scope_id) or (own and d.status in('Active','Paused','Completed'))) then raise exception 'Loan details are outside your authorized scope.' using errcode='42501';end if;
 return to_jsonb(d)||jsonb_build_object('employeeName',(select full_name from public.hris_users where id=d.employee_id),'employeeCode',(select employee_id from public.hris_users where id=d.employee_id),
 'totalPaid',d.opening_balance-d.current_balance,'remainingCutoffs',(select count(*) from public.payroll_debt_schedule where debt_id=d.id and status='Scheduled' and scheduled_amount>0),
 'schedule',(select coalesce(jsonb_agg(to_jsonb(s) order by sequence_no),'[]') from public.payroll_debt_schedule s where debt_id=d.id),
 'audit',(select coalesce(jsonb_agg(jsonb_build_object('action',a.action,'reason',a.reason,'before',a.before_value,'after',a.after_value,'at',a.occurred_at,'actor',h.full_name) order by a.occurred_at desc),'[]') from public.payroll_debt_audit a join public.hris_users h on h.id=a.actor_id where a.debt_id=d.id));
end$$;

create function public.get_payroll_debt_context(p_scope uuid default null,p_payroll_date date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare own uuid:=public.current_hris_user_id();begin if own is null then raise exception 'Active HRIS login required.' using errcode='42501';end if;
 if p_scope is null or not private.payroll_debt_manager(p_scope) then
  return jsonb_build_object('canManage',false,'canApprove',false,'scopes','[]'::jsonb,'employees','[]'::jsonb,'debts',(select coalesce(jsonb_agg(private.payroll_debt_view(d.id) order by d.created_at desc),'[]') from public.payroll_debts d where d.employee_id=own and d.status in('Active','Paused','Completed')));
 end if;
 return jsonb_build_object('canManage',true,'canApprove',private.payroll_debt_approver(p_scope),
 'scopes',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name),'[]') from public.payroll_access_scopes s where s.kind='business_unit' and private.payroll_debt_manager(s.id)),
 'employees',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.full_name,'code',h.employee_id) order by h.full_name),'[]') from public.hris_users h join public.payroll_access_scopes s on s.business_unit_id=h.business_unit_id and s.id=p_scope where lower(h.status)='active' and not coalesce(h.is_duplicate,false) and private.payroll_package_permission(h.id,p_scope,'view')),
 'debts',(select coalesce(jsonb_agg(private.payroll_debt_view(d.id) order by d.created_at desc),'[]') from public.payroll_debts d where d.scope_id=p_scope),
 'payrollDate',p_payroll_date,'locked',case when p_payroll_date is null then false else private.payroll_debt_locked(p_scope,p_payroll_date) end);
end$$;

create function public.create_payroll_debt(p_id uuid,p_employee uuid,p_source text,p_original text,p_opening text,p_issued date,p_method text,p_term integer,p_first date,p_authority text,p_submit boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare scope uuid:=private.payroll_employee_bu_scope(p_employee);actor uuid:=public.current_hris_user_id();orig numeric;opening numeric;cutoffs integer;snapshot jsonb;begin
 if p_id is null or not private.payroll_debt_manager(scope) or not private.payroll_package_permission(p_employee,scope,'view') or p_employee=actor then raise exception 'Scoped HR/Finance payroll access is required; own-loan entry is prohibited.' using errcode='42501';end if;
 if p_method not in('months','cutoffs') or p_term not between 1 and 120 then raise exception 'Choose months or payroll cutoffs and a valid repayment term.';end if;
 orig:=private.payroll_net_money(jsonb_build_object('amount',p_original),'amount');opening:=private.payroll_net_money(jsonb_build_object('amount',p_opening),'amount');if opening>orig or opening<=0 then raise exception 'Opening balance must be above zero and cannot exceed the original amount.';end if;
 if p_first is null or p_issued is null or p_first<p_issued then raise exception 'First deduction date must be on or after the issue date.';end if;
 if p_submit and length(btrim(coalesce(p_authority,'')))<3 then raise exception 'Payroll deduction authority is required before submission.';end if;
 cutoffs:=case when p_method='months' then p_term*2 else p_term end;
 insert into public.payroll_debts(id,scope_id,employee_id,debt_source,original_amount,opening_balance,current_balance,issued_on,repayment_method,term_count,cutoff_count,installment,first_deduction_date,expected_final_date,authority_reference,status,created_by,updated_by)
 values(p_id,scope,p_employee,btrim(p_source),orig,opening,opening,p_issued,p_method,p_term,cutoffs,round(opening/cutoffs,2),p_first,private.payroll_debt_paydate(p_first,cutoffs-1),nullif(btrim(p_authority),''),case when p_submit then 'Pending Approval' else 'Draft' end,actor,actor);
 perform private.payroll_debt_rebuild_schedule(p_id);select to_jsonb(d) into snapshot from public.payroll_debts d where id=p_id;
 insert into public.payroll_debt_audit(debt_id,action,actor_id,reason,after_value) values(p_id,case when p_submit then 'Created and submitted' else 'Created draft' end,actor,case when p_submit then 'Submitted with payroll deduction authority' else 'Saved as draft' end,snapshot);return p_id;
end$$;

create function public.attach_payroll_debt_document(p_id uuid,p_path text,p_name text) returns void language plpgsql security definer set search_path='' as $$
declare d public.payroll_debts;before jsonb;begin select * into strict d from public.payroll_debts where id=p_id for update;if not private.payroll_debt_manager(d.scope_id) then raise exception 'Not authorized.' using errcode='42501';end if;
 if p_path not like p_id::text||'/%' or length(p_name)<1 then raise exception 'Invalid secured document path.';end if;before:=to_jsonb(d);update public.payroll_debts set document_path=p_path,document_name=p_name,updated_by=public.current_hris_user_id(),updated_at=clock_timestamp() where id=p_id;
 insert into public.payroll_debt_audit(debt_id,action,actor_id,reason,before_value,after_value) values(p_id,'Supporting document attached',public.current_hris_user_id(),'Supporting document attached',before,(select to_jsonb(x) from public.payroll_debts x where x.id=p_id));end$$;

create function public.act_on_payroll_debt(p_id uuid,p_action text,p_reason text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.payroll_debts;before jsonb;actor uuid:=public.current_hris_user_id();new_method text;new_term integer;new_first date;cutoffs integer;begin
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'A reason is required for every loan action.';end if;perform pg_advisory_xact_lock(hashtextextended('payroll-debt:'||p_id,0));select * into strict d from public.payroll_debts where id=p_id for update;
 if not private.payroll_debt_manager(d.scope_id) then raise exception 'Not authorized for this payroll scope.' using errcode='42501';end if;before:=to_jsonb(d);
 if p_action='submit' then if d.status<>'Draft' or length(btrim(coalesce(d.authority_reference,'')))<3 then raise exception 'A draft with payroll deduction authority is required.';end if;update public.payroll_debts set status='Pending Approval',updated_by=actor,updated_at=clock_timestamp() where id=p_id;
 elsif p_action='approve' then if d.status<>'Pending Approval' or not private.payroll_debt_approver(d.scope_id) or d.created_by=actor then raise exception 'Independent scoped HR Manager or Finance approval is required.' using errcode='42501';end if;update public.payroll_debts set status='Active',approved_by=actor,approved_at=clock_timestamp(),updated_by=actor,updated_at=clock_timestamp() where id=p_id;
  insert into public.payroll_loan_ledger(employee_id,scope_id,account_ref,as_of,balance,installment,previous_id,source_ref,authorized_by) select employee_id,scope_id,'DEBT-'||id,first_deduction_date,current_balance,installment,(select id from public.payroll_loan_ledger where employee_id=d.employee_id and account_ref='DEBT-'||d.id order by revision desc limit 1),authority_reference,actor from public.payroll_debts where id=p_id;
 elsif p_action='pause' then if d.status<>'Active' then raise exception 'Only an active schedule can be paused.';end if;update public.payroll_debts set status='Paused',updated_by=actor,updated_at=clock_timestamp() where id=p_id;
  insert into public.payroll_loan_ledger(employee_id,scope_id,account_ref,as_of,balance,installment,previous_id,source_ref,authorized_by) values(d.employee_id,d.scope_id,'DEBT-'||d.id,greatest((now() at time zone 'Asia/Manila')::date,d.first_deduction_date),0,.01,(select id from public.payroll_loan_ledger where employee_id=d.employee_id and account_ref='DEBT-'||d.id order by revision desc limit 1),'Paused: '||p_reason,actor);
 elsif p_action='resume' then if d.status<>'Paused' then raise exception 'Only a paused schedule can resume.';end if;update public.payroll_debts set status='Active',updated_by=actor,updated_at=clock_timestamp() where id=p_id;
  insert into public.payroll_loan_ledger(employee_id,scope_id,account_ref,as_of,balance,installment,previous_id,source_ref,authorized_by) values(d.employee_id,d.scope_id,'DEBT-'||d.id,greatest((now() at time zone 'Asia/Manila')::date,d.first_deduction_date),d.current_balance,d.installment,(select id from public.payroll_loan_ledger where employee_id=d.employee_id and account_ref='DEBT-'||d.id order by revision desc limit 1),'Resumed: '||p_reason,actor);
 elsif p_action='change_schedule' then if d.status not in('Active','Paused') then raise exception 'Only an approved schedule can be changed.';end if;new_method:=p_payload->>'method';new_term:=(p_payload->>'term')::integer;new_first:=(p_payload->>'firstDate')::date;if new_method not in('months','cutoffs') or new_term not between 1 and 120 then raise exception 'Valid replacement schedule required.';end if;cutoffs:=case when new_method='months' then new_term*2 else new_term end;
  if exists(select 1 from public.payroll_debt_schedule where debt_id=p_id and private.payroll_debt_locked(d.scope_id,payroll_date)) then raise exception 'Locked payroll history cannot be changed. Use a future auditable adjustment.';end if;
  update public.payroll_debts set repayment_method=new_method,term_count=new_term,cutoff_count=cutoffs,first_deduction_date=new_first,status='Pending Approval',approved_by=null,approved_at=null,schedule_version=schedule_version+1,updated_by=actor,updated_at=clock_timestamp() where id=p_id;perform private.payroll_debt_rebuild_schedule(p_id);
  insert into public.payroll_loan_ledger(employee_id,scope_id,account_ref,as_of,balance,installment,previous_id,source_ref,authorized_by) values(d.employee_id,d.scope_id,'DEBT-'||d.id,new_first,0,.01,(select id from public.payroll_loan_ledger where employee_id=d.employee_id and account_ref='DEBT-'||d.id order by revision desc limit 1),'Schedule pending reapproval: '||p_reason,actor);
 elsif p_action='exclude' then new_first:=(p_payload->>'payrollDate')::date;if private.payroll_debt_locked(d.scope_id,new_first) then raise exception 'Locked payroll cannot be silently changed.';end if;update public.payroll_debt_schedule set status='Excluded',scheduled_amount=0,excluded_reason=p_reason where debt_id=p_id and payroll_date=new_first and status='Scheduled';if not found then raise exception 'Future scheduled deduction not found.';end if;
  insert into public.payroll_loan_ledger(employee_id,scope_id,account_ref,as_of,balance,installment,previous_id,source_ref,authorized_by) values(d.employee_id,d.scope_id,'DEBT-'||d.id,new_first,0,.01,(select id from public.payroll_loan_ledger where employee_id=d.employee_id and account_ref='DEBT-'||d.id order by revision desc limit 1),'Excluded cutoff: '||p_reason,actor);
  select payroll_date into new_first from public.payroll_debt_schedule where debt_id=p_id and payroll_date>new_first and status='Scheduled' order by payroll_date limit 1;if new_first is not null then insert into public.payroll_loan_ledger(employee_id,scope_id,account_ref,as_of,balance,installment,previous_id,source_ref,authorized_by) values(d.employee_id,d.scope_id,'DEBT-'||d.id,new_first,d.current_balance,d.installment,(select id from public.payroll_loan_ledger where employee_id=d.employee_id and account_ref='DEBT-'||d.id order by revision desc limit 1),'Resume after excluded cutoff: '||p_reason,actor);end if;
 elsif p_action='mark_paid' then update public.payroll_debts set current_balance=0,status='Completed',updated_by=actor,updated_at=clock_timestamp() where id=p_id;update public.payroll_debt_schedule set status='Adjusted',scheduled_amount=0,balance_after=0 where debt_id=p_id and status='Scheduled';
 elsif p_action='cancel' then if d.status in('Completed','Cancelled') then raise exception 'This loan is already closed.';end if;update public.payroll_debts set status='Cancelled',updated_by=actor,updated_at=clock_timestamp() where id=p_id;
 else raise exception 'Unsupported loan action.';end if;
 insert into public.payroll_debt_audit(debt_id,action,actor_id,reason,before_value,after_value) values(p_id,p_action,actor,btrim(p_reason),before,(select to_jsonb(x) from public.payroll_debts x where x.id=p_id));return private.payroll_debt_view(p_id);
end$$;

create function public.post_payroll_debt_deduction(p_id uuid,p_payroll_date date,p_run uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.payroll_debts;s public.payroll_debt_schedule;amount numeric;post_id uuid;actor uuid:=public.current_hris_user_id();begin perform pg_advisory_xact_lock(hashtextextended('payroll-debt-post:'||p_id||':'||p_payroll_date,0));select * into strict d from public.payroll_debts where id=p_id for update;
 if not private.payroll_debt_manager(d.scope_id) or d.status<>'Active' or d.approved_at is null then raise exception 'Only an approved active loan may be deducted.' using errcode='42501';end if;select * into strict s from public.payroll_debt_schedule where debt_id=p_id and payroll_date=p_payroll_date for update;if s.status<>'Scheduled' then raise exception 'This loan deduction is not currently scheduled.';end if;
 amount:=least(s.scheduled_amount,d.current_balance);if amount<=0 then raise exception 'Loan balance is already zero.';end if;
 insert into public.payroll_debt_postings(debt_id,schedule_id,employee_id,payroll_date,payroll_run_id,scheduled_amount,actual_amount,opening_balance,remaining_balance,posted_by) values(d.id,s.id,d.employee_id,p_payroll_date,p_run,s.scheduled_amount,amount,d.current_balance,d.current_balance-amount,actor) returning id into post_id;
 update public.payroll_debt_schedule set status='Posted',actual_amount=amount,balance_after=d.current_balance-amount,posted_at=clock_timestamp() where id=s.id;update public.payroll_debts set current_balance=current_balance-amount,status=case when current_balance-amount=0 then 'Completed' else status end,updated_by=actor,updated_at=clock_timestamp() where id=d.id;
 insert into public.payroll_debt_audit(debt_id,action,actor_id,reason,before_value,after_value) values(d.id,'Deduction posted',actor,'Approved payroll deduction posted',jsonb_build_object('balance',d.current_balance),jsonb_build_object('deduction',amount,'balance',d.current_balance-amount,'payrollDate',p_payroll_date));return post_id;end$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('payroll-debt-documents','payroll-debt-documents',false,10485760,array['application/pdf','image/png','image/jpeg']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy payroll_debt_document_insert on storage.objects for insert to authenticated with check(bucket_id='payroll-debt-documents' and exists(select 1 from public.payroll_debts d where d.id=(storage.foldername(name))[1]::uuid and d.created_by=public.current_hris_user_id() and private.payroll_debt_manager(d.scope_id)));
create policy payroll_debt_document_read on storage.objects for select to authenticated using(bucket_id='payroll-debt-documents' and exists(select 1 from public.payroll_debts d where d.document_path=name and (private.payroll_debt_manager(d.scope_id) or (d.employee_id=public.current_hris_user_id() and d.status in('Active','Paused','Completed')))));

do $$declare sig text;begin foreach sig in array array['private.payroll_debt_manager(uuid)','private.payroll_debt_approver(uuid)','private.payroll_debt_paydate(date,integer)','private.payroll_debt_rebuild_schedule(uuid)','private.payroll_debt_locked(uuid,date)','private.payroll_debt_view(uuid)'] loop execute format('revoke all on function %s from public,anon,authenticated',sig);end loop;end$$;
revoke all on function public.get_payroll_debt_context(uuid,date),public.create_payroll_debt(uuid,uuid,text,text,text,date,text,integer,date,text,boolean),public.attach_payroll_debt_document(uuid,text,text),public.act_on_payroll_debt(uuid,text,text,jsonb),public.post_payroll_debt_deduction(uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.get_payroll_debt_context(uuid,date),public.create_payroll_debt(uuid,uuid,text,text,text,date,text,integer,date,text,boolean),public.attach_payroll_debt_document(uuid,text,text),public.act_on_payroll_debt(uuid,text,text,jsonb),public.post_payroll_debt_deduction(uuid,date,uuid) to authenticated;
