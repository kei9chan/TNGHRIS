-- Close the legacy anonymous self-registration privilege-escalation path.
-- The public RPC signature remains unchanged for the deployed signup client,
-- but authorization values are now server-owned and safely audited.

select pg_advisory_xact_lock(hashtext('tng-hris-secure-self-registration-rbac-v1'));

create or replace function public.register_user_profile(
  p_auth_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_full_name text,
  p_role text,
  p_status text,
  p_is_photo_enrolled boolean,
  p_business_unit text,
  p_business_unit_id uuid,
  p_department text,
  p_department_id uuid,
  p_position text,
  p_birth_date date,
  p_date_hired date,
  p_sss_no text,
  p_pagibig_no text,
  p_philhealth_no text,
  p_tin text,
  p_emergency_contact_name text,
  p_emergency_contact_relationship text,
  p_emergency_contact_phone text,
  p_bank_name text,
  p_bank_account_number text,
  p_bank_account_type text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_email text;
  canonical_business_unit public.business_units%rowtype;
  canonical_department public.departments%rowtype;
  new_hris_user_id uuid;
begin
  if p_auth_user_id is null or nullif(trim(p_email), '') is null then
    raise exception 'A valid authentication identity and email are required.' using errcode = '22023';
  end if;

  select lower(trim(au.email))
    into auth_email
  from auth.users au
  where au.id = p_auth_user_id
    and au.deleted_at is null;

  if auth_email is null then
    raise exception 'The authentication identity does not exist.' using errcode = '42501';
  end if;

  if auth_email <> lower(trim(p_email)) then
    raise exception 'The profile email does not match the authentication identity.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.hris_users u
    where u.auth_user_id = p_auth_user_id
       or lower(u.email) = auth_email
  ) then
    raise exception 'A profile already exists for this account.' using errcode = '23505';
  end if;

  if nullif(trim(p_first_name), '') is null
     or nullif(trim(p_last_name), '') is null
     or nullif(trim(p_full_name), '') is null
     or nullif(trim(p_position), '') is null then
    raise exception 'First name, last name, full name, and position are required.' using errcode = '22023';
  end if;

  if p_business_unit_id is not null then
    select * into canonical_business_unit
    from public.business_units bu
    where bu.id = p_business_unit_id;
  elsif nullif(trim(p_business_unit), '') is not null then
    select * into canonical_business_unit
    from public.business_units bu
    where lower(trim(bu.name)) = lower(trim(p_business_unit))
    order by bu.id
    limit 1;
  end if;

  if canonical_business_unit.id is null then
    raise exception 'Select a valid business unit.' using errcode = '22023';
  end if;

  if p_department_id is not null then
    select * into canonical_department
    from public.departments d
    where d.id = p_department_id
      and d.business_unit_id = canonical_business_unit.id;
  elsif nullif(trim(p_department), '') is not null then
    select * into canonical_department
    from public.departments d
    where d.business_unit_id = canonical_business_unit.id
      and lower(trim(d.name)) = lower(trim(p_department))
    order by d.id
    limit 1;
  end if;

  if canonical_department.id is null then
    raise exception 'Select a valid department for the chosen business unit.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.roles r where r.id = 'Employee' and r.is_active
  ) then
    raise exception 'The approved Employee role is unavailable.' using errcode = '55000';
  end if;

  insert into public.hris_users (
    auth_user_id,
    email,
    first_name,
    last_name,
    full_name,
    role,
    status,
    is_photo_enrolled,
    business_unit,
    business_unit_id,
    department,
    department_id,
    position,
    birth_date,
    date_hired,
    sss_no,
    pagibig_no,
    philhealth_no,
    tin,
    emergency_contact_name,
    emergency_contact_relationship,
    emergency_contact_phone,
    bank_name,
    bank_account_number,
    bank_account_type,
    data_access_scope,
    dashboard_type,
    permission_updated_at
  ) values (
    p_auth_user_id,
    auth_email,
    trim(p_first_name),
    trim(p_last_name),
    trim(p_full_name),
    'Employee',
    'Inactive',
    coalesce(p_is_photo_enrolled, false),
    canonical_business_unit.name,
    canonical_business_unit.id,
    canonical_department.name,
    canonical_department.id,
    trim(p_position),
    p_birth_date,
    p_date_hired,
    nullif(trim(p_sss_no), ''),
    nullif(trim(p_pagibig_no), ''),
    nullif(trim(p_philhealth_no), ''),
    nullif(trim(p_tin), ''),
    nullif(trim(p_emergency_contact_name), ''),
    nullif(trim(p_emergency_contact_relationship), ''),
    nullif(trim(p_emergency_contact_phone), ''),
    nullif(trim(p_bank_name), ''),
    nullif(trim(p_bank_account_number), ''),
    coalesce(nullif(trim(p_bank_account_type), ''), 'Savings'),
    jsonb_build_object('type', 'SELF'),
    'employee',
    now()
  )
  returning id into new_hris_user_id;

  insert into public.user_roles (
    user_id,
    role_id,
    is_primary,
    scope_type,
    allowed_business_unit_ids,
    dashboard_type,
    is_active
  ) values (
    new_hris_user_id,
    'Employee',
    true,
    'SELF',
    '{}'::uuid[],
    'employee',
    true
  );

  insert into public.rbac_cache_versions (user_id, version, updated_at)
  values (new_hris_user_id, 1, now())
  on conflict (user_id) do nothing;

  insert into public.rbac_audit_log (
    actor_user_id,
    target_user_id,
    action,
    entity_type,
    entity_id,
    before_value,
    after_value
  ) values (
    null,
    new_hris_user_id,
    'SELF_REGISTRATION',
    'user_role_assignment',
    new_hris_user_id::text,
    null,
    jsonb_build_object(
      'assignedRole', 'Employee',
      'assignedStatus', 'Inactive',
      'scopeType', 'SELF',
      'dashboardType', 'employee',
      'requestedRole', p_role,
      'requestedStatus', p_status,
      'authUserId', p_auth_user_id,
      'email', auth_email
    )
  );
end;
$$;

comment on function public.register_user_profile(
  uuid,text,text,text,text,text,text,boolean,text,uuid,text,uuid,text,date,date,
  text,text,text,text,text,text,text,text,text,text
) is 'Creates an inactive Employee SELF-scope profile for a verified new Auth identity; caller-supplied role and status values are ignored and audited.';

revoke all on function public.register_user_profile(
  uuid,text,text,text,text,text,text,boolean,text,uuid,text,uuid,text,date,date,
  text,text,text,text,text,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.register_user_profile(
  uuid,text,text,text,text,text,text,boolean,text,uuid,text,uuid,text,date,date,
  text,text,text,text,text,text,text,text,text,text
) to anon;

-- Keep this legacy RLS helper transition-compatible, but resolve its meaning
-- through normalized assignments/matrices rather than hris_users.role strings.
create or replace function public.is_manager_or_above()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.has_workflow_permission('JobRequisitions', 'review')
      or (
        public.has_feature_permission('JobRequisitions', 'view')
        and public.current_data_scope()->>'type' = 'DIRECT_REPORTS'
      )
$$;

revoke all on function public.is_manager_or_above() from public, anon;
grant execute on function public.is_manager_or_above() to authenticated;

-- Trigger helpers are never callable as public API functions.
revoke all on function public.set_updated_at() from public, anon, authenticated;

do $$
begin
  if not has_function_privilege(
    'anon',
    'public.register_user_profile(uuid,text,text,text,text,text,text,boolean,text,uuid,text,uuid,text,date,date,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Self-registration lockdown failed: anon cannot invoke the guarded registration RPC.';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.register_user_profile(uuid,text,text,text,text,text,text,boolean,text,uuid,text,uuid,text,date,date,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Self-registration lockdown failed: authenticated sessions can invoke the anonymous registration RPC.';
  end if;

  if has_function_privilege('anon', 'public.is_manager_or_above()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.is_manager_or_above()', 'EXECUTE')
     or has_function_privilege('anon', 'public.set_updated_at()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.set_updated_at()', 'EXECUTE') then
    raise exception 'Legacy helper privilege lockdown failed.';
  end if;
end;
$$;
