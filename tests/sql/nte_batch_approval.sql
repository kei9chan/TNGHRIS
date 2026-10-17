-- Run as the migration owner. All decision tests roll back, including issuance
-- notifications and audit entries; no live NTE approval is committed.
begin;
do $$
declare
  sample record; other_auth uuid; result jsonb; before_notice jsonb;
  before_approvals jsonb; after_approvals jsonb;
begin
  select n.id, n.updated_at, a.id as approval_id, u.auth_user_id
    into strict sample
  from public.ntes n join public.nte_approvals a on a.nte_id=n.id
  join public.hris_users u on u.id=a.approver_user_id
  where n.status='PendingApproval' and a.status='Pending'
    and lower(u.status)='active' and u.auth_user_id is not null
  order by n.id limit 1;
  select to_jsonb(n) into before_notice from public.ntes n where n.id=sample.id;
  select jsonb_agg(to_jsonb(a) order by a.id) into before_approvals from public.nte_approvals a where a.nte_id=sample.id;
  select u.auth_user_id into strict other_auth from public.hris_users u
  where lower(u.status)='active' and u.auth_user_id is not null
    and not exists(select 1 from public.nte_approvals a where a.nte_id=sample.id and a.approver_user_id=u.id)
  limit 1;

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role authenticated';
  begin
    perform public.approve_nte_queue_item(sample.id,sample.approval_id,sample.updated_at);
    raise exception 'Unauthenticated request was accepted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',other_auth::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',other_auth,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  result := public.approve_nte_queue_item(sample.id,sample.approval_id,sample.updated_at);
  if result->>'outcome'<>'skipped' then raise exception 'Unassigned actor was accepted'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',sample.auth_user_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',sample.auth_user_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  result := public.approve_nte_queue_item(sample.id,sample.approval_id,sample.updated_at-interval '1 second');
  if result->>'outcome'<>'skipped' then raise exception 'Stale notice was accepted'; end if;
  begin
    result := public.approve_nte_queue_item(sample.id,sample.approval_id,sample.updated_at);
    if result->>'outcome'<>'approved' then raise exception 'Assigned actor could not approve: %',result; end if;
    result := public.approve_nte_queue_item(sample.id,sample.approval_id,sample.updated_at);
    if result->>'outcome'<>'skipped' then raise exception 'Duplicate approval was accepted'; end if;
    -- Undo the successful decision and every trigger effect before checking data.
    raise exception using errcode='PZ001',message='rollback test decision';
  exception when sqlstate 'PZ001' then null; end;
  execute 'reset role';
  if before_notice is distinct from (select to_jsonb(n) from public.ntes n where n.id=sample.id) then
    raise exception 'Test changed the notice';
  end if;
  select jsonb_agg(to_jsonb(a) order by a.id) into after_approvals from public.nte_approvals a where a.nte_id=sample.id;
  if before_approvals is distinct from after_approvals then raise exception 'Test changed approvals'; end if;
  if has_function_privilege('anon','public.approve_nte_queue_item(uuid,uuid,timestamptz)','EXECUTE') then
    raise exception 'Anonymous RPC access is enabled';
  end if;
  raise notice 'PASS: auth, assignment, stale preview, success, duplicate protection; all decisions rolled back';
end $$;
rollback;
