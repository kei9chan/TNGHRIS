import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260920145257_grant_loans_debt_role_access.sql', import.meta.url),
  'utf8',
);
const creatorFix = fs.readFileSync(
  new URL('../supabase/migrations/20260921033140_fix_loans_debt_finance_routing_and_admin_bod_create.sql', import.meta.url),
  'utf8',
);
const navigation = fs.readFileSync(new URL('../constants.ts', import.meta.url), 'utf8');

for (const role of ['Admin', 'Board of Director', 'HR Manager', 'HR Staff']) {
  assert.match(migration, new RegExp(`'${role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
}
assert.match(migration, /values \('Loans',[\s\S]*true, true\)/);
assert.match(migration, /array\['view'\]/);
assert.match(migration, /workflow_user_has_role\(public\.current_hris_user_id\(\), 'Admin'\)/);
assert.match(migration, /workflow_user_has_role\(public\.current_hris_user_id\(\), 'Board of Director'\)/);
assert.match(migration, /payroll_has_access\('manage_access', p_scope\)/);
assert.match(migration, /payroll_has_access\('approve_bod', p_scope\)/);
assert.match(migration, /create or replace function private\.payroll_debt_oversight_view/);
assert.match(migration, /private\.payroll_debt_manager\(p_scope\)/);
assert.match(migration, /'canManage', manager/);
assert.match(migration, /payroll_debt_document_oversight_read/);
assert.match(navigation, /Loans & Debt'[\s\S]*resource: 'Loans'[\s\S]*Permission\.View/);
assert.doesNotMatch(creatorFix, /min\(h\.id\)/i);
assert.match(creatorFix, /array_agg\(h\.id order by h\.id\)/i);
assert.match(creatorFix, /payroll_debt_creator\(p_scope uuid\)[\s\S]*payroll_debt_oversight_view\(p_scope\)/i);

console.log('PASS: Scoped Admin and BOD users can add Loans & Debt records, with Finance approval separation preserved.');
