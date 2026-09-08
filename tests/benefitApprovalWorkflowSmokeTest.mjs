import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260908231500_benefit_approval_center_automatic_routing.sql');
const service = read('services/benefitApprovalService.ts');
const hook = read('hooks/useAdditionalApprovals.ts');
const center = read('pages/ApprovalCenter.tsx');
const benefits = read('pages/employees/Benefits.tsx');
const approvalsTable = read('components/employees/BenefitApprovalsTable.tsx');
const header = read('components/layout/Header.tsx');
const employeeList = read('pages/employees/EmployeeList.tsx');
const widget = read('components/dashboard/ApprovalWidget.tsx');
const quickLinks = read('components/dashboard/QuickLinks.tsx');
const history = read('components/approvals/RecentDecisions.tsx');
assert.match(widget, /slug:'benefit',count:additional.pendingBenefitApprovals.length/);
assert.match(widget, /\],\[.*additional.pendingBenefitApprovals/);
assert.match(quickLinks, /name: 'Approval Center', path: '\/approvals'.*allowed: Boolean\(user\)/);
assert.match(center, /<RecentDecisions userId=\{user.id\}/);
assert.match(history, /\.eq\('user_id', userId\)\.in\('action', \['APPROVE', 'REJECT'\]\)/);
assert.match(history, /order\('created_at', \{ ascending: false \}\).*order\('id', \{ ascending: false \}\)\.limit\(20\)/);

// Submission and queue visibility are owned by the database.
assert.match(migration, /benefit_request_notify_hr_manager/);
assert.match(migration, /get_my_pending_benefit_approvals/);
assert.match(migration, /status::text = 'Pending HR Review'[\s\S]*has_active_role\('HR Manager'\)/);
assert.match(migration, /status::text = 'Pending Board Approval'[\s\S]*has_active_role\('Board of Director'\)[\s\S]*has_active_role\('GeneralManager'\)/);
assert.match(migration, /for update/);
assert.match(migration, /on conflict \(user_id, dedupe_key\) do nothing/);

// The only approval transition is HR Manager -> shared BOD / GM -> Approved.
assert.match(migration, /Only an HR Manager can complete HR review/);
assert.match(migration, /set status = 'Pending Board Approval'/);
assert.match(migration, /Only a BOD or General Manager can complete final approval/);
assert.match(migration, /set status = 'Approved'/);
assert.match(migration, /This benefit request is no longer awaiting your action/);
assert.match(migration, /revoke all on function public\.review_benefit_request/);

// Approval Center consumes the role-scoped queue and deep-links to the request.
assert.match(service, /rpc\('get_my_pending_benefit_approvals'\)/);
assert.match(service, /rpc\('review_benefit_request'/);
assert.match(hook, /fetchMyPendingBenefitApprovals/);
assert.match(hook, /table: 'benefit_requests'/);
assert.match(center, /kind: 'benefit'/);
assert.match(center, /Benefit Requests/);
assert.match(center, /getApprovalReviewUrl\('benefit', row\.id\)/);

// There is no named-approver selection or employee-facing endorsement dialog.
assert.doesNotMatch(benefits, /Endorse to Board of Directors|EmployeeMultiSelect|selectedApprovers|handleConfirmEndorse/);
assert.match(benefits, /reviewBenefitRequest\(request\.id, true\)/);
assert.match(approvalsTable, /Approve and route automatically/);

// Snapshot remains in Employee Management, not in global desktop/mobile navigation.
assert.doesNotMatch(header, />Employee Snapshot<|Employee Snapshot · BOD only/);
assert.match(employeeList, /Open Employee Snapshot · BOD only/);

console.log('Benefit Approval Center and automatic routing smoke test passed.');
