-- Exercise real authorization, route progression and trigger effects, rolling
-- back every decision and notification before the transaction ends.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$
declare sample record; payload jsonb; result jsonb; before_request jsonb;
  before_assignments jsonb; after_assignments jsonb; before_audits bigint;
begin
  select r.id,r.requester_id,u.auth_user_id into strict sample
  from public.manpower_requests r
  join public.manpower_request_approval_assignments a on a.request_id=r.id and a.approval_stage=r.approval_stage
  join public.hris_users u on u.id=a.approver_user_id
  where r.status='Pending' and a.status='Pending' and r.clarification_status<>'requested'
    and nullif(trim(r.approval_issue),'') is null and u.auth_user_id is not null
    and lower(u.status)='active' and r.requester_id<>u.id
  order by r.id limit 1;
  select private.oncall_approval_snapshot(r),to_jsonb(r) into payload,before_request from public.manpower_requests r where id=sample.id;
  select jsonb_agg(to_jsonb(a) order by a.id) into before_assignments from public.manpower_request_approval_assignments a where a.request_id=sample.id;
  select count(*) into before_audits from public.audit_logs where entity='ManpowerRequest' and entity_id=sample.id::text;

  perform set_config('request.jwt.claims','{}',true);
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role authenticated';
  begin
    perform public.approve_oncall_queue_item(sample.id,payload);
    raise exception 'Unauthenticated approval was accepted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',(select auth_user_id from public.hris_users where id=sample.requester_id),'role','authenticated')::text,true);
  execute 'set local role authenticated';
  result:=public.approve_oncall_queue_item(sample.id,payload);
  if result->>'outcome'<>'skipped' then raise exception 'Self approval was accepted'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',sample.auth_user_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  result:=public.approve_oncall_queue_item(sample.id,jsonb_set(payload,'{grand_total}',to_jsonb((payload->>'grand_total')::numeric+1)));
  if result->>'outcome'<>'skipped' then raise exception 'Changed cost was accepted'; end if;
  result:=public.approve_oncall_queue_item(sample.id,jsonb_set(payload,'{revision}',to_jsonb((payload->>'revision')::int+1)));
  if result->>'outcome'<>'skipped' then raise exception 'Revised request was accepted'; end if;
  begin
    result:=public.approve_oncall_queue_item(sample.id,payload);
    if result->>'outcome'<>'approved' then raise exception 'Assigned approval failed: %',result; end if;
    if result->>'status' not in ('Approved','Pending') then raise exception 'Canonical route result lost'; end if;
    result:=public.approve_oncall_queue_item(sample.id,payload);
    if result->>'outcome'<>'skipped' then raise exception 'Duplicate or old-stage approval accepted'; end if;
    raise exception using errcode='PZ001',message='rollback successful test decision';
  exception when sqlstate 'PZ001' then null; end;
  execute 'reset role';
  if before_request is distinct from (select to_jsonb(r) from public.manpower_requests r where r.id=sample.id) then raise exception 'Test changed request'; end if;
  select jsonb_agg(to_jsonb(a) order by a.id) into after_assignments from public.manpower_request_approval_assignments a where a.request_id=sample.id;
  if before_assignments is distinct from after_assignments then raise exception 'Test changed assignments'; end if;
  if before_audits<>(select count(*) from public.audit_logs where entity='ManpowerRequest' and entity_id=sample.id::text) then raise exception 'Test committed audit effects'; end if;
  if has_function_privilege('anon','public.approve_oncall_queue_item(uuid,jsonb)','EXECUTE') then raise exception 'Anonymous RPC exposed'; end if;
end $$;
select 'PASS: authentication, self-approval, changed cost, revision, canonical route, duplicate protection; decisions rolled back' as result;
rollback;
