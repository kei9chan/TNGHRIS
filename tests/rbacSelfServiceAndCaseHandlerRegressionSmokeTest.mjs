import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260901130000_repair_canonical_employee_self_service_and_case_handlers.sql');
const timeAccessMigration = read('supabase/migrations/20260901131500_separate_self_service_from_cross_employee_time_access.sql');
const workflowMigration = read('supabase/migrations/20260901133000_repair_employee_workflow_submission_transition.sql');
const capabilityPolicyMigration = read('supabase/migrations/20260901134500_explicitly_deny_case_handler_capability_table.sql');
const permissionsContext = read('context/PermissionsContext.tsx');
const authContext = read('context/AuthContext.tsx');
const permissionHook = read('hooks/usePermissions.ts');
const incidentService = read('services/incidentReportService.ts');
const incidentModal = read('components/feedback/IncidentReportModal.tsx');
const overtimePage = read('pages/payroll/OvertimeRequests.tsx');
const wfhPage = read('pages/payroll/WFHRequests.tsx');
const integrationSql = read('tests/sql/rbac_self_service_case_handler_integration.sql');

assert.match(migration, /private\.effective_role_ids/);
assert.match(migration, /private\.is_employee_self_service_eligible/);
assert.match(migration, /from private\.effective_role_ids\(public\.current_hris_user_id\(\)\)/);
assert.match(migration, /'OT'::text, array\['view', 'create', 'edit'\]/);
assert.match(migration, /'WFH'::text, array\['view', 'create', 'edit'\]/);
assert.match(migration, /'Overtime'::text, array\['submit', 'cancel'\]/);
assert.match(migration, /incident_case_handler_roles/);
assert.match(migration, /refresh_rbac_after_case_handler_capability_change/);
assert.match(migration, /get_assignable_incident_case_handlers/);
assert.match(migration, /private\.user_is_within_current_scope/);
assert.match(migration, /on conflict \(user_id, dedupe_key\) do nothing/);
assert.match(migration, /legacy_role/);
assert.match(migration, /selfServiceInherited/);
assert.match(migration, /refresh_rbac_after_user_role_change/);
assert.match(migration, /refresh_rbac_after_feature_permission_change/);
assert.match(migration, /alter publication supabase_realtime add table public\.rbac_cache_versions/);
assert.match(timeAccessMigration, /private\.has_assigned_feature_permission/);
assert.match(timeAccessMigration, /private\.is_active_time_request_approver/);
assert.match(timeAccessMigration, /v_actor = p_employee_id/);
assert.doesNotMatch(timeAccessMigration, /has_active_role\('HR Staff'\)/);
assert.match(workflowMigration, /old_status in \('draft', 'wfh_pending_submission'\)/);
assert.match(workflowMigration, /'wfh_pending_dept_head_approval'/);
assert.match(workflowMigration, /then 'submit'/);
assert.match(capabilityPolicyMigration, /incident_case_handler_roles_no_direct_access/);
assert.match(capabilityPolicyMigration, /using \(false\)/);

assert.match(authContext, /refreshUser: \(\) => Promise<User \| null>/);
assert.match(authContext, /const refreshUser = useCallback/);
assert.match(permissionsContext, /table: 'rbac_cache_versions'/);
assert.match(permissionsContext, /window\.setInterval\(\(\) => void refreshAccess\(\), 30_000\)/);
assert.match(permissionHook, /canRequest: can\(resource, Permission\.Create\) && workflowCan/);
assert.match(permissionHook, /can\('OT', Permission\.Create\) && workflowCan\('Overtime'/);

assert.match(incidentService, /get_assignable_incident_case_handlers/);
assert.match(incidentService, /assignIncidentCaseHandler\(mappedRow\.id, requestedHandlerId, false\)/);
assert.doesNotMatch(incidentService, /Case Assigned to You/);
assert.match(incidentModal, /No eligible active HR case handlers found/);
assert.doesNotMatch(incidentModal, /handlerRoles/);

assert.match(overtimePage, /\{canCreate && <Button onClick=\{handleNewRequest\}>\+ New OT Request<\/Button>\}/);
assert.doesNotMatch(overtimePage, /user\?\.role === Role\./);
assert.match(wfhPage, /const canView = access\.canView/);
assert.match(wfhPage, /const canCreate = access\.canRequest/);
assert.doesNotMatch(wfhPage, /includes\(user\?\.role as Role\)/);
assert.match(integrationSql, /Transactional integration regression/);
assert.match(integrationSql, /hr_staff_inherits_self_service_without_foreign_access/);
assert.match(integrationSql, /finance_staff_inherits_employee_bundle/);
assert.match(integrationSql, /permission_removal_is_immediate/);
assert.match(integrationSql, /rollback;/);

const forbiddenAccountSpecificText = [
  'Jedediah',
  'Joanna',
  'Ferlyne',
  'Gem Meryl',
];
for (const accountName of forbiddenAccountSpecificText) {
  assert.equal(migration.includes(accountName), false, `migration must not hard-code ${accountName}`);
}

console.log('RBAC self-service and case-handler regression smoke test passed.');
