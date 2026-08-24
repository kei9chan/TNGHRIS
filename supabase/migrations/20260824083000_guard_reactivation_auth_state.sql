-- Guard controlled reactivation from clearing an unrelated Supabase Auth ban.
-- The core functions remain transactional and are no longer directly callable.

alter function public.set_employee_end_date(uuid,date,text)
  rename to set_employee_end_date_core_20260824;

revoke all on function public.set_employee_end_date_core_20260824(uuid,date,text)
  from public, anon, authenticated;

create or replace function public.set_employee_end_date(
  p_target_user_id uuid,
  p_end_date date,
  p_reason text
)
returns public.hris_users
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  target_row public.hris_users;
  current_auth_ban timestamptz;
begin
  if actor_id is null or not (
    public.has_active_role('Admin')
    or public.has_active_role('HR Manager')
    or public.has_active_role('HR Staff')
  ) then
    raise exception 'Forbidden: HR Staff, HR Manager, or Admin authority is required.' using errcode = '42501';
  end if;
  if not public.can_access_hris_user(p_target_user_id) then
    raise exception 'The employee is outside your authorized scope.' using errcode = '42501';
  end if;

  select * into target_row
  from public.hris_users
  where id = p_target_user_id
  for update;
  if target_row.id is null then
    raise exception 'Employee account not found.' using errcode = 'P0002';
  end if;
  if p_end_date is null and target_row.end_date is null then
    raise exception 'No End Date is recorded. Reactivation must reverse a confirmed employee offboarding.';
  end if;

  if p_end_date is null and target_row.auth_user_id is not null then
    select u.banned_until into current_auth_ban
    from auth.users u
    where u.id = target_row.auth_user_id
    for update;

    -- 9999-12-31 is the HRIS lifecycle lock. Any other future ban was
    -- established independently and must survive employee reactivation.
    if current_auth_ban is not null
       and current_auth_ban > now()
       and current_auth_ban <> '9999-12-31 23:59:59+00'::timestamptz then
      update public.hris_users
      set pre_deactivation_banned_until = current_auth_ban
      where id = p_target_user_id;
    end if;
  end if;

  return public.set_employee_end_date_core_20260824(
    p_target_user_id,
    p_end_date,
    p_reason
  );
end;
$$;

revoke all on function public.set_employee_end_date(uuid,date,text) from public, anon;
grant execute on function public.set_employee_end_date(uuid,date,text) to authenticated;

alter function public.admin_set_account_lifecycle(uuid,text,text,boolean)
  rename to admin_set_account_lifecycle_core_20260824;

revoke all on function public.admin_set_account_lifecycle_core_20260824(uuid,text,text,boolean)
  from public, anon, authenticated;

create or replace function public.admin_set_account_lifecycle(
  p_target_user_id uuid,
  p_action text,
  p_reason text,
  p_mark_duplicate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_hris_user_id();
  target_row public.hris_users;
  current_auth_ban timestamptz;
  normalized_action text := lower(trim(coalesce(p_action, '')));
begin
  if actor_id is null or not public.has_active_role('Admin') then
    raise exception 'Forbidden: Admin authority is required.' using errcode = '42501';
  end if;

  select * into target_row
  from public.hris_users
  where id = p_target_user_id
  for update;
  if target_row.id is null then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;
  if normalized_action = 'reactivate' and lower(target_row.status) = 'active' then
    raise exception 'The account is already active. No authentication restriction was changed.';
  end if;
  if normalized_action = 'inactivate' and lower(target_row.status) = 'inactive' then
    raise exception 'The account is already inactive.';
  end if;

  if normalized_action = 'reactivate' and target_row.auth_user_id is not null then
    select u.banned_until into current_auth_ban
    from auth.users u
    where u.id = target_row.auth_user_id
    for update;

    if current_auth_ban is not null
       and current_auth_ban > now()
       and current_auth_ban <> '9999-12-31 23:59:59+00'::timestamptz then
      update public.hris_users
      set pre_deactivation_banned_until = current_auth_ban
      where id = p_target_user_id;
    end if;
  end if;

  return public.admin_set_account_lifecycle_core_20260824(
    p_target_user_id,
    p_action,
    p_reason,
    p_mark_duplicate
  );
end;
$$;

revoke all on function public.admin_set_account_lifecycle(uuid,text,text,boolean) from public, anon;
grant execute on function public.admin_set_account_lifecycle(uuid,text,text,boolean) to authenticated;
