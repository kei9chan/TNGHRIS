import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('pages/ApprovalCenter.tsx');
const widget = read('components/dashboard/ApprovalWidget.tsx');
const app = read('App.tsx');
const migration = read('supabase/migrations/20260823233000_approval_center_bulk_workflow.sql');

const checks = [
  [page.includes('Approval Center'), 'Approval Center heading'],
  [page.includes('Approve selected'), 'selected bulk action'],
  [page.includes('Approve group'), 'group bulk action'],
  [page.includes('I confirm these requests meet policy'), 'confirmation safeguard'],
  [page.includes('Overlapping leave request'), 'exception detection'],
  [page.includes('All business units') && page.includes('All departments'), 'scope filters'],
  [widget.includes('Approval workload') && widget.includes('Auto-routing & delegation'), 'dashboard workload redesign'],
  [app.includes('path="approvals"'), 'protected Approval Center route'],
  [migration.includes('for update of r skip locked'), 'concurrency-safe locking'],
  [migration.includes("has_workflow_permission(workflow_key, 'approve')"), 'backend workflow permission'],
  [migration.includes('can_access_hris_user'), 'backend record scope'],
  [migration.includes('idempotency_key uuid not null unique'), 'duplicate submission protection'],
  [migration.includes('insert into public.audit_logs') && migration.includes('insert into public.notifications'), 'audit and notification integration'],
  [migration.includes('revoke all on function public.bulk_approve_requests'), 'RPC execution lockdown'],
];

const failed = checks.filter(([ok]) => !ok);
if (failed.length) {
  for (const [,label] of failed) console.error(`FAIL: ${label}`);
  process.exit(1);
}
console.log(`Approval Center smoke checks passed (${checks.length}/${checks.length}).`);
