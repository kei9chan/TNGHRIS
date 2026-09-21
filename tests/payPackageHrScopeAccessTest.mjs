import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260921045810_align_pay_package_hr_scope_access.sql', import.meta.url),
  'utf8',
);
const builder = fs.readFileSync(
  new URL('../modules/payroll/PayPackageBuilder.tsx', import.meta.url),
  'utf8',
);
const sensitiveGrant = fs.readFileSync(
  new URL('../supabase/migrations/20260921051800_grant_hr_staff_pay_package_compensation_access.sql', import.meta.url),
  'utf8',
);

assert.match(migration, /workflow_user_has_role\(public\.current_hris_user_id\(\), 'HR Manager'\)/);
assert.match(migration, /workflow_user_has_role\(public\.current_hris_user_id\(\), 'HR Staff'\)/);
assert.match(sensitiveGrant, /'HR Staff', 'salary_compensation', array\['view', 'edit'\]/);
assert.match(sensitiveGrant, /rbac_audit_log/);
assert.match(migration, /public\.can_access_hris_user\(p_employee\)/);
assert.match(migration, /public\.current_hris_user_id\(\) <> p_employee/);
assert.match(migration, /when 'approve' then[\s\S]*payroll_has_access\('authorize_hr', s\.id\)/);
assert.match(builder, /const editableScopes = data\.scopes\.filter\([\s\S]*s\.canEdit/);

console.log('PASS: HR Manager and HR Staff receive editable Pay Package scopes while approval and self-entry controls remain separate.');
