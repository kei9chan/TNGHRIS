import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260903050341_fix_direct_manager_time_approval_authorization.sql', import.meta.url),
  'utf8',
);
const quickLinks = fs.readFileSync(new URL('../components/dashboard/QuickLinks.tsx', import.meta.url), 'utf8');
const permissions = fs.readFileSync(new URL('../hooks/usePermissions.ts', import.meta.url), 'utf8');

assert.match(migration, /private\.is_direct_reporting_manager\(actor_id, employee_id\)/);
assert.match(migration, /a\.approver_user_id = actor_id[\s\S]*a\.status = 'Pending'/);
assert.match(migration, /app\.time_request_approval_context/);
assert.match(migration, /format\('%s:%s:%s', lower\(p_request_type\), p_request_id, actor_id\)/);
assert.match(migration, /canonical_time_approval_context = expected_time_approval_context/);
assert.match(migration, /perform set_config\('app\.time_request_approval_context', '', true\)/);
assert.match(migration, /exception when others then[\s\S]*set_config\('app\.time_request_approval_context', '', true\)/);
assert.match(migration, /insert into public\.audit_logs/);
assert.match(migration, /private\.assign_time_request_approvers/);
assert.doesNotMatch(migration, /insert into public\.user_roles/i);
assert.doesNotMatch(migration, /update public\.role_workflow_permissions/i);
assert.doesNotMatch(migration, /boj|mojica|desree|peralta/i);

assert.match(quickLinks, /workflowCan\('WFH', Permission\.Submit\)/);
assert.match(quickLinks, /workflowCan\('Overtime', Permission\.Submit\)/);
assert.match(permissions, /can\('OT', Permission\.Create\) && workflowCan\('Overtime', Permission\.Submit\)/);
assert.match(permissions, /can\(resource, Permission\.Create\) && workflowCan\(workflow, Permission\.Submit\)/);

console.log('Direct-manager WFH/OT authorization and employee self-service smoke checks passed.');
