import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = path => readFileSync(join(root, path), 'utf8');
const migration = read('supabase/migrations/20260823210000_complete_rbac_repair.sql');
const types = read('types.ts');
const auth = read('context/AuthContext.tsx');
const permissions = read('context/PermissionsContext.tsx');
const approvals = read('hooks/useApprovals.ts');
const app = read('App.tsx');

const approvedRoles = [
  'Admin','Auditor','Board of Director','Business Unit Manager','Employee','Finance Staff',
  'GeneralManager','HR Manager','HR Staff','IT','Manager','Operations Director',
];
for (const role of approvedRoles) assert.match(types, new RegExp(`['=]\\s*['\"]${role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]`), `missing role ${role}`);
assert.doesNotMatch(types, /Recruiter\s*=/, 'Recruiter must not remain an active frontend role');

const sourceExtensions = new Set(['.ts','.tsx','.js','.jsx']);
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  if (['node_modules','dist','.git','supabase'].includes(entry.name)) return [];
  const path = join(dir, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});
for (const file of walk(root)) {
  if (![...sourceExtensions].some(ext => file.endsWith(ext))) continue;
  assert.doesNotMatch(readFileSync(file,'utf8'), /Role\.Recruiter|['\"]Recruiter['\"]/, `active Recruiter reference in ${relative(root,file)}`);
}

assert.match(auth, /get_my_hris_bootstrap/);
assert.match(auth, /get_my_effective_rbac/);
assert.doesNotMatch(auth, /\?\?\s*Role\.Employee/, 'unknown roles must not fall back to Employee');
assert.match(permissions, /authorized:\s*false/);
assert.match(permissions, /setAuthorizationError/);
assert.match(app, /Authorization unavailable/);
assert.match(app, /routePermissions/);
assert.match(approvals, /approvalError/);
assert.match(approvals, /isGlobalHrAuthority/);

assert.match(migration, /private\.rbac_migration_snapshots/);
assert.match(migration, /pre-rbac-20260823-fde428f/);
assert.match(migration, /create table if not exists public\.user_roles/);
assert.match(migration, /user_multi_role_allowlist/);
assert.match(migration, /Self-promotion and self-role changes are not permitted/);
assert.match(migration, /assert_bod_hr_manager_parity/);
assert.match(migration, /enforce_bod_hr_manager_feature_parity/);
assert.match(migration, /guard_workflow_status_transition/);
assert.match(migration, /get_accessible_hris_users/);
assert.match(migration, /has_sensitive_permission/);
assert.match(migration, /has_workflow_permission/);
assert.match(migration, /'kay@thenextperience\.com','Board of Director'/);
assert.match(migration, /'it@thenextperience\.com','IT'/);
assert.match(migration, /'hrs@thenextperience\.com','HR Manager'/);
assert.match(migration, /when u\.role = 'Recruiter' then 'HR Staff'/);
assert.match(migration, /when u\.role = 'test role' then 'Employee'/);
assert.match(migration, /pending approval baseline changed/);
assert.doesNotMatch(migration, /\btruncate\b/i, 'RBAC repair must not truncate production data');
assert.doesNotMatch(migration, /drop\s+table/i, 'RBAC repair must not drop production tables');
assert.doesNotMatch(migration, /delete\s+from\s+public\.(leave_requests|wfh_requests|ot_requests|manpower_requests|hris_users)/i, 'RBAC repair must not delete business data');

console.log('RBAC repair static smoke test passed.');
