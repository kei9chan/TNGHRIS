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
const focusedRouteMigration = read('supabase/migrations/20260924080000_fix_hris_workflow_integrity.sql');
const grantMigration = read('supabase/migrations/20260829101000_grant_manpower_rls_helper_execution.sql');
const calendarDate = read('utils/calendarDate.ts');
const requestModel = read('modules/payroll/onCallRequestModel.ts');
const dashboard = read('pages/payroll/OnCallManpowerCost.tsx');
const dashboardMigration = read('supabase/migrations/20260912133000_on_call_manpower_dashboard_filters_and_costs.sql');

const checks = [
  [requestForm.includes('Department / Area') && requestForm.includes('Select department'), 'department dropdown'],
  [requestForm.includes('Required FTE') && requestForm.includes('Reporting FTE') && requestForm.includes('On-call needed'), 'FTE fields and calculated output'],
  [requestModel.includes('Math.max(requiredFte - reportingFte, 0)') && requestModel.includes('totalItemCost: onCallNeeded * ratePerDay'), 'on-call calculation formula'],
  [requestForm.includes('get_department_reporting_fte') && requestForm.includes('editable'), 'schedule-based editable reporting FTE'],
  [requestForm.includes('Opening') && requestForm.includes('Mid') && requestForm.includes('Closing') && requestForm.includes('Custom'), 'shift presets'],
  [requestForm.includes('manpower_department_rates') && requestForm.includes('departmentRates[departmentId] || DEFAULT_ON_CALL_RATE') && requestModel.includes('DEFAULT_ON_CALL_RATE = 610'), 'department rate defaults'],
  [requestForm.includes('One reason for all dates') && requestForm.includes('Different reason per date') && requestForm.includes('Reason for this date'), 'shared and per-date reason choices'],
  [requestForm.includes('Specific operational need') && requestModel.includes('isReasonVague'), 'operational reason detail validation'],
  [requestForm.includes('Number(item.onCallNeeded || 0) > 0 && !item.reason?.trim()'), 'zero-count item reason rule'],
  [requestForm.includes('startDate,') && requestForm.includes('endDate,') && requestForm.includes('toLocalCalendarDate') && service.includes('normalizeCalendarDate(request.dateNeeded || request.date)'), 'date-only values are submitted without UTC conversion'],
  [calendarDate.includes('getFullYear()') && calendarDate.includes('getMonth() + 1') && service.includes('normalizeCalendarDate(request.dateNeeded || request.date)'), 'local calendar date serialization'],
  [requestForm.includes('formatCoverageDate(day.date)') && requestForm.includes('role="alert" aria-live="polite"'), 'visible date-specific submission validation'],
  [requestForm.includes('loadingKeys.size > 0') && requestForm.includes('disabled={isSubmitting || loadingKeys.size > 0'), 'schedule lookup cannot race submission'],
  [requestForm.includes('+ Add department') && requestForm.includes('emptyItem('), 'additional department rows'],
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
  [review.includes('Approval history') && review.includes('Pending Board of Director Approval') && review.includes('Required FTE'), 'review modal shows BOD stage and request detail'],
  [focusedRouteMigration.includes('A Business Unit Manager must be assigned before this request can be submitted.') && focusedRouteMigration.includes('BUM_THEN_BOD'), 'active BUM is required for the requester-to-BOD route'],
  [focusedRouteMigration.includes('preview_manpower_approval_route') && requestForm.includes('Business Unit Manager') && requestForm.includes('Board of Director'), 'the submitted route is previewed from the server resolver'],
  [focusedRouteMigration.includes('DIRECT_BOD_REPORT') && focusedRouteMigration.includes('requester_is_bum'), 'direct BOD reports and BUM requesters route directly to BOD'],
  [dashboard.includes("get_on_call_manpower_dashboard_v2") && dashboard.includes('On-Call &amp; Manpower Cost'), 'cost dashboard route and live RPC'],
  [dashboard.includes('Location') && dashboard.includes('Cost status') && dashboard.includes('Coverage status'), 'dashboard scope filters'],
  [dashboard.includes('Overview') && dashboard.includes('Daily View') && dashboard.includes('Employee Cost') && dashboard.includes('Reports'), 'dashboard tabs'],
  [dashboardMigration.includes('get_on_call_manpower_dashboard_v2') && dashboardMigration.includes("'actualCost'") && dashboardMigration.includes('replacementActualCost'), 'actual cost reconciliation wrapper'],
  [dashboardMigration.includes('p_location text') && dashboardMigration.includes('p_coverage_status text'), 'server-side location and coverage filters'],
];

const failed = checks.filter(([ok]) => !ok);
if (failed.length) {
  for (const [, label] of failed) console.error(`FAIL: ${label}`);
  process.exit(1);
}

console.log(`On-call manpower workflow smoke checks passed (${checks.length}/${checks.length}).`);
