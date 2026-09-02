import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('pages/ApprovalCenter.tsx');
const widget = read('components/dashboard/ApprovalWidget.tsx');
const app = read('App.tsx');
const migration = read('supabase/migrations/20260823233000_approval_center_bulk_workflow.sql');
const bulkRepair = read('supabase/migrations/20260824130000_repair_conditional_bulk_approvals.sql');
const consolidationMigration = read('supabase/migrations/20260824030000_consolidate_approval_notifications.sql');
const additionalApprovals = read('hooks/useAdditionalApprovals.ts');
const notifications = read('services/notificationService.ts');
const routing = read('utils/approvalCenterRouting.ts');
const deepLinks = read('services/approvalDeepLinks.ts');
const leave = read('pages/payroll/Leave.tsx');
const wfh = read('pages/payroll/WFHRequests.tsx');
const overtime = read('pages/payroll/OvertimeRequests.tsx');
const manpower = read('pages/payroll/ManpowerPlanning.tsx');
const requisitions = read('pages/recruitment/Requisitions.tsx');
const leaveService = read('services/leaveService.ts');
const wfhService = read('services/wfhService.ts');
const overtimeService = read('services/otService.ts');
const manpowerService = read('services/manpowerService.ts');
const requisitionService = read('services/jobRequisitionService.ts');
const timeAssignmentService = read('services/timeApprovalAssignmentService.ts');

const checks = [
  [page.includes('Approval Center'), 'Approval Center heading'],
  [page.includes('Approve selected'), 'selected bulk action'],
  [page.includes('Approve all pending'), 'all-pending bulk action'],
  [page.includes('Select all pending requests') && !page.includes('Select all eligible'), 'plain-language pending selection'],
  [!page.includes('Standard requests') && !widget.includes('review=eligible'), 'standard-request view removed'],
  [page.includes('TIME_DESKTOP_HEADINGS') && page.includes("'Approval step', 'Eligibility', 'Action'"), 'standardized time-request columns'],
  [page.includes('OVERTIME_DESKTOP_HEADINGS') && page.includes("'Week of'"), 'overtime week column'],
  [page.includes('I confirm these requests meet policy'), 'confirmation safeguard'],
  [page.includes('Overlapping leave request'), 'exception detection'],
  [page.includes('All business units') && page.includes('All departments'), 'scope filters'],
  [page.includes("kind: 'nte'") && page.includes("kind: 'pan'"), 'NTE and PAN queues'],
  [page.includes('canonicalKey') && page.includes('new Map<string, ApprovalItem>'), 'canonical approval deduplication'],
  [page.includes("getApprovalReviewUrl('nte', row.id)") && page.includes("getApprovalReviewUrl('pan', row.id)"), 'canonical exact NTE and PAN review links'],
  [additionalApprovals.includes("rpc('get_my_pending_job_requisition_approvals')") && additionalApprovals.includes(".from('pans')"), 'server-owned requisition and PAN data sources'],
  [additionalApprovals.includes('row.current_step') && additionalApprovals.includes('row.step_order'), 'server-resolved requisition approval step'],
  [widget.includes('Approval workload') && widget.includes('Only queues with pending tasks are shown') && !widget.includes('Auto-routing & delegation') && !widget.includes('Bulk actions log'), 'dashboard active-queue redesign'],
  [widget.includes('const activeQueues=queues.filter(q=>q.count>0)') && widget.includes('{activeQueues.map'), 'dashboard hides zero-count queues'],
  [widget.includes('Some approval queues could not be refreshed') && widget.includes('Available approval tasks are still shown below.'), 'partial queue failures do not hide available approvals'],
  [widget.includes("name:'NTE'") && widget.includes("name:'PAN'") && widget.includes("name:'Job Requisitions'"), 'dashboard consolidated queue counts'],
  [routing.includes('isCentralizedApprovalActionItem'), 'duplicate dashboard approval filtering'],
  [app.includes('path="approvals"'), 'protected Approval Center route'],
  [migration.includes('for update of r skip locked'), 'concurrency-safe locking'],
  [migration.includes("has_workflow_permission(workflow_key, 'approve')"), 'backend workflow permission'],
  [migration.includes('can_access_hris_user'), 'backend record scope'],
  [migration.includes('idempotency_key uuid not null unique'), 'duplicate submission protection'],
  [migration.includes('insert into public.audit_logs') && migration.includes('insert into public.notifications'), 'audit and notification integration'],
  [migration.includes('revoke all on function public.bulk_approve_requests'), 'RPC execution lockdown'],
  [bulkRepair.includes('public.process_time_request_approval') && bulkRepair.includes('private.is_direct_reporting_manager'), 'canonical conditional bulk authorization'],
  [page.includes('Requests that changed, are no longer assigned to you') && page.includes('skippedItems'), 'clear bulk skip feedback'],
  [consolidationMigration.includes('notifications_user_dedupe_key_unique'), 'notification idempotency constraint'],
  [notifications.includes('canonicalApprovalLink') && notifications.includes('getApprovalReviewUrl(kind, requestId)'), 'notification direct-review routing'],
  [deepLinks.includes("params.get('review') || params.get('item') || params.get('requestId')"), 'backward-compatible review parameters'],
  [leave.includes('fetchLeaveRequestById(reviewId)') && leaveService.includes(".eq('id', id)") && leave.includes("'team_requests'"), 'leave fetches and opens the exact staff review'],
  [wfh.includes('fetchWfhRequestById(reviewId)') && wfhService.includes('fetchWfhRequestById') && wfh.includes('setIsReviewModalOpen(true)'), 'WFH fetches and opens the exact staff review'],
  [overtime.includes('fetchOtRequestById(reviewId)') && overtimeService.includes('fetchOtRequestById') && overtime.includes("'team_approvals'"), 'overtime fetches and opens the exact team review'],
  [manpower.includes('fetchManpowerRequestById(requestId)') && manpowerService.includes('fetchManpowerRequestById') && manpower.includes('setIsReviewModalOpen(true)'), 'manpower fetches and opens the exact review'],
  [requisitions.includes('fetchJobRequisitionById(reviewId)') && requisitionService.includes('fetchJobRequisitionById') && requisitions.includes('handleOpenModal(requested)'), 'requisition fetches and opens the exact review'],
  [timeAssignmentService.includes(".from('time_request_approval_assignments')") && [leave, wfh, overtime].every(source => source.includes('hasPendingTimeApprovalAssignment')), 'time-request deep links honor immutable pending assignments'],
  [[leave, wfh, overtime, manpower, requisitions].every(source => source.includes('Unable to open')), 'direct-review failures are visible instead of silently falling back'],
  [notifications.includes("error.code === '23505'"), 'duplicate notification retry protection'],
];

const failed = checks.filter(([ok]) => !ok);
if (failed.length) {
  for (const [,label] of failed) console.error(`FAIL: ${label}`);
  process.exit(1);
}
console.log(`Approval Center smoke checks passed (${checks.length}/${checks.length}).`);
