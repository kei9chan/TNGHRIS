import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260824070000_fix_offboarding_leave_awards.sql');
const lifecyclePage = read('pages/employees/OnboardingChecklist.tsx');
const leavePage = read('pages/payroll/Leave.tsx');
const assignModal = read('components/evaluation/AssignAwardModal.tsx');
const awardsPage = read('pages/evaluation/Awards.tsx');
const awardService = read('services/awardService.ts');
const approvalCenter = read('pages/ApprovalCenter.tsx');
const approvalDeepLinks = read('services/approvalDeepLinks.ts');
const additionalApprovals = read('hooks/useAdditionalApprovals.ts');
const notifications = read('services/notificationService.ts');

assert.match(migration, /remove_onboarding_checklist_template/);
assert.match(migration, /usage_count > 0[\s\S]*is_active = false/);
assert.match(migration, /insert into public\.leave_types\(name, paid/);
assert.match(migration, /'Without Pay', false/);
assert.match(migration, /submit_employee_award/);
assert.match(migration, /certificate_snapshot_url[\s\S]*null[\s\S]*'PendingApproval'/);
assert.match(migration, /process_employee_award_approval/);
assert.match(migration, /remaining_count = 0[\s\S]*status = 'Approved'/);
assert.match(migration, /mark_employee_award_issued/);
assert.match(migration, /status = 'Issued'/);
assert.match(migration, /employee_awards_certificate_gate/);
for (const businessUnit of ['Dessert Museum', 'Gootopia', 'Bakebe', 'Inflatable Island', 'Fun Roof']) {
  assert.match(migration, new RegExp(businessUnit));
}

assert.match(lifecyclePage, /rpc\('remove_onboarding_checklist_template'/);
assert.match(lifecyclePage, /linked employee checklist\(s\) were preserved/);
assert.match(leavePage, /without pay/);

assert.doesNotMatch(assignModal, /\/api\/send-email/);
assert.doesNotMatch(assignModal, /certificateUrl/);
assert.match(assignModal, /Submit for Approval/);
assert.match(assignModal, /All Business Units/);
assert.match(assignModal, /All Departments/);

assert.match(awardService, /rpc\('submit_employee_award'/);
assert.match(awardService, /rpc\('process_employee_award_approval'/);
assert.match(awardService, /rpc\('mark_employee_award_issued'/);
assert.match(awardsPage, /processEmployeeAwardApproval/);
assert.match(awardsPage, /nextStatus === ResolutionStatus\.Approved/);
assert.match(awardsPage, /await issueApprovedAward/);
assert.match(awardsPage, /\/api\/send-email/);
assert.match(awardsPage, /Issue Certificate & Email/);
assert.match(awardsPage, /isDuplicatingTemplate/);

assert.match(additionalApprovals, /pendingAwardApprovals/);
assert.match(approvalCenter, /kind: 'award'/);
assert.match(approvalCenter, /getApprovalReviewUrl\('award', row\.id\)/);
assert.match(approvalDeepLinks, /award: '\/evaluation\/awards'/);
assert.match(notifications, /linkedType === 'award'.*getApprovalReviewUrl\(kind, requestId\)/s);

console.log('Offboarding, unpaid leave, and awards workflow smoke tests passed.');
