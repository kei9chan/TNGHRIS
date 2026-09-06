-- Phase 8: payment evidence and review outputs. No transfers or live activation.
-- Preserve Phase 7's full-batch accounting/release event and immutable receipts.
create table public.payroll_payment_batches (
 id uuid primary key default gen_random_uuid(), run_id uuid not null unique references public.payroll_approval_runs(id),
 scope_id uuid not null references public.payroll_access_scopes(id), settlement_key text not null,
 reference text not null check(length(trim(reference)) between 3 and 300),
 created_by uuid not null references public.hris_users(id), created_at timestamptz not null default now(),
 unique(scope_id,reference),unique(id,scope_id)
);
create table public.payroll_payment_closures (
 batch_id uuid primary key references public.payroll_payment_batches(id),
 reason text not null check(length(trim(reason)) between 3 and 1000),
 actor_id uuid not null references public.hris_users(id),created_at timestamptz not null default now()
);
create table public.payroll_payment_attempts (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null,
 scope_id uuid not null,employee_id uuid not null references public.hris_users(id),
 amount numeric(24,2) not null check(amount>0),reference text not null check(length(trim(reference)) between 3 and 300),
 scheduled_on date not null,bank_hash text not null,verification_id uuid not null references public.payroll_payment_verifications(id),
 reissue_of uuid references public.payroll_payment_attempts(id),
 created_by uuid not null references public.hris_users(id),created_at timestamptz not null default now(),
 foreign key(batch_id,scope_id) references public.payroll_payment_batches(id,scope_id),unique(scope_id,reference)
);
create table public.payroll_payment_events (
 id bigint generated always as identity primary key,request_id uuid not null unique,
 attempt_id uuid not null references public.payroll_payment_attempts(id),
 status text not null check(status in('confirmed','failed','cancelled','returned')),
 occurred_on date not null,reference text not null check(length(trim(reference)) between 3 and 1000),
 reason text not null check(length(trim(reason)) between 3 and 1000),
 actor_id uuid not null references public.hris_users(id),recorded_at timestamptz not null default now(),
 unique(attempt_id,status)
);
create table public.payroll_loan_posting_adjustments (
 id uuid primary key default gen_random_uuid(),posting_id uuid not null references public.payroll_loan_postings(id),
 event_id bigint references public.payroll_payment_events(id),
 kind text not null check(kind in('return_reversal','reissue_restore')),amount numeric(20,2) not null check(amount<>0),
 reason text not null,actor_id uuid not null references public.hris_users(id),created_at timestamptz not null default now(),
 check((kind='return_reversal' and amount<0 and event_id is not null) or (kind='reissue_restore' and amount>0)),unique(posting_id,event_id)
);
create table public.payroll_output_processes (
 id bigint generated always as identity primary key,scope_id uuid not null references public.payroll_access_scopes(id),
 code text not null check(code in('bank','1601_c','1604_c','2316','sss','philhealth','pagibig','special_pay')),
 owner_id uuid not null references public.hris_users(id),process_ref text not null check(length(trim(process_ref)) between 3 and 1000),
 recorded_by uuid not null references public.hris_users(id),recorded_at timestamptz not null default now()
);
create table public.payroll_output_exports (
 id uuid primary key default gen_random_uuid(),run_id uuid not null references public.payroll_approval_runs(id),
 kind text not null check(kind in('register','finance','payment_preview','payment_schedule','tax','agency')),
 payload jsonb not null,payload_hash text not null,created_by uuid not null references public.hris_users(id),created_at timestamptz not null default now()
);
create table public.payroll_output_downloads (
 id bigint generated always as identity primary key,export_id uuid not null references public.payroll_output_exports(id),
 actor_id uuid not null references public.hris_users(id),requested_at timestamptz not null default now()
);
create index payroll_payment_batch_entitlement on public.payroll_payment_batches(settlement_key);
create index payroll_attempt_employee on public.payroll_payment_attempts(batch_id,employee_id);
create index payroll_attempt_reissue on public.payroll_payment_attempts(reissue_of);
create index payroll_event_latest on public.payroll_payment_events(attempt_id,id desc);
create index payroll_loan_adjustment_posting on public.payroll_loan_posting_adjustments(posting_id);
create index payroll_output_process_latest on public.payroll_output_processes(scope_id,code,id desc);
create index payroll_output_run on public.payroll_output_exports(run_id,created_at desc);
create index payroll_download_export on public.payroll_output_downloads(export_id);
do $$declare t text;begin
 foreach t in array array['payroll_payment_batches','payroll_payment_closures','payroll_payment_attempts','payroll_payment_events',
 'payroll_loan_posting_adjustments','payroll_output_processes','payroll_output_exports','payroll_output_downloads'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('create trigger immutable before update or delete on public.%I for each row execute function private.payroll_audit_immutable()',t);
 end loop;end $$;

create function private.payroll_payment_position(p_due numeric,p_confirmed numeric,p_pending numeric) returns jsonb
language plpgsql immutable set search_path='' as $$begin
 if p_due is null or p_confirmed is null or p_pending is null or least(p_due,p_confirmed,p_pending)<0 or p_confirmed+p_pending>p_due then
 raise exception 'Payment totals do not reconcile to the approved net.';end if;
 return jsonb_build_object('due',p_due::text,'confirmed',p_confirmed::text,'pending',p_pending::text,
 'unpaid',(p_due-p_confirmed)::text,'available',(p_due-p_confirmed-p_pending)::text,'complete',p_due=p_confirmed and p_pending=0);
end $$;
create function private.payroll_payment_transition(p_before text,p_after text) returns void
language plpgsql immutable set search_path='' as $$begin
 if not coalesce((p_before='pending' and p_after in('confirmed','failed','cancelled')) or (p_before='confirmed' and p_after='returned'),false) then
 raise exception 'Outcome changed or transition unavailable. Refresh before recording payment evidence.' using errcode='40001';end if;
end $$;
create function private.payroll_attempt_state(p_attempt uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select status from public.payroll_payment_events where attempt_id=p_attempt order by id desc limit 1),'pending')
$$;
create function private.payroll_employee_payment(p_batch uuid,p_employee uuid,p_due numeric) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.payroll_payment_position(p_due,
 coalesce(sum(amount) filter(where private.payroll_attempt_state(id)='confirmed'),0),
 coalesce(sum(amount) filter(where private.payroll_attempt_state(id)='pending'),0))
 from public.payroll_payment_attempts where batch_id=p_batch and employee_id=p_employee
$$;
create function private.payroll_payment_authority(p_run uuid,p_new boolean) returns public.payroll_approval_runs
language plpgsql stable security definer set search_path='' as $$
declare r public.payroll_approval_runs;s jsonb;begin
 s:=private.payroll_approval_state(p_run);select * into r from public.payroll_approval_runs where id=p_run;
 if r.mode<>'live' or not public.check_payroll_operation('release_payroll',r.scope_id,'payment')
 or not private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff')
 or r.source_snapshot->'editors' @> jsonb_build_array(public.current_hris_user_id())
 or (s->>'step')::int<>6 or s->>'returned'='true' then
 raise exception 'Current scoped independent Finance release authority and all six live approval steps required.' using errcode='42501';end if;
 if p_new and s->>'current' is distinct from 'true' and not exists(select 1 from public.payroll_disbursements where run_id=r.id) then
 raise exception 'Inputs changed before settlement. Close unused attempts/batch and obtain fresh approvals.';end if;
 if r.special_run_id is not null then raise exception 'Special-pay settlement stays with the assigned existing process until cross-case entitlement reconciliation is validated. Do not record it as a regular payment.';end if;
 return r;
end $$;
create function private.payroll_payment_rows(p_run uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.payroll_approval_runs;b public.payroll_payment_batches;e jsonb;rows jsonb:='[]';pos jsonb;
begin
 select * into r from public.payroll_approval_runs where id=p_run;select * into b from public.payroll_payment_batches where run_id=p_run;
 for e in select value from jsonb_array_elements(r.source_snapshot->'employees') loop
 pos:=private.payroll_employee_payment(b.id,(e->>'employeeId')::uuid,(e->>'net')::numeric);
 rows:=rows||jsonb_build_array(jsonb_build_object('employeeId',e->>'employeeId','employeeName',e->>'employeeName')||pos);
 end loop;return rows;
end $$;

create function public.create_payroll_payment_batch(p_run_id uuid,p_reference text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.payroll_approval_runs;b public.payroll_payment_batches;begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-approval:'||p_run_id::text,0));
 r:=private.payroll_payment_authority(p_run_id,true);
 perform pg_advisory_xact_lock(hashtextextended('payroll-settlement:'||r.settlement_key,0));
 select * into b from public.payroll_payment_batches where run_id=r.id;
 if b.id is not null then
 if b.reference<>trim(p_reference) or exists(select 1 from public.payroll_payment_closures where batch_id=b.id) then raise exception 'This version already has a payment batch. Open it or prepare a fresh approved version.';end if;
 return b.id;end if;
 if exists(select 1 from public.payroll_disbursements where settlement_key=r.settlement_key)
 or exists(select 1 from public.payroll_payment_batches x where x.settlement_key=r.settlement_key and not exists(select 1 from public.payroll_payment_closures c where c.batch_id=x.id)) then
 raise exception 'Another version already reserves or settled this entitlement. Close its unpaid batch before starting a new version.';end if;
 if not exists(select 1 from public.payroll_output_processes p where p.scope_id=r.scope_id and p.code='bank' and p.id=(select max(id) from public.payroll_output_processes where scope_id=r.scope_id and code='bank') and private.workflow_user_has_role(p.owner_id,'Finance Staff')) then
 raise exception 'Record the existing verified bank/payment process and its active Finance owner first.';end if;
 insert into public.payroll_payment_batches(run_id,scope_id,settlement_key,reference,created_by)
 values(r.id,r.scope_id,r.settlement_key,trim(p_reference),public.current_hris_user_id()) returning id into b.id;return b.id;
end $$;
create function public.close_payroll_payment_batch(p_batch_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare b public.payroll_payment_batches;begin
 select * into b from public.payroll_payment_batches where id=p_batch_id;
 perform pg_advisory_xact_lock(hashtextextended('payroll-approval:'||b.run_id::text,0));
 perform private.payroll_payment_authority(b.run_id,false);
 if exists(select 1 from public.payroll_disbursements where run_id=b.run_id) or exists(select 1 from public.payroll_payment_attempts a where a.batch_id=b.id and private.payroll_attempt_state(a.id) in('pending','confirmed','returned')) then
 raise exception 'Only a batch with no pending or ever-confirmed transfers can be closed. Retain paid/returned entitlements for reconciliation.';end if;
 insert into public.payroll_payment_closures(batch_id,reason,actor_id) values(b.id,p_reason,public.current_hris_user_id()) on conflict(batch_id) do nothing;
end $$;
create function public.prepare_payroll_payment_attempt(p_batch_id uuid,p_employee_id uuid,p_amount text,p_reference text,p_scheduled_on date,p_reissue_of uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare b public.payroll_payment_batches;r public.payroll_approval_runs;e jsonb;pos jsonb;a public.payroll_payment_attempts;prior public.payroll_payment_attempts;
 amount numeric;available numeric;verification uuid;begin
 select * into b from public.payroll_payment_batches where id=p_batch_id;
 perform pg_advisory_xact_lock(hashtextextended('payroll-approval:'||b.run_id::text,0));r:=private.payroll_payment_authority(b.run_id,true);
 if exists(select 1 from public.payroll_payment_closures where batch_id=b.id) then raise exception 'Payment batch is closed.';end if;
 amount:=private.payroll_net_money(jsonb_build_object('amount',p_amount),'amount');
 select * into a from public.payroll_payment_attempts where scope_id=b.scope_id and reference=trim(p_reference);
 if a.id is not null then
 if a.batch_id=b.id and a.employee_id=p_employee_id and a.amount=amount and a.scheduled_on=p_scheduled_on and a.reissue_of is not distinct from p_reissue_of then return a.id;end if;
 raise exception 'Payment reference already belongs to a different attempt.';end if;
 select value into e from jsonb_array_elements(r.source_snapshot->'employees') where value->>'employeeId'=p_employee_id::text;
 if e is null or not private.payroll_package_permission(p_employee_id,r.scope_id,'view') or not public.has_sensitive_permission('bank_information','view') then
 raise exception 'Employee or bank details outside existing authorized scope.' using errcode='42501';end if;
 perform 1 from public.hris_users where id=p_employee_id for share;
 if p_scheduled_on is null or p_scheduled_on<(r.source_snapshot->>'payDate')::date then raise exception 'Schedule on or after the approved payday.';end if;
 select v.id into verification from public.payroll_payment_verifications v join public.hris_users h on h.id=v.employee_id
 where v.employee_id=p_employee_id and v.details_hash=private.payroll_bank_hash(p_employee_id)
 and nullif(trim(h.bank_account_number),'') is not null and nullif(trim(h.bank_name),'') is not null order by v.verified_at desc limit 1;
 if verification is null then raise exception 'Verify the current employee bank details in Pay Packages first.';end if;
 pos:=private.payroll_employee_payment(b.id,p_employee_id,(e->>'net')::numeric);available:=(pos->>'available')::numeric;
 if p_reissue_of is null and exists(select 1 from public.payroll_payment_attempts x where x.batch_id=b.id and x.employee_id=p_employee_id and private.payroll_attempt_state(x.id) in('failed','cancelled','returned')) then
 raise exception 'Link the failed, cancelled or returned attempt when reissuing unpaid amounts.';end if;
 if p_reissue_of is not null then
 select * into prior from public.payroll_payment_attempts where id=p_reissue_of;
 if prior.id is null or prior.batch_id<>b.id or prior.employee_id<>p_employee_id or private.payroll_attempt_state(prior.id) not in('failed','cancelled','returned') then raise exception 'Reissue must link this employee/batch failed, cancelled or returned attempt.';end if;
 select least(available,prior.amount-coalesce(sum(x.amount) filter(where private.payroll_attempt_state(x.id) in('pending','confirmed')),0)) into available from public.payroll_payment_attempts x where x.reissue_of=prior.id;
 end if;
 if amount<=0 or amount>available then raise exception 'Amount exceeds unreserved unpaid balance. Pending attempts reserve funds; confirm their outcome before retrying.';end if;
 insert into public.payroll_payment_attempts(batch_id,scope_id,employee_id,amount,reference,scheduled_on,bank_hash,verification_id,reissue_of,created_by)
 values(b.id,b.scope_id,p_employee_id,amount,trim(p_reference),p_scheduled_on,private.payroll_bank_hash(p_employee_id),verification,p_reissue_of,public.current_hris_user_id()) returning id into a.id;return a.id;
end $$;

create function public.record_payroll_payment_outcome(p_attempt_id uuid,p_expected_event bigint,p_status text,p_occurred_on date,p_reference text,p_reason text,p_request_id uuid) returns bigint
language plpgsql security definer set search_path='' as $$
declare a public.payroll_payment_attempts;b public.payroll_payment_batches;r public.payroll_approval_runs;old public.payroll_payment_events;last_id bigint;last_status text;
 event bigint;lp record;balance numeric;begin
 select * into a from public.payroll_payment_attempts where id=p_attempt_id;select * into b from public.payroll_payment_batches where id=a.batch_id;
 perform pg_advisory_xact_lock(hashtextextended('payroll-approval:'||b.run_id::text,0));r:=private.payroll_payment_authority(b.run_id,false);
 if exists(select 1 from public.payroll_payment_closures where batch_id=b.id) then raise exception 'Payment batch is closed.';end if;
 select * into old from public.payroll_payment_events where request_id=p_request_id;
 if old.id is not null then
 if old.attempt_id=a.id and old.status=p_status and old.occurred_on=p_occurred_on and old.reference=p_reference and old.reason=p_reason then return old.id;end if;
 raise exception 'Outcome request ID was already used for different evidence.';end if;
 select * into old from public.payroll_payment_events where attempt_id=a.id order by id desc limit 1;
 last_id:=coalesce(old.id,0);last_status:=coalesce(old.status,'pending');
 if p_expected_event is distinct from last_id then raise exception 'Payment outcome changed; refresh before recording.' using errcode='40001';end if;
 perform private.payroll_payment_transition(last_status,p_status);
 if p_occurred_on is null or p_occurred_on>(now() at time zone 'Asia/Manila')::date
 or (p_status in('confirmed','returned') and p_occurred_on<a.scheduled_on)
 or (old.id is not null and p_occurred_on<old.occurred_on) then raise exception 'Use the actual outcome date, never before its confirmed payment/schedule or in the future.';end if;
 insert into public.payroll_payment_events(request_id,attempt_id,status,occurred_on,reference,reason,actor_id)
 values(p_request_id,a.id,p_status,p_occurred_on,p_reference,p_reason,public.current_hris_user_id()) returning id into event;
 -- A returned transfer reverses this employee's original loan effect once.
 -- Historical receipts and payslip amounts are never edited or deleted.
 if p_status='returned' then
 for lp in select l.* from public.payroll_loan_postings l join public.payroll_disbursements d on d.id=l.disbursement_id
 where d.run_id=r.id and l.employee_id=a.employee_id order by l.employee_id,l.account_ref loop
 perform pg_advisory_xact_lock(hashtextextended('payroll-loan:'||lp.employee_id::text||':'||lp.account_ref,0));
 select lp.amount+coalesce(sum(x.amount),0) into balance from public.payroll_loan_posting_adjustments x where x.posting_id=lp.id;
 if balance>0 then insert into public.payroll_loan_posting_adjustments(posting_id,event_id,kind,amount,reason,actor_id)
 values(lp.id,event,'return_reversal',-balance,p_reason,public.current_hris_user_id());end if;
 end loop;end if;return event;
end $$;

-- Preserve the installed Phase 7 posting implementation as a private finalizer.
do $$declare ddl text;begin
 ddl:=pg_get_functiondef('public.record_payroll_disbursement(uuid,text,date,text)'::regprocedure);
 ddl:=replace(ddl,'FUNCTION public.record_payroll_disbursement(','FUNCTION private.payroll_finish_disbursement(');
 ddl:=replace(ddl,'sum(lp.amount)','sum(lp.amount+coalesce((select sum(x.amount) from public.payroll_loan_posting_adjustments x where x.posting_id=lp.id),0))');
 execute ddl;
end $$;
create function public.complete_payroll_payment_batch(p_batch_id uuid,p_reference text) returns uuid
language plpgsql security definer set search_path='' as $$
declare b public.payroll_payment_batches;r public.payroll_approval_runs;rows jsonb;d public.payroll_disbursements;paid_on date;lp record;
 net_posted numeric;used numeric;opening public.payroll_loan_ledger;begin
 select * into b from public.payroll_payment_batches where id=p_batch_id;
 perform pg_advisory_xact_lock(hashtextextended('payroll-approval:'||b.run_id::text,0));r:=private.payroll_payment_authority(b.run_id,true);
 if exists(select 1 from public.payroll_payment_closures where batch_id=b.id) then raise exception 'Payment batch is closed.';end if;
 rows:=private.payroll_payment_rows(r.id);
 if exists(select 1 from jsonb_array_elements(rows) x where x->>'complete' is distinct from 'true') then raise exception 'Every employee must reconcile to their approved net, with no pending attempts.';end if;
 select greatest((r.source_snapshot->>'payDate')::date,max(e.occurred_on)) into paid_on
 from public.payroll_payment_attempts a join public.payroll_payment_events e on e.attempt_id=a.id and e.status='confirmed'
 where a.batch_id=b.id and private.payroll_attempt_state(a.id)='confirmed';
 select * into d from public.payroll_disbursements where run_id=r.id;
 if d.id is null then return private.payroll_finish_disbursement(r.id,p_reference,paid_on,r.source_snapshot->>'net');end if;
 -- A fully reconciled reissue restores each reversed posting once, under the
 -- same loan locks as the opening-balance writer and normal payroll release.
 for lp in select * from public.payroll_loan_postings where disbursement_id=d.id order by employee_id,account_ref loop
 perform pg_advisory_xact_lock(hashtextextended('payroll-loan:'||lp.employee_id::text||':'||lp.account_ref,0));
 select lp.amount+coalesce(sum(amount),0) into net_posted from public.payroll_loan_posting_adjustments where posting_id=lp.id;
 if net_posted=0 then
 select * into opening from public.payroll_loan_ledger where employee_id=lp.employee_id and account_ref=lp.account_ref order by revision desc limit 1;
 if opening.id<>lp.ledger_id then raise exception 'Loan opening changed after return. Reconcile its history before restoring this posting.';end if;
 select coalesce(sum(l.amount+coalesce((select sum(x.amount) from public.payroll_loan_posting_adjustments x where x.posting_id=l.id),0)),0)
 into used from public.payroll_loan_postings l where l.ledger_id=lp.ledger_id;
 if opening.balance-used<lp.amount then raise exception 'Reissue loan posting exceeds actual remaining balance. Finance reconciliation required.';end if;
 insert into public.payroll_loan_posting_adjustments(posting_id,kind,amount,reason,actor_id)
 values(lp.id,'reissue_restore',lp.amount,p_reference,public.current_hris_user_id());
 elsif net_posted<>lp.amount then raise exception 'Loan posting history needs reconciliation.';end if;
 end loop;return d.id;
end $$;
-- Compatibility endpoint cannot bypass per-employee evidence or pay twice.
create or replace function public.record_payroll_disbursement(p_run_id uuid,p_reference text,p_paid_on date,p_amount text) returns uuid
language plpgsql security definer set search_path='' as $$declare b uuid;r public.payroll_approval_runs;begin
 r:=private.payroll_payment_authority(p_run_id,true);
 select id into b from public.payroll_payment_batches where run_id=r.id;
 if b is null then raise exception 'Open Payment & Reports and reconcile actual employee outcomes first.';end if;
 if p_amount::numeric<>(r.source_snapshot->>'net')::numeric then raise exception 'Amount differs from approved net.';end if;
 return public.complete_payroll_payment_batch(b,p_reference);
end $$;

create function public.get_payroll_output_setup() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS account required.' using errcode='42501';end if;
 return jsonb_build_object('scopes',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,
 'canManage',private.payroll_has_access('authorize_finance',s.id) and private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff'),
 'processes',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('owner',h.full_name,'ownerActive',private.workflow_user_has_role(h.id,'Finance Staff'))),'[]')
 from (select distinct on(code) * from public.payroll_output_processes where scope_id=s.id order by code,id desc) p join public.hris_users h on h.id=p.owner_id)) order by s.name),'[]')
 from public.payroll_access_scopes s where s.kind='business_unit' and private.payroll_gross_permission(s.id,'view')),
 'owners',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.full_name) order by h.full_name),'[]') from public.hris_users h
 where public.can_access_hris_user(h.id) and private.workflow_user_has_role(h.id,'Finance Staff')
 and exists(select 1 from public.payroll_access_scopes s where private.payroll_gross_permission(s.id,'view'))));
end $$;
create function public.record_payroll_output_process(p_scope_id uuid,p_code text,p_owner_id uuid,p_reference text) returns void
language plpgsql security definer set search_path='' as $$begin
 if not private.payroll_gross_permission(p_scope_id,'view') or not private.payroll_has_access('authorize_finance',p_scope_id)
 or not private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff') or not private.workflow_user_has_role(p_owner_id,'Finance Staff')
 or not public.can_access_hris_user(p_owner_id) then raise exception 'Scoped Finance authorizer and an existing active Finance owner required.' using errcode='42501';end if;
 insert into public.payroll_output_processes(scope_id,code,owner_id,process_ref,recorded_by) values(p_scope_id,p_code,p_owner_id,p_reference,public.current_hris_user_id());
end $$;
create function public.get_payroll_payment_workspace(p_run_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s jsonb;r public.payroll_approval_runs;b public.payroll_payment_batches;rows jsonb;attempts jsonb;can_release boolean:=false;why text;begin
 s:=private.payroll_approval_state(p_run_id);select * into r from public.payroll_approval_runs where id=p_run_id;select * into b from public.payroll_payment_batches where run_id=r.id;
 begin perform private.payroll_payment_authority(r.id,true);can_release:=true;exception when raise_exception or insufficient_privilege then why:=sqlerrm;end;
 rows:=private.payroll_payment_rows(r.id);
 select coalesce(jsonb_agg(to_jsonb(a)-'bank_hash'-'verification_id'||jsonb_build_object('status',private.payroll_attempt_state(a.id),
 'lastEvent',coalesce((select max(id) from public.payroll_payment_events where attempt_id=a.id),0),
 'bankChanged',a.bank_hash<>private.payroll_bank_hash(a.employee_id),
 'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from public.payroll_payment_events e where e.attempt_id=a.id)) order by a.created_at),'[]') into attempts
 from public.payroll_payment_attempts a where a.batch_id=b.id;
 return jsonb_build_object('approval',s,'batch',case when b.id is null then null else to_jsonb(b)||jsonb_build_object('closed',exists(select 1 from public.payroll_payment_closures where batch_id=b.id)) end,
 'rows',rows,'attempts',attempts,'canRelease',can_release,'blockedReason',why,
 'canRecordOutcome',r.mode='live' and public.check_payroll_operation('release_payroll',r.scope_id,'payment') and private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff') and not(r.source_snapshot->'editors' @> jsonb_build_array(public.current_hris_user_id())),
 'totals',(select jsonb_build_object('net',r.source_snapshot->>'net','confirmed',sum((x->>'confirmed')::numeric)::text,'pending',sum((x->>'pending')::numeric)::text,'unpaid',sum((x->>'unpaid')::numeric)::text) from jsonb_array_elements(rows) x),
 'loanAdjustments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.payroll_loan_posting_adjustments x join public.payroll_loan_postings l on l.id=x.posting_id join public.payroll_disbursements d on d.id=l.disbursement_id where d.run_id=r.id),
 'exports',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'kind',o.kind,'at',o.created_at,'hash',o.payload_hash,'downloadRequests',(select count(*) from public.payroll_output_downloads where export_id=o.id)) order by o.created_at desc),'[]') from public.payroll_output_exports o where o.run_id=r.id));
end $$;

create function private.payroll_payment_bank_snapshot(p_run uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.payroll_approval_runs;e jsonb;h public.hris_users;v uuid;outp jsonb:='[]';begin
 select * into r from public.payroll_approval_runs where id=p_run;
 if not public.has_sensitive_permission('bank_information','view') then raise exception 'Existing HRIS bank-view permission required for an authorized payment schedule.' using errcode='42501';end if;
 for e in select value from jsonb_array_elements(r.source_snapshot->'employees') order by value->>'employeeId' loop
 if (e->>'net')::numeric=0 then continue;end if;
 select * into h from public.hris_users where id=(e->>'employeeId')::uuid;
 select id into v from public.payroll_payment_verifications where employee_id=h.id and details_hash=private.payroll_bank_hash(h.id) order by verified_at desc limit 1;
 if v is null or nullif(trim(h.bank_name),'') is null or nullif(trim(h.bank_account_number),'') is null then raise exception 'Current verified payment details missing for an employee.';end if;
 outp:=outp||jsonb_build_array(jsonb_build_object('employeeId',h.id,'verificationId',v,'bankName',h.bank_name,'last4',right(h.bank_account_number,4)));
 end loop;
 if exists(select 1 from public.payroll_payment_attempts a join public.payroll_payment_batches b on b.id=a.batch_id
 where b.run_id=r.id and private.payroll_attempt_state(a.id)='pending' and a.bank_hash<>private.payroll_bank_hash(a.employee_id)) then
 raise exception 'Bank details changed for a pending attempt. Reconcile the original attempt before exporting new instructions.';end if;
 return outp;
end $$;
create function public.create_payroll_output(p_run_id uuid,p_kind text) returns uuid
language plpgsql security definer set search_path='' as $$
declare w jsonb;r public.payroll_approval_runs;n public.payroll_net_runs;s public.payroll_special_runs;e jsonb;data jsonb;id uuid;label text;bank jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-approval:'||p_run_id::text,0));
 w:=public.get_payroll_payment_workspace(p_run_id);select * into r from public.payroll_approval_runs where id=p_run_id;
 if not private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff') or not private.payroll_gross_permission(r.scope_id,'view') then raise exception 'Scoped Finance with existing salary access required to generate exports.' using errcode='42501';end if;
 if p_kind='payment_schedule' then
 perform private.payroll_payment_authority(r.id,true);
 if w->'batch'='null'::jsonb or w#>>'{batch,closed}'='true' then raise exception 'Open the authorized payment batch first.';end if;
 bank:=private.payroll_payment_bank_snapshot(r.id);
 label:='AUTHORIZED PAYMENT SCHEDULE — existing verified process only; not a bank upload file or proof of payment';
 elsif p_kind in('register','finance','payment_preview','tax','agency') then
 label:=case when r.mode='shadow' then 'SHADOW — ' else '' end||'INTERNAL REVIEW WORKPAPER — not a bank/agency submission file or proof of payment';
 else raise exception 'Choose a supported export.';end if;
 select * into n from public.payroll_net_runs where id=r.net_run_id;select * into s from public.payroll_special_runs where id=r.special_run_id;
 data:=jsonb_build_object('label',label,'kind',p_kind,'runId',r.id,'sourceHash',r.source_hash,'mode',r.mode,'sourceCurrent',w#>'{approval,current}',
 'approvalStage',w#>>'{approval,stage}','from',r.source_snapshot->>'from','to',r.source_snapshot->>'to','payDate',r.source_snapshot->>'payDate',
 'version',r.source_snapshot->>'version','payKind',r.source_snapshot->>'kind','gross',r.source_snapshot->>'gross','deductions',r.source_snapshot->>'deductions','net',r.source_snapshot->>'net',
 'employer',coalesce(n.employer_amount,(s.result->>'employer')::numeric)::text,
 'employees',r.source_snapshot->'employees','payments',w->'rows','batch',w->'batch','totals',w->'totals','attempts',w->'attempts','bankVerification',bank,
 'contributionMonth',n.source_snapshot#>>'{review,contributionMonth}','reviewInputs',coalesce(n.source_snapshot->'review',s.inputs),
 'reportingNote','Per-version source data only. Annual/YTD values are snapshots, not additive. Reconcile both cutoffs, imported openings, previous employers and all special cases using the assigned filing process. Full bank and statutory IDs remain in the existing protected HRIS records.',
 'processes',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('owner',h.full_name)),'[]') from (select distinct on(code) * from public.payroll_output_processes where scope_id=r.scope_id order by code,id desc) p join public.hris_users h on h.id=p.owner_id));
 insert into public.payroll_output_exports(run_id,kind,payload,payload_hash,created_by) values(r.id,p_kind,data,md5(data::text),public.current_hris_user_id()) returning payroll_output_exports.id into id;return id;
end $$;
create function public.download_payroll_output(p_export_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$declare o public.payroll_output_exports;s jsonb;begin
 select * into o from public.payroll_output_exports where id=p_export_id;s:=private.payroll_approval_state(o.run_id);
 perform pg_advisory_xact_lock(hashtextextended('payroll-approval:'||o.run_id::text,0));
 if not private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff') then raise exception 'Current scoped Finance salary access required.' using errcode='42501';end if;
 if o.kind='payment_schedule' then
 perform private.payroll_payment_authority(o.run_id,true);
 if private.payroll_payment_bank_snapshot(o.run_id) is distinct from o.payload->'bankVerification'
 or (public.get_payroll_payment_workspace(o.run_id)->'rows') is distinct from o.payload->'payments'
 or (public.get_payroll_payment_workspace(o.run_id)->'attempts') is distinct from o.payload->'attempts'
 or exists(select 1 from public.payroll_payment_closures c join public.payroll_payment_batches b on b.id=c.batch_id where b.run_id=o.run_id) then
 raise exception 'Payment balances changed. Generate a current schedule; the old snapshot remains audit history.';end if;end if;
 insert into public.payroll_output_downloads(export_id,actor_id) values(o.id,public.current_hris_user_id());
 return o.payload||jsonb_build_object('exportId',o.id,'generatedAt',o.created_at,'hash',o.payload_hash);
end $$;

-- Receipt history is separate from current money received. Do not show a
-- returned batch as Paid in the existing approval list or dashboard.
do $$declare ddl text;begin
 ddl:=pg_get_functiondef('private.payroll_approval_state(uuid)'::regprocedure);
 ddl:=replace(ddl,'FUNCTION private.payroll_approval_state(','FUNCTION private.payroll_original_approval_state(');execute ddl;
end $$;
create or replace function private.payroll_approval_state(p_run uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare s jsonb;begin
 s:=private.payroll_original_approval_state(p_run);
 if s->>'paid'='true' and exists(select 1 from public.payroll_payment_batches where run_id=p_run)
 and exists(select 1 from jsonb_array_elements(private.payroll_payment_rows(p_run)) x where x->>'complete' is distinct from 'true') then
 s:=s||jsonb_build_object('stage','Payment returned / reissue pending','paid',false,'canAct',false,'canDisburse',false);end if;
 return s;
end $$;

-- Keep employee payslips immutable and private; append current payment status.
do $$declare ddl text;begin
 ddl:=pg_get_functiondef('public.get_my_payroll_payslip(uuid)'::regprocedure);
 ddl:=replace(ddl,'FUNCTION public.get_my_payroll_payslip(','FUNCTION private.payroll_original_my_payslip(');execute ddl;
end $$;
create or replace function public.get_my_payroll_payslip(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p jsonb;sl public.payroll_released_payslips;b uuid;pos jsonb;begin
 p:=private.payroll_original_my_payslip(p_id);
 select * into sl from public.payroll_released_payslips where id=p_id and employee_id=public.current_hris_user_id();
 select id into b from public.payroll_payment_batches where run_id=sl.run_id;
 if b is not null then
 pos:=private.payroll_employee_payment(b,sl.employee_id,(p->>'net')::numeric);
 p:=p||jsonb_build_object('paymentStatus',case when pos->>'complete'='true' then 'Payment reconciled' else 'Payment returned / reissue pending' end,'unpaid',pos->>'unpaid');end if;
 return p;
end $$;

do $$declare sig text;begin
 foreach sig in array array['private.payroll_payment_position(numeric,numeric,numeric)','private.payroll_payment_transition(text,text)',
 'private.payroll_attempt_state(uuid)','private.payroll_employee_payment(uuid,uuid,numeric)','private.payroll_payment_authority(uuid,boolean)',
 'private.payroll_payment_rows(uuid)','private.payroll_finish_disbursement(uuid,text,date,text)','private.payroll_original_my_payslip(uuid)',
 'private.payroll_original_approval_state(uuid)','private.payroll_payment_bank_snapshot(uuid)'] loop
 execute 'revoke all on function '||sig||' from public,anon,authenticated';end loop;
 foreach sig in array array['public.create_payroll_payment_batch(uuid,text)','public.close_payroll_payment_batch(uuid,text)',
 'public.prepare_payroll_payment_attempt(uuid,uuid,text,text,date,uuid)','public.record_payroll_payment_outcome(uuid,bigint,text,date,text,text,uuid)',
 'public.complete_payroll_payment_batch(uuid,text)','public.get_payroll_output_setup()','public.record_payroll_output_process(uuid,text,uuid,text)',
 'public.get_payroll_payment_workspace(uuid)','public.create_payroll_output(uuid,text)','public.download_payroll_output(uuid)'] loop
 execute 'revoke all on function '||sig||' from public,anon,authenticated';execute 'grant execute on function '||sig||' to authenticated';end loop;
end $$;
revoke all on sequence public.payroll_payment_events_id_seq,public.payroll_output_processes_id_seq,public.payroll_output_downloads_id_seq from public,anon,authenticated;
notify pgrst,'reload schema';
