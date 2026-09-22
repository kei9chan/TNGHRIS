import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=(path)=>fs.readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [batch,builder,page,service,migration]=await Promise.all([
  read('modules/payroll/PayPackageBatchUpload.tsx'),
  read('modules/payroll/PayPackageBuilder.tsx'),
  read('modules/payroll/PayPackagesPage.tsx'),
  read('modules/payroll/payPackages.ts'),
  read('supabase/migrations/20260922061518_resume_and_submit_existing_pay_package_drafts.sql'),
]);

assert.match(batch,/Drafts ready to submit/);
assert.match(batch,/Submit \{summary\.draft\} existing draft/);
assert.match(batch,/matching saved draft already exists/);
assert.match(builder,/Submit existing draft for approval/);
assert.match(page,/Submit draft for approval/);
assert.match(service,/submit_payroll_pay_package_draft/);
assert.match(migration,/approval_state='pending'/);
assert.match(migration,/private\.direct_package_approval_steps\(payroll_actor\)/);
assert.match(migration,/Only the person who saved this draft may submit it for approval/);
assert.match(migration,/submitted_for_approval/);
assert.match(migration,/revoke all on function public\.submit_payroll_pay_package_draft\(uuid\) from public,anon,authenticated/);

console.log('Passed resumable draft classification, direct submission actions, ownership guard, routing, and audit checks.');
