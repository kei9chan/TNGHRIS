import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (path) => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [leave, importPage, packages, approvals, hook, widget, links, migration] = await Promise.all([
  read('pages/payroll/Leave.tsx'),
  read('pages/payroll/LeaveBalanceImport.tsx'),
  read('modules/payroll/PayPackagesPage.tsx'),
  read('pages/ApprovalCenter.tsx'),
  read('hooks/useAdditionalApprovals.ts'),
  read('components/dashboard/ApprovalWidget.tsx'),
  read('services/approvalDeepLinks.ts'),
  read('supabase/migrations/20260922014934_pay_package_approval_inbox.sql'),
]);

assert.match(leave, /canAddLeaveBalances[\s\S]*Add Leave/);
assert.match(leave, /Role\.Admin, Role\.HRManager, Role\.HRStaff, Role\.BOD/);
assert.match(importPage, /Only HR Manager, HR Staff, Admin, and Board of Director/);
assert.match(importPage, /Download template/);
assert.match(importPage, /accept="\.csv,\.xlsx,\.xls"/);
assert.match(packages, /Pending for approval \(\$\{pendingPackages\.length\}\)/);
assert.match(packages, /Waiting for/);
assert.match(packages, /Review &amp; decide/);
assert.match(approvals, /kind: 'pay_package'/);
assert.match(hook, /pendingPayPackageApprovals/);
assert.match(widget, /pay_package:'Pay Packages'/);
assert.match(links, /\/approvals\?type=pay_package&item=/);
assert.match(migration, /step->>'userId'=actor::text/);
assert.match(migration, /private\.payroll_package_scope_permission/);
assert.match(migration, /revoke all on function public\.get_payroll_pay_package_approval_workspace\(\) from public,anon,authenticated/);

console.log('Passed leave-balance access and pay-package approval inbox tests.');
