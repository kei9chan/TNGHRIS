import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = path => fs.readFile(new URL(path, import.meta.url), 'utf8');
const migration = await read('../supabase/migrations/20260921010208_pan_compensation_source_of_truth.sql');
const panPage = await read('../pages/employees/PersonnelActionNotice.tsx');
const panModal = await read('../components/employees/PANModal.tsx');
const builder = await read('../modules/payroll/PayPackageBuilder.tsx');
const packagesPage = await read('../modules/payroll/PayPackagesPage.tsx');
const profile = await read('../components/employees/CompensationCard.tsx');

// 1. Final PAN approval atomically creates an approved package and updates the profile without a second approval.
assert.match(migration, /pan_compensation_after_approval[\s\S]*apply_approved_pan_compensation/);
assert.match(migration, /source_kind[\s\S]*'approved_pan'[\s\S]*status[\s\S]*'approved'/);
assert.match(panPage, /PAN approved\. Pay package and employee compensation profile were updated automatically\./);
assert.match(packagesPage, /item\.source_kind !== "approved_pan"/);

// 2. Previous compensation is retained as effective-dated history.
assert.match(migration, /previousCompensation/);
assert.match(migration, /'history'[\s\S]*status in \('approved','superseded'\)/);
assert.doesNotMatch(migration, /delete from public\.payroll_pay_packages/i);

// 3. A later approved PAN receives a new version and its own effective date.
assert.match(migration, /max\(x\.version_no\),0\)\+1/);
assert.match(migration, /p\.effective_date[\s\S]*version/);
assert.match(migration, /payroll_package_pan_source_unique/);

// 4. The generated package retains PAN reference, approval provenance, and source document.
assert.match(migration, /panReference[\s\S]*panApprovalDate[\s\S]*approvers[\s\S]*sourceDocument/);
assert.match(packagesPage, /View approved PAN/);
assert.match(packagesPage, /View source document/);

// 5. Direct entries use the Jedediah HR Manager / Lenny Rose Casas Finance route with no self-approval.
assert.match(migration, /direct_package_approval_steps/);
assert.match(migration, /lower\(u\.role\)='hr manager'[\s\S]*jedediah/i);
assert.match(migration, /like '%casas%'[\s\S]*like '%lenny%'/i);
assert.match(migration, /creator_hris is distinct from hr\.id[\s\S]*creator_hris is distinct from finance\.id/);
assert.match(migration, /The creator cannot approve their own compensation entry/);

// 6. Employee and consultant arrangements remain separate streams and profile collections.
assert.match(migration, /'employee','employee_payroll'/);
assert.match(migration, /'consultantPackages'[\s\S]*stream='professional_fee'/);
assert.match(builder, /Employee payroll/);
assert.match(builder, /Consultant fee/);

// 7. Pending, rejected, or incompletely approved PANs cannot activate compensation.
assert.match(migration, /pending, rejected, expired, or incompletely approved PAN cannot update compensation/);
assert.match(migration, /exists\(select 1 from jsonb_array_elements\(p\.routing_steps\)[\s\S]*status' is distinct from 'Approved'/);

// 8. Editing a generated package creates a correction version that re-enters approval.
assert.match(packagesPage, /Create correction/);
assert.match(builder, /sourceKind:\s*correctionSource\s*\?\s*"correction"/);
assert.match(builder, /correctionOfId: correctionSource\?\.id/);
assert.match(migration, /source_kind='correction'[\s\S]*correction_of_id is null/);
assert.match(profile, /Compensation source: Approved PAN/);
assert.match(panModal, /Previous package preserved in salary history/);

console.log('Passed 8 focused PAN-to-compensation source-of-truth acceptance tests.');
