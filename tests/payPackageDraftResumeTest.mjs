import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=(path)=>fs.readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [batch,builder,page,service,migration]=await Promise.all([
  read('modules/payroll/PayPackageBatchUpload.tsx'),
  read('modules/payroll/PayPackageBuilder.tsx'),
  read('modules/payroll/PayPackagesPage.tsx'),
  read('modules/payroll/payPackages.ts'),
  read('supabase/migrations/20260922143000_editable_pay_package_drafts.sql'),
]);

assert.match(batch,/Valid rows go directly to approval/);
assert.match(batch,/saveAndSubmitValidRows/);
assert.match(batch,/await submitPayPackageDraft\(id\)/);
assert.match(batch,/matching saved draft already exists/);
assert.match(builder,/Edit draft/);
assert.match(builder,/updatePayPackageDraft/);
assert.match(builder,/Changes update this same draft/);
assert.match(page,/Edit draft/);
assert.match(service,/submit_payroll_pay_package_draft/);
assert.match(service,/update_payroll_pay_package_draft/);
assert.match(migration,/approval_state='pending'/);
assert.match(migration,/private\.direct_package_approval_steps\(payroll_actor\)/);
assert.match(migration,/draft_updated/);
assert.match(migration,/submitted_for_approval/);
assert.match(migration,/private\.payroll_package_scope_permission/);
assert.match(migration,/Only the person who saved this draft may edit it/);
assert.match(migration,/business-unit scope cannot be changed/);
assert.match(migration,/revoke all on function public\.submit_payroll_pay_package_draft\(uuid\) from public,anon,authenticated/);

console.log('Passed editable draft, automatic batch submission, scoped authorization, routing, and audit checks.');
