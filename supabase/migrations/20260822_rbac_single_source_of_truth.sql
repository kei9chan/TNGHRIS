-- TNG HRIS authoritative RBAC. Apply after 20260512_admin_rls_bypass.sql.
alter table public.roles add column if not exists dashboard_type text not null default 'employee';
alter table public.roles drop constraint if exists roles_dashboard_type_check;
alter table public.roles add constraint roles_dashboard_type_check
check (dashboard_type in ('employee', 'manager', 'hr', 'executive'));

update public.roles set dashboard_type = 'hr'
where lower(id) in ('admin', 'hr manager', 'hr staff', 'hr head') or lower(id) like '%human resources%';
update public.roles set dashboard_type = 'executive'
where lower(id) in ('board of director', 'generalmanager');
update public.roles set dashboard_type = 'manager'
where lower(id) in ('manager', 'business unit manager', 'operations director', 'finance staff', 'auditor', 'recruiter', 'it');

insert into public.resources (id, group_name) values
('RolesPermissions','Admin'),('UserManagement','Admin'),('Departments','Admin'),
('SiteManagement','Admin'),('LeavePolicies','Admin'),('Holidays','Admin'),
('AuditLog','Admin'),('Calendar','Helpdesk'),('OrgChart','Helpdesk'),
('Contracts & Signing','Employees'),('DailyTimeReview','Payroll')
on conflict (id) do nothing;

create or replace function public.active_hris_user_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select u.id from public.hris_users u
  where u.auth_user_id = auth.uid() and lower(coalesce(u.status,'')) = 'active'
  limit 1
$$;

create or replace function public.active_hris_role_id()
returns text language sql stable security definer set search_path = ''
as $$
  select u.role from public.hris_users u
  where u.auth_user_id = auth.uid() and lower(coalesce(u.status,'')) = 'active'
  limit 1
$$;

create or replace function public.rbac_has_permission(p_resource text, p_action text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select u.role = 'Admin'
      or to_jsonb(rp.permissions) ? 'manage'
      or to_jsonb(rp.permissions) ? p_action
      or (p_action = 'view' and (
        to_jsonb(rp.permissions) ? 'create' or to_jsonb(rp.permissions) ? 'edit'
        or to_jsonb(rp.permissions) ? 'approve'
      ))
    from public.hris_users u
    join public.roles r on r.id = u.role
    left join public.role_permissions rp on rp.role_id = r.id and rp.resource_id = p_resource
    where u.auth_user_id = auth.uid() and lower(coalesce(u.status,'')) = 'active'
    limit 1
  ), false)
$$;

create or replace function public.rbac_allowed_business_unit_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select x.id
  from public.hris_users u
  cross join lateral (
    select u.business_unit_id as id
    where coalesce(u.data_access_scope->>'type','HOME_ONLY') = 'HOME_ONLY'
    union
    select value::uuid from jsonb_array_elements_text(coalesce(u.data_access_scope->'allowedBuIds','[]'::jsonb)) value
    where u.data_access_scope->>'type' = 'SPECIFIC'
    union
    select b.id from public.business_units b where u.data_access_scope->>'type' = 'GLOBAL'
  ) x
  where u.auth_user_id = auth.uid() and lower(coalesce(u.status,'')) = 'active' and x.id is not null
$$;

create or replace function public.rbac_can_access_business_unit(p_business_unit_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(p_business_unit_id in (select public.rbac_allowed_business_unit_ids()), false) $$;

create or replace function public.rbac_can_access_employee(p_employee_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select e.auth_user_id = auth.uid()
    or public.rbac_can_access_business_unit(e.business_unit_id)
    from public.hris_users e where e.id = p_employee_id), false)
$$;

create table if not exists public.rbac_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null, target_user_id uuid not null,
  previous_role_id text, previous_data_access_scope jsonb,
  new_role_id text not null, new_data_access_scope jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.rbac_audit_log enable row level security;
drop policy if exists rbac_audit_log_read on public.rbac_audit_log;
create policy rbac_audit_log_read on public.rbac_audit_log
for select using (public.rbac_has_permission('AuditLog','view'));

create or replace function public.update_user_rbac(
  p_target_user_id uuid, p_role_id text, p_data_access_scope jsonb
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid;
  v_previous public.hris_users%rowtype;
  v_scope_type text;
begin
  if not public.rbac_has_permission('UserManagement','manage') then
    raise exception 'Not authorized to manage user access';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id) then
    raise exception 'Role does not exist';
  end if;
  v_scope_type := p_data_access_scope->>'type';
  if v_scope_type not in ('GLOBAL','SPECIFIC','HOME_ONLY') then raise exception 'Invalid data access scope'; end if;
  if v_scope_type = 'SPECIFIC'
    and jsonb_array_length(coalesce(p_data_access_scope->'allowedBuIds','[]'::jsonb)) = 0
  then raise exception 'Specific scope requires at least one business unit'; end if;
  if v_scope_type = 'SPECIFIC' and exists (
    select 1 from jsonb_array_elements_text(p_data_access_scope->'allowedBuIds') item
    where not exists (select 1 from public.business_units where id = item::uuid)
  ) then raise exception 'Specific scope contains an invalid business unit'; end if;

  select * into strict v_previous from public.hris_users where id = p_target_user_id for update;
  v_actor := public.active_hris_user_id();
  update public.hris_users set role = p_role_id, data_access_scope = p_data_access_scope where id = p_target_user_id;
  insert into public.rbac_audit_log (
    actor_user_id,target_user_id,previous_role_id,previous_data_access_scope,new_role_id,new_data_access_scope
  ) values (
    v_actor,p_target_user_id,v_previous.role,v_previous.data_access_scope,p_role_id,p_data_access_scope
  );
end
$$;

revoke all on function public.active_hris_user_id() from public;
revoke all on function public.active_hris_role_id() from public;
revoke all on function public.rbac_has_permission(text,text) from public;
revoke all on function public.rbac_allowed_business_unit_ids() from public;
revoke all on function public.rbac_can_access_business_unit(uuid) from public;
revoke all on function public.rbac_can_access_employee(uuid) from public;
revoke all on function public.update_user_rbac(uuid,text,jsonb) from public;
grant execute on function public.active_hris_user_id() to authenticated;
grant execute on function public.active_hris_role_id() to authenticated;
grant execute on function public.rbac_has_permission(text,text) to authenticated;
grant execute on function public.rbac_allowed_business_unit_ids() to authenticated;
grant execute on function public.rbac_can_access_business_unit(uuid) to authenticated;
grant execute on function public.rbac_can_access_employee(uuid) to authenticated;
grant execute on function public.update_user_rbac(uuid,text,jsonb) to authenticated;

alter table public.roles enable row level security;
drop policy if exists rbac_read_roles on public.roles;
create policy rbac_read_roles on public.roles for select using (
  id = public.active_hris_role_id() or public.rbac_has_permission('RolesPermissions','view')
);
drop policy if exists rbac_manage_roles on public.roles;
create policy rbac_manage_roles on public.roles for all using (
  public.rbac_has_permission('RolesPermissions','manage')
) with check (public.rbac_has_permission('RolesPermissions','manage'));

alter table public.resources enable row level security;
drop policy if exists rbac_read_resources on public.resources;
create policy rbac_read_resources on public.resources for select using (
  public.active_hris_user_id() is not null
);
drop policy if exists rbac_manage_resources on public.resources;
create policy rbac_manage_resources on public.resources for all using (
  public.rbac_has_permission('RolesPermissions','manage')
) with check (public.rbac_has_permission('RolesPermissions','manage'));

alter table public.role_permissions enable row level security;
drop policy if exists rbac_read_role_permissions on public.role_permissions;
create policy rbac_read_role_permissions on public.role_permissions for select using (
  role_id = public.active_hris_role_id()
  or public.rbac_has_permission('RolesPermissions','view')
);
drop policy if exists rbac_manage_role_permissions on public.role_permissions;
create policy rbac_manage_role_permissions on public.role_permissions for all using (
  public.rbac_has_permission('RolesPermissions','manage')
) with check (public.rbac_has_permission('RolesPermissions','manage'));

alter table public.hris_users enable row level security;
drop policy if exists rbac_select_hris_users on public.hris_users;
create policy rbac_select_hris_users on public.hris_users for select using (
  auth_user_id = auth.uid() or (
    public.rbac_has_permission('Employees','view')
    and public.rbac_can_access_business_unit(business_unit_id)
  )
);
drop policy if exists rbac_update_hris_users on public.hris_users;
create policy rbac_update_hris_users on public.hris_users for update using (
  public.rbac_has_permission('Employees','edit') and public.rbac_can_access_business_unit(business_unit_id)
) with check (
  public.rbac_has_permission('Employees','edit') and public.rbac_can_access_business_unit(business_unit_id)
);

-- Install uniform feature + scope policies where a table has business_unit_id.
do $$
declare item record;
begin
  for item in select * from (values
    ('departments','Departments'),('leave_requests','Leave'),('ot_requests','OT'),
    ('wfh_requests','WFH'),('incident_reports','Feedback'),('disciplinary_cases','Feedback'),
    ('coaching_logs','Coaching'),('pans','PAN'),('coe_requests','COE'),
    ('manpower_requests','Manpower'),('assets','Assets'),('asset_requests','AssetRequests'),
    ('tickets','Helpdesk'),('announcements','Announcements'),('payroll_staging','PayrollStaging'),
    ('payslips','Payslips'),('loans','Loans')
  ) as mappings(table_name,resource_id)
  loop
    if to_regclass('public.'||item.table_name) is not null and exists (
      select 1 from information_schema.columns where table_schema='public'
      and table_name=item.table_name and column_name='business_unit_id'
    ) then
      execute format('alter table public.%I enable row level security',item.table_name);
      execute format('drop policy if exists rbac_select on public.%I',item.table_name);
      execute format('create policy rbac_select on public.%I for select using (public.rbac_has_permission(%L,%L) and public.rbac_can_access_business_unit(business_unit_id))',item.table_name,item.resource_id,'view');
      execute format('drop policy if exists rbac_insert on public.%I',item.table_name);
      execute format('create policy rbac_insert on public.%I for insert with check (public.rbac_has_permission(%L,%L) and public.rbac_can_access_business_unit(business_unit_id))',item.table_name,item.resource_id,'create');
      execute format('drop policy if exists rbac_update on public.%I',item.table_name);
      execute format('create policy rbac_update on public.%I for update using (public.rbac_has_permission(%L,%L) and public.rbac_can_access_business_unit(business_unit_id)) with check (public.rbac_has_permission(%L,%L) and public.rbac_can_access_business_unit(business_unit_id))',item.table_name,item.resource_id,'edit',item.resource_id,'edit');
    end if;
  end loop;
end
$$;

-- Configure Jedediah through RBAC data, never application logic.
do $$
declare v_role text; v_user uuid;
begin
  select id into v_role from public.roles where lower(id) in ('hr head','hr manager')
  order by case when lower(id)='hr head' then 0 else 1 end limit 1;
  select id into v_user from public.hris_users
  where lower(trim(full_name))='jedediah tejido' and auth_user_id is not null limit 1;
  if v_role is not null and v_user is not null then
    update public.roles set dashboard_type='hr' where id=v_role;
    if v_role <> 'HR Manager' then
      insert into public.role_permissions (role_id,resource_id,permissions)
      select v_role,resource_id,permissions from public.role_permissions where role_id='HR Manager'
      on conflict (role_id,resource_id) do update set permissions=excluded.permissions;
    end if;
    update public.hris_users set role=v_role,data_access_scope='{"type":"GLOBAL"}'::jsonb where id=v_user;
  else
    raise warning 'Jedediah Tejido RBAC unchanged: verify the auth link and existing HR role.';
  end if;
end
$$;

-- Verification:
-- select u.id,u.full_name,u.auth_user_id,u.role,u.data_access_scope,r.dashboard_type
-- from public.hris_users u join public.roles r on r.id=u.role
-- where lower(trim(u.full_name))='jedediah tejido';
-- select * from public.role_permissions where role_id=(
--   select role from public.hris_users where lower(trim(full_name))='jedediah tejido'
-- );
