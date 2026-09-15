-- Registration review is independent of employment/account lifecycle.
alter table public.hris_users add column registration_status text not null default 'NotApplicable'
 check (registration_status in ('NotApplicable','Pending','Approved','Rejected'));
update public.hris_users u set registration_status = case
 when u.status::text='Active' or exists(select 1 from public.audit_logs a where a.entity='UserRegistration' and a.entity_id=u.id::text and a.action='APPROVE') then 'Approved'
 when u.account_inactivated_at is not null or u.end_date is not null or coalesce(u.is_duplicate,false)
 or lower(coalesce(u.employment_status::text,'')) in ('resigned','terminated','separated','inactive') then 'NotApplicable'
 when exists(select 1 from public.audit_logs a where a.entity='UserRegistration' and a.entity_id=u.id::text and a.action='DELETE' and a.details ilike '%reject%') then 'Rejected'
 when u.status::text='Inactive' and exists(select 1 from public.rbac_audit_log a where a.target_user_id=u.id and a.action='SELF_REGISTRATION') then 'Pending'
 else 'NotApplicable' end;
create schema registration_private;
revoke all on schema registration_private from public,anon;
grant usage on schema registration_private to authenticated;
create function registration_private.guard_registration_status() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('authenticated','anon') and
 ((TG_OP='INSERT' and new.registration_status <> 'NotApplicable') or
 (TG_OP='UPDATE' and new.registration_status is distinct from old.registration_status)) then
 raise exception 'Registration decisions must use the review action.' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function registration_private.guard_registration_status() from public,anon,authenticated;
create trigger guard_registration_status before insert or update on public.hris_users
 for each row execute function registration_private.guard_registration_status();
create function registration_private.pending_registration(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.hris_users u where u.id=p_id and u.registration_status='Pending'
 and u.status::text='Inactive' and u.account_inactivated_at is null and u.end_date is null
 and not coalesce(u.is_duplicate,false) and lower(coalesce(u.employment_status::text,'')) not in ('resigned','terminated','separated','inactive'))
$$;
revoke all on function registration_private.pending_registration(uuid) from public,anon,authenticated;
create function registration_private.registration_queue() returns setof public.hris_users language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_feature_permission('Employees','edit') then
 raise exception 'Registration review permission required.' using errcode='42501'; end if;
 return query select u.* from public.hris_users u where registration_private.pending_registration(u.id)
 and public.can_access_hris_user(u.id) order by u.created_at;
end $$;
create function public.get_pending_registrations() returns setof public.hris_users language sql stable security invoker set search_path='' as $$select * from registration_private.registration_queue()$$;
create function registration_private.review_registration(p_id uuid,p_decision text,p_reason text,p_reports_to uuid,p_employee_id text)
 returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_hris_user_id(); target public.hris_users; actor_email text;
begin
 if auth.uid() is null or actor is null or not public.has_feature_permission('Employees','edit')
 or not public.can_access_hris_user(p_id) or actor=p_id then
 raise exception 'Registration review permission required.' using errcode='42501'; end if;
 select * into target from public.hris_users where id=p_id for update;
 if not found or not registration_private.pending_registration(p_id) then
 raise exception 'This account is no longer a pending registration. Refresh the queue.' using errcode='55000'; end if;
 if p_decision='Rejected' then
 if nullif(trim(p_reason),'') is null then raise exception 'A rejection reason is required.'; end if;
 update public.hris_users set registration_status='Rejected' where id=p_id;
 elsif p_decision='Approved' then
 if nullif(trim(p_employee_id),'') is null or not exists(select 1 from public.hris_users m where m.id=p_reports_to and m.status::text='Active'
 and m.role::text in ('Manager','Business Unit Manager','Auditor','HR Manager','Operations Director','General Manager','Board of Director','BOD','Admin')
 and (m.role::text <> 'Business Unit Manager' or m.business_unit_id=target.business_unit_id)) then
 raise exception 'A valid reporting manager and employee code are required.'; end if;
 update public.hris_users set registration_status='Approved',status='Active',reports_to=p_reports_to,employee_id=trim(p_employee_id) where id=p_id;
 else raise exception 'Unsupported registration decision.'; end if;
 select email into actor_email from public.hris_users where id=actor;
 insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details)
 values(actor::text,actor_email,case when p_decision='Approved' then 'APPROVE' else 'REJECT' end,'UserRegistration',p_id::text,
 case when p_decision='Approved' then 'Approved new user registration.' else 'Rejected registration: '||trim(p_reason) end);
 return p_decision;
end $$;
create function public.review_registration(p_id uuid,p_decision text,p_reason text default null,p_reports_to uuid default null,p_employee_id text default null)
 returns text language sql security invoker set search_path='' as $$select registration_private.review_registration(p_id,p_decision,p_reason,p_reports_to,p_employee_id)$$;
revoke all on function registration_private.registration_queue(), public.get_pending_registrations(),
 registration_private.review_registration(uuid,text,text,uuid,text),public.review_registration(uuid,text,text,uuid,text) from public,anon;
grant execute on function registration_private.registration_queue(), public.get_pending_registrations(),
 registration_private.review_registration(uuid,text,text,uuid,text),public.review_registration(uuid,text,text,uuid,text) to authenticated;

-- Existing secure self-registration retains its identity and role validation.
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
    registration_status,
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
    'Pending',
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

