import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260905161000_phase1i_attendance_exception_resolution.sql');
const service = read('services/payrollAttendanceService.ts');
const page = read('pages/payroll/AttendanceExceptions.tsx');
const staging = read('pages/payroll/PayrollStaging.tsx');

assert.match(migration, /payroll_attendance_exception_actions/);
assert.match(migration, /before update or delete/);
assert.match(migration, /create or replace function public\.resolve_payroll_attendance_exception/);
assert.match(migration, /security definer/);
assert.match(migration, /set search_path = ''/);
assert.match(migration, /Only an authorized payroll reviewer can waive/);
assert.match(migration, /Waiver approval must be performed by a different user/);
assert.match(migration, /old\.status = 'resolved' and new\.status in \('reopened', 'waived'\)/);
assert.match(migration, /revoke all on function public\.resolve_payroll_attendance_exception/);
assert.match(migration, /grant execute on function public\.resolve_payroll_attendance_exception/);
assert.match(service, /resolve_payroll_attendance_exception/);
assert.match(service, /acknowledged_by_user_id/);
assert.match(page, /fetchPayrollAttendanceExceptions/);
assert.match(page, /resolvePayrollAttendanceException/);
assert.match(page, /Normalized exception queue/);
assert.match(page, /Required note/);
assert.match(staging, /Review attendance exceptions/);
assert.match(staging, /to="\/payroll\/exceptions"/);

console.log('Payroll attendance exception resolution smoke checks passed.');
