import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [presentation, approvalCenter, widget, wfhPage, wfhModal, leaveModal, otModal, emailService] = await Promise.all([
  read('utils/approvalPresentation.ts'),
  read('pages/ApprovalCenter.tsx'),
  read('components/dashboard/ApprovalWidget.tsx'),
  read('pages/payroll/WFHRequests.tsx'),
  read('components/payroll/WFHReviewModal.tsx'),
  read('components/payroll/LeaveRequestModal.tsx'),
  read('components/payroll/OTRequestModal.tsx'),
  read('services/approverConfigService.ts'),
]);

assert.match(presentation, /WFH_PENDING_DEPT_HEAD_APPROVAL/);
assert.match(presentation, /LEAVE_PENDING_DEPT_HEAD_APPROVAL/);
assert.match(presentation, /OT_PENDING_DEPT_HEAD_APPROVAL/);
assert.match(presentation, /OVERTIME_PENDING_DEPT_HEAD_APPROVAL/);
assert.match(presentation, /Pending Direct Manager approval/);
assert.match(presentation, /WFH_PENDING_BOD_APPROVAL/);
assert.match(presentation, /BOD approval/);
assert.match(presentation, /maximumFractionDigits: 2/);
assert.match(presentation, /Week covered|weekStart/);
assert.match(presentation, /weekday: 'short'/);
assert.match(presentation, /exceeded by/);

assert.doesNotMatch(approvalCenter, /Select all eligible/);
assert.match(approvalCenter, /Select all standard requests/);
assert.match(approvalCenter, /Exception \/ Reason/);
assert.match(approvalCenter, /getApprovalStatusLabel\(item\.status\)/);
assert.match(approvalCenter, /getTimeApprovalReason\('wfh'/);
assert.match(approvalCenter, /getTimeApprovalReason\('leave'/);
assert.match(approvalCenter, /getTimeApprovalReason\('overtime'/);
assert.match(approvalCenter, /Weekly total —/);

assert.match(widget, /approvalRoute==='BOD_REQUIRED'/);
assert.match(wfhPage, /Pending Direct Manager approval/);
for (const modal of [wfhModal, leaveModal, otModal]) {
  assert.match(modal, /Current step/);
  assert.match(modal, /Status/);
  assert.match(modal, /Details/);
}
assert.match(otModal, /Week covered/);
assert.match(otModal, /Weekly total —/);
assert.match(emailService, /getOvertimeWeekDetails/);
assert.match(emailService, /Exception \/ reason/);

console.log('Approval presentation smoke test passed.');
