import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const requestForm = read('components/payroll/ManpowerRequestModal.tsx');
const review = read('components/payroll/ManpowerReviewModal.tsx');
const approvalCenter = read('pages/ApprovalCenter.tsx');
const planning = read('pages/payroll/ManpowerPlanning.tsx');
const managerDashboard = read('components/dashboard/ManagerDashboard.tsx');
const service = read('services/manpowerService.ts');
const deepLinks = read('services/approvalDeepLinks.ts');
const migration = read('supabase/migrations/20260829100000_on_call_manpower_form_and_approval_workflow.sql');
const grantMigration = read('supabase/migrations/20260829101000_grant_manpower_rls_helper_execution.sql');

const reasons = [
  'Sick call / absence',
  'No-show',
  'Approved leave',
  'Sudden increase in bookings / PAX',
  'Special event / group booking',
  'Additional coverage required',
  'Other',
];

const checks = [
  [requestForm.includes('Department / Area') && requestForm.includes('Select department'), 'department dropdown'],
  [requestForm.includes('Required FTE') && requestForm.includes('Reporting FTE') && requestForm.includes('On-call needed'), 'FTE fields and calculated output'],
  [requestForm.includes('Math.max(requiredFte - reportingFte, 0)') && requestForm.includes('On-call needed = max(Required FTE − Reporting FTE, 0)'), 'on-call calculation formula'],
  [requestForm.includes('get_department_reporting_fte') && requestForm.includes('editable'), 'schedule-based editable reporting FTE'],
  [requestForm.includes('Opening') && requestForm.includes('Mid') && requestForm.includes('Closing') && requestForm.includes('Custom'), 'shift presets'],
  [requestForm.includes('manpower_department_rates') && requestForm.includes('Prefilled from department default'), 'department rate defaults'],
  [reasons.every(reason => requestForm.includes(reason)), 'per-department reason choices'],
  [requestForm.includes('Explain other reason') && requestForm.includes("selectedReason === 'Other'"), 'Other explanation field'],
  [requestForm.includes('Reason is required only for departments with on-call coverage') && requestForm.includes('needed > 0'), 'zero-count reason rule'],
  [requestForm.includes('Add Department') && requestForm.includes('handleAddDepartment'), 'additional department rows'],
  [migration.includes('create table if not exists public.manpower_department_rates') && migration.includes('create table if not exists public.manpower_request_approval_assignments'), 'workflow support tables'],
  [migration.includes("approval_stage text not null default 'BUSINESS_UNIT_MANAGER'") && migration.includes("'BOD_GM'"), 'staged approval columns'],
  [migration.includes("unique (request_id, approval_stage, approver_user_id)") && migration.includes('for update'), 'duplicate and concurrent approval protection'],
  [migration.includes("private.workflow_user_has_role(manager.id, 'Business Unit Manager')") && migration.includes("approval_stage, approver_user_id, approver_role, status"), 'Business Unit Manager assignment'],
  [migration.includes("private.workflow_user_has_role(approver.id, 'Board of Director')") && migration.includes("private.workflow_user_has_role(approver.id, 'GeneralManager')"), 'BOD and GM approval pool'],
  [migration.includes("set status = 'Cancelled'") && migration.includes('Completed by another BOD / GM approver.'), 'pool cleanup after one approval'],
  [migration.includes('create or replace function public.process_manpower_request_approval') && migration.includes("This on-call request has already been processed."), 'server-side approval action'],
  [migration.includes('approval_history') && migration.includes('insert into public.audit_logs') && migration.includes('insert into public.notifications'), 'approval trail audit and notifications'],
  [migration.includes('private.is_manpower_active_approver') && migration.includes('create policy manpower_authorized_view'), 'assignment-aware RLS visibility'],
  [grantMigration.includes('grant execute on function private.is_manpower_active_approver') && grantMigration.includes('grant execute on function private.is_manpower_request_owner'), 'RLS helper execution grant'],
  [service.includes("rpc('get_my_pending_manpower_approval_ids'") && service.includes("rpc('process_manpower_request_approval'") && !service.includes(".from('manpower_requests')\n    .update"), 'client uses audited RPCs'],
  [deepLinks.includes("type=manpower&item=") && approvalCenter.includes('<ManpowerReviewModal'), 'canonical direct review link'],
  [approvalCenter.includes("const BULK_KINDS = new Set<Kind>(['leave', 'wfh', 'overtime'])") && approvalCenter.includes("bulkSelectable: false"), 'on-call queue is individually reviewable'],
  [planning.includes('fetchMyPendingManpowerApprovalIds') && planning.includes('This on-call request is no longer assigned to you'), 'planning deep-link authorization'],
  [managerDashboard.includes('fetchMyPendingManpowerApprovalIds') && managerDashboard.includes('assignment-based'), 'manager dashboard follows active assignment'],
  [review.includes('Approval trail') && review.includes('Pending BOD / GM Approval') && review.includes('Required FTE'), 'review modal shows stage and request detail'],
];

const failed = checks.filter(([ok]) => !ok);
if (failed.length) {
  for (const [, label] of failed) console.error(`FAIL: ${label}`);
  process.exit(1);
}

console.log(`On-call manpower workflow smoke checks passed (${checks.length}/${checks.length}).`);
