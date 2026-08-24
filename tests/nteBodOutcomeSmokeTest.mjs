import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const detail = read('pages/feedback/NTEDetail.tsx');
const modal = read('components/feedback/NTEModal.tsx');
const cases = read('pages/feedback/DisciplinaryCases.tsx');
const service = read('services/nteService.ts');
const migration = read('supabase/migrations/20260824200000_nte_bod_revision_or_closure.sql');

assert.match(detail, /Return for Revision/);
assert.match(detail, /Close NTE/);
assert.match(detail, /isCurrentUserBod/);
assert.match(detail, /processNTEBodOutcome/);
assert.match(modal, /Resubmit for BOD Approval/);
assert.match(modal, /revisionNote/);
assert.match(cases, /pipelineStage: 'nte-for-approval'/);
assert.match(cases, /resubmitNTERevision/);
assert.match(service, /process_nte_bod_outcome/);
assert.match(service, /resubmit_nte_revision/);
assert.match(migration, /public\.has_active_role\('Board of Director'\)/);
assert.match(migration, /pipeline_stage = 'ir-review'/);
assert.match(migration, /status = 'Closed'::public\.nte_status/);
assert.match(migration, /workflow_history/);
assert.match(migration, /guard_nte_bod_outcome_transition/);

console.log('NTE BOD revision/closure smoke test passed.');
