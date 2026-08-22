-- Limited dual-role support for the approved owner and IT administrator accounts.
-- Review the RBAC audit documents before applying this migration.

create table if not exists public.user_roles (
  user_id uuid not null references public.hris_users(id) on delete cascade,
  role_id text not null references public.roles(id) on update cascade on delete restrict,
  is_primary boolean not null default false,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.hris_users(id),
  primary key (user_id, role_id)
);

create unique index if not exists user_roles_one_primary_per_user
  on public.user_roles(user_id) where is_primary;

create table if not exists public.dual_role_allowlist (
  user_id uuid primary key references public.hris_users(id) on delete cascade,
  allowed_role_ids text[] not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rbac_role_assignment_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.hris_users(id),
  target_user_id uuid not null references public.hris_users(id),
  previous_role_ids text[] not null default '{}',
  new_role_ids text[] not null,
  previous_primary_role_id text,
  new_primary_role_id text not null,
  previous_data_access_scope jsonb,
  new_data_access_scope jsonb,
  changed_at timestamptz not null default now()
);

insert into public.user_roles (user_id, role_id, is_primary)
select u.id, u.role, true
from public.hris_users u
join public.roles r on r.id = u.role
where u.role is not null
on conflict (user_id, role_id) do update set is_primary = excluded.is_primary;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.hris_users u
    join public.user_roles ur on ur.user_id = u.id
    where u.auth_user_id = auth.uid()
      and ur.role_id = 'Admin'
      and lower(coalesce(u.status, '')) = 'active'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.user_roles enable row level security;
alter table public.dual_role_allowlist enable row level security;
alter table public.rbac_role_assignment_audit enable row level security;

drop policy if exists user_roles_read_effective on public.user_roles;
create policy user_roles_read_effective on public.user_roles
for select using (
  public.is_admin()
  or user_id in (
    select u.id from public.hris_users u where u.auth_user_id = auth.uid()
  )
);

drop policy if exists dual_role_allowlist_admin_read on public.dual_role_allowlist;
create policy dual_role_allowlist_admin_read on public.dual_role_allowlist
for select using (public.is_admin());

drop policy if exists role_assignment_audit_admin_read on public.rbac_role_assignment_audit;
create policy role_assignment_audit_admin_read on public.rbac_role_assignment_audit
for select using (public.is_admin());

create or replace function public.update_user_role_assignments(
  p_target_user_id uuid,
  p_role_ids text[],
  p_primary_role_id text,
  p_data_access_scope jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_allowed_roles text[];
  v_previous_roles text[];
  v_previous_primary text;
  v_previous_scope jsonb;
  v_scope_type text;
begin
  if not public.is_admin() then
    raise exception 'Not authorized to manage role assignments';
  end if;

  if p_role_ids is null or cardinality(p_role_ids) < 1 or cardinality(p_role_ids) > 2 then
    raise exception 'One or two roles must be assigned';
  end if;
  if p_primary_role_id <> all(p_role_ids) then
    raise exception 'Primary role must be one of the assigned roles';
  end if;
  if exists (
    select 1 from unnest(p_role_ids) requested
    where not exists (select 1 from public.roles r where r.id = requested)
  ) then
    raise exception 'One or more assigned roles do not exist';
  end if;

  if cardinality(p_role_ids) > 1 then
    select allowed_role_ids into v_allowed_roles
    from public.dual_role_allowlist where user_id = p_target_user_id;
    if v_allowed_roles is null
      or not (p_role_ids <@ v_allowed_roles and v_allowed_roles <@ p_role_ids)
    then
      raise exception 'This user is not approved for the requested dual-role combination';
    end if;
  end if;

  v_scope_type := coalesce(p_data_access_scope->>'type', 'HOME_ONLY');
  if v_scope_type not in ('HOME_ONLY', 'SPECIFIC', 'GLOBAL') then
    raise exception 'Invalid data access scope';
  end if;
  if v_scope_type = 'SPECIFIC'
    and jsonb_array_length(coalesce(p_data_access_scope->'allowedBuIds', '[]'::jsonb)) = 0
  then
    raise exception 'SPECIFIC scope requires at least one business unit';
  end if;

  select u.role, u.data_access_scope
    into v_previous_primary, v_previous_scope
  from public.hris_users u where u.id = p_target_user_id for update;
  if not found then raise exception 'Target HRIS user does not exist'; end if;

  select coalesce(array_agg(ur.role_id order by ur.role_id), '{}')
    into v_previous_roles
  from public.user_roles ur where ur.user_id = p_target_user_id;
  select u.id into v_actor_id
  from public.hris_users u where u.auth_user_id = auth.uid() limit 1;

  delete from public.user_roles where user_id = p_target_user_id;
  insert into public.user_roles (user_id, role_id, is_primary, assigned_by)
  select p_target_user_id, role_id, role_id = p_primary_role_id, v_actor_id
  from unnest(p_role_ids) role_id;

  update public.hris_users
  set role = p_primary_role_id,
      data_access_scope = p_data_access_scope
  where id = p_target_user_id;

  insert into public.rbac_role_assignment_audit (
    actor_user_id, target_user_id, previous_role_ids, new_role_ids,
    previous_primary_role_id, new_primary_role_id,
    previous_data_access_scope, new_data_access_scope
  ) values (
    v_actor_id, p_target_user_id, v_previous_roles, p_role_ids,
    v_previous_primary, p_primary_role_id,
    v_previous_scope, p_data_access_scope
  );
end;
$$;

revoke all on function public.update_user_role_assignments(uuid, text[], text, jsonb) from public;
grant execute on function public.update_user_role_assignments(uuid, text[], text, jsonb) to authenticated;

do $$
declare
  v_owner_user_id uuid;
  v_it_user_id uuid;
  v_admin_role text;
  v_bod_role text;
  v_it_role text;
begin
  select id into v_admin_role from public.roles where lower(id) = 'admin' limit 1;
  select id into v_bod_role from public.roles where lower(id) = 'board of director' limit 1;
  select id into v_it_role from public.roles where lower(id) = 'it' limit 1;
  select id into v_owner_user_id from public.hris_users where lower(trim(email)) = 'kay@thenextperience.com' limit 1;
  select id into v_it_user_id from public.hris_users where lower(trim(email)) = 'it@thenextperience.com' limit 1;

  if v_admin_role is null or v_bod_role is null or v_it_role is null then
    raise exception 'Required existing roles Admin, Board of Director, and IT must be verified before seeding';
  end if;
  if v_owner_user_id is null or v_it_user_id is null then
    raise exception 'Approved owner and IT HRIS accounts must exist before seeding dual roles';
  end if;

  insert into public.dual_role_allowlist (user_id, allowed_role_ids, reason) values
    (v_owner_user_id, array[v_admin_role, v_bod_role], 'Approved owner: Super Admin + Board of Director'),
    (v_it_user_id, array[v_admin_role, v_it_role], 'Approved IT administrator: Super Admin + IT')
  on conflict (user_id) do update
    set allowed_role_ids = excluded.allowed_role_ids,
        reason = excluded.reason;

  delete from public.user_roles where user_id in (v_owner_user_id, v_it_user_id);
  insert into public.user_roles (user_id, role_id, is_primary) values
    (v_owner_user_id, v_bod_role, true),
    (v_owner_user_id, v_admin_role, false),
    (v_it_user_id, v_it_role, true),
    (v_it_user_id, v_admin_role, false);

  update public.hris_users
  set role = v_bod_role, data_access_scope = '{"type":"GLOBAL"}'::jsonb
  where id = v_owner_user_id;
  update public.hris_users
  set role = v_it_role, data_access_scope = '{"type":"GLOBAL"}'::jsonb
  where id = v_it_user_id;
end;
$$;

-- Verification (must return exactly two rows and the exact role combinations):
-- select u.email, u.role as primary_role, u.data_access_scope,
--        array_agg(ur.role_id order by ur.role_id) as effective_roles
-- from public.hris_users u
-- join public.user_roles ur on ur.user_id = u.id
-- where lower(u.email) in ('kay@thenextperience.com', 'it@thenextperience.com')
-- group by u.email, u.role, u.data_access_scope
-- order by u.email;
