import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260905180000_phase1k_leave_schedule_workflows.sql');
const service = read('services/payrollScheduleWorkflowService.ts');
const page = read('pages/payroll/ScheduleRequests.tsx');
const app = read('App.tsx');
const constants = read('constants.ts');
const nav = read('components/layout/PayrollSubNav.tsx');

assert.match(migration, /create table if not exists public\.payroll_leave_request_events/);
assert.match(migration, /create table if not exists public\.payroll_schedule_change_requests/);
assert.match(migration, /create table if not exists public\.payroll_shift_swap_requests/);
assert.match(migration, /create table if not exists public\.payroll_schedule_workflow_actions/);
assert.match(migration, /Payroll workflow history is append-only/);
assert.match(migration, /create or replace function public\.submit_payroll_schedule_change_request/);
assert.match(migration, /create or replace function public\.review_payroll_schedule_change_request/);
assert.match(migration, /create or replace function public\.submit_payroll_shift_swap_request/);
assert.match(migration, /create or replace function public\.respond_payroll_shift_swap_request/);
assert.match(migration, /create or replace function public\.review_payroll_shift_swap_request/);
assert.match(migration, /record_status = 'superseded'/);
assert.match(migration, /requires_reinterpretation = interpretation_exists/);
assert.match(migration, /alter table public\.payroll_schedule_change_requests enable row level security/);
assert.match(migration, /alter table public\.payroll_shift_swap_requests enable row level security/);
assert.match(migration, /revoke all on function public\.submit_payroll_shift_swap_request/);
assert.match(migration, /notify pgrst, 'reload schema'/);

assert.match(service, /fetchPayrollScheduleWorkflowContext/);
assert.match(service, /submitPayrollScheduleChangeRequest/);
assert.match(service, /reviewPayrollScheduleChangeRequest/);
assert.match(service, /submitPayrollShiftSwapRequest/);
assert.match(service, /respondPayrollShiftSwapRequest/);
assert.match(service, /reviewPayrollShiftSwapRequest/);

assert.match(page, /Schedule Requests/);
assert.match(page, /Request change of shift/);
assert.match(page, /Request peer shift swap/);
assert.match(page, /The other employee must accept/);
assert.match(page, /Approve and apply/);
assert.match(page, /Existing attendance interpretations are not overwritten/);

assert.match(app, /path="schedule-requests"/);
assert.match(constants, /name: 'Schedule Requests'/);
assert.match(nav, /'Schedule Requests'/);

console.log('Payroll schedule workflow smoke checks passed.');
