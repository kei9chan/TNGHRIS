import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('pages/ApprovalCenter.tsx');
const widget = read('components/dashboard/ApprovalWidget.tsx');
const app = read('App.tsx');
const migration = read('supabase/migrations/20260823233000_approval_center_bulk_workflow.sql');
const consolidationMigration = read('supabase/migrations/20260824030000_consolidate_approval_notifications.sql');
const additionalApprovals = read('hooks/useAdditionalApprovals.ts');
const notifications = read('services/notificationService.ts');
const routing = read('utils/approvalCenterRouting.ts');

const checks = [
  [page.includes('Approval Center'), 'Approval Center heading'],
  [page.includes('Approve selected'), 'selected bulk action'],
  [page.includes('Approve group'), 'group bulk action'],
  [page.includes('I confirm these requests meet policy'), 'confirmation safeguard'],
  [page.includes('Overlapping leave request'), 'exception detection'],
  [page.includes('All business units') && page.includes('All departments'), 'scope filters'],
  [page.includes("kind: 'nte'") && page.includes("kind: 'pan'"), 'NTE and PAN queues'],
  [page.includes('canonicalKey') && page.includes('new Map<string, ApprovalItem>'), 'canonical approval deduplication'],
  [page.includes('/feedback/nte/${row.id}') && page.includes('/employees/pan?item=${row.id}'), 'exact NTE and PAN review links'],
  [additionalApprovals.includes(".eq('status', 'PendingApproval')") && additionalApprovals.includes(".from('pans')"), 'pending NTE and PAN data sources'],
  [additionalApprovals.includes('step.userId === user.id') && additionalApprovals.includes('isPending(step.status)'), 'current approver-step filtering'],
  [widget.includes('Approval workload') && widget.includes('Auto-routing & delegation'), 'dashboard workload redesign'],
  [widget.includes("name:'NTE'") && widget.includes("name:'PAN'") && widget.includes("name:'Job Requisitions'"), 'dashboard consolidated queue counts'],
  [routing.includes('isCentralizedApprovalActionItem'), 'duplicate dashboard approval filtering'],
  [app.includes('path="approvals"'), 'protected Approval Center route'],
  [migration.includes('for update of r skip locked'), 'concurrency-safe locking'],
  [migration.includes("has_workflow_permission(workflow_key, 'approve')"), 'backend workflow permission'],
  [migration.includes('can_access_hris_user'), 'backend record scope'],
  [migration.includes('idempotency_key uuid not null unique'), 'duplicate submission protection'],
  [migration.includes('insert into public.audit_logs') && migration.includes('insert into public.notifications'), 'audit and notification integration'],
  [migration.includes('revoke all on function public.bulk_approve_requests'), 'RPC execution lockdown'],
  [consolidationMigration.includes('notifications_user_dedupe_key_unique'), 'notification idempotency constraint'],
  [notifications.includes('canonicalApprovalLink') && notifications.includes('/approvals?type=nte'), 'notification Approval Center routing'],
  [notifications.includes("error.code === '23505'"), 'duplicate notification retry protection'],
];

const failed = checks.filter(([ok]) => !ok);
if (failed.length) {
  for (const [,label] of failed) console.error(`FAIL: ${label}`);
  process.exit(1);
}
console.log(`Approval Center smoke checks passed (${checks.length}/${checks.length}).`);
