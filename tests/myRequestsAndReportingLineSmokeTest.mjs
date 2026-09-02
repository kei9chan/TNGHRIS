import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260902100000_my_requests_and_reporting_line_routing.sql');
const widget = read('components/dashboard/MyRequestsWidget.tsx');
const service = read('services/myRequestsService.ts');
const approvalWidget = read('components/dashboard/ApprovalWidget.tsx');
const dashboards = [
  read('components/dashboard/EmployeeDashboard.tsx'),
  read('components/dashboard/ManagerDashboard.tsx'),
  read('components/dashboard/HRDashboard.tsx'),
  read('components/dashboard/BODDashboard.tsx'),
];

for (const label of ['Pending', 'Approved', 'Rejected', 'Returned']) {
  assert.match(widget, new RegExp(label), `missing request status ${label}`);
}
for (const field of ['requestType', 'submittedAt', 'status', 'View details']) {
  assert.match(widget, new RegExp(field), `missing My Requests field ${field}`);
}
assert.match(service, /rpc\('get_my_request_summaries'\)/);
assert.match(migration, /create or replace function public\.get_my_request_summaries\(\)/);
assert.match(migration, /where auth\.uid\(\) is not null/);
assert.match(migration, /join actor on actor\.id = request_feed\.owner_id/);
assert.match(migration, /grant execute on function public\.get_my_request_summaries\(\) to authenticated/);
for (const requestType of ['WFH', 'Leave', 'Overtime', 'COE', 'Benefit', 'Asset', 'Manpower']) {
  assert.match(migration, new RegExp(`'${requestType}'`), `missing ${requestType} in My Requests feed`);
}

assert.match(migration, /create trigger reconcile_time_requests_after_reporting_line_change/);
assert.match(migration, /after update of reports_to on public\.hris_users/);
assert.match(migration, /Direct reporting manager changed/);
assert.match(migration, /is_read = true/);
assert.match(migration, /'APPROVAL_REQUIRED'/);
assert.match(migration, /time-request-current-assignment:/);
assert.match(migration, /create or replace function private\.is_active_time_request_approver/);
assert.match(migration, /v_current_manager_id := private\.resolve_direct_manager_id/);
assert.doesNotMatch(migration, /delete\s+from\s+public\.(leave_requests|wfh_requests|ot_requests)/i);
assert.doesNotMatch(
  migration,
  /update\s+public\.(?:leave_requests|wfh_requests|ot_requests)[\s\S]{0,500}set\s+status\s*=/i,
  'reporting-line reconciliation must preserve request status',
);

for (const dashboard of dashboards) {
  assert.match(dashboard, /MyRequestsWidget/, 'every dashboard must include My Requests');
}
assert.doesNotMatch(approvalWidget, /\.eq\('reports_to'/, 'approval queue must not derive authorization from a stale direct-report query');
assert.match(approvalWidget, /useApprovals\(\{user,isHR:roles\.has\(Role\.HRStaff\)\}\)/);

console.log('My Requests and reporting-line routing smoke test passed.');
