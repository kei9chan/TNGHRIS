-- Make the Loans & Debt route and its scoped records available to the HR
-- oversight roles that own this workflow. Approval separation remains
-- unchanged.
set local lock_timeout = '30s';
set local statement_timeout = '90s';

insert into public.resources(id, group_name, module, description, is_active, high_risk)
values ('Loans', 'Attendance and payroll', 'Payroll', 'Employee loans and payroll debt', true, true)
on conflict (id) do update
set group_name = excluded.group_name,
    module = excluded.module,
    description = excluded.description,
    is_active = true,
    high_risk = true;

do $$
declare
  role_name text;
  before_permissions text[];
  after_permissions text[];
begin
  perform set_config('app.rbac_role_update', 'allowed', true);

  foreach role_name in array array[
    'Admin',
    'Board of Director',
    'HR Manager',
    'HR Staff'
  ]
  loop
    if not exists (select 1 from public.roles where id = role_name and is_active) then
      raise exception 'Required active role % is missing; refusing partial Loans access.', role_name;
    end if;

    select permissions into before_permissions
    from public.role_permissions
    where role_id = role_name and resource_id = 'Loans';

    after_permissions := array(
      select distinct permission
      from unnest(coalesce(before_permissions, '{}'::text[]) || array['view']::text[]) permission
      order by permission
    );

    insert into public.role_permissions(role_id, resource_id, permissions, updated_at)
    values (role_name, 'Loans', after_permissions, clock_timestamp())
    on conflict (role_id, resource_id) do update
    set permissions = excluded.permissions,
        updated_at = excluded.updated_at;

    if before_permissions is distinct from after_permissions then
      insert into public.rbac_audit_log(
        actor_user_id, action, entity_type, entity_id, before_value, after_value
      ) values (
        null,
        'UPDATE_ROLE_PERMISSIONS',
        'role',
        role_name,
        jsonb_build_object(
          'resource', 'Loans',
          'permissions', coalesce(to_jsonb(before_permissions), '[]'::jsonb)
        ),
        jsonb_build_object('resource', 'Loans', 'permissions', to_jsonb(after_permissions))
      );
    end if;
  end loop;
end;
$$;

-- Admin and BOD receive read-only oversight. Existing HR/Finance operational
-- permissions remain owned by payroll_debt_manager and are not broadened.
create or replace function private.payroll_debt_oversight_view(p_scope uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_hris_user_id() is not null
    and (
      (private.workflow_user_has_role(public.current_hris_user_id(), 'Admin')
        and private.payroll_has_access('manage_access', p_scope))
      or (private.workflow_user_has_role(public.current_hris_user_id(), 'Board of Director')
        and private.payroll_has_access('approve_bod', p_scope))
    )
$$;

create or replace function private.payroll_debt_view(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d public.payroll_debts;
  own boolean;
begin
  select * into d
  from public.payroll_debts
  where id = p_id and debt_kind = 'existing_loan';

  own := d.employee_id = public.current_hris_user_id();
  if d.id is null or not (
    private.payroll_debt_manager(d.scope_id)
    or private.payroll_debt_oversight_view(d.scope_id)
    or (own and d.status in ('Active', 'Paused', 'Completed'))
  ) then
    raise exception 'Loan details are outside your authorized scope.' using errcode = '42501';
  end if;

  return to_jsonb(d) || jsonb_build_object(
    'employeeName', (select full_name from public.hris_users where id = d.employee_id),
    'employeeCode', (select employee_id from public.hris_users where id = d.employee_id),
    'totalPaid', d.opening_balance - d.current_balance,
    'remainingCutoffs', (
      select count(*) from public.payroll_debt_schedule
      where debt_id = d.id and status = 'Scheduled' and scheduled_amount > 0
    ),
    'schedule', (
      select coalesce(jsonb_agg(to_jsonb(s) order by sequence_no), '[]')
      from public.payroll_debt_schedule s where debt_id = d.id
    ),
    'audit', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'action', a.action, 'reason', a.reason, 'before', a.before_value,
        'after', a.after_value, 'at', a.occurred_at, 'actor', h.full_name
      ) order by a.occurred_at desc), '[]')
      from public.payroll_debt_audit a
      join public.hris_users h on h.id = a.actor_id
      where a.debt_id = d.id
    )
  );
end
$$;

create or replace function public.get_payroll_debt_context(
  p_scope uuid default null,
  p_payroll_date date default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  own uuid := public.current_hris_user_id();
  manager boolean;
  oversight boolean;
begin
  if own is null then
    raise exception 'Active HRIS login required.' using errcode = '42501';
  end if;

  manager := p_scope is not null and private.payroll_debt_manager(p_scope);
  oversight := p_scope is not null and private.payroll_debt_oversight_view(p_scope);

  if p_scope is null or not (manager or oversight) then
    return jsonb_build_object(
      'canManage', false,
      'canApprove', false,
      'canViewScope', false,
      'scopes', '[]'::jsonb,
      'employees', '[]'::jsonb,
      'debts', (
        select coalesce(jsonb_agg(private.payroll_debt_view(d.id) order by d.created_at desc), '[]')
        from public.payroll_debts d
        where d.employee_id = own
          and d.debt_kind = 'existing_loan'
          and d.status in ('Active', 'Paused', 'Completed')
      )
    );
  end if;

  return jsonb_build_object(
    'canManage', manager,
    'canApprove', manager and private.payroll_debt_approver(p_scope),
    'canViewScope', true,
    'scopes', (
      select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]')
      from public.payroll_access_scopes s
      where s.kind = 'business_unit'
        and (private.payroll_debt_manager(s.id) or private.payroll_debt_oversight_view(s.id))
    ),
    'employees', case when manager then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', h.id, 'name', h.full_name, 'code', h.employee_id
      ) order by h.full_name), '[]')
      from public.hris_users h
      join public.payroll_access_scopes s
        on s.business_unit_id = h.business_unit_id and s.id = p_scope
      where lower(h.status) = 'active'
        and not coalesce(h.is_duplicate, false)
        and private.payroll_package_permission(h.id, p_scope, 'view')
    ) else '[]'::jsonb end,
    'debts', (
      select coalesce(jsonb_agg(private.payroll_debt_view(d.id) order by d.created_at desc), '[]')
      from public.payroll_debts d
      where d.scope_id = p_scope and d.debt_kind = 'existing_loan'
    ),
    'payrollDate', p_payroll_date,
    'locked', case when p_payroll_date is null
      then false else private.payroll_debt_locked(p_scope, p_payroll_date) end
  );
end
$$;

drop policy if exists payroll_debt_document_oversight_read on storage.objects;
create policy payroll_debt_document_oversight_read
on storage.objects for select to authenticated
using (
  bucket_id = 'payroll-debt-documents'
  and exists (
    select 1 from public.payroll_debts d
    where d.document_path = name
      and private.payroll_debt_oversight_view(d.scope_id)
  )
);

revoke all on function private.payroll_debt_oversight_view(uuid) from public, anon, authenticated;
revoke all on function private.payroll_debt_view(uuid) from public, anon, authenticated;
revoke all on function public.get_payroll_debt_context(uuid, date) from public, anon, authenticated;
grant execute on function public.get_payroll_debt_context(uuid, date) to authenticated;

notify pgrst, 'reload schema';
