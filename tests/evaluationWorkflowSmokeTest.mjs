import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260824060000_repair_evaluation_assignment_access.sql');
const submissionHardening = read('supabase/migrations/20260824062000_harden_evaluation_submission_assignment.sql');
const listPage = read('pages/evaluation/Evaluations.tsx');
const createPage = read('pages/evaluation/NewEvaluation.tsx');
const performPage = read('pages/evaluation/PerformEvaluation.tsx');
const notifications = read('services/notificationService.ts');
const notificationBell = read('components/layout/NotificationBell.tsx');
const notificationPage = read('pages/Notifications.tsx');

assert.match(migration, /create or replace function public\.create_evaluation_cycle/);
assert.match(migration, /security invoker/);
assert.match(migration, /At least one evaluator is required/);
assert.match(migration, /Evaluator weights must total exactly 100/);
assert.match(migration, /evaluation_evaluators_scoped_select/);
assert.match(migration, /evaluation_submissions_assigned_insert/);
assert.match(migration, /format\('\/evaluation\/perform\/%s'/);
assert.match(migration, /on conflict \(user_id, dedupe_key\) do nothing/);
assert.match(migration, /This does not add, remove, or reassign any evaluator/);
assert.match(migration, /evaluation_evaluators_user_evaluation_idx/);
assert.match(migration, /evaluation_submissions_eval_rater_idx/);
assert.match(submissionHardening, /assignment\.user_id = \(select public\.current_hris_user_id\(\)\)/);
assert.match(submissionHardening, /lower\(evaluation\.status\) = 'inprogress'/);
assert.match(submissionHardening, /evaluation\.due_date >= current_date/);

assert.match(createPage, /createEvaluationCycle/);
assert.doesNotMatch(createPage, /from\('evaluations'\)\.insert/);
assert.doesNotMatch(createPage, /targets\.add\(emp\.authUserId\)/);
assert.match(listPage, /\.in\('evaluation_id', evaluationIds\)/);
assert.match(listPage, /No evaluators assigned/);
assert.match(listPage, /evaluations, yearFilter, monthFilter/);
assert.match(performPage, /fetchMyEvaluationWorkspace/);
assert.doesNotMatch(performPage, /from\('hris_users'\)/);
assert.doesNotMatch(performPage, /raterProfileId \|\| user\.id/);
assert.match(performPage, /not assigned to your account/);
assert.match(performPage, /evaluation\.status !== 'InProgress'/);
assert.match(notifications, /resolveNotificationDestination/);
assert.match(notifications, /isAssignedEvaluator/);
assert.match(notifications, /status !== 'inprogress'/);

for (const handler of [notificationBell, notificationPage]) {
  assert.match(handler, /resolveNotificationDestination/);
  assert.match(handler, /navigate\(destination\)[\s\S]*markNotificationRead/);
}

console.log('Evaluation workflow smoke tests passed.');
