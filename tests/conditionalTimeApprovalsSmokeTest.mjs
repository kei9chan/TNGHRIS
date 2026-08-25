import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260824120000_conditional_time_approval_routing.sql');
const bulkRepair = read('supabase/migrations/20260824130000_repair_conditional_bulk_approvals.sql');
const approvals = read('hooks/useApprovals.ts');
const settings = read('pages/admin/Settings.tsx');
const service = read('services/approverConfigService.ts');
const leave = read('pages/payroll/Leave.tsx');
const wfh = read('pages/payroll/WFHRequests.tsx');
const overtime = read('pages/payroll/OvertimeRequests.tsx');

assert.match(migration, /conditional_time_approvals/);
assert.match(migration, /time_request_approval_assignments/);
assert.match(migration, /At least one required active BOD approver is required/);
assert.match(migration, /leave_days_per_remaining_month/);
assert.match(migration, /wfh_days_per_month/);
assert.match(migration, /weekly_total_hours/);
assert.match(migration, /guard_conditional_time_approval_transition/);
assert.match(migration, /Only a currently assigned escalation approver may decide this request/);
assert.match(migration, /get_time_approval_email_payload/);
assert.match(migration, /regine@thenextperience\.com/);
assert.match(migration, /Kay and HR Manager are not assigned this backlog/);
assert.match(bulkRepair, /v_request_type text/);
assert.match(bulkRepair, /a\.request_type = v_request_type/);
assert.match(bulkRepair, /public\.process_time_request_approval/);
assert.match(bulkRepair, /private\.is_direct_reporting_manager/);
assert.match(bulkRepair, /Pending final approval by its assigned BOD approver/);
assert.match(approvals, /time_request_approval_assignments/);
assert.doesNotMatch(approvals, /\.eq\('role', Role\.BOD\)/);
assert.match(settings, /Conditional Approval Routing/);
assert.match(settings, /active BOD and mark that BOD as required/);
assert.match(settings, /Reason \/ change note/);
assert.match(service, /Open Request/);
assert.match(service, /getApprovalStepLabel/);
assert.match(service, /getApprovalStatusLabel/);
assert.match(service, /BOD approval/);
for (const source of [leave, wfh, overtime]) {
  assert.match(source, /processTimeRequestApproval/);
  assert.match(source, /sendConditionalApprovalEmails/);
}
assert.doesNotMatch(wfh, /\.eq\('role', Role\.BOD\)/);
assert.doesNotMatch(overtime, /\.eq\('role', Role\.BOD\)/);

console.log('Conditional Leave/WFH/OT approval smoke checks passed.');
