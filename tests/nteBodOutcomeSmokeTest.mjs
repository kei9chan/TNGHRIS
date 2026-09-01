import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const detail = read('pages/feedback/NTEDetail.tsx');
const modal = read('components/feedback/NTEModal.tsx');
const cases = read('pages/feedback/DisciplinaryCases.tsx');
const service = read('services/nteService.ts');
const migration = read('supabase/migrations/20260901140000_nte_multi_approver_employee_specific_workflow.sql');

assert.match(detail, /Return for Revision/);
assert.match(detail, /Reject NTE/);
assert.doesNotMatch(detail, /isCurrentUserBod/);
assert.match(detail, /processNTEApproval/);
assert.match(modal, /Resubmit for Approval/);
assert.match(modal, /revisionNote/);
assert.match(cases, /resubmitNTERevision/);
assert.match(service, /act_on_nte_approval/);
assert.match(service, /resubmit_nte_revision/);
assert.match(migration, /approver_user_id = actor_id/);
assert.match(migration, /bool_or\(status = 'Approved'\) filter \(where is_required and is_bod_role\)/);
assert.match(migration, /status = 'Returned for Revision'/);
assert.match(migration, /status = 'Cancelled'/);
assert.match(migration, /workflow_history/);
assert.doesNotMatch(migration, /update public\.incident_reports[\s\S]{0,300}status = 'Closed'/);

console.log('NTE required-approver outcomes smoke test passed.');
