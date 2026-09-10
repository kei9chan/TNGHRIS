-- Requires one routed, insufficient-offset-credit fixture. All decisions roll back.
begin;
set local statement_timeout='30s';
do $$declare r record; result jsonb; positive_before numeric; outsider uuid;begin
 select l.id,l.employee_id,h.auth_user_id into r from public.leave_requests l
 join public.leave_types t on t.id=l.leave_type_id
 join public.time_request_approval_assignments a on a.request_id=l.id and a.request_type='leave' and a.is_bod and a.status='Pending'
 join public.hris_users h on h.id=a.approver_user_id
 where l.status='PendingBOD' and l.duplicate_of is null and lower(t.name) like '%offset%'
 and (private.leave_credit_context(l.id)->>'creditException')::boolean and h.auth_user_id is not null limit 1;
 if r.id is null then raise exception 'Insufficient offset credit BOD fixture needed';end if;
 select coalesce(sum(amount),0) into positive_before from public.payroll_leave_ledger where employee_id=r.employee_id and leave_kind='offset' and amount>0;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',r.auth_user_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 result:=public.process_time_request_approval('leave',r.id,'approve',null);
 if result->>'status' not in('Approved','PendingBOD') then raise exception 'BOD exception failed';end if;
 result:=public.process_time_request_approval('leave',r.id,'approve',null);
 if not coalesce((result->>'alreadyDecided')::boolean,false) then raise exception 'Approval retry not idempotent';end if;
 execute 'reset role';
 if not exists(select 1 from private.leave_credit_overrides where request_id=r.id and note is null and (credit_snapshot->>'creditShortfall')::numeric>0) then raise exception 'Credit snapshot missing';end if;
 if (select coalesce(sum(amount),0) from public.payroll_leave_ledger where employee_id=r.employee_id and leave_kind='offset' and amount>0)<>positive_before then raise exception 'Earned credits were granted';end if;
 if (select count(*) from public.payroll_leave_ledger where event_key='usage:'||r.id)>1 then raise exception 'Double debit';end if;
 select auth_user_id into outsider from public.hris_users where role='Employee' and lower(status)='active' and auth_user_id is not null limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin perform public.process_time_request_approval('leave',r.id,'approve',null);raise exception 'Unauthorized approval allowed';exception when insufficient_privilege or invalid_parameter_value then null;end;
 execute 'reset role';
end $$;
select 'PASS: authenticated BOD blank note, retry, snapshot, no credit grant or duplicate debit, unauthorized denial' result;
rollback;
