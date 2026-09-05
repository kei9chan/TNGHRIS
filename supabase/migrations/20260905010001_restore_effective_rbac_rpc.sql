-- Restore the current production RBAC resolver required by AuthContext after
-- get_my_hris_bootstrap() succeeds on a reduced staging baseline.

select pg_advisory_xact_lock(hashtext('tng-hris-effective-rbac-rpc-repair-v1'));

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.role_sensitive_permissions (
  role_id text not null references public.roles(id) on delete restrict,
  field_key text not null,
  permissions text[] not null default '{}'::text[] check (
    permissions <@ array['view', 'edit', 'download', 'export']::text[]
  ),
  updated_at timestamptz not null default now(),
  primary key (role_id, field_key)
);

create table if not exists public.role_workflow_permissions (
  role_id text not null references public.roles(id) on delete restrict,
  workflow_key text not null,
  actions text[] not null default '{}'::text[] check (
    actions <@ array['submit', 'review', 'approve', 'reject', 'return', 'cancel', 'finalize']::text[]
  ),
  updated_at timestamptz not null default now(),
  primary key (role_id, workflow_key)
);

alter table public.role_sensitive_permissions enable row level security;
alter table public.role_workflow_permissions enable row level security;

revoke insert, update, delete
  on public.role_sensitive_permissions, public.role_workflow_permissions
  from authenticated;
grant select
  on public.role_sensitive_permissions, public.role_workflow_permissions
  to authenticated;

-- Exact current production eligibility helper.
create or replace function private.is_employee_self_service_eligible(p_user_id uuid)
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
      and u.auth_user_id is not null
      and lower(coalesce(u.status, '')) = 'active'
      and coalesce(u.is_duplicate, false) = false
      and lower(coalesce(u.employment_status, '')) not in (
        'inactive', 'terminated', 'resigned', 'separated', 'archived'
      )
      and exists (
        select 1
        from auth.users au
        where au.id = u.auth_user_id
          and au.deleted_at is null
          and (au.banned_until is null or au.banned_until < now())
      )
      and exists (
        select 1
        from public.user_roles assigned
        join public.roles assigned_role
          on assigned_role.id = assigned.role_id
         and assigned_role.is_active
        where assigned.user_id = u.id
          and assigned.is_active
      )
  )
$$;

-- Exact current production effective-role helper.
create or replace function private.effective_role_ids(p_user_id uuid)
returns table(role_id text)
language sql
stable
security definer
set search_path = ''
as $$
  with assigned as (
    select distinct ur.role_id
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.is_active
    where ur.user_id = p_user_id
      and ur.is_active
  )
  select assigned.role_id
  from assigned
  union
  select employee_role.id
  from public.roles employee_role
  where employee_role.id = 'Employee'
    and employee_role.is_active
    and exists (select 1 from assigned)
    and private.is_employee_self_service_eligible(p_user_id)
$$;

-- Exact current production RPC definition and return shape.
create or replace function public.get_my_effective_rbac()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select public.current_hris_user_id() as id
  ), assigned as (
    select ur.role_id, ur.is_primary, ur.dashboard_type, ur.scope_type, ur.allowed_business_unit_ids
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.is_active
    where ur.user_id = (select id from me) and ur.is_active
  ), effective_roles as (
    select role_id from private.effective_role_ids((select id from me))
  ), features as (
    select rp.resource_id, array_agg(distinct action order by action) actions
    from effective_roles effective_role
    join public.role_permissions rp on rp.role_id = effective_role.role_id
    join public.resources res on res.id = rp.resource_id and res.is_active
    cross join lateral unnest(rp.permissions) action
    group by rp.resource_id
  ), sensitive as (
    select sp.field_key, array_agg(distinct action order by action) actions
    from assigned actual_role
    join public.role_sensitive_permissions sp on sp.role_id = actual_role.role_id
    cross join lateral unnest(sp.permissions) action
    group by sp.field_key
  ), workflows as (
    select wp.workflow_key, array_agg(distinct action order by action) actions
    from effective_roles effective_role
    join public.role_workflow_permissions wp on wp.role_id = effective_role.role_id
    cross join lateral unnest(wp.actions) action
    group by wp.workflow_key
  )
  select case
    when (select id from me) is null then
      jsonb_build_object('authorized', false, 'diagnostic', 'No active HRIS profile is linked to this authenticated account.')
    when not exists (select 1 from assigned) then
      jsonb_build_object('authorized', false, 'diagnostic', 'No active approved role assignment was found.')
    else jsonb_build_object(
      'authorized', true,
      'userId', (select id from me),
      'roles', (select jsonb_agg(role_id order by is_primary desc, role_id) from assigned),
      'primaryRole', (select role_id from assigned where is_primary order by role_id limit 1),
      'dashboardType', (select dashboard_type from assigned order by is_primary desc, role_id limit 1),
      'dataScope', public.current_data_scope(),
      'features', coalesce((select jsonb_object_agg(resource_id, to_jsonb(actions)) from features), '{}'::jsonb),
      'sensitive', coalesce((select jsonb_object_agg(field_key, to_jsonb(actions)) from sensitive), '{}'::jsonb),
      'workflows', coalesce((select jsonb_object_agg(workflow_key, to_jsonb(actions)) from workflows), '{}'::jsonb),
      'selfServiceInherited', private.is_employee_self_service_eligible((select id from me)),
      'cacheVersion', coalesce((select version from public.rbac_cache_versions where user_id = (select id from me)), 1)
    )
  end
$$;

alter function private.is_employee_self_service_eligible(uuid) owner to postgres;
alter function private.effective_role_ids(uuid) owner to postgres;
alter function public.get_my_effective_rbac() owner to postgres;

revoke all on function private.is_employee_self_service_eligible(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.effective_role_ids(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_effective_rbac()
  from public, anon;

grant execute on function public.get_my_effective_rbac()
  to authenticated, service_role;

notify pgrst, 'reload schema';
