import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260905170000_phase1j_attendance_correction_requests.sql');
const guardMigration = read('supabase/migrations/20260905170500_phase1j_correction_review_guard.sql');
const service = read('services/payrollAttendanceService.ts');
const page = read('pages/payroll/AttendanceExceptions.tsx');

assert.match(migration, /create table if not exists public\.payroll_attendance_correction_requests/);
assert.match(migration, /create table if not exists public\.payroll_attendance_correction_request_actions/);
assert.match(migration, /Submitted attendance correction evidence is immutable/);
assert.match(migration, /create or replace function public\.submit_payroll_attendance_correction_request/);
assert.match(migration, /create or replace function public\.review_payroll_attendance_correction_request/);
assert.match(migration, /Only HR, Finance, or system administrators may approve or reject/);
assert.match(migration, /raw events, interpretations, and exception evidence remain immutable/);
assert.match(migration, /set_config\('payroll\.attendance_correction_source', 'correction'/);
assert.match(migration, /interpretation_source := 'correction'/);
assert.match(migration, /'payroll-correction'/);
assert.match(migration, /notify pgrst, 'reload schema'/);
assert.match(guardMigration, /guard_payroll_attendance_correction_review/);
assert.match(guardMigration, /source exception is no longer open/);
assert.match(service, /fetchPayrollAttendanceCorrectionRequests/);
assert.match(service, /submitPayrollAttendanceCorrectionRequest/);
assert.match(service, /reviewPayrollAttendanceCorrectionRequest/);
assert.match(page, /Request correction/);
assert.match(page, /Submit for payroll review/);
assert.match(page, /Approve and rebuild attendance/);
assert.match(page, /Correction: \{statusLabel\(correctionRequest\.status\)\}/);

console.log('Payroll attendance correction smoke checks passed.');
