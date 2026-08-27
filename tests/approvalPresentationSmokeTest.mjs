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
assert.match(presentation, /Pending Direct Manager Review/);
assert.match(presentation, /Pending BOD Final Approval/);
assert.match(presentation, /WFH_PENDING_BOD_APPROVAL/);
assert.match(presentation, /BOD approval/);
assert.match(presentation, /maximumFractionDigits: 2/);
assert.match(presentation, /Week covered|weekStart/);
assert.match(presentation, /weekday: 'short'/);
assert.match(presentation, /dateRange/);
assert.match(presentation, /exceeded by/);

assert.doesNotMatch(approvalCenter, /Select all eligible/);
assert.match(approvalCenter, /Select all pending requests/);
assert.doesNotMatch(approvalCenter, /Standard requests|Select all standard requests|Approve standard/);
assert.doesNotMatch(widget, /review=eligible|Review standard requests/);
assert.doesNotMatch(widget, /Auto-routing & delegation|Bulk actions log|View full audit log/);
assert.match(widget, /activeQueues=queues\.filter\(q=>q\.count>0\)/);
assert.match(approvalCenter, /No pending approvals/);
assert.match(approvalCenter, /activeGroupKinds/);
assert.match(approvalCenter, /sticky right-0/);
const timeHeadings = approvalCenter.match(/const TIME_DESKTOP_HEADINGS = \[([^\]]+)\]/)?.[1] || '';
const overtimeHeadings = approvalCenter.match(/const OVERTIME_DESKTOP_HEADINGS = \[([^\]]+)\]/)?.[1] || '';
assert.match(timeHeadings, /Request details/);
assert.match(timeHeadings, /Approval step/);
assert.match(timeHeadings, /Eligibility/);
assert.doesNotMatch(timeHeadings, /Current step|Status|Classification/);
assert.match(overtimeHeadings, /Week of/);
assert.match(approvalCenter, /getApprovalStatusLabel\(item\.status\)/);
assert.match(approvalCenter, /getApprovalActionLabel\(item\.status\)/);
assert.match(approvalCenter, /getTimeApprovalReason\('wfh'/);
assert.match(approvalCenter, /getTimeApprovalReason\('leave'/);
assert.match(approvalCenter, /getTimeApprovalReason\('overtime'/);
assert.match(approvalCenter, /Weekly total —/);
assert.match(approvalCenter, /Weekly OT:/);
assert.match(approvalCenter, /requestStart/);

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
