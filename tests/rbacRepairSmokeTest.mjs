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
const rbacService = read('services/rbacService.ts');
const timeApprovalService = read('services/timeApprovalService.ts');
const manpowerService = read('services/manpowerService.ts');
const app = read('App.tsx');
const signUp = read('pages/SignUp.tsx');
const selfRegistrationMigration = read('supabase/migrations/20260823213000_secure_self_registration_rbac.sql');
const scopeControlsMigration = read('supabase/migrations/20260823222000_complete_rbac_admin_scope_controls.sql');
const rolesPermissionsPage = read('pages/admin/RolesPermissions.tsx');
const userManagementPage = read('pages/admin/UserManagement.tsx');

const approvedRoles = [
  'Admin','Auditor','Board of Director','Business Unit Manager','Employee','Finance Staff',
  'GeneralManager','HR Manager','HR Staff','IT','Manager','Operations Director',
];
for (const role of approvedRoles) assert.match(types, new RegExp(`['=]\\s*['\"]${role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]`), `missing role ${role}`);
assert.doesNotMatch(types, /Recruiter\s*=/, 'Recruiter must not remain an active frontend role');
assert.match(types, /Manager\s*=\s*['"]Manager['"]/, 'Manager must remain an approved frontend role');
assert.doesNotMatch(types, /Team Leader/, 'Manager must not be renamed to Team Leader');

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
assert.match(auth, /fetchEffectiveRbacSnapshot/);
assert.match(rbacService, /get_my_effective_rbac/);
assert.doesNotMatch(auth, /\?\?\s*Role\.Employee/, 'unknown roles must not fall back to Employee');
assert.match(permissions, /authorized:\s*false/);
assert.match(permissions, /setAuthorizationError/);
assert.match(app, /Authorization unavailable/);
assert.match(app, /routePermissions/);
assert.match(approvals, /approvalError/);
assert.doesNotMatch(approvals, /isGlobalHrAuthority/, 'approval queues must not be granted by a broad global-role shortcut');
assert.match(approvals, /fetchMyPendingTimeApprovalAssignments/);
assert.match(timeApprovalService, /get_my_pending_time_approval_ids/);
assert.match(approvals, /fetchMyPendingManpowerApprovalIds/);
assert.match(manpowerService, /get_my_pending_manpower_approval_ids/);

assert.doesNotMatch(signUp, /roleOptions\.map|name=["']role["']/, 'public signup must not expose authorization roles');
assert.match(signUp, /p_role:\s+Role\.Employee/);
assert.match(signUp, /p_status:\s+['"]Inactive['"]/);
assert.match(signUp, /name=["']position["']/);

assert.match(selfRegistrationMigration, /auth\.users/);
assert.match(selfRegistrationMigration, /'Employee',\s*\n\s*'Inactive'/);
assert.match(selfRegistrationMigration, /jsonb_build_object\('type', 'SELF'\)/);
assert.match(selfRegistrationMigration, /'SELF_REGISTRATION'/);
assert.match(selfRegistrationMigration, /'requestedRole', p_role/);
assert.match(selfRegistrationMigration, /revoke all on function public\.register_user_profile/);
assert.match(selfRegistrationMigration, /grant execute on function public\.register_user_profile[\s\S]*to anon/);
const profileInsert = selfRegistrationMigration.match(/insert into public\.hris_users[\s\S]*?returning id into new_hris_user_id;/i)?.[0] || '';
assert.ok(profileInsert, 'guarded hris_users insert is missing');
assert.doesNotMatch(profileInsert, /\bp_role\b|\bp_status\b/, 'caller role/status must not be persisted');

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

assert.match(scopeControlsMigration, /admin_update_role_default_scope/);
assert.match(scopeControlsMigration, /Manager must remain active/);
assert.match(scopeControlsMigration, /Team Leader must not replace Manager/);
assert.match(scopeControlsMigration, /UPDATE_ROLE_DEFAULT_SCOPE/);
assert.match(scopeControlsMigration, /revoke all on function public\.admin_update_role_default_scope\(text,text\) from public, anon/);
assert.match(rolesPermissionsPage, /Default data scope/);
assert.match(rolesPermissionsPage, /admin_update_role_default_scope/);
assert.match(userManagementPage, /effectiveFeaturePermissions/);
assert.match(userManagementPage, /permissionUpdatedByName/);

console.log('RBAC repair static smoke test passed.');
