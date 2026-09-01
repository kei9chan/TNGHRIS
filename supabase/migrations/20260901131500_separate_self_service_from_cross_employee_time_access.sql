-- Employee self-service inheritance must never authorize cross-employee reads.
-- Cross-record access requires an explicit permission on an actually assigned
-- role, or an active workflow assignment for the specific request.

create or replace function private.has_assigned_feature_permission(
  p_user_id uuid,
  p_resource text,
  p_action text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.is_active
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.resources res on res.id = rp.resource_id and res.is_active
    where ur.user_id = p_user_id
      and ur.is_active
      and rp.resource_id = p_resource
      and (p_action = any(rp.permissions) or 'manage' = any(rp.permissions))
  )
$$;

revoke all on function private.has_assigned_feature_permission(uuid, text, text)
  from public, anon, authenticated;

create or replace function public.can_view_time_request(
  p_request_type text,
  p_request_id uuid,
  p_employee_id uuid,
  p_direct_manager_id uuid,
  p_business_unit_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.current_hris_user_id();
  v_resource text := case lower(p_request_type)
    when 'overtime' then 'OT'
    when 'wfh' then 'WFH'
    when 'leave' then 'Leave'
    else null
  end;
begin
  if v_actor is null or v_resource is null then return false; end if;
  if v_actor = p_employee_id then return true; end if;
  if private.is_active_time_request_approver(v_actor, p_request_type, p_request_id) then return true; end if;

  return private.has_assigned_feature_permission(v_actor, v_resource, 'view')
    and public.can_access_hris_user(p_employee_id);
end;
$$;

revoke all on function public.can_view_time_request(text, uuid, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.can_view_time_request(text, uuid, uuid, uuid, uuid)
  to authenticated;

comment on function public.can_view_time_request(text, uuid, uuid, uuid, uuid) is
  'Allows own records, active request assignments, or scoped cross-employee access backed by an explicitly assigned role permission.';
