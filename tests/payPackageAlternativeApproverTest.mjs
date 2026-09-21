import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = (path) => fs.readFile(new URL(path, import.meta.url), "utf8");
const migration = await read(
  "../supabase/migrations/20260921093117_pay_package_alternative_approver.sql",
);
const page = await read("../modules/payroll/PayPackagesPage.tsx");

// Kay is an assigned alternative approver, resolved from the requested account.
assert.match(migration, /lower\(u\.email\)='kay@thenextperience\.com'/);
assert.match(migration, /BOD · Alternate approver/);

// The submitter is excluded and at least two independent approvers remain.
assert.match(migration, /creator_hris is distinct from alternate\.id/);
assert.match(migration, /jsonb_array_length\(result\)<2/);
assert.match(migration, /The creator cannot approve their own compensation entry/);

// Approval is parallel. Authorized submitters need one independent review;
// HR Staff submissions retain two independent assigned reviews.
assert.doesNotMatch(migration, /first_pending/);
const submitterMigration = await read(
  "../supabase/migrations/20260921235506_pay_package_explicit_submission_signoff.sql",
);
assert.match(submitterMigration, /all_done:=approved_count>=2/);
assert.match(submitterMigration, /'kind','submission'/);
assert.match(submitterMigration, /count\(distinct s->>'userId'\)/);
assert.match(submitterMigration, /u\.auth_user_id=p_creator or u\.id=p_creator/);
assert.match(submitterMigration, /lower\(u\.email\)='kay@thenextperience\.com'/);
assert.match(migration, /Two independent compensation approvals must be completed first/);
assert.match(migration, /Two independent approvals completed/);

// Existing pending packages gain Kay without creating a duplicate package.
assert.match(migration, /update public\.payroll_pay_packages p[\s\S]*approval_state='pending'/);
assert.match(migration, /not exists\(select 1 from jsonb_array_elements\(p\.approval_steps\)/);

// The review UI exposes the action to the signed-in assigned approver.
assert.match(page, /step\.status === "Pending" && step\.userId === user\?\.id/);
assert.match(page, /Two-person approval is required/);

console.log("Passed focused alternative pay-package approver checks.");
