-- Restore the production HRIS bootstrap RPC on databases that started from the
-- reduced staging baseline. The definitions below were read from production's
-- PostgreSQL catalogs; no production objects or data are changed here.

select pg_advisory_xact_lock(hashtext('tng-hris-bootstrap-rpc-repair-v1'));

-- These two normalized RBAC relations are direct dependencies of the current
-- production bootstrap definition. Keep their production column, constraint,
-- and index shapes so the later complete RBAC migration remains compatible.
create table if not exists public.user_roles (
  user_id uuid not null references public.hris_users(id) on delete restrict,
  role_id text not null references public.roles(id) on delete restrict,
  is_primary boolean not null default false,
  scope_type text not null default 'SELF' check (scope_type in (
    'SELF', 'DIRECT_REPORTS', 'DEPARTMENT', 'HOME_ONLY', 'SPECIFIC', 'GLOBAL'
  )),
  allowed_business_unit_ids uuid[] not null default '{}'::uuid[],
  dashboard_type text not null default 'employee',
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.hris_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.hris_users(id) on delete set null,
  primary key (user_id, role_id)
);

create unique index if not exists user_roles_one_active_primary_idx
  on public.user_roles(user_id)
  where is_active and is_primary;

create table if not exists public.rbac_cache_versions (
  user_id uuid primary key references public.hris_users(id) on delete cascade,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;
alter table public.rbac_cache_versions enable row level security;

-- Match production's direct table access: authenticated callers may read, but
-- normalized assignments and cache versions are mutated only by trusted RPCs.
revoke insert, update, delete on public.user_roles, public.rbac_cache_versions
  from authenticated;
grant select on public.user_roles, public.rbac_cache_versions to authenticated;

-- Exact current production helper definition.
create or replace function public.current_hris_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.hris_users u
  where u.auth_user_id = auth.uid()
    and lower(u.status) = 'active'
  limit 1
$$;

-- Exact current production helper definition.
create or replace function public.current_data_scope()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with scopes as (
    select ur.scope_type, ur.allowed_business_unit_ids,
      case ur.scope_type
        when 'GLOBAL' then 6 when 'SPECIFIC' then 5 when 'HOME_ONLY' then 4
        when 'DEPARTMENT' then 3 when 'DIRECT_REPORTS' then 2 else 1
      end as rank
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.is_active
    where ur.user_id = public.current_hris_user_id() and ur.is_active
  ), chosen as (
    select scope_type from scopes order by rank desc limit 1
  )
  select jsonb_build_object(
    'type', coalesce((select scope_type from chosen), 'NONE'),
    'allowedBuIds', coalesce((select to_jsonb(array_agg(distinct bu))
      from scopes s cross join lateral unnest(s.allowed_business_unit_ids) bu), '[]'::jsonb)
  )
$$;

-- Exact current production RPC definition and return shape.
create or replace function public.get_my_hris_bootstrap()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(profile)
  from (
    select
      u.id,
      u.full_name,
      primary_assignment.role_id as role,
      u.status,
      u.department,
      u.business_unit,
      u.position,
      u.date_hired,
      u.is_photo_enrolled,
      u.email,
      u.business_unit_id,
      u.department_id,
      u.reports_to,
      u.employee_id,
      public.current_data_scope() as data_access_scope,
      primary_assignment.dashboard_type,
      u.permission_diagnostic,
      coalesce(cache.updated_at, u.permission_updated_at) as permission_updated_at,
      u.permission_updated_by,
      u.role as legacy_role,
      u.data_access_scope as legacy_data_access_scope,
      u.dashboard_type as legacy_dashboard_type
    from public.hris_users u
    left join lateral (
      select ur.role_id, ur.dashboard_type
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id and r.is_active
      where ur.user_id = u.id and ur.is_active
      order by ur.is_primary desc, ur.updated_at desc nulls last, ur.role_id
      limit 1
    ) primary_assignment on true
    left join public.rbac_cache_versions cache on cache.user_id = u.id
    where u.auth_user_id = auth.uid()
    limit 1
  ) profile
$$;

alter function public.current_hris_user_id() owner to postgres;
alter function public.current_data_scope() owner to postgres;
alter function public.get_my_hris_bootstrap() owner to postgres;

revoke all on function public.current_hris_user_id() from public, anon;
revoke all on function public.current_data_scope() from public, anon;
revoke all on function public.get_my_hris_bootstrap() from public, anon;

grant execute on function public.current_hris_user_id() to authenticated, service_role;
grant execute on function public.current_data_scope() to authenticated, service_role;
grant execute on function public.get_my_hris_bootstrap() to authenticated, service_role;

notify pgrst, 'reload schema';
