-- The capability table is read only through protected SECURITY DEFINER
-- functions. Keep direct API access explicitly denied for signed-in users.

drop policy if exists incident_case_handler_roles_no_direct_access
  on public.incident_case_handler_roles;
create policy incident_case_handler_roles_no_direct_access
on public.incident_case_handler_roles
for all
to authenticated
using (false)
with check (false);
