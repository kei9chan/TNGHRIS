-- Phase 7: additive ordered approvals and private released payslips.
-- Login IDs and employee IDs are distinct in production. Preserve the existing
-- payroll actor/access helpers; correct only the seven new payroll callers whose
-- audit columns and own-pay comparisons use HRIS employee IDs.
do $$ declare sig text;ddl text;begin
 foreach sig in array array['private.payroll_net_review_validate(uuid,jsonb)','public.save_payroll_net_review(uuid,jsonb,text)',
 'public.record_payroll_loan_balance(uuid,text,date,text,text,text)','public.prepare_payroll_net(uuid,text)',
 'public.prepare_payroll_special(uuid,jsonb,text,uuid)','public.review_payroll_special(uuid,text)','public.get_payroll_special_context(uuid)'] loop
 ddl:=pg_get_functiondef(sig::regprocedure);
 ddl:=replace(ddl,'private.payroll_actor_id()','public.current_hris_user_id()');
 if sig='public.get_payroll_special_context(uuid)' then
 ddl:=replace(ddl,'if public.current_hris_user_id() is null then','if private.payroll_actor_id() is null then');end if;
 execute ddl;
 end loop;
end $$;

create table public.payroll_approval_runs (
 id uuid primary key default gen_random_uuid(),scope_id uuid not null references public.payroll_access_scopes(id),
 net_run_id uuid unique references public.payroll_net_runs(id),special_run_id uuid unique references public.payroll_special_runs(id),
 source_hash text not null,source_snapshot jsonb not null,settlement_key text not null,
 submitted_by uuid not null references public.hris_users(id),submitted_at timestamptz not null default now(),
 submission_ref text not null check(length(trim(submission_ref)) between 3 and 1000),
 correction_contact text not null check(length(trim(correction_contact)) between 3 and 300),
 mode text not null check(mode in('shadow','live')),check(num_nonnulls(net_run_id,special_run_id)=1)
);
create table public.payroll_approval_actions (
 id bigint generated always as identity primary key,run_id uuid not null references public.payroll_approval_runs(id),
 step integer not null check(step between 0 and 5),action text not null check(action in('approve','return')),
 actor_id uuid not null references public.hris_users(id),reason text not null check(length(trim(reason)) between 3 and 1000),
 occurred_at timestamptz not null default now(),unique(run_id,step)
);
create unique index payroll_two_distinct_bod on public.payroll_approval_actions(run_id,actor_id) where step in(4,5);
create table public.payroll_disbursements (
 id uuid primary key default gen_random_uuid(),run_id uuid not null unique references public.payroll_approval_runs(id),
 settlement_key text not null unique,scope_id uuid not null references public.payroll_access_scopes(id),
 reference text not null check(length(trim(reference)) between 3 and 1000),
 amount numeric(24,2) not null check(amount>=0),paid_on date not null,
 recorded_by uuid not null references public.hris_users(id),recorded_at timestamptz not null default now(),
 unique(scope_id,reference)
);
create table public.payroll_loan_postings (
 id uuid primary key default gen_random_uuid(),disbursement_id uuid not null references public.payroll_disbursements(id),
 employee_id uuid not null references public.hris_users(id),ledger_id uuid not null references public.payroll_loan_ledger(id),
 account_ref text not null,amount numeric(20,2) not null check(amount>0),
 created_at timestamptz not null default now(),unique(disbursement_id,employee_id,account_ref)
);
create table public.payroll_released_payslips (
 id uuid primary key default gen_random_uuid(),run_id uuid not null references public.payroll_approval_runs(id),
 disbursement_id uuid not null references public.payroll_disbursements(id),employee_id uuid not null references public.hris_users(id),
 payload jsonb not null,released_at timestamptz not null default now(),unique(run_id,employee_id)
);
create index payroll_approval_scope on public.payroll_approval_runs(scope_id,submitted_at desc);
create index payroll_payslip_employee on public.payroll_released_payslips(employee_id,released_at desc);
create index payroll_loan_posting_ledger on public.payroll_loan_postings(ledger_id);
do $$declare t text;begin
 foreach t in array array['payroll_approval_runs','payroll_approval_actions','payroll_disbursements','payroll_loan_postings','payroll_released_payslips'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('create trigger immutable before update or delete on public.%I for each row execute function private.payroll_audit_immutable()',t);
 end loop;end $$;

create function private.payroll_approval_stage(p_step integer) returns text language sql immutable set search_path='' as $$
 select (array['HR validation','HR endorsement','HR Manager authorization','Finance authorization','BOD approval 1 of 2','BOD approval 2 of 2','Approved / Locked'])[p_step+1]
$$;
create function private.payroll_approval_role(p_step integer,p_scope uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.payroll_actor_id() is not null and private.payroll_gross_permission(p_scope,'view') and
 case when p_step in(0,1) then private.payroll_has_access('review_endorse',p_scope) and
 (private.workflow_user_has_role(public.current_hris_user_id(),'HR Staff') or private.workflow_user_has_role(public.current_hris_user_id(),'HR Manager'))
 when p_step=2 then private.payroll_has_access('authorize_hr',p_scope) and private.workflow_user_has_role(public.current_hris_user_id(),'HR Manager')
 when p_step=3 then private.payroll_has_access('authorize_finance',p_scope) and private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff')
 when p_step in(4,5) then private.payroll_has_access('approve_bod',p_scope) and private.workflow_user_has_role(public.current_hris_user_id(),'Board of Director') else false end
$$;
-- Isolated approval simulation in shadow; existing live operation gates stay intact.
create function private.payroll_approval_mode(p_scope uuid) returns text language sql stable security definer set search_path='' as $$
 select s.processing_mode from public.payroll_access_scopes s where s.id=p_scope and s.processing_mode in('shadow','live')
 and not exists(select 1 from public.payroll_access_scopes p where p.id<>s.id and private.payroll_scope_covers(p.id,s.id) and p.processing_mode='off')
$$;

create function private.payroll_approval_source(p_net uuid,p_special uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare n public.payroll_net_runs;g public.payroll_gross_runs;t public.payroll_time_packages;s public.payroll_special_runs;
 v jsonb;editors jsonb;employees jsonb;scope uuid;source_hash text;
begin
 if num_nonnulls(p_net,p_special)<>1 then raise exception 'Choose one saved net or special-pay version.';end if;
 if p_net is not null then
 v:=public.get_payroll_net_run(p_net);if v->>'current' is distinct from 'true' then raise exception 'Payroll inputs changed. Rebuild the current version before approval.';end if;
 select * into n from public.payroll_net_runs where id=p_net;select * into g from public.payroll_gross_runs where id=n.gross_run_id;
 select * into t from public.payroll_time_packages where id=g.time_package_id;
 if t.status<>'submitted' or t.submitted_by is null or not exists(select 1 from public.hris_users h where h.auth_user_id=t.submitted_by and (private.workflow_user_has_role(h.id,'HR Staff') or private.workflow_user_has_role(h.id,'HR Manager'))) then raise exception 'HR must submit the current complete timekeeping version first.';end if;
 select jsonb_agg(distinct actor) into editors from (
 select n.created_by actor union select h.id from public.hris_users h where h.auth_user_id=g.created_by
 union select r.approved_by from public.payroll_net_reviews r where r.id=n.review_id
 union select value::uuid from jsonb_each_text(coalesce(n.source_snapshot#>'{review,employeeApprovals}','{}'))) q;
 select jsonb_agg(e||jsonb_build_object('lines',(select x->'lines' from jsonb_array_elements(g.result->'employees') x where x->>'employeeId'=e->>'employeeId'))) into employees from jsonb_array_elements(n.result->'employees') e;
 return jsonb_build_object('scope',n.scope_id,'hash',n.source_hash,'editors',editors,'employees',employees,'from',n.date_from,'to',n.date_to,
 'payDate',n.source_snapshot#>>'{review,payDate}','net',n.net_amount,'gross',n.gross_amount,'deductions',n.deduction_amount,
 'kind','regular','version',n.version,'timekeepingId',t.id,'timekeepingSubmittedAt',t.submitted_at,
 'key','regular:'||n.scope_id::text||':'||n.date_from::text||':'||n.date_to::text);
 end if;
 v:=public.get_payroll_special_run(p_special);if v->>'current' is distinct from 'true' or v->'review'='null'::jsonb or (v#>>'{result,negativeBalance}')::boolean then raise exception 'Special pay needs a current, nonnegative version and independent Finance check.';end if;
 select * into s from public.payroll_special_runs where id=p_special;
 select jsonb_agg(distinct actor) into editors from (select s.created_by actor union select reviewed_by from public.payroll_special_reviews where run_id=s.id) q;
 return jsonb_build_object('scope',s.scope_id,'hash',s.source_hash,'editors',editors,'employees',jsonb_build_array(s.result||jsonb_build_object('employeeId',s.employee_id,'employeeName',s.source_snapshot#>>'{employee,name}')),
 'from',s.date_from,'to',s.date_to,'payDate',s.pay_date,'net',s.net_amount,'gross',s.gross_amount,'deductions',s.deduction_amount,
 'kind',s.kind,'version',s.version,'key','special:'||s.employee_id::text||':'||s.case_key);
end $$;

create function public.submit_payroll_for_approval(p_net_id uuid,p_special_id uuid,p_reference text,p_contact text) returns uuid
language plpgsql security definer set search_path='' as $$
declare snap jsonb;scope uuid;mode text;id uuid;actor uuid:=public.current_hris_user_id();
begin
 snap:=private.payroll_approval_source(p_net_id,p_special_id);scope:=(snap->>'scope')::uuid;mode:=private.payroll_approval_mode(scope);
 if not private.payroll_gross_permission(scope,'prepare') or not private.workflow_user_has_role(actor,'Finance Staff') or mode is null then raise exception 'Scoped Finance preparer and BU/parent processing enabled required.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-approval-submit:'||(snap->>'key'),0));
 select a.id into id from public.payroll_approval_runs a where a.net_run_id=p_net_id or a.special_run_id=p_special_id;
 if id is not null then return id;end if;
 if exists(select 1 from public.payroll_disbursements d where d.settlement_key=snap->>'key') then raise exception 'This entitlement is already settled. Use a linked special-pay correction.';end if;
 snap:=snap||jsonb_build_object('editors',(snap->'editors')||jsonb_build_array(actor));
 insert into public.payroll_approval_runs(scope_id,net_run_id,special_run_id,source_hash,source_snapshot,settlement_key,submitted_by,submission_ref,correction_contact,mode)
 values(scope,p_net_id,p_special_id,snap->>'hash',snap,snap->>'key',actor,p_reference,p_contact,mode) returning payroll_approval_runs.id into id;
 return id;
end $$;

create function private.payroll_approval_state(p_run uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.payroll_approval_runs;snap jsonb;fresh boolean:=false;why text;step integer;returned boolean;paid boolean;eligible boolean;actor uuid:=public.current_hris_user_id();
begin
 select * into r from public.payroll_approval_runs where id=p_run;
 if r.id is null or not private.payroll_gross_permission(r.scope_id,'view') then raise exception 'Payroll approval outside authorized salary scope.' using errcode='42501';end if;
 if exists(select 1 from jsonb_array_elements(r.source_snapshot->'employees') e where not private.payroll_package_permission((e->>'employeeId')::uuid,r.scope_id,'view')) then raise exception 'Employee outside current salary access.' using errcode='42501';end if;
 select count(*) filter(where action='approve'),coalesce(bool_or(action='return'),false) into step,returned from public.payroll_approval_actions where run_id=r.id;
 paid:=exists(select 1 from public.payroll_disbursements where run_id=r.id);
 begin snap:=private.payroll_approval_source(r.net_run_id,r.special_run_id);fresh:=snap->>'hash'=r.source_hash;
 exception when raise_exception or serialization_failure then why:=sqlerrm;end;
 eligible:=fresh and not returned and not paid and step<6 and private.payroll_approval_mode(r.scope_id) is not null
 and private.payroll_approval_role(step,r.scope_id) and not (r.source_snapshot->'editors' @> jsonb_build_array(actor))
 and not exists(select 1 from public.payroll_approval_actions a where a.run_id=r.id and a.step in(4,5) and a.actor_id=actor)
 and not (r.special_run_id is not null and r.source_snapshot#>>'{employees,0,employeeId}'=actor::text);
 return jsonb_build_object('id',r.id,'scopeId',r.scope_id,'step',step,'stage',case when paid then 'Paid / Payslips released' when returned then 'Returned for revision' when not fresh then 'Inputs changed — approvals invalid' else private.payroll_approval_stage(step) end,
 'current',fresh,'staleReason',why,'returned',returned,'paid',paid,'mode',r.mode,'canAct',eligible,
 'canDisburse',fresh and step=6 and not returned and not paid and r.mode='live' and public.check_payroll_operation('release_payroll',r.scope_id,'payment') and private.workflow_user_has_role(actor,'Finance Staff') and not(r.source_snapshot->'editors' @> jsonb_build_array(actor)),
 'source',r.source_snapshot,'reference',r.submission_ref,'contact',r.correction_contact,
 'actions',(select coalesce(jsonb_agg(jsonb_build_object('step',a.step,'stage',private.payroll_approval_stage(a.step),'action',a.action,'actor',h.full_name,'at',a.occurred_at,'reason',a.reason) order by a.step),'[]') from public.payroll_approval_actions a join public.hris_users h on h.id=a.actor_id where a.run_id=r.id));
end $$;
create function public.get_payroll_approval(p_run_id uuid) returns jsonb language sql stable security definer set search_path='' as $$select private.payroll_approval_state(p_run_id)$$;
create function private.payroll_validate_approval_action(p_expected integer,p_current integer,p_allowed boolean,p_action text) returns void
language plpgsql immutable set search_path='' as $$begin
 if p_allowed is distinct from true or p_expected is distinct from p_current or p_current not between 0 and 5 or p_current is null then
 raise exception 'This stage is unavailable, changed, already acted on, or requires a different authorized reviewer.' using errcode='42501';end if;
 if p_action is null or p_action not in('approve','return') then raise exception 'Choose approve or return.';end if;
end $$;
create function public.act_on_payroll_approval(p_run_id uuid,p_step integer,p_action text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare state jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-approval:'||p_run_id::text,0));
 state:=private.payroll_approval_state(p_run_id);
 perform private.payroll_validate_approval_action(p_step,(state->>'step')::int,(state->>'canAct')::boolean,p_action);
 insert into public.payroll_approval_actions(run_id,step,action,actor_id,reason) values(p_run_id,p_step,p_action,public.current_hris_user_id(),p_reason);
end $$;
create function public.list_payroll_approvals() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r record;s jsonb;outp jsonb:='[]';begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS login required.' using errcode='42501';end if;
 for r in select id from public.payroll_approval_runs where private.payroll_gross_permission(scope_id,'view') order by submitted_at desc limit 100 loop
 begin s:=private.payroll_approval_state(r.id);outp:=outp||jsonb_build_array(s-'source'-'actions'||jsonb_build_object('from',s#>>'{source,from}','to',s#>>'{source,to}','kind',s#>>'{source,kind}','version',s#>>'{source,version}'));exception when insufficient_privilege then null;end;
 end loop;return outp;
end $$;

-- Confirmed full disbursement only; partial/failed/reissue handling is Phase 8.
-- Hard gated by both LIVE mode and the existing release operation gate. Shadow
-- approvals can never produce a payment, actual loan posting or employee payslip.
create function public.record_payroll_disbursement(p_run_id uuid,p_reference text,p_paid_on date,p_amount text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.payroll_approval_runs;state jsonb;d public.payroll_disbursements;e jsonb;l jsonb;opening public.payroll_loan_ledger;posted numeric;amount numeric;paydate date;
begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-approval:'||p_run_id::text,0));
 state:=private.payroll_approval_state(p_run_id);select * into r from public.payroll_approval_runs where id=p_run_id;
 -- A repeat is still authorized, and must describe the identical real receipt.
 if not public.check_payroll_operation('release_payroll',r.scope_id,'payment') or not private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff') or r.mode<>'live' then raise exception 'Live payroll activation and scoped Finance release authority required.' using errcode='42501';end if;
 amount:=private.payroll_net_money(jsonb_build_object('amount',p_amount),'amount');
 select * into d from public.payroll_disbursements where run_id=r.id;
 if d.id is not null then if d.reference=trim(p_reference) and d.paid_on=p_paid_on and d.amount=amount then return d.id;else raise exception 'Disbursement already recorded; do not overwrite a receipt.';end if;end if;
 if state->>'canDisburse' is distinct from 'true' then raise exception 'Complete the current independent HR / Finance / two-BOD approvals first.' using errcode='42501';end if;
 paydate:=(r.source_snapshot->>'payDate')::date;
 if p_paid_on is null or p_paid_on<paydate or p_paid_on>(now() at time zone 'Asia/Manila')::date or amount<>(r.source_snapshot->>'net')::numeric then raise exception 'Record the actual full approved amount on or after its reviewed payday, never a future assumed receipt.';end if;
 if r.special_run_id is not null then raise exception 'Special-pay settlements require the Phase 8 cross-case payment reconciliation. No special-pay disbursement is enabled yet.';end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-settlement:'||r.settlement_key,0));
 -- Loan locks use the existing reconciliation writer's key and are acquired in
 -- deterministic order. Postings never rewrite the immutable opening snapshot.
 for e in select value from jsonb_array_elements(r.source_snapshot->'employees') order by value->>'employeeId' loop
 for l in select value from jsonb_array_elements(coalesce(e->'loans','[]')) order by value->>'account' loop
 if (l->>'amount')::numeric<=0 then continue;end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll-loan:'||(e->>'employeeId')||':'||(l->>'account'),0));
 select * into opening from public.payroll_loan_ledger where employee_id=(e->>'employeeId')::uuid and account_ref=l->>'account' order by revision desc limit 1;
 if opening.id is distinct from (l->>'ledgerId')::uuid then raise exception 'Loan opening changed. Reconcile and reapprove payroll.';end if;
 select coalesce(sum(lp.amount),0) into posted from public.payroll_loan_postings lp where lp.ledger_id=opening.id;
 if opening.balance-posted<>(l->>'balance')::numeric then raise exception 'Loan actual balance differs from the approved projection. Settle preceding payroll or reconcile before release.';end if;
 end loop;end loop;
 insert into public.payroll_disbursements(run_id,settlement_key,scope_id,reference,amount,paid_on,recorded_by)
 values(r.id,r.settlement_key,r.scope_id,trim(p_reference),amount,p_paid_on,public.current_hris_user_id()) returning * into d;
 for e in select value from jsonb_array_elements(r.source_snapshot->'employees') loop
 for l in select value from jsonb_array_elements(coalesce(e->'loans','[]')) loop
 if (l->>'amount')::numeric>0 then insert into public.payroll_loan_postings(disbursement_id,employee_id,ledger_id,account_ref,amount)
 values(d.id,(e->>'employeeId')::uuid,(l->>'ledgerId')::uuid,l->>'account',(l->>'amount')::numeric);end if;end loop;
 insert into public.payroll_released_payslips(run_id,disbursement_id,employee_id,payload)
 values(r.id,d.id,(e->>'employeeId')::uuid,jsonb_build_object('employeeName',e->>'employeeName','from',r.source_snapshot->>'from','to',r.source_snapshot->>'to','payDate',p_paid_on,
 'gross',e->>'gross','deductions',e->>'deductions','net',e->>'net','tax',e->>'tax','lines',e->'lines','contributions',e->'contributions','loans',e->'loans','otherDeductions',e->'otherDeductions','contact',r.correction_contact,'version',r.source_snapshot->>'version'));
 end loop;return d.id;
end $$;
create function public.list_my_payroll_payslips() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS login required.' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'from',payload->>'from','to',payload->>'to','net',payload->>'net','releasedAt',released_at) order by released_at desc),'[]') from public.payroll_released_payslips where employee_id=public.current_hris_user_id());end $$;
create function public.get_my_payroll_payslip(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare p jsonb;begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS login required.' using errcode='42501';end if;
 select payload||jsonb_build_object('id',id,'releasedAt',released_at) into p from public.payroll_released_payslips where id=p_id and employee_id=public.current_hris_user_id();
 if p is null then raise exception 'Released payslip unavailable for this account.' using errcode='42501';end if;return p;end $$;
revoke all on function private.payroll_validate_approval_action(integer,integer,boolean,text),private.payroll_approval_stage(integer),private.payroll_approval_role(integer,uuid),private.payroll_approval_mode(uuid),private.payroll_approval_source(uuid,uuid),private.payroll_approval_state(uuid) from public,anon,authenticated;
revoke all on function public.submit_payroll_for_approval(uuid,uuid,text,text),public.get_payroll_approval(uuid),public.act_on_payroll_approval(uuid,integer,text,text),public.list_payroll_approvals(),public.record_payroll_disbursement(uuid,text,date,text),public.list_my_payroll_payslips(),public.get_my_payroll_payslip(uuid) from public,anon,authenticated;
grant execute on function public.submit_payroll_for_approval(uuid,uuid,text,text),public.get_payroll_approval(uuid),public.act_on_payroll_approval(uuid,integer,text,text),public.list_payroll_approvals(),public.record_payroll_disbursement(uuid,text,date,text),public.list_my_payroll_payslips(),public.get_my_payroll_payslip(uuid) to authenticated;
notify pgrst,'reload schema';
