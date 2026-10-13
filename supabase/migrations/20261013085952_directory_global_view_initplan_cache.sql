-- Cache only the row-independent global-view branch of can_access_hris_user.
-- Scoped, department, direct-report and self visibility continue to use the
-- existing per-row authority. This changes no write permissions or grants.
set local lock_timeout='5s';
set local statement_timeout='30s';
alter policy hris_users_central_select on public.hris_users
using (
 (select public.current_hris_user_id() is not null and (
   (public.has_active_role('Admin') and public.has_feature_permission('UserManagement','view'))
   or ((public.has_feature_permission('Employees','view')
     or public.has_feature_permission('EmployeeList','view')
     or public.has_feature_permission('UserManagement','view'))
     and public.current_data_scope()->>'type'='GLOBAL')
 ))
 or public.can_access_hris_user(id)
);
notify pgrst,'reload schema';
