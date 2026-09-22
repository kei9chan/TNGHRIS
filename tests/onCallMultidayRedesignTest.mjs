import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  coverageTotals,
  deriveCoverageDay,
  enumerateCoverageDates,
  formatCoverageDate,
  getOnCallWarnings,
} from '../modules/payroll/onCallRequestModel.ts';

const requestUi = await readFile(new URL('../components/payroll/ManpowerRequestModal.tsx', import.meta.url), 'utf8');
const reviewUi = await readFile(new URL('../components/payroll/ManpowerReviewModal.tsx', import.meta.url), 'utf8');
const service = await readFile(new URL('../services/manpowerService.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20260922004715_on_call_multiday_clarification_workflow.sql', import.meta.url), 'utf8');

const item = (department, requiredFte, reportingFte, ratePerDay) => ({
  id: department, role: department, departmentId: department, departmentName: department,
  requiredFte, reportingFte, onCallNeeded: Math.max(requiredFte - reportingFte, 0),
  currentFte: reportingFte, requestedCount: Math.max(requiredFte - reportingFte, 0),
  costPerHead: ratePerDay, ratePerDay,
  totalItemCost: Math.max(requiredFte - reportingFte, 0) * ratePerDay,
  shiftPreset: 'Mid', shiftTime: '10:00 AM – 7:00 PM',
  reason: 'Support scheduled equipment repair', justification: 'Support scheduled equipment repair',
});
const day = (date, items, forecastedPax = 25) => deriveCoverageDay({ date, coverageRequired: true, forecastedPax, items, totalStaff: 0, totalCost: 0 });

const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };

check('1. Single-date request retains prominent weekday/full date and approval path', () => {
  assert.deepEqual(enumerateCoverageDates('2026-09-22', '2026-09-22'), ['2026-09-22']);
  assert.equal(formatCoverageDate('2026-09-22'), 'Tuesday, September 22, 2026');
  assert.match(reviewUi, /text-5xl/);
  assert.match(migration, /create_manpower_request_v2/);
  assert.match(reviewUi, />Approve</);
});

check('2. September 22–25 renders four explicit weekday/date cards', () => {
  const dates = enumerateCoverageDates('2026-09-22', '2026-09-25');
  assert.deepEqual(dates.map(value => formatCoverageDate(value)), [
    'Tuesday, September 22, 2026', 'Wednesday, September 23, 2026',
    'Thursday, September 24, 2026', 'Friday, September 25, 2026',
  ]);
  assert.match(requestUi, /Every included coverage date/);
  assert.match(requestUi, /No coverage needed/);
});

check('3. Reason is dedicated and vague reasons raise Needs clarification', () => {
  const warnings = getOnCallWarnings([day('2026-09-22', [{ ...item('ops', 3, 1, 800), reason: 'Maintenance', justification: 'Maintenance' }], 0)], 'Maintenance');
  assert.ok(warnings.some(warning => warning.id.startsWith('reason-')));
  assert.match(reviewUi, /Why is on-call needed\?/);
  assert.match(reviewUi, /Needs clarification — the reason should explain the operational need/);
});

check('4. Daily totals and overall total recalculate when one date changes', () => {
  const original = [day('2026-09-22', [item('ops', 3, 1, 800)]), day('2026-09-23', [item('ops', 3, 1, 800)])];
  assert.deepEqual(coverageTotals(original), { coverageDays: 2, staffDays: 4, cost: 3200 });
  const edited = [original[0], day('2026-09-23', [item('ops', 4, 1, 900)])];
  assert.deepEqual(coverageTotals(edited), { coverageDays: 2, staffDays: 5, cost: 4300 });
  assert.match(reviewUi, /Required FTE − Reporting FTE/);
});

check('5. Multiple departments are summed independently', () => {
  const result = coverageTotals([day('2026-09-22', [item('ops', 3, 1, 800), item('maintenance', 2, 1, 900)])]);
  assert.deepEqual(result, { coverageDays: 1, staffDays: 3, cost: 2500 });
});

check('6. Overlapping pending or approved coverage is blocked', () => {
  assert.match(migration, /status in\('Pending','Approved'\)/);
  assert.match(migration, /already overlaps this department and date/);
});

check('7. Approval keeps mobile actions accessible and creates linked daily records', () => {
  assert.match(reviewUi, /viewportFit footer=\{footer\}/);
  assert.match(reviewUi, />Reject</);
  assert.match(reviewUi, />Request clarification</);
  assert.match(migration, /create table if not exists public\.on_call_daily_records/);
  assert.match(migration, /activate_manpower_daily_records/);
});

check('8. Clarification keeps one request ID and preserves snapshots and responses', () => {
  assert.match(service, /request_manpower_clarification/);
  assert.match(service, /respond_manpower_request_clarification/);
  assert.match(migration, /private\.manpower_request_revisions/);
  assert.match(migration, /Requester responded/);
  assert.match(migration, /where id=request\.id/);
});

console.log(`Passed ${checks.length} focused on-call acceptance tests.`);
