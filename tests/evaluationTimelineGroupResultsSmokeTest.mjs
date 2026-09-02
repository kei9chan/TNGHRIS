import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260902123000_evaluation_timeline_assignments.sql');
const newEvaluation = read('pages/evaluation/NewEvaluation.tsx');
const timelineService = read('services/evaluationTimelineService.ts');
const resultPage = read('pages/evaluation/EvaluationResult.tsx');
const resultSummary = read('components/evaluation/EvaluationResultSummary.tsx');
const permissions = read('hooks/usePermissions.ts');
const dashboards = [
  'components/dashboard/EmployeeDashboard.tsx',
  'components/dashboard/ManagerDashboard.tsx',
  'components/dashboard/HRDashboard.tsx',
  'components/dashboard/BODDashboard.tsx',
].map(read);

assert.match(migration, /ensure_evaluation_calendar_periods/);
assert.match(migration, /make_date\(p_year, month_number, 1\)/);
assert.match(migration, /format\('Q%s %s'/);
assert.match(migration, /create table if not exists public\.evaluation_assignments/);
assert.match(migration, /unique \(evaluation_id, employee_id\)/);
assert.match(migration, /evaluations_creator_request_key_uidx/);
assert.match(migration, /EVALUATION_PENDING/);
assert.match(migration, /EVALUATION_ASSIGNED/);
assert.match(migration, /private\.can_current_user_access_evaluation/);
assert.doesNotMatch(migration, /using \(true\)/i);

assert.match(newEvaluation, /Monthly Evaluation/);
assert.match(newEvaluation, /Quarterly Evaluation/);
assert.match(newEvaluation, /Annual Evaluation/);
assert.match(newEvaluation, /Onboarding Evaluation/);
assert.match(newEvaluation, /loadEvaluationTimelines\(selectedYear\)/);
assert.match(newEvaluation, /requestKey: requestKeyRef\.current/);
assert.match(timelineService, /Array\.from\(\{ length: 6 \}/);
assert.doesNotMatch(timelineService, /2026/);

assert.doesNotMatch(permissions, /subjectId === user\.id && evaluation\.targetEmployeeIds\.includes/);
dashboards.forEach(source => assert.match(source, /My Evaluation Pending/));

assert.match(resultPage, /EvaluationResultSummary/);
assert.match(resultPage, /categoryWeightedScore/);
assert.match(resultPage, /downloadEvaluationResultPdf/);
assert.match(resultSummary, /Overall score/);
assert.match(resultSummary, /Category scores/);
assert.match(resultSummary, /Weighted scoring/);
assert.match(resultSummary, /View Detailed Summary/);
assert.match(resultSummary, /View Full Evaluation/);
assert.match(resultSummary, /Download PDF/);
assert.doesNotMatch(resultSummary, />3\.5\s*\/\s*5\.0</);

console.log('Evaluation timeline, group assignment, dashboard, and result summary smoke test passed.');
