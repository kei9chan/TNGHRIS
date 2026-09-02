import assert from 'node:assert/strict';
import fs from 'node:fs';

const authContext = fs.readFileSync('context/AuthContext.tsx', 'utf8');
const login = fs.readFileSync('pages/Login.tsx', 'utf8');
const permissionsContext = fs.readFileSync('context/PermissionsContext.tsx', 'utf8');
const supabaseClient = fs.readFileSync('services/supabaseClient.ts', 'utf8');
const rbacService = fs.readFileSync('services/rbacService.ts', 'utf8');
const readCache = fs.readFileSync('services/readCache.ts', 'utf8');
const approvals = fs.readFileSync('hooks/useApprovals.ts', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
const migration = fs.readFileSync(
  'supabase/migrations/20260902023000_restore_dashboard_rpc_access.sql',
  'utf8'
);
const performanceMigration = fs.readFileSync(
  'supabase/migrations/20260902044442_optimize_dashboard_loading.sql',
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
assert.match(supabaseClient, /retryTransientSupabaseRead/);
assert.match(supabaseClient, /failed to fetch\|fetch failed/);
assert.match(authContext, /Promise\.all\(\[/);
assert.match(authContext, /fetchEffectiveRbacSnapshot/);
assert.match(rbacService, /effective-rbac:/);
assert.match(readCache, /cached\.promise/);
assert.doesNotMatch(approvals, /reporteeIds\s*=\s*\[\]/);
assert.match(approvals, /\}, \[user\?\.id\]\);/);
assert.match(performanceMigration, /leave_requests_pending_manager_queue_idx/);
assert.match(performanceMigration, /select request_type, request_id from assigned[\s\S]*union[\s\S]*select request_type, request_id from manager_queue/);
assert.match(authContext, /window\.setTimeout\(\(\) => \{[\s\S]*hydrateSupabaseUser/);
assert.match(
  authContext,
  /err\.code === 'network_unavailable'[\s\S]{0,220}if \(!preserveExisting\) \{[\s\S]{0,180}setUser\(null\);[\s\S]{0,80}\}[\s\S]{0,40}return;/
);
assert.match(permissionsContext, /hasAuthorizedSnapshotRef/);
assert.match(permissionsContext, /Keeping the last verified RBAC snapshot/);
assert.match(permissionsContext, /authorizationTransient/);
assert.match(app, /Connection interrupted/);
assert.match(app, /Retry connection/);

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
