import assert from 'node:assert/strict';
import fs from 'node:fs';

const authContext = fs.readFileSync('context/AuthContext.tsx', 'utf8');
const login = fs.readFileSync('pages/Login.tsx', 'utf8');
const migration = fs.readFileSync(
  'supabase/migrations/20260902023000_restore_dashboard_rpc_access.sql',
  'utf8'
);

assert.match(authContext, /profileHydrationInFlight/);
assert.match(authContext, /rbac_profile_error[\s\S]*setAuthorizationUnavailableNotice/);
assert.doesNotMatch(
  authContext,
  /rbac_profile_error[\s\S]{0,180}setHrPendingNotice/,
  'Temporary RBAC failures must not be presented as pending HR approval.'
);
assert.match(login, /authorization_unavailable/);

for (const signature of [
  'current_hris_user_id()',
  'get_my_hris_bootstrap()',
  'get_my_effective_rbac()',
  'get_my_request_summaries()',
]) {
  assert.ok(migration.includes(`grant execute on function public.${signature} to authenticated;`));
}
assert.match(migration, /notify pgrst, 'reload schema'/);

console.log('Dashboard auth resilience smoke test passed.');
