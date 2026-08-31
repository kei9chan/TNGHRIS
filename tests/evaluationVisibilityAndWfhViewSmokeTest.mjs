import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const access = read('utils/evaluationAccess.ts');
const app = read('App.tsx');
const nav = read('components/layout/EvaluationSubNav.tsx');
const wfhPage = read('pages/payroll/WFHRequests.tsx');
const wfhModal = read('components/payroll/WFHRequestModal.tsx');
const compliance = read('components/evaluation/ComplianceModal.tsx');
const evaluations = read('pages/evaluation/Evaluations.tsx');
const perform = read('pages/evaluation/PerformEvaluation.tsx');
const result = read('pages/evaluation/EvaluationResult.tsx');
const migration = read('supabase/migrations/20260831090000_repair_evaluation_oversight_access.sql');

for (const role of ['Role.Admin', 'Role.BOD', 'Role.HRManager', 'Role.HRStaff']) {
    assert.match(access, new RegExp(role.replace('.', '\\.')), `${role} must have evaluation oversight access`);
}
assert.match(access, /isEvaluationSubject/);

assert.match(app, /isEvaluationReadRoute/);
assert.match(app, /hasEvaluationOversightAccess\(user\)/);
assert.match(nav, /hasEvaluationOversightAccess/);

assert.match(wfhPage, /isReadOnlyRequest/);
assert.match(wfhPage, /request\.employeeId !== user\?\.id/);
assert.match(wfhPage, /readOnly=\{isReadOnlyRequest\}/);
assert.match(wfhModal, /readOnly\?: boolean/);
assert.match(wfhModal, /if \(readOnly\) return/);
assert.match(wfhModal, /View WFH Request/);

assert.match(compliance, /table-fixed/);
assert.match(compliance, /overflow-y-auto/);
assert.doesNotMatch(compliance, /<tbody[^>]*block/);
assert.doesNotMatch(compliance, /<tr[^>]*table w-full table-fixed/);

assert.match(evaluations, /hasEvaluationOversightAccess/);
assert.match(evaluations, /canInspectAsOversight/);
assert.match(evaluations, /evaluationPath/);
assert.match(evaluations, /View Evaluation/);
assert.match(perform, /canInspectReadOnly/);
assert.match(perform, /read-only access/);
assert.match(result, /canViewAllResults/);
assert.match(result, /!isEvaluatedEmployee/);
assert.match(result, /canChangeResultVisibility/);

for (const role of ['Admin', 'HR Staff']) {
    assert.match(migration, new RegExp(`'${role}'.*'Evaluation'`), `${role} Evaluation view permission is missing`);
    assert.match(migration, new RegExp(`'${role}'.*'EvaluationResults'`), `${role} EvaluationResults view permission is missing`);
}
assert.match(migration, /on conflict \(role_id, resource_id\) do update/);
assert.doesNotMatch(migration, /create or replace function public\.is_hr_or_admin/);

console.log('Evaluation visibility and WFH view smoke tests passed.');
