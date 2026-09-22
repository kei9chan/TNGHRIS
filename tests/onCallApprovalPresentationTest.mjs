import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [hook, service, widget, modal, manager, bod] = await Promise.all([
  read('hooks/useApprovals.ts'),
  read('services/manpowerService.ts'),
  read('components/dashboard/ApprovalWidget.tsx'),
  read('components/payroll/ManpowerReviewModal.tsx'),
  read('components/dashboard/ManagerDashboard.tsx'),
  read('components/dashboard/BODDashboard.tsx'),
]);

assert.match(hook, /date_mode, start_date, end_date, coverage_days, coverage_day_count, total_staff_days/);
assert.match(hook, /mapManpowerRequestRow/);
assert.match(service, /export const mapManpowerRequestRow/);
assert.match(manager, /mapManpowerRequestRow/);
assert.match(bod, /mapManpowerRequestRow/);

assert.match(widget, /requests\.length === 1/);
assert.match(widget, /getApprovalReviewUrl\(kind, requests\[0\]\.id\)/);
assert.match(widget, /Review request →/);

assert.match(modal, /size="4xl"/);
assert.doesNotMatch(modal, /size="full"/);
assert.match(modal, /hasReviewableCoverage/);
assert.match(modal, /disabled=\{busy \|\| !hasReviewableCoverage\}/);
assert.match(modal, /Request details are incomplete/);

console.log('Passed focused on-call approval presentation regression tests.');
