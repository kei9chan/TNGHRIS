-- Phase 9: real-cutoff comparison evidence and deliberately gated pilot activation.
-- No seeded duties, payroll data, approvals or processing-mode updates.
create table public.payroll_comparisons (
 id uuid primary key default gen_random_uuid(),run_id uuid not null references public.payroll_approval_runs(id),
 scope_id uuid not null references public.payroll_access_scopes(id),source_hash text not null,
 source_rows jsonb not null,input jsonb not null,results jsonb not null,input_hash text not null,
 created_by uuid not null references public.hris_users(id),created_at timestamptz not null default clock_timestamp(),unique(run_id,input_hash)
);
create table public.payroll_comparison_acceptances (
 comparison_id uuid not null references public.payroll_comparisons(id),duty text not null check(duty in('hr','finance')),
 actor_id uuid not null references public.hris_users(id),reference text not null check(length(trim(reference)) between 3 and 1000),
 created_at timestamptz not null default now(),primary key(comparison_id,duty),unique(comparison_id,actor_id)
);
create table public.payroll_pilot_proposals (
 id uuid primary key default gen_random_uuid(),scope_id uuid not null references public.payroll_access_scopes(id),
 first_comparison uuid not null references public.payroll_comparisons(id),second_comparison uuid not null references public.payroll_comparisons(id),
 date_from date not null,date_to date not null,evidence jsonb not null,proof_hash text not null,
 created_by uuid not null references public.hris_users(id),created_at timestamptz not null default now(),check(first_comparison<>second_comparison)
);
create table public.payroll_pilot_decisions (
 proposal_id uuid not null references public.payroll_pilot_proposals(id),actor_id uuid not null references public.hris_users(id),
 reference text not null check(length(trim(reference)) between 3 and 1000),created_at timestamptz not null default now(),primary key(proposal_id,actor_id)
);
create table public.payroll_pilot_activations (
 id uuid primary key default gen_random_uuid(),proposal_id uuid not null unique references public.payroll_pilot_proposals(id),
 scope_id uuid not null unique references public.payroll_access_scopes(id),actor_id uuid not null references public.hris_users(id),
 reference text not null check(length(trim(reference)) between 3 and 1000),created_at timestamptz not null default now()
);
create table public.payroll_pilot_monitoring (
 id uuid primary key default gen_random_uuid(),activation_id uuid not null references public.payroll_pilot_activations(id),run_id uuid not null references public.payroll_approval_runs(id),
 duty text not null check(duty in('hr','finance')),actor_id uuid not null references public.hris_users(id),
 reference text not null check(length(trim(reference)) between 3 and 1000),payment_hash text not null,
 created_at timestamptz not null default clock_timestamp(),unique(activation_id,duty,payment_hash)
);
create table public.payroll_pilot_promotions (
 activation_id uuid primary key references public.payroll_pilot_activations(id),actor_id uuid not null references public.hris_users(id),
 reference text not null check(length(trim(reference)) between 3 and 1000),created_at timestamptz not null default now()
);
create index payroll_comparison_latest on public.payroll_comparisons(run_id,created_at desc);
create index payroll_comparison_scope on public.payroll_comparisons(scope_id,created_at desc);
create index payroll_pilot_scope on public.payroll_pilot_proposals(scope_id,created_at desc);
do $$ declare t text;begin
 foreach t in array array['payroll_comparisons','payroll_comparison_acceptances','payroll_pilot_proposals','payroll_pilot_decisions','payroll_pilot_activations','payroll_pilot_monitoring','payroll_pilot_promotions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('create trigger immutable before update or delete on public.%I for each row execute function private.payroll_audit_immutable()',t);
 end loop;end $$;

create function private.payroll_comparison_rows(p_source jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare e jsonb;l jsonb;k text;i integer;outp jsonb:='[]';base jsonb;
begin
 for e in select value from jsonb_array_elements(p_source->'employees') loop
 base:=jsonb_build_object('employeeId',e->>'employeeId','employeeName',e->>'employeeName');
 foreach k in array array['gross','deductions','net','tax','employer'] loop
 outp:=outp||jsonb_build_array(base||jsonb_build_object('key','total:'||k,'label',k,'amount',private.payroll_net_money(e,k,true)::text));end loop;
 foreach k in array array['lines','contributions','loans','otherDeductions'] loop
 i:=0;for l in select value from jsonb_array_elements(coalesce(e->k,'[]')) loop
 i:=i+1;outp:=outp||jsonb_build_array(base||jsonb_build_object('key',k||':'||i,'label',coalesce(l->>'label',l->>'account',k)||coalesce(' · '||(l->>'date'),''),'amount',private.payroll_net_money(l,'amount',true)::text));
 end loop;end loop;
 end loop;
 return outp;
end $$;
create function private.payroll_compare_values(p_source jsonb,p_input jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare s jsonb;r jsonb;v numeric;delta numeric;outp jsonb:='[]';roster jsonb;
begin
 if jsonb_typeof(p_input->'rows') is distinct from 'array' or jsonb_typeof(p_input->'legacyEmployees') is distinct from 'array'
 or jsonb_array_length(p_input->'rows')<>jsonb_array_length(p_source) or jsonb_array_length(p_source)=0 or jsonb_array_length(p_source)>50000 then raise exception 'Supply every comparison row, including zero amounts.';end if;
 if exists(select 1 from jsonb_array_elements(p_input->'rows') x group by x->>'employeeId',x->>'key' having count(*)<>1) then raise exception 'Duplicate comparison rows.';end if;
 select jsonb_agg(id order by id) into roster from (select distinct x->>'employeeId' id from jsonb_array_elements(p_source) x) q;
 if roster is distinct from (select jsonb_agg(value order by value) from jsonb_array_elements_text(p_input->'legacyEmployees')) then raise exception 'Legacy payroll roster differs: reconcile omitted, additional or duplicate employees first.';end if;
 if length(trim(coalesce(p_input->>'sourceRef','')))<3 or length(trim(coalesce(p_input->>'coverageRef','')))<3 then raise exception 'Legacy register and component/employee coverage evidence references required.';end if;
 for s in select value from jsonb_array_elements(p_source) loop
 select x into r from jsonb_array_elements(p_input->'rows') x where x->>'employeeId'=s->>'employeeId' and x->>'key'=s->>'key';
 if r is null then raise exception 'Missing or changed comparison row.';end if;
 v:=private.payroll_net_money(r,'legacyAmount',true);delta:=(s->>'amount')::numeric-v;
 if length(coalesce(r->>'explanation',''))>1000 or length(coalesce(r->>'policyRef',''))>1000 then raise exception 'Explanation/reference exceeds 1,000 characters.';end if;
 outp:=outp||jsonb_build_array(s||jsonb_build_object('legacyAmount',v::text,'difference',delta::text,'explanation',r->>'explanation','policyRef',r->>'policyRef',
 'resolved',delta=0 or (length(trim(coalesce(r->>'explanation','')))>=3 and length(trim(coalesce(r->>'policyRef','')))>=3)));
 end loop;return outp;
end $$;
create function private.payroll_phase9_role(p_scope uuid,p_duty text) returns boolean language sql stable security definer set search_path='' as $$
 select case p_duty when 'hr' then private.payroll_approval_role(2,p_scope) when 'finance' then private.payroll_approval_role(3,p_scope) when 'bod' then private.payroll_approval_role(4,p_scope) else false end
$$;
create function public.get_payroll_comparison_template(p_run_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.payroll_approval_runs;s jsonb;begin
 s:=private.payroll_approval_state(p_run_id);select * into a from public.payroll_approval_runs where id=p_run_id;
 if a.mode<>'shadow' or a.net_run_id is null or s->>'current' is distinct from 'true' then raise exception 'Choose a current regular shadow payroll version.';end if;
 return jsonb_build_object('runId',a.id,'sourceHash',a.source_hash,'from',a.source_snapshot->>'from','to',a.source_snapshot->>'to','rows',private.payroll_comparison_rows(a.source_snapshot));
end $$;
create function public.save_payroll_comparison(p_run_id uuid,p_source_hash text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare t jsonb;a public.payroll_approval_runs;v jsonb;id uuid;h text;begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-pilot-control',0));
 t:=public.get_payroll_comparison_template(p_run_id);select * into a from public.payroll_approval_runs where id=p_run_id;
 if not private.payroll_gross_permission(a.scope_id,'prepare') or not private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff') then raise exception 'Scoped Finance preparer and existing salary access required.' using errcode='42501';end if;
 if t->>'sourceHash' is distinct from p_source_hash then raise exception 'Workbook belongs to another source version. Download the current template.';end if;
 v:=private.payroll_compare_values(t->'rows',p_input);h:=md5(p_input::text);
 select c.id into id from public.payroll_comparisons c where c.run_id=p_run_id and c.input_hash=h;if id is not null then return id;end if;
 insert into public.payroll_comparisons(run_id,scope_id,source_hash,source_rows,input,results,input_hash,created_by)
 values(a.id,a.scope_id,a.source_hash,t->'rows',p_input,v,h,public.current_hris_user_id()) returning payroll_comparisons.id into id;return id;
end $$;
create function private.payroll_comparison_ready(p_id uuid,p_accepted boolean) returns public.payroll_comparisons language plpgsql stable security definer set search_path='' as $$
declare c public.payroll_comparisons;s jsonb;begin
 select * into c from public.payroll_comparisons where id=p_id;
 if c.id is null then raise exception 'Comparison unavailable.' using errcode='42501';end if;
 s:=private.payroll_approval_state(c.run_id);
 if c.id is distinct from (select id from public.payroll_comparisons where run_id=c.run_id order by created_at desc,id desc limit 1)
 or s->>'current' is distinct from 'true' or s->>'mode'<>'shadow' or s#>>'{source,hash}' is distinct from c.source_hash then raise exception 'Comparison is superseded or its payroll source changed.';end if;
 if (s#>>'{source,to}')::date>(now() at time zone 'Asia/Manila')::date or (s->>'step')::int<>6 or s->>'returned'='true'
 or exists(select 1 from jsonb_array_elements(c.results) x where x->>'resolved' is distinct from 'true') then raise exception 'Complete the real cutoff, all six shadow approvals and every difference explanation before acceptance.';end if;
 if p_accepted and (select count(*) from public.payroll_comparison_acceptances where comparison_id=c.id)<>2 then raise exception 'Independent HR and Finance acceptance required for both cutoffs.';end if;
 return c;
end $$;
create function public.accept_payroll_comparison(p_id uuid,p_duty text,p_reference text) returns void language plpgsql security definer set search_path='' as $$
declare c public.payroll_comparisons;begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-pilot-control',0));c:=private.payroll_comparison_ready(p_id,false);
 if p_duty not in('hr','finance') or not private.payroll_phase9_role(c.scope_id,p_duty) or c.created_by=public.current_hris_user_id() then raise exception 'An independent assigned HR Manager / Finance authorizer must accept the comparison.' using errcode='42501';end if;
 insert into public.payroll_comparison_acceptances(comparison_id,duty,actor_id,reference) values(c.id,p_duty,public.current_hris_user_id(),p_reference);
end $$;

create function private.payroll_pilot_dates(p_from date,p_to date) returns boolean language sql immutable set search_path='' as $$
 select coalesce((extract(day from p_from)=11 and p_to=p_from+14) or (extract(day from p_from)=26 and p_to=(date_trunc('month',p_from)+interval '1 month 9 days')::date),false)
$$;
create function private.payroll_pilot_proof(p_scope uuid,p_first uuid,p_second uuid,p_from date,p_to date,p_evidence jsonb) returns text language plpgsql stable security definer set search_path='' as $$
declare c1 public.payroll_comparisons;c2 public.payroll_comparisons;n1 public.payroll_net_runs;n2 public.payroll_net_runs;k text;processes jsonb;
begin
 if not private.payroll_gross_permission(p_scope,'view') then raise exception 'Existing scoped salary access required.' using errcode='42501';end if;
 c1:=private.payroll_comparison_ready(p_first,true);c2:=private.payroll_comparison_ready(p_second,true);
 select n.* into n1 from public.payroll_net_runs n join public.payroll_approval_runs a on a.net_run_id=n.id where a.id=c1.run_id;
 select n.* into n2 from public.payroll_net_runs n join public.payroll_approval_runs a on a.net_run_id=n.id where a.id=c2.run_id;
 if c1.scope_id<>p_scope or c2.scope_id<>p_scope or n1.date_to+1<>n2.date_from or n2.date_to>=p_from
 or n1.source_snapshot#>>'{review,contributionMonth}' is distinct from n2.source_snapshot#>>'{review,contributionMonth}'
 or n1.source_snapshot#>>'{review,cutoff}' is distinct from '1' or n2.source_snapshot#>>'{review,cutoff}' is distinct from '2'
 or n2.source_snapshot#>>'{review,previousRunId}' is distinct from n1.id::text then raise exception 'Use two consecutive accepted cutoffs covering one contribution month, with the second linked to the first; handover must follow them.';end if;
 if not private.payroll_pilot_dates(p_from,p_to) or not exists(select 1 from public.payroll_access_scopes where id=p_scope and kind='business_unit') then raise exception 'Choose one business unit and a complete 11–25 or 26–10 first live cutoff.';end if;
 foreach k in array array['handoverRef','legacyStoppedRef','taxOpeningRef','contributionOpeningRef','loanOpeningRef','inFlightPaymentsRef','coverageRef'] loop
 if length(trim(coalesce(p_evidence->>k,''))) not between 3 and 1000 then raise exception 'Document handover, legacy stop/ownership, YTD tax, contributions, loans, in-flight payments and supported/unsupported coverage (%).',k;end if;end loop;
 select jsonb_agg(to_jsonb(q) order by q.code) into processes from (select distinct on(code) id,code,owner_id,process_ref from public.payroll_output_processes where scope_id=p_scope order by code,id desc) q;
 if jsonb_array_length(coalesce(processes,'[]'))<>8 or exists(select 1 from jsonb_array_elements(processes) x where not private.workflow_user_has_role((x->>'owner_id')::uuid,'Finance Staff')) then raise exception 'Assign active Finance owners and the existing bank, tax, agency and special-pay processes in Payments & Reports.';end if;
 return md5(jsonb_build_object('first',c1.id,'firstHash',c1.input_hash,'second',c2.id,'secondHash',c2.input_hash,'from',p_from,'to',p_to,'evidence',p_evidence,'processes',processes)::text);
end $$;
create function public.propose_payroll_pilot(p_scope uuid,p_first uuid,p_second uuid,p_from date,p_to date,p_evidence jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare h text;id uuid;begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-pilot-control',0));
 if not private.payroll_phase9_role(p_scope,'finance') then raise exception 'Assigned Finance authorizer required to propose the handover.' using errcode='42501';end if;
 h:=private.payroll_pilot_proof(p_scope,p_first,p_second,p_from,p_to,p_evidence);
 if exists(select 1 from public.payroll_pilot_activations where scope_id=p_scope) then raise exception 'This BU already has an immutable handover. Use its pilot controls.';end if;
 insert into public.payroll_pilot_proposals(scope_id,first_comparison,second_comparison,date_from,date_to,evidence,proof_hash,created_by)
 values(p_scope,p_first,p_second,p_from,p_to,p_evidence,h,public.current_hris_user_id()) returning payroll_pilot_proposals.id into id;return id;
end $$;
create function private.payroll_check_proposal(p_id uuid) returns public.payroll_pilot_proposals language plpgsql stable security definer set search_path='' as $$
declare p public.payroll_pilot_proposals;begin
 select * into p from public.payroll_pilot_proposals where id=p_id;if p.id is null then raise exception 'Pilot proposal not found.';end if;
 if p.proof_hash is distinct from private.payroll_pilot_proof(p.scope_id,p.first_comparison,p.second_comparison,p.date_from,p.date_to,p.evidence) then raise exception 'Pilot evidence changed. Create a fresh proposal and obtain fresh BOD decisions.';end if;return p;
end $$;
create function public.approve_payroll_pilot(p_id uuid,p_reference text) returns void language plpgsql security definer set search_path='' as $$
declare p public.payroll_pilot_proposals;begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-pilot-control',0));p:=private.payroll_check_proposal(p_id);
 if not private.payroll_phase9_role(p.scope_id,'bod') or p.created_by=public.current_hris_user_id() then raise exception 'A distinct assigned BOD approver must approve this pilot.' using errcode='42501';end if;
 if (select count(*) from public.payroll_pilot_decisions where proposal_id=p.id)>=2 then raise exception 'Both BOD decisions are already recorded.';end if;
 insert into public.payroll_pilot_decisions(proposal_id,actor_id,reference) values(p.id,public.current_hris_user_id(),p_reference);
end $$;

create function private.payroll_live_window(p_scope uuid,p_from date,p_to date) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(exists(select 1 from public.payroll_pilot_activations a join public.payroll_pilot_proposals p on p.id=a.proposal_id
 where a.scope_id=p_scope and private.payroll_pilot_dates(p_from,p_to) and
 ((p_from=p.date_from and p_to=p.date_to) or (p_from>p.date_to and exists(select 1 from public.payroll_pilot_promotions where activation_id=a.id)))),false)
$$;
create function private.payroll_assert_live_window(p_scope uuid,p_source jsonb) returns void language plpgsql stable security definer set search_path='' as $$begin
 if p_source->>'kind' is distinct from 'regular' or not private.payroll_live_window(p_scope,(p_source->>'from')::date,(p_source->>'to')::date) then raise exception 'Live payroll is limited to the authorized handover cutoff until HR and Finance accept its paid reconciliation and the access manager continues the rollout.' using errcode='42501';end if;
end $$;
-- Ordinary grants alone cannot enable live processing. A recorded two-BOD handover
-- certificate is required, even for privileged direct mode changes.
alter table public.payroll_access_scopes drop constraint payroll_no_live_processing;
create function private.payroll_require_live_certificate() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.processing_mode='live' and (new.kind<>'business_unit' or not exists(select 1 from public.payroll_pilot_activations where scope_id=new.id)) then raise exception 'A certified business-unit pilot is required for live processing.';end if;return new;
end $$;
create trigger payroll_live_certificate before insert or update of processing_mode on public.payroll_access_scopes for each row execute function private.payroll_require_live_certificate();
create function public.activate_payroll_pilot(p_id uuid,p_reference text) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.payroll_pilot_proposals;a public.payroll_pilot_activations;begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-pilot-control',0));
 select * into p from public.payroll_pilot_proposals where id=p_id;
 if p.id is null or not private.payroll_has_access('manage_access',p.scope_id) then raise exception 'Scoped Payroll Access manager required.' using errcode='42501';end if;
 if length(trim(coalesce(p_reference,''))) not between 3 and 1000 then raise exception 'Activation/handover decision reference required.';end if;
 select * into a from public.payroll_pilot_activations where scope_id=p.scope_id;
 if a.id is null then
 p:=private.payroll_check_proposal(p_id);
 if (select count(*) from public.payroll_pilot_decisions where proposal_id=p.id and private.workflow_user_has_role(actor_id,'Board of Director'))<>2 then raise exception 'Two distinct BOD approvals required.';end if;
 if exists(select 1 from public.payroll_pilot_activations x where not exists(select 1 from public.payroll_pilot_promotions where activation_id=x.id)) then raise exception 'Finish the first live cutoff review for the current pilot before adding another BU.';end if;
 if p.date_to<(now() at time zone 'Asia/Manila')::date then raise exception 'The proposed first live cutoff has already ended. Create a current handover proposal.';end if;
 insert into public.payroll_pilot_activations(proposal_id,scope_id,actor_id,reference) values(p.id,p.scope_id,public.current_hris_user_id(),p_reference) returning * into a;
 elsif a.proposal_id<>p.id then raise exception 'Use this BU’s original handover certificate to resume.';end if;
 if exists(select 1 from public.payroll_access_scopes s where s.id<>p.scope_id and private.payroll_scope_covers(s.id,p.scope_id) and s.processing_mode='off') then raise exception 'Enable the parent shadow gate in Gross Pay first; other BUs remain off.';end if;
 update public.payroll_access_scopes set processing_mode='live' where id=p.scope_id;
 -- Existing mode audit uses Auth IDs, unlike the new employee audit columns.
 insert into public.payroll_gross_audit(scope_id,actor_id,action,record_id,reason) values(p.scope_id,private.payroll_actor_id(),'pilot_live_enabled',a.id,trim(p_reference));
 return a.id;
end $$;

create function private.payroll_pilot_payment_proof(p_activation uuid,p_run uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare a public.payroll_pilot_activations;p public.payroll_pilot_proposals;r public.payroll_approval_runs;s jsonb;rows jsonb;e jsonb;l jsonb;posted numeric;begin
 select * into a from public.payroll_pilot_activations where id=p_activation;select * into p from public.payroll_pilot_proposals where id=a.proposal_id;
 s:=private.payroll_approval_state(p_run);select * into r from public.payroll_approval_runs where id=p_run;
 if r.scope_id is distinct from a.scope_id or r.mode<>'live' or (r.source_snapshot->>'from')::date is distinct from p.date_from or (r.source_snapshot->>'to')::date is distinct from p.date_to
 or not exists(select 1 from public.payroll_disbursements where run_id=r.id) then raise exception 'Review the actual paid first live cutoff for this pilot.';end if;
 rows:=private.payroll_payment_rows(r.id);
 if jsonb_array_length(rows)=0 or exists(select 1 from jsonb_array_elements(rows) x where x->>'complete' is distinct from 'true') then raise exception 'Resolve all pending, failed, returned or unpaid amounts before accepting the first live cutoff.';end if;
 for e in select value from jsonb_array_elements(r.source_snapshot->'employees') loop
 for l in select value from jsonb_array_elements(coalesce(e->'loans','[]')) loop
 select coalesce(sum(x.amount+coalesce((select sum(z.amount) from public.payroll_loan_posting_adjustments z where z.posting_id=x.id),0)),0) into posted from public.payroll_loan_postings x join public.payroll_disbursements d on d.id=x.disbursement_id where d.run_id=r.id and x.employee_id=(e->>'employeeId')::uuid and x.account_ref=l->>'account';
 if posted<>(l->>'amount')::numeric then raise exception 'Complete payment reconciliation and loan restoration in Payments & Reports before pilot review.';end if;end loop;end loop;
 return md5(jsonb_build_object('run',r.id,'rows',rows,'events',(select jsonb_agg(e.id order by e.id) from public.payroll_payment_events e join public.payroll_payment_attempts t on t.id=e.attempt_id join public.payroll_payment_batches b on b.id=t.batch_id where b.run_id=r.id))::text);
end $$;
create function public.review_payroll_pilot(p_activation uuid,p_run uuid,p_duty text,p_reference text) returns void language plpgsql security definer set search_path='' as $$
declare a public.payroll_pilot_activations;h text;begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-pilot-control',0));select * into a from public.payroll_pilot_activations where id=p_activation;
 if a.id is null or p_duty not in('hr','finance') or not private.payroll_phase9_role(a.scope_id,p_duty)
 or exists(select 1 from public.payroll_approval_runs r where r.id=p_run and r.source_snapshot->'editors' @> jsonb_build_array(public.current_hris_user_id())) then raise exception 'Independent assigned HR / Finance reviewer required.' using errcode='42501';end if;
 h:=private.payroll_pilot_payment_proof(a.id,p_run);
 if exists(select 1 from public.payroll_pilot_monitoring where activation_id=a.id and actor_id=public.current_hris_user_id() and duty<>p_duty) then raise exception 'HR and Finance pilot reviewers must be different people.';end if;
 insert into public.payroll_pilot_monitoring(activation_id,run_id,duty,actor_id,reference,payment_hash) values(a.id,p_run,p_duty,public.current_hris_user_id(),p_reference,h);
end $$;
create function public.continue_payroll_pilot(p_activation uuid,p_reference text) returns void language plpgsql security definer set search_path='' as $$
declare a public.payroll_pilot_activations;m public.payroll_pilot_monitoring;begin
 perform pg_advisory_xact_lock(hashtextextended('payroll-pilot-control',0));select * into a from public.payroll_pilot_activations where id=p_activation;
 if a.id is null or not private.payroll_has_access('manage_access',a.scope_id) then raise exception 'Scoped Payroll Access manager required.' using errcode='42501';end if;
 if (select count(distinct duty) from public.payroll_pilot_monitoring where activation_id=a.id)<>2 then raise exception 'Both independent HR and Finance first-live-cutoff acceptances required.';end if;
 for m in select distinct on(duty) * from public.payroll_pilot_monitoring where activation_id=a.id order by duty,created_at desc,id desc loop
 if m.payment_hash is distinct from private.payroll_pilot_payment_proof(a.id,m.run_id) then raise exception 'Payment evidence changed after review; reconcile and obtain a fresh review before continuing.';end if;end loop;
 insert into public.payroll_pilot_promotions(activation_id,actor_id,reference) values(a.id,public.current_hris_user_id(),p_reference);
end $$;

create or replace function public.check_payroll_operation(p_permission text,p_scope_id uuid,p_operation text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.payroll_has_access(p_permission,p_scope_id) and exists(select 1 from public.payroll_access_scopes s where s.id=p_scope_id
 and ((p_operation='calculate' and p_permission='prepare_pr' and s.processing_mode in('shadow','live'))
 or (p_operation='approve' and p_permission in('review_endorse','authorize_hr','authorize_finance','approve_bod') and s.processing_mode='live')
 or (p_operation in('release','official_export','loan_post','payment') and p_permission='release_payroll' and s.processing_mode='live'))
 and (s.processing_mode<>'live' or exists(select 1 from public.payroll_pilot_activations where scope_id=s.id))
 and not exists(select 1 from public.payroll_access_scopes p where p.id<>s.id and private.payroll_scope_covers(p.id,s.id) and p.processing_mode='off'))
$$;

-- A calculation may be reused, but a live approval workflow never inherits any
-- shadow decision. Settlement/payment uniqueness still spans both modes.
alter table public.payroll_approval_runs drop constraint payroll_approval_runs_net_run_id_key;
alter table public.payroll_approval_runs drop constraint payroll_approval_runs_special_run_id_key;
alter table public.payroll_approval_runs add constraint payroll_approval_net_mode unique(net_run_id,mode);
alter table public.payroll_approval_runs add constraint payroll_approval_special_mode unique(special_run_id,mode);
do $$declare ddl text;begin
 ddl:=pg_get_functiondef('public.submit_payroll_for_approval(uuid,uuid,text,text)'::regprocedure);
 if position('where a.net_run_id=p_net_id or a.special_run_id=p_special_id' in ddl)=0 then raise exception 'Unexpected approval implementation; review before applying.';end if;
 ddl:=replace(ddl,'where a.net_run_id=p_net_id or a.special_run_id=p_special_id','where (a.net_run_id=p_net_id or a.special_run_id=p_special_id) and a.mode=private.payroll_approval_mode(scope)');
 ddl:=replace(ddl,'perform pg_advisory_xact_lock(hashtextextended(''payroll-approval-submit:''','if mode=''live'' then perform private.payroll_assert_live_window(scope,snap);end if;'||chr(10)||' perform pg_advisory_xact_lock(hashtextextended(''payroll-approval-submit:''');execute ddl;
 ddl:=pg_get_functiondef('private.payroll_approval_state(uuid)'::regprocedure);
 execute replace(ddl,'FUNCTION private.payroll_approval_state(','FUNCTION private.payroll_phase8_approval_state(');
 ddl:=pg_get_functiondef('private.payroll_payment_authority(uuid,boolean)'::regprocedure);
 execute replace(ddl,'return r;','perform private.payroll_assert_live_window(r.scope_id,r.source_snapshot);return r;');
end $$;
create or replace function private.payroll_approval_state(p_run uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s jsonb;r public.payroll_approval_runs;begin
 s:=private.payroll_phase8_approval_state(p_run);select * into r from public.payroll_approval_runs where id=p_run;
 if r.mode='live' and (private.payroll_approval_mode(r.scope_id) is distinct from 'live' or not private.payroll_live_window(r.scope_id,(r.source_snapshot->>'from')::date,(r.source_snapshot->>'to')::date)) then
 s:=s||jsonb_build_object('canAct',false,'canDisburse',false,'stage','Live processing stopped or outside pilot cutoff');end if;return s;
end $$;
-- Stop/activation obtains an exclusive lock; money/approval writers share it.
-- No operation can straddle a committed stop and continue with an earlier mode.
do $$declare sig text;ddl text;begin
 foreach sig in array array['public.prepare_payroll_gross(uuid,text)','public.prepare_payroll_net(uuid,text)',
 'public.prepare_payroll_special(uuid,jsonb,text,uuid)','public.submit_payroll_for_approval(uuid,uuid,text,text)',
 'public.act_on_payroll_approval(uuid,integer,text,text)','public.create_payroll_payment_batch(uuid,text)',
 'public.close_payroll_payment_batch(uuid,text)','public.prepare_payroll_payment_attempt(uuid,uuid,text,text,date,uuid)',
 'public.record_payroll_payment_outcome(uuid,bigint,text,date,text,text,uuid)','public.complete_payroll_payment_batch(uuid,text)',
 'public.record_payroll_disbursement(uuid,text,date,text)','public.create_payroll_output(uuid,text)','public.download_payroll_output(uuid)',
 'public.record_payroll_output_process(uuid,text,uuid,text)'] loop
 ddl:=pg_get_functiondef(sig::regprocedure);
 ddl:=regexp_replace(ddl,'\mbegin\M','begin'||chr(10)||' perform pg_advisory_xact_lock_shared(hashtextextended(''payroll-pilot-control'',0));','i');execute ddl;
 end loop;
 ddl:=pg_get_functiondef('public.set_payroll_shadow_mode(uuid,boolean,text)'::regprocedure);
 ddl:=regexp_replace(ddl,'\mbegin\M','begin'||chr(10)||' perform pg_advisory_xact_lock(hashtextextended(''payroll-pilot-control'',0));','i');execute ddl;
end $$;

create function public.get_payroll_pilot_workspace(p_scope uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare scopes jsonb;comps jsonb:='[]';proposals jsonb:='[]';r record;s jsonb;v jsonb;err text;ready boolean;a public.payroll_pilot_activations;begin
 if private.payroll_actor_id() is null then raise exception 'Active HRIS login required.' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'mode',processing_mode,'canManage',private.payroll_has_access('manage_access',id),'canView',private.payroll_gross_permission(id,'view')) order by name),'[]') into scopes
 from public.payroll_access_scopes where kind='business_unit' and (private.payroll_has_access('manage_access',id) or private.payroll_gross_permission(id,'view'));
 if p_scope is null then return jsonb_build_object('scopes',scopes,'comparisons','[]'::jsonb,'proposals','[]'::jsonb);end if;
 if not private.payroll_gross_permission(p_scope,'view') then
 if not private.payroll_has_access('manage_access',p_scope) then raise exception 'Payroll scope unavailable.' using errcode='42501';end if;
 return jsonb_build_object('scopes',scopes,'comparisons','[]'::jsonb,'proposals','[]'::jsonb,'blockedReason','Assign the named payroll duties and retain existing HRIS salary access before reviewing comparisons. Payroll Access management alone does not grant salary access.');end if;
 for r in select * from public.payroll_comparisons where scope_id=p_scope order by created_at desc limit 100 loop
 begin
 s:=private.payroll_approval_state(r.run_id);ready:=true;err:=null;
 begin perform private.payroll_comparison_ready(r.id,false);exception when raise_exception then ready:=false;err:=sqlerrm;end;
 v:=jsonb_build_object('id',r.id,'runId',r.run_id,'from',s#>>'{source,from}','to',s#>>'{source,to}','createdAt',r.created_at,'sourceRef',r.input->>'sourceRef','coverageRef',r.input->>'coverageRef','rows',r.results,'ready',ready,'blockedReason',err,
 'acceptances',(select coalesce(jsonb_agg(jsonb_build_object('duty',x.duty,'actor',h.full_name,'reference',x.reference)),'[]') from public.payroll_comparison_acceptances x join public.hris_users h on h.id=x.actor_id where x.comparison_id=r.id),
 'canHR',ready and private.payroll_phase9_role(p_scope,'hr') and r.created_by<>public.current_hris_user_id() and not exists(select 1 from public.payroll_comparison_acceptances where comparison_id=r.id and (duty='hr' or actor_id=public.current_hris_user_id())),
 'canFinance',ready and private.payroll_phase9_role(p_scope,'finance') and r.created_by<>public.current_hris_user_id() and not exists(select 1 from public.payroll_comparison_acceptances where comparison_id=r.id and (duty='finance' or actor_id=public.current_hris_user_id())));
 comps:=comps||jsonb_build_array(v);
 exception when insufficient_privilege then null;end;end loop;
 for r in select * from public.payroll_pilot_proposals where scope_id=p_scope order by created_at desc limit 30 loop
 ready:=true;err:=null;begin perform private.payroll_check_proposal(r.id);exception when raise_exception or insufficient_privilege then ready:=false;err:=sqlerrm;end;
 proposals:=proposals||jsonb_build_array(to_jsonb(r)-'created_by'||jsonb_build_object('ready',ready,'blockedReason',err,
 'decisions',(select coalesce(jsonb_agg(jsonb_build_object('actor',h.full_name,'reference',d.reference)),'[]') from public.payroll_pilot_decisions d join public.hris_users h on h.id=d.actor_id where d.proposal_id=r.id),
 'canBOD',ready and private.payroll_phase9_role(p_scope,'bod') and r.created_by<>public.current_hris_user_id() and (select count(*) from public.payroll_pilot_decisions where proposal_id=r.id)<2 and not exists(select 1 from public.payroll_pilot_decisions where proposal_id=r.id and actor_id=public.current_hris_user_id())));
 end loop;
 select * into a from public.payroll_pilot_activations where scope_id=p_scope;
 return jsonb_build_object('scopes',scopes,'comparisons',comps,'proposals',proposals,'canPrepare',private.payroll_gross_permission(p_scope,'prepare') and private.workflow_user_has_role(public.current_hris_user_id(),'Finance Staff'),
 'canPropose',private.payroll_phase9_role(p_scope,'finance'),'canHR',private.payroll_phase9_role(p_scope,'hr'),'canFinance',private.payroll_phase9_role(p_scope,'finance'),
 'activation',case when a.id is null then null else to_jsonb(a)-'actor_id'||jsonb_build_object('continued',exists(select 1 from public.payroll_pilot_promotions where activation_id=a.id),
 'monitoring',(select coalesce(jsonb_agg(to_jsonb(q)-'actor_id'),'[]') from public.payroll_pilot_monitoring q where activation_id=a.id)) end,
 'processCount',(select count(distinct code) from public.payroll_output_processes where scope_id=p_scope));
end $$;
-- Private helpers are never callable through the API; only these guarded RPCs.
do $$declare r record;sig text;begin
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
 and p.proname in('payroll_comparison_rows','payroll_compare_values','payroll_phase9_role','payroll_comparison_ready','payroll_pilot_dates','payroll_pilot_proof','payroll_check_proposal','payroll_live_window','payroll_assert_live_window','payroll_require_live_certificate','payroll_pilot_payment_proof','payroll_phase8_approval_state') loop
 execute 'revoke all on function '||r.sig||' from public,anon,authenticated';end loop;
 foreach sig in array array['public.get_payroll_comparison_template(uuid)','public.save_payroll_comparison(uuid,text,jsonb)',
 'public.accept_payroll_comparison(uuid,text,text)','public.propose_payroll_pilot(uuid,uuid,uuid,date,date,jsonb)',
 'public.approve_payroll_pilot(uuid,text)','public.activate_payroll_pilot(uuid,text)','public.review_payroll_pilot(uuid,uuid,text,text)',
 'public.continue_payroll_pilot(uuid,text)','public.get_payroll_pilot_workspace(uuid)'] loop
 execute 'revoke all on function '||sig||' from public,anon,authenticated';execute 'grant execute on function '||sig||' to authenticated';end loop;
end $$;
notify pgrst,'reload schema';
