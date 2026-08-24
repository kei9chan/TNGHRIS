import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260824143000_configurable_coe_approval_routing.sql');
const types = read('types.ts');
const configService = read('services/approverConfigService.ts');
const settingsContext = read('context/SettingsContext.tsx');
const settingsPage = read('pages/admin/Settings.tsx');
const coePage = read('pages/admin/COERequests.tsx');
const coeService = read('services/coeService.ts');
const permissionsHook = read('hooks/usePermissions.ts');
const bodDashboard = read('components/dashboard/BODDashboard.tsx');
const employeeDashboard = read('components/dashboard/EmployeeDashboard.tsx');

for (const authority of ['HR_MANAGER', 'HR_STAFF', 'HR_MANAGER_OR_HR_STAFF']) {
  assert.match(migration, new RegExp(authority), `missing authority ${authority}`);
}
assert.match(migration, /coe_approval_authority[\s\S]*HR_MANAGER/);
assert.match(migration, /create or replace function public\.get_coe_approval_authority/);
assert.match(migration, /create or replace function public\.save_coe_approval_authority/);
assert.match(migration, /Only an Admin can change COE approval routing/);
assert.match(migration, /create or replace function private\.is_coe_approval_authorized/);
assert.match(migration, /private\.coe_user_can_access_employee/);
assert.match(migration, /public\.can_approve_coe_request\(employee_id, 'approve'\)/);
assert.match(migration, /public\.can_approve_coe_request\(employee_id, 'reject'\)/);
assert.match(migration, /create or replace function public\.reject_coe_request/);
assert.match(migration, /coe_notify_approvers_after_insert/);
assert.match(migration, /resolve_coe_notifications_after_update/);
assert.match(migration, /coe-decision:/);
assert.match(migration, /coe-approval:%s:%s/);
assert.match(migration, /set actions = array\['submit', 'review'\][\s\S]*where role_id = 'Board of Director'[\s\S]*workflow_key = 'COE'/);
assert.match(migration, /'HR Staff',\s*'COE',\s*array\[[\s\S]*'approve'[\s\S]*'reject'/);
assert.match(migration, /drop policy if exists coe_req_hr_admin_all/);
assert.match(migration, /coe_req_hr_read/);
assert.doesNotMatch(migration, /drop\s+table/i, 'COE routing must preserve existing tables');
assert.doesNotMatch(migration, /delete\s+from\s+public\.coe_requests/i, 'COE routing must preserve existing requests');

assert.match(types, /enum COEApprovalAuthority/);
assert.match(types, /HRManagerOrHRStaff = 'HR_MANAGER_OR_HR_STAFF'/);
assert.match(configService, /DEFAULT_COE_APPROVAL/);
assert.match(configService, /save_coe_approval_authority/);
assert.match(configService, /getCOEApprovalRoles/);
assert.match(settingsContext, /updateCOEApprovalAuthority/);
assert.match(settingsPage, /COE Approval Routing/);
assert.match(settingsPage, /coe-approval-authority/);
assert.match(settingsPage, /Save COE Routing/);
assert.match(settingsPage, /isSuperAdmin\(\)/);
assert.match(coePage, /fetchCOEApprovalAuthority/);
assert.match(coePage, /isConfiguredApproverRole/);
assert.match(coePage, /Approval Authority/);
assert.doesNotMatch(coePage, /can\('COE', Permission\.Manage\)/);
assert.match(coeService, /rpc\('reject_coe_request'/);
assert.doesNotMatch(coeService, /\.in\('role', \[Role\.HRManager, Role\.HRStaff\]\)/);
assert.match(permissionsHook, /configuredApproverRoles/);
assert.doesNotMatch(bodDashboard, /<COEQueue/);
assert.doesNotMatch(employeeDashboard, /COE Request Pending Approval/);

console.log('Configurable COE approval routing smoke test passed.');
