import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260902110000_job_requisition_dashboard_queue.sql');
const invokerMigration = read('supabase/migrations/20260902111000_job_requisition_dashboard_queue_invoker.sql');
const hook = read('hooks/useAdditionalApprovals.ts');
const widget = read('components/dashboard/ApprovalWidget.tsx');

assert.match(migration, /get_my_pending_job_requisition_approvals/);
assert.match(migration, /where auth\.uid\(\) is not null/);
assert.match(migration, /public\.current_hris_user_id\(\)/);
assert.match(migration, /coalesce\(step\.value ->> 'userId', step\.value ->> 'user_id'\)/);
assert.match(migration, /lower\(trim\(coalesce\(step\.value ->> 'status', ''\)\)\) = 'pending'/);
assert.match(migration, /requisition\.status = 'PendingApproval'::public\.job_requisition_status/);
assert.match(migration, /revoke all on function public\.get_my_pending_job_requisition_approvals\(\) from public, anon/);
assert.match(migration, /grant execute on function public\.get_my_pending_job_requisition_approvals\(\) to authenticated/);
assert.match(migration, /on conflict \(user_id, dedupe_key\) do nothing/);
assert.match(migration, /notify pgrst, 'reload schema'/);
assert.match(invokerMigration, /security invoker/);
assert.match(invokerMigration, /from public, anon/);

assert.match(hook, /rpc\('get_my_pending_job_requisition_approvals'\)/);
assert.doesNotMatch(hook, /from\('job_requisitions'\)/);
assert.match(hook, /currentStep: row\.current_step/);
assert.match(widget, /Some approval queues could not be refreshed/);

console.log('Job requisition dashboard queue smoke test passed.');
