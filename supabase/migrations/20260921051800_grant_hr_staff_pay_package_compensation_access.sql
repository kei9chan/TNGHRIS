-- HR Staff are authorized to prepare employee pay packages within their
-- existing employee/business-unit scope. Grant the sensitive-field capability
-- used by the Pay Package Builder; row-level access and approval authority
-- remain enforced independently.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  v_before text[];
begin
  select permissions
  into v_before
  from public.role_sensitive_permissions
  where role_id = 'HR Staff'
    and field_key = 'salary_compensation';

  insert into public.role_sensitive_permissions (
    role_id, field_key, permissions, updated_at
  ) values (
    'HR Staff', 'salary_compensation', array['view', 'edit']::text[], now()
  )
  on conflict (role_id, field_key) do update
    set permissions = (
          select array_agg(distinct permission order by permission)
          from unnest(
            public.role_sensitive_permissions.permissions
            || array['view', 'edit']::text[]
          ) permission
        ),
        updated_at = now();

  if not (coalesce(v_before, '{}'::text[]) @> array['view', 'edit']::text[]) then
    insert into public.rbac_audit_log (
      actor_user_id, action, entity_type, entity_id, before_value, after_value
    ) values (
      null,
      'UPDATE_ROLE_SENSITIVE_PERMISSIONS',
      'role',
      'HR Staff',
      jsonb_build_object(
        'field', 'salary_compensation',
        'permissions', coalesce(to_jsonb(v_before), '[]'::jsonb)
      ),
      jsonb_build_object(
        'field', 'salary_compensation',
        'permissions', to_jsonb(array['view', 'edit']::text[]),
        'reason', 'Align Pay Package Builder access with HR Staff responsibility.'
      )
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';
