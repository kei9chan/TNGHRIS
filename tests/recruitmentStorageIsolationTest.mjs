import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260922111500_isolate_recruitment_uploads_from_payroll_storage.sql', import.meta.url),
  'utf8',
);
const nonPayrollGuard = fs.readFileSync(
  new URL('../supabase/migrations/20260922112500_guard_non_payroll_uploads.sql', import.meta.url),
  'utf8',
);
const remainingUploadIsolation = fs.readFileSync(
  new URL('../supabase/migrations/20260922113500_isolate_remaining_payroll_upload_checks.sql', import.meta.url),
  'utf8',
);

assert.match(migration, /security definer/gi);
assert.match(migration, /payroll_pay_package_document_insert_allowed\(name\)/);
assert.match(migration, /payroll_pay_package_document_read_allowed\(name\)/);
assert.match(migration, /grant execute[^;]+authenticated, service_role/gi);

const insertPolicy = migration.match(/create policy payroll_pay_package_document_insert[\s\S]*?;/i)?.[0] || '';
const readPolicy = migration.match(/create policy payroll_pay_package_document_read[\s\S]*?;/i)?.[0] || '';

assert.ok(insertPolicy, 'The repaired payroll document insert policy must exist.');
assert.ok(readPolicy, 'The repaired payroll document read policy must exist.');
assert.doesNotMatch(insertPolicy, /from\s+public\.payroll_pay_packages/i);
assert.doesNotMatch(readPolicy, /from\s+public\.payroll_pay_package_documents/i);
assert.match(insertPolicy, /bucket_id\s*=\s*'payroll-pay-package-documents'/i);
assert.match(readPolicy, /bucket_id\s*=\s*'payroll-pay-package-documents'/i);

assert.doesNotMatch(nonPayrollGuard, /create\s+(or replace\s+)?function/i);
for (const policy of [
  'payroll_debt_document_insert',
  'payroll_debt_document_upload_insert',
  'payroll_nte_atd_insert',
]) {
  const policySql = nonPayrollGuard.match(new RegExp(`create policy ${policy}[^;]+;`, 'i'))?.[0] || '';
  assert.ok(policySql, `${policy} must be replaced.`);
  assert.match(policySql, /case\s+when\s+bucket_id\s*=\s*'payroll-/i);
  assert.match(policySql, /else\s+false\s+end/i);
}

assert.match(remainingUploadIsolation, /security definer/gi);
assert.match(remainingUploadIsolation, /payroll_debt_document_insert_allowed\(name, true\)/i);
assert.match(remainingUploadIsolation, /payroll_debt_document_insert_allowed\(name, false\)/i);
assert.match(remainingUploadIsolation, /payroll_nte_atd_insert_allowed\(name\)/i);
for (const policy of [
  'payroll_debt_document_insert',
  'payroll_debt_document_upload_insert',
  'payroll_nte_atd_insert',
]) {
  const policySql = remainingUploadIsolation.match(new RegExp(`create policy ${policy}[^;]+;`, 'i'))?.[0] || '';
  assert.ok(policySql, `${policy} must use an isolated authorization helper.`);
  assert.doesNotMatch(policySql, /from\s+public\.payroll_/i);
}

console.log('PASS: recruitment storage access is isolated from payroll table privileges.');
