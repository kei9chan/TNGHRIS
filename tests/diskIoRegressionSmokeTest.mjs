import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const permissions = read('hooks/usePermissions.ts');
const timekeeping = read('pages/payroll/Timekeeping.tsx');
const incidentService = read('services/incidentReportService.ts');
const cases = read('pages/feedback/DisciplinaryCases.tsx');
const incidentListRead = incidentService.slice(
  incidentService.indexOf('export const fetchIncidentReports'),
  incidentService.indexOf('export const followUpIncidentReport'),
);
const pipelineListRead = incidentService.slice(
  incidentService.indexOf('export const fetchPipelineStages'),
);

assert.match(permissions, /const getAccessibleBusinessUnits = useCallback\(/,
  'business-unit permission helper must keep a stable identity');
assert.match(permissions, /const getIrAccess = useCallback\(/,
  'incident-report permission helper must keep a stable identity');
assert.match(cases, /\[filterByIrAccess\]/,
  'incident reports must remain scoped through the existing RBAC filter');

assert.match(timekeeping, /const weekStart = useMemo\(\(\) => getStartOfWeek\(viewDate\), \[viewDate\]\)/,
  'timekeeping week dependency must not change on every render');
assert.match(timekeeping, /\.lte\('start_date', toDateOnly\(rangeEnd\)\)/,
  'leave reads must be bounded to the visible schedule window');
assert.match(timekeeping, /\.gte\('end_date', toDateOnly\(rangeStart\)\)/,
  'leave reads must include only records overlapping the visible schedule window');

assert.doesNotMatch(incidentListRead, /\.select\('\*'\)/,
  'incident-report list reads must not use select *');
assert.doesNotMatch(pipelineListRead, /\.select\('\*'\)/,
  'pipeline-stage list reads must not use select *');

for (const path of [
  'components/layout/NotificationBell.tsx',
  'components/dashboard/MyRequestsWidget.tsx',
  'components/dashboard/EmployeeDashboard.tsx',
  'components/dashboard/ManagerDashboard.tsx',
  'components/dashboard/HRDashboard.tsx',
  'components/dashboard/BODDashboard.tsx',
  'hooks/useAdditionalApprovals.ts',
]) {
  assert.match(read(path), /document\.visibilityState === 'visible'/,
    `${path} must pause background polling while the page is hidden`);
}

console.log('Disk IO regression smoke test passed.');
