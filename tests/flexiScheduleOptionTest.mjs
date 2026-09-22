import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [component, migration] = await Promise.all([
  read('components/dashboard/BodScheduleWorkflow.tsx'),
  read('supabase/migrations/20260922023000_ensure_flexi_schedule_option.sql'),
]);

assert.match(component, /Flexi · \$\{\(t\.paidMinutes\?\?480\)\/60\} paid hours/, 'Employee selector must clearly label the Flexi option');
assert.match(component, /e\.flexible\?` · Flexi/, 'Approver summary must identify flexible days');
assert.match(migration, /'Flexi'/);
assert.match(migration, /is_flexible/);
assert.match(migration, /paid_minutes[\s\S]*480/);
assert.match(migration, /schedule_compliance\.bod_manager\(employee\.id\)/, 'Flexi presets must follow the current BOD or GM reporting line');
assert.match(migration, /not exists[\s\S]*existing\.created_by = approver\.id/, 'Migration must be idempotent per approver and business unit');
assert.match(migration, /'flexible',t\.is_flexible,'paidMinutes',t\.paid_minutes/, 'Workflow must return flexibility metadata');
assert.match(migration, /revoke all on function public\.get_bod_schedule_workflow\(date\) from public, anon, authenticated/);

console.log('PASS: Flexi schedule option is seeded, labeled, approval-visible, idempotent, and authenticated-only.');
