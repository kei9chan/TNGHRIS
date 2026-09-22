import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [leaveModal, packages, packageModal, approvalCenter, links] = await Promise.all([
  read('components/payroll/LeaveRequestModal.tsx'),
  read('modules/payroll/PayPackagesPage.tsx'),
  read('components/payroll/PayPackageApprovalModal.tsx'),
  read('pages/ApprovalCenter.tsx'),
  read('services/approvalDeepLinks.ts'),
]);

assert.match(leaveModal, /size=\{isNew\?'full':'2xl'\}/, 'Leave approvals must use a compact 2xl modal while new requests retain the full workspace');
assert.match(leaveModal, /viewportFit=\{isNew\}/, 'Only the leave creation workspace should force the full mobile viewport');
assert.match(leaveModal, /max-w-2xl/, 'Leave review content must stay readable on desktop');

assert.match(packages, /overflow-visible/, 'The employee search card must allow its results to escape the card boundary');
assert.match(packages, /z-\[100\]/, 'Search results must layer above the package builder');
assert.match(packages, /<PayPackageApprovalModal/, 'Pending packages must open a review modal');

assert.match(packageModal, /title="Review Pay Package"/);
assert.match(packageModal, /size="2xl"/);
assert.match(packageModal, /Approval note/);
assert.match(packageModal, />Reject</);
assert.match(packageModal, />Approve</);
assert.match(approvalCenter, /requestedPayPackage/);
assert.match(approvalCenter, /<PayPackageApprovalModal/);
assert.match(links, /\/approvals\?type=pay_package&item=/, 'Approval links must open the package modal directly');

console.log('Compact approval modal and search layering tests passed.');
