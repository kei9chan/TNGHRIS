-- A configuration-fallback final step represents the shared BOD / GM approval
-- authority, not a single arbitrarily selected person. Keep explicit org-chart
-- approvers exclusive, but expand fallback steps to every active authorized
-- BOD / GM so the request is visible in each eligible Approval Center.

create or replace function private.ensure_manpower_final_approval_pool(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.manpower_requests%rowtype;
  v_route_step jsonb;
  v_added integer := 0;
begin
  select * into v_request
  from public.manpower_requests
  where id = p_request_id;

  if not found
     or v_request.status <> 'Pending'
     or v_request.approval_stage <> 'BOD_GM'
     or v_request.routing_basis <> 'ORG_CHART_AND_AUTHORITY_MATRIX'
     or v_request.approval_route_snapshot is null then
    return 0;
  end if;

  v_route_step := v_request.approval_route_snapshot -> coalesce(v_request.approval_route_step, 0);
  if coalesce(v_route_step ->> 'authorityKind', '') <> 'FINAL_APPROVAL'
     or not coalesce((v_route_step ->> 'configurationFallback')::boolean, false) then
    return 0;
  end if;

  with added as (
    insert into public.manpower_request_approval_assignments(
      request_id, approval_stage, approver_user_id, approver_role, status
    )
    select
      v_request.id,
      'BOD_GM',
      u.id,
      case
        when private.workflow_user_has_role(u.id, 'Board of Director') then 'Board of Director'
        else 'General Manager'
      end,
      'Pending'
    from public.hris_users u
    where lower(u.status::text) = 'active'
      and u.auth_user_id is not null
      and u.id <> v_request.requester_id
      and (
        private.workflow_user_has_role(u.id, 'Board of Director')
        or private.workflow_user_has_role(u.id, 'GeneralManager')
      )
    on conflict(request_id, approval_stage, approver_user_id) do nothing
    returning approver_user_id
  )
  select count(*)::integer into v_added from added;

  insert into public.notifications(
    user_id, type, title, message, link, is_read, related_entity_id, dedupe_key
  )
  select
    a.approver_user_id::text,
    'MANPOWER_REQUEST_SUBMITTED',
    'New On-Call Request',
    format(
      'A new on-call request for %s was submitted by %s.',
      coalesce(v_request.business_unit_name, 'the selected Business Unit'),
      v_request.requester_name
    ),
    '/approvals?type=manpower&item=' || v_request.id,
    false,
    v_request.id::text,
    format('manpower:%s:FINAL_POOL:%s', v_request.id, a.approver_user_id)
  from public.manpower_request_approval_assignments a
  where a.request_id = v_request.id
    and a.approval_stage = 'BOD_GM'
    and a.status = 'Pending'
  on conflict(user_id, dedupe_key) do nothing;

  if v_added > 0 then
    insert into public.org_routing_audit(
      entity_type, entity_id, action, old_value, new_value
    ) values (
      'MANPOWER_REQUEST',
      v_request.id::text,
      'EXPAND_FINAL_APPROVER_POOL',
      jsonb_build_object('assignedApproverId', v_route_step ->> 'approverUserId'),
      jsonb_build_object('addedApprovers', v_added, 'stage', 'BOD_GM')
    );
  end if;

  return v_added;
end
$$;

create or replace function private.expand_manpower_final_approval_pool_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_manpower_final_approval_pool(new.id);
  return new;
end
$$;

revoke all on function private.ensure_manpower_final_approval_pool(uuid) from public, anon, authenticated;
revoke all on function private.expand_manpower_final_approval_pool_on_insert() from public, anon, authenticated;

drop trigger if exists zz_expand_manpower_final_approval_pool on public.manpower_requests;
create trigger zz_expand_manpower_final_approval_pool
  after insert on public.manpower_requests
  for each row execute function private.expand_manpower_final_approval_pool_on_insert();

-- Repair requests submitted after org-chart routing went live. This preserves
-- their request IDs, route snapshots, dates, costs, and existing approval trail.
do $$
declare
  v_request_id uuid;
begin
  for v_request_id in
    select r.id
    from public.manpower_requests r
    where r.status = 'Pending'
      and r.approval_stage = 'BOD_GM'
      and r.routing_basis = 'ORG_CHART_AND_AUTHORITY_MATRIX'
  loop
    perform private.ensure_manpower_final_approval_pool(v_request_id);
  end loop;
end
$$;
