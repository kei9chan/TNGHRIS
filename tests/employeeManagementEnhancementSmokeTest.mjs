import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260824040000_employee_management_enhancements.sql');
const users = read('pages/admin/UserManagement.tsx');
const profile = read('pages/employees/EmployeeProfile.tsx');
const list = read('hooks/useHRData.ts');
const documents = read('components/employees/UserDocumentsManager.tsx');

assert.match(migration, /admin_set_account_lifecycle/);
assert.match(migration, /has_active_role\('Admin'\).*has_active_role\('HR Manager'\)/s);
assert.match(migration, /Date Hired cannot be in the future/);
assert.match(migration, /employee-documents/);
assert.match(migration, /public\.can_manage_employee_documents/);
assert.match(migration, /audit_employee_employment_change/);
assert.match(users, /Duplicate accounts/);
assert.match(users, /AccountLifecycleModal/);
assert.doesNotMatch(profile, /row\.position \|\| row\.role/);
assert.match(list, /resolveEmployeePosition/);
assert.match(documents, /createSignedUrl/);
assert.doesNotMatch(documents, /URL\.createObjectURL\(file\)/);

console.log('Employee Management enhancement smoke tests passed.');
