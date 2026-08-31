-- Allow authorized evaluation oversight users to open evaluation cycles and
-- read internal results without making them evaluator assignments. Employees
-- who are targets remain subject to the existing released-results policy.

do $$
begin
  if not exists (select 1 from public.resources where id = 'Evaluation') then
    raise exception 'Evaluation resource is missing; refusing to change RBAC.';
  end if;
  if not exists (select 1 from public.resources where id = 'EvaluationResults') then
    raise exception 'EvaluationResults resource is missing; refusing to change RBAC.';
  end if;
end;
$$;

insert into public.role_permissions (role_id, resource_id, permissions, updated_at)
values
  ('Admin', 'Evaluation', array['view']::text[], now()),
  ('Admin', 'EvaluationResults', array['view']::text[], now()),
  ('HR Staff', 'Evaluation', array['view']::text[], now()),
  ('HR Staff', 'EvaluationResults', array['view']::text[], now())
on conflict (role_id, resource_id) do update
set permissions = array(
      select distinct action
      from unnest(coalesce(public.role_permissions.permissions, '{}'::text[]) || excluded.permissions) action
      order by action
    ),
    updated_at = now();

-- The live security helper already includes these roles. Keep this migration
-- limited to feature visibility so other HR/RLS policies are not broadened.
