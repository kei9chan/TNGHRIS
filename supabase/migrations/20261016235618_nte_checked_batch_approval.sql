-- A guarded entry point for list approvals. Keep the canonical NTE workflow
-- responsible for decisions, remaining approvers, notifications and audit logs.
create function private.approve_nte_queue_item(
  p_nte_id uuid, p_approval_id uuid, p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := public.current_hris_user_id();
  current_nte public.ntes;
  current_approval public.nte_approvals;
begin
  if auth.uid() is null or actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_approval_id is null or p_expected_updated_at is null then
    raise exception 'Refresh this NTE before approving it.' using errcode = '22023';
  end if;
  -- Match the lock order of act_on_nte_approval. A revision or a concurrent
  -- decision cannot slip between this check and the canonical decision.
  select * into current_nte from public.ntes where id = p_nte_id for update;
  select * into current_approval from public.nte_approvals
  where id = p_approval_id and nte_id = p_nte_id and approver_user_id = actor_id
  for update;
  if current_nte.id is null or current_approval.id is null
     or current_nte.status <> 'PendingApproval'::public.nte_status
     or current_approval.status <> 'Pending'
     or current_nte.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('outcome', 'skipped', 'reason',
      'This notice changed or is no longer awaiting your approval. Refresh to review it.');
  end if;
  current_nte := public.act_on_nte_approval(p_nte_id, 'approve', null);
  return jsonb_build_object('outcome', 'approved', 'status', current_nte.status::text);
end;
$$;
revoke all on function private.approve_nte_queue_item(uuid,uuid,timestamptz) from public, anon;
grant execute on function private.approve_nte_queue_item(uuid,uuid,timestamptz) to authenticated;

create function public.approve_nte_queue_item(
  p_nte_id uuid, p_approval_id uuid, p_expected_updated_at timestamptz
) returns jsonb language sql security invoker set search_path = ''
return private.approve_nte_queue_item(p_nte_id,p_approval_id,p_expected_updated_at);
revoke all on function public.approve_nte_queue_item(uuid,uuid,timestamptz) from public, anon;
grant execute on function public.approve_nte_queue_item(uuid,uuid,timestamptz) to authenticated;
