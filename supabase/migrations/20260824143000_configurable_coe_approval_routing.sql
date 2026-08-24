-- Configurable COE approval routing.
-- COE approval is limited to HR Manager and/or HR Staff. Board of Director
-- and technical Admin access must never authorize a COE approval decision.
-- Existing request rows, completed documents, and approval history are kept.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Authoritative configuration
-- ---------------------------------------------------------------------------

insert into public.approver_configs(config_key, config_value, updated_at)
values (
  'coe_approval_authority',
  jsonb_build_object('authority', 'HR_MANAGER'),
  now()
)
on conflict (config_key) do nothing;

create or replace function public.get_coe_approval_authority()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  authority text;
begin
  select coalesce(config_value->>'authority', config_value->>'value')
    into authority
  from public.approver_configs
  where config_key = 'coe_approval_authority';

  -- HR Manager only is the safe, explicit default when the setting has not
  -- yet been written. Invalid saved values fail closed instead of silently
  -- selecting a broader role.
  if authority is null then
    return 'HR_MANAGER';
  end if;
  if authority not in ('HR_MANAGER', 'HR_STAFF', 'HR_MANAGER_OR_HR_STAFF') then
    raise exception 'Invalid COE approval authority configuration.' using errcode = '22023';
  end if;
  return authority;
end;
$$;

revoke all on function public.get_coe_approval_authority() from public, anon;
grant execute on function public.get_coe_approval_authority() to authenticated;

-- ---------------------------------------------------------------------------
-- Role and scope helpers
-- ---------------------------------------------------------------------------

create or replace function private.coe_user_has_role(p_user_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hris_users u
    where u.id = p_user_id
      and lower(coalesce(u.status, '')) = 'active'
      and (
        u.role = p_role
        or exists (
          select 1
          from public.user_roles ur
          join public.roles r on r.id = ur.role_id and r.is_active
          where ur.user_id = u.id
            and ur.role_id = p_role
            and ur.is_active
        )
      )
  );
$$;

create or replace function private.coe_user_has_workflow_permission(p_user_id uuid, p_action text)
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
    join public.role_workflow_permissions wp on wp.role_id = ur.role_id
    where ur.user_id = p_user_id
      and ur.is_active
      and wp.workflow_key = 'COE'
      and p_action = any(wp.actions)
  );
$$;

create or replace function private.coe_user_can_access_employee(p_viewer_id uuid, p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hris_users viewer
    join public.hris_users target on target.id = p_employee_id
    join public.user_roles scope
      on scope.user_id = viewer.id
     and scope.is_active
    where viewer.id = p_viewer_id
      and (
        scope.scope_type = 'GLOBAL'
        or (
          scope.scope_type = 'SPECIFIC'
          and target.business_unit_id = any(scope.allowed_business_unit_ids)
        )
        or (
          scope.scope_type = 'HOME_ONLY'
          and viewer.business_unit_id is not null
          and viewer.business_unit_id = target.business_unit_id
        )
        or (
          scope.scope_type = 'DEPARTMENT'
          and viewer.department_id is not null
          and viewer.department_id = target.department_id
        )
        or (
          scope.scope_type = 'DIRECT_REPORTS'
          and target.reports_to in (
            viewer.id::text,
            viewer.auth_user_id::text,
            viewer.employee_id,
            viewer.full_name
          )
        )
        or (
          scope.scope_type = 'SELF'
          and viewer.id = target.id
        )
      )
  );
$$;

create or replace function private.is_coe_approval_authorized(
  p_actor_id uuid,
  p_employee_id uuid,
  p_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  authority text;
  has_allowed_role boolean := false;
begin
  if p_actor_id is null
     or p_employee_id is null
     or p_actor_id is distinct from public.current_hris_user_id()
     or p_action not in ('approve', 'reject') then
    return false;
  end if;

  authority := public.get_coe_approval_authority();

  if authority = 'HR_MANAGER' then
    has_allowed_role := private.coe_user_has_role(p_actor_id, 'HR Manager');
  elsif authority = 'HR_STAFF' then
    has_allowed_role := private.coe_user_has_role(p_actor_id, 'HR Staff');
  elsif authority = 'HR_MANAGER_OR_HR_STAFF' then
    has_allowed_role :=
      private.coe_user_has_role(p_actor_id, 'HR Manager')
      or private.coe_user_has_role(p_actor_id, 'HR Staff');
  end if;

  -- This deliberately does not call is_hr_or_admin(), because that helper
  -- includes BOD and technical Admin for other HRIS read workflows.
  return has_allowed_role
    and private.coe_user_has_workflow_permission(p_actor_id, p_action)
    and private.coe_user_can_access_employee(p_actor_id, p_employee_id);
end;
$$;

-- A boolean-only public wrapper is used by RLS policies. It reveals no
-- employee or configuration data and keeps authorization in the database.
create or replace function public.can_approve_coe_request(
  p_employee_id uuid,
  p_action text default 'approve'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_coe_approval_authorized(
    public.current_hris_user_id(),
    p_employee_id,
    p_action
  );
$$;

revoke all on function public.can_approve_coe_request(uuid, text) from public, anon;
grant execute on function public.can_approve_coe_request(uuid, text) to authenticated;

revoke all on function private.coe_user_has_role(uuid, text) from public, anon, authenticated;
revoke all on function private.coe_user_has_workflow_permission(uuid, text) from public, anon, authenticated;
revoke all on function private.coe_user_can_access_employee(uuid, uuid) from public, anon, authenticated;
revoke all on function private.is_coe_approval_authorized(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin-only configuration writes and pending-request notification repair
-- ---------------------------------------------------------------------------

create or replace function private.coe_notify_approvers(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.coe_requests;
  authority text;
  approver_row record;
begin
  select * into request_row
  from public.coe_requests
  where id = p_request_id;

  if request_row.id is null or request_row.status <> 'Pending' then
    return;
  end if;

  authority := public.get_coe_approval_authority();

  -- Close any old COE approval alerts for this pending request before
  -- reopening the current configured recipient set. This prevents a role
  -- change from leaving an obsolete BOD/HR queue item active.
  update public.notifications
     set is_read = true
   where related_entity_id = request_row.id::text
     and type = 'COE_UPDATE'
     and title not in ('COE Request Approved', 'COE Request Rejected');

  for approver_row in
    select u.id
    from public.hris_users u
    where lower(coalesce(u.status, '')) = 'active'
      and (
        (authority = 'HR_MANAGER' and private.coe_user_has_role(u.id, 'HR Manager'))
        or (authority = 'HR_STAFF' and private.coe_user_has_role(u.id, 'HR Staff'))
        or (
          authority = 'HR_MANAGER_OR_HR_STAFF'
          and (
            private.coe_user_has_role(u.id, 'HR Manager')
            or private.coe_user_has_role(u.id, 'HR Staff')
          )
        )
      )
      and private.coe_user_can_access_employee(u.id, request_row.employee_id)
  loop
    insert into public.notifications(
      user_id,
      type,
      title,
      message,
      link,
      is_read,
      related_entity_id,
      dedupe_key
    )
    values (
      approver_row.id::text,
      'COE_UPDATE',
      'COE Request Approval Required',
      format('%s has requested a Certificate of Employment.', request_row.employee_name),
      format('/employees/coe/requests?requestId=%s', request_row.id),
      false,
      request_row.id::text,
      format('coe-approval:%s:%s', request_row.id, approver_row.id)
    )
    on conflict (user_id, dedupe_key) do update
      set type = excluded.type,
          title = excluded.title,
          message = excluded.message,
          link = excluded.link,
          is_read = false,
          related_entity_id = excluded.related_entity_id,
          created_at = now();
  end loop;
end;
$$;

create or replace function private.coe_sync_pending_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
begin
  for request_id in
    select id from public.coe_requests where status = 'Pending'
  loop
    perform private.coe_notify_approvers(request_id);
  end loop;
end;
$$;

create or replace function public.save_coe_approval_authority(p_authority text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  normalized_authority text := upper(btrim(coalesce(p_authority, '')));
begin
  if actor_id is null or not public.is_system_admin() then
    raise exception 'Only an Admin can change COE approval routing.' using errcode = '42501';
  end if;
  if normalized_authority not in ('HR_MANAGER', 'HR_STAFF', 'HR_MANAGER_OR_HR_STAFF') then
    raise exception 'Invalid COE approval authority.' using errcode = '22023';
  end if;

  insert into public.approver_configs(config_key, config_value, updated_at)
  values (
    'coe_approval_authority',
    jsonb_build_object('authority', normalized_authority),
    now()
  )
  on conflict (config_key) do update
    set config_value = excluded.config_value,
        updated_at = excluded.updated_at;

  perform private.coe_sync_pending_notifications();

  select email into actor_email
  from public.hris_users
  where id = actor_id;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text,
    actor_email,
    'UPDATE',
    'COEApprovalConfig',
    'coe_approval_authority',
    format('Changed COE approval authority to %s. Pending COE notifications were reconciled.', normalized_authority)
  );

  return jsonb_build_object('authority', normalized_authority);
end;
$$;

revoke all on function public.save_coe_approval_authority(text) from public, anon;
grant execute on function public.save_coe_approval_authority(text) to authenticated;

revoke all on function private.coe_notify_approvers(uuid) from public, anon, authenticated;
revoke all on function private.coe_sync_pending_notifications() from public, anon, authenticated;

-- Keep existing GM/BOD/conditional configuration behavior, but prevent those
-- roles from directly changing this dedicated COE setting outside the
-- Admin-only RPC above.
drop policy if exists approver_configs_hr_authority_write on public.approver_configs;
create policy approver_configs_hr_authority_write on public.approver_configs
  for all to authenticated
  using (
    public.is_system_admin()
    or (
      (
        public.has_active_role('Board of Director')
        or public.has_active_role('HR Manager')
      )
      and config_key <> 'coe_approval_authority'
    )
  )
  with check (
    public.is_system_admin()
    or (
      (
        public.has_active_role('Board of Director')
        or public.has_active_role('HR Manager')
      )
      and config_key <> 'coe_approval_authority'
    )
  );

-- ---------------------------------------------------------------------------
-- Notification trigger and approval matrix
-- ---------------------------------------------------------------------------

create or replace function private.notify_coe_approvers_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.coe_notify_approvers(new.id);
  return new;
end;
$$;

drop trigger if exists coe_notify_approvers_after_insert on public.coe_requests;
create trigger coe_notify_approvers_after_insert
after insert on public.coe_requests
for each row execute function private.notify_coe_approvers_after_insert();

revoke all on function private.notify_coe_approvers_after_insert() from public, anon, authenticated;

create or replace function private.resolve_coe_notifications_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
     and new.status in ('Approved', 'Rejected') then
    update public.notifications
       set is_read = true
     where related_entity_id = new.id::text
       and type = 'COE_UPDATE'
       and title not in ('COE Request Approved', 'COE Request Rejected');

    insert into public.notifications(
      user_id,
      type,
      title,
      message,
      link,
      is_read,
      related_entity_id,
      dedupe_key
    )
    values (
      new.employee_id::text,
      'COE_UPDATE',
      case when new.status = 'Approved' then 'COE Request Approved' else 'COE Request Rejected' end,
      case
        when new.status = 'Approved' then 'Your Certificate of Employment request has been approved.'
        else format('Your Certificate of Employment request has been rejected. Reason: %s', coalesce(new.rejection_reason, ''))
      end,
      format('/employees/coe/requests?requestId=%s', new.id),
      false,
      new.id::text,
      format('coe-decision:%s:%s', new.id, lower(new.status::text))
    )
    on conflict (user_id, dedupe_key) do update
      set type = excluded.type,
          title = excluded.title,
          message = excluded.message,
          link = excluded.link,
          is_read = false,
          related_entity_id = excluded.related_entity_id,
          created_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists coe_resolve_approval_notifications on public.coe_requests;
create trigger coe_resolve_approval_notifications
after update of status on public.coe_requests
for each row execute function private.resolve_coe_notifications_after_update();

revoke all on function private.resolve_coe_notifications_after_update() from public, anon, authenticated;

-- HR Staff can approve/reject COE when selected in Admin Settings. BOD keeps
-- the ability to submit a request for itself and read/review visibility, but
-- is removed from the COE decision action set.
insert into public.role_workflow_permissions(role_id, workflow_key, actions, updated_at)
values (
  'HR Staff',
  'COE',
  array['submit', 'review', 'approve', 'reject', 'return']::text[],
  now()
)
on conflict (role_id, workflow_key) do update
set actions = array(
  select distinct action
  from unnest(public.role_workflow_permissions.actions || excluded.actions) action
  order by action
),
updated_at = now();

update public.role_workflow_permissions
set actions = array['submit', 'review']::text[],
    updated_at = now()
where role_id = 'Board of Director'
  and workflow_key = 'COE';

-- The existing BOD/HR Manager parity guard remains in force for all other
-- workflows. COE is intentionally configurable and is the approved exception.
create or replace function public.assert_bod_hr_manager_parity()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mismatch_count integer;
begin
  select count(*) into mismatch_count
  from (
    (select resource_id, permissions from public.role_permissions where role_id = 'Board of Director'
     except
     select resource_id, permissions from public.role_permissions where role_id = 'HR Manager')
    union all
    (select resource_id, permissions from public.role_permissions where role_id = 'HR Manager'
     except
     select resource_id, permissions from public.role_permissions where role_id = 'Board of Director')
    union all
    (select field_key, permissions from public.role_sensitive_permissions where role_id = 'Board of Director'
     except
     select field_key, permissions from public.role_sensitive_permissions where role_id = 'HR Manager')
    union all
    (select field_key, permissions from public.role_sensitive_permissions where role_id = 'HR Manager'
     except
     select field_key, permissions from public.role_sensitive_permissions where role_id = 'Board of Director')
    union all
    (select workflow_key, actions from public.role_workflow_permissions
      where role_id = 'Board of Director' and workflow_key <> 'COE'
     except
     select workflow_key, actions from public.role_workflow_permissions
      where role_id = 'HR Manager' and workflow_key <> 'COE')
    union all
    (select workflow_key, actions from public.role_workflow_permissions
      where role_id = 'HR Manager' and workflow_key <> 'COE'
     except
     select workflow_key, actions from public.role_workflow_permissions
      where role_id = 'Board of Director' and workflow_key <> 'COE')
  ) differences;
  if mismatch_count > 0 then
    raise exception 'Board of Director and HR Manager authority parity failed (% differences)', mismatch_count;
  end if;
  return true;
end;
$$;

select public.assert_bod_hr_manager_parity();

-- ---------------------------------------------------------------------------
-- COE RLS and approval RPCs
-- ---------------------------------------------------------------------------

drop policy if exists coe_req_hr_admin_all on public.coe_requests;
drop policy if exists coe_req_hr_read on public.coe_requests;
create policy coe_req_hr_read on public.coe_requests
  for select to authenticated
  using (public.is_hr_or_admin());

drop policy if exists coe_req_hr_approval_update on public.coe_requests;
create policy coe_req_hr_approval_update on public.coe_requests
  for update to authenticated
  using (
    public.can_approve_coe_request(employee_id, 'approve')
    or public.can_approve_coe_request(employee_id, 'reject')
  )
  with check (
    public.can_approve_coe_request(employee_id, 'approve')
    or public.can_approve_coe_request(employee_id, 'reject')
  );

-- The trigger is also a guard for older clients that still attempt direct
-- status updates instead of calling the RPC.
create or replace function private.ensure_coe_approval_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_value jsonb;
  action_value text;
begin
  action_value := case when new.status = 'Approved' then 'approve' else 'reject' end;

  if new.status in ('Approved', 'Rejected')
     and (
       tg_op = 'INSERT'
       or old.status is distinct from new.status
     )
     and not private.is_coe_approval_authorized(
       public.current_hris_user_id(),
       new.employee_id,
       action_value
     ) then
    raise exception 'You do not have permission to approve or reject this COE request.' using errcode = '42501';
  end if;

  if new.status = 'Approved'
     and (new.template_snapshot is null or new.employee_snapshot is null) then
    new.approved_at := coalesce(new.approved_at, now());
    document_value := private.build_coe_document(new);
    new.template_id := nullif(document_value->>'templateId', '')::uuid;
    new.template_snapshot := document_value->'template';
    new.employee_snapshot := document_value->'employee';
    new.snapshot_created_at := now();
    new.generation_source := document_value->>'generationSource';
    new.fallback_reason := document_value->>'fallbackReason';
    new.generated_document_url := coalesce(
      nullif(new.generated_document_url, ''),
      'coe://request/' || new.id::text || '/document'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists coe_approval_snapshot_guard on public.coe_requests;
create trigger coe_approval_snapshot_guard
before insert or update on public.coe_requests
for each row execute function private.ensure_coe_approval_snapshot();

revoke all on function private.ensure_coe_approval_snapshot() from public, anon, authenticated;

create or replace function public.approve_coe_request_with_snapshot(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  request_row public.coe_requests;
  document_value jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into request_row
  from public.coe_requests
  where id = p_request_id
  for update;
  if request_row.id is null then
    raise exception 'COE request not found.' using errcode = 'P0002';
  end if;

  if not private.is_coe_approval_authorized(actor_id, request_row.employee_id, 'approve') then
    raise exception 'Only the configured HR Manager or HR Staff authority can approve this COE request.' using errcode = '42501';
  end if;

  if request_row.status = 'Rejected' then
    raise exception 'A rejected COE request cannot be approved without reopening the existing workflow.';
  end if;

  if request_row.status = 'Approved'
     and request_row.template_snapshot is not null
     and request_row.employee_snapshot is not null then
    document_value := jsonb_build_object(
      'templateId', request_row.template_id,
      'generationSource', coalesce(request_row.generation_source, 'historical_snapshot'),
      'fallbackReason', request_row.fallback_reason,
      'template', request_row.template_snapshot,
      'employee', request_row.employee_snapshot
    );
  else
    request_row.approved_at := coalesce(request_row.approved_at, now());
    document_value := private.build_coe_document(request_row);

    update public.coe_requests
       set status = 'Approved',
           approved_by = actor_id,
           approved_at = request_row.approved_at,
           rejection_reason = null,
           generated_document_url = 'coe://request/' || p_request_id::text || '/document',
           template_id = nullif(document_value->>'templateId', '')::uuid,
           template_snapshot = document_value->'template',
           employee_snapshot = document_value->'employee',
           snapshot_created_at = now(),
           generation_source = document_value->>'generationSource',
           fallback_reason = document_value->>'fallbackReason',
           document_version = greatest(document_version, 1),
           updated_at = now()
     where id = p_request_id
     returning * into request_row;

    select email into actor_email
    from public.hris_users
    where id = actor_id;

    insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
    values (
      actor_id::text,
      actor_email,
      'APPROVE',
      'COERequest',
      p_request_id::text,
      format(
        'Approved COE with immutable document snapshot (source=%s, template=%s).',
        document_value->>'generationSource',
        coalesce(document_value->>'templateId', 'protected fallback')
      )
    );
  end if;

  return jsonb_build_object(
    'request', to_jsonb(request_row),
    'template', document_value->'template',
    'employee', document_value->'employee',
    'meta', jsonb_build_object(
      'generationSource', document_value->>'generationSource',
      'fallbackReason', document_value->>'fallbackReason',
      'snapshotCreatedAt', coalesce(request_row.snapshot_created_at, now()),
      'documentVersion', request_row.document_version
    )
  );
end;
$$;

revoke all on function public.approve_coe_request_with_snapshot(uuid) from public, anon;
grant execute on function public.approve_coe_request_with_snapshot(uuid) to authenticated;

create or replace function public.reject_coe_request(p_request_id uuid, p_reason text)
returns public.coe_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  actor_email text;
  request_row public.coe_requests;
  reason_value text := btrim(coalesce(p_reason, ''));
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if length(reason_value) < 1 then
    raise exception 'A rejection reason is required.';
  end if;

  select * into request_row
  from public.coe_requests
  where id = p_request_id
  for update;
  if request_row.id is null then
    raise exception 'COE request not found.' using errcode = 'P0002';
  end if;
  if request_row.status <> 'Pending' then
    raise exception 'Only a pending COE request can be rejected.';
  end if;
  if not private.is_coe_approval_authorized(actor_id, request_row.employee_id, 'reject') then
    raise exception 'Only the configured HR Manager or HR Staff authority can reject this COE request.' using errcode = '42501';
  end if;

  update public.coe_requests
     set status = 'Rejected',
         rejection_reason = reason_value,
         approved_by = actor_id,
         approved_at = now(),
         generated_document_url = null,
         updated_at = now()
   where id = p_request_id
   returning * into request_row;

  select email into actor_email
  from public.hris_users
  where id = actor_id;

  insert into public.audit_logs(user_id, user_email, action, entity, entity_id, details)
  values (
    actor_id::text,
    actor_email,
    'REJECT',
    'COERequest',
    p_request_id::text,
    format('Rejected COE request. Reason: %s', reason_value)
  );

  return request_row;
end;
$$;

revoke all on function public.reject_coe_request(uuid, text) from public, anon;
grant execute on function public.reject_coe_request(uuid, text) to authenticated;

-- Re-route all existing pending COEs to the current default (HR Manager only)
-- without deleting request rows or changing historical approval records.
do $$
begin
  perform private.coe_sync_pending_notifications();
end;
$$;
