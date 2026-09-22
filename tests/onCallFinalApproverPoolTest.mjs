import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL(
  '../supabase/migrations/20260922063850_restore_on_call_bod_gm_approval_pool.sql',
  import.meta.url,
), 'utf8');

assert.match(migration, /configurationFallback/);
assert.match(migration, /workflow_user_has_role\(u\.id, 'Board of Director'\)/);
assert.match(migration, /workflow_user_has_role\(u\.id, 'GeneralManager'\)/);
assert.match(migration, /u\.id <> v_request\.requester_id/);
assert.match(migration, /on conflict\(request_id, approval_stage, approver_user_id\) do nothing/);
assert.match(migration, /perform private\.ensure_manpower_final_approval_pool\(v_request_id\)/);
assert.match(migration, /EXPAND_FINAL_APPROVER_POOL/);

console.log('On-call final BOD/GM approval pool checks passed.');
