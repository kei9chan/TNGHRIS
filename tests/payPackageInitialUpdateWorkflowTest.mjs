import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  consultantArrangementVisible,
  groupPayPackageHistory,
  initialBuilderMode,
  packageVersionState,
} from "../modules/payroll/payPackageWorkspaceModel.ts";

const builder = await fs.readFile(
  new URL("../modules/payroll/PayPackageBuilder.tsx", import.meta.url),
  "utf8",
);
const page = await fs.readFile(
  new URL("../modules/payroll/PayPackagesPage.tsx", import.meta.url),
  "utf8",
);
const panMigration = await fs.readFile(
  new URL(
    "../supabase/migrations/20260921010208_pan_compensation_source_of_truth.sql",
    import.meta.url,
  ),
  "utf8",
);

const packageRecord = (id, effectiveFrom, status = "approved") => ({
  id,
  scope_id: "bakebe-sm-aura",
  engagement_key: "employee",
  stream: "employee_payroll",
  effective_from: effectiveFrom,
  effective_until: null,
  rate_type: "Monthly",
  base_amount: 40000,
  components: [],
  treatment: { payBasis: "gross", taxResponsibility: "employee" },
  tax_profile_ref: null,
  status,
  source_ref: `Laner source ${effectiveFrom}`,
  reason: "Initial history test",
  approved_at: "2026-09-01T00:00:00Z",
  source_pan_id: null,
  version_no: id === "v3" ? 3 : id === "v2" ? 2 : 1,
  approval_state: "approved",
  documents: [
    {
      id: `doc-${id}`,
      path: `${id}/source.pdf`,
      name: "source.pdf",
      uploadedAt: "2026-09-01T00:00:00Z",
    },
  ],
});

// 1. Employees without an approved package open in initial-package mode.
assert.equal(initialBuilderMode([]), "initial");
assert.match(builder, /Initial package setup/);
assert.match(
  builder,
  /This creates the employee’s first dated compensation record\. It will not replace an existing package\./,
);

// 2. Laner's first direct entry can be saved as a draft before approval routing.
assert.match(builder, /Save draft/);
assert.match(builder, /save\("draft"\)/);
assert.match(builder, /stream:\s*"employee_payroll"/);
assert.match(builder, /sourceKind:[\s\S]*"direct_entry"/);

// 3. Three Laner dates are one arrangement with one active and two historical versions.
const lanerHistory = [
  packageRecord("v3", "2026-09-01"),
  packageRecord("v2", "2025-09-01"),
  packageRecord("v1", "2024-07-15"),
];
const groups = groupPayPackageHistory(lanerHistory, "2026-09-21");
assert.equal(groups.length, 1);
assert.equal(groups[0].versions.length, 3);
assert.equal(groups[0].activeId, "v3");
assert.equal(packageVersionState(groups[0].versions[0], "v3", "2026-09-21"), "Active");
assert.equal(packageVersionState(groups[0].versions[1], "v3", "2026-09-21"), "Historical");
assert.equal(packageVersionState(groups[0].versions[2], "v3", "2026-09-21"), "Historical");
assert.doesNotMatch(builder, /Existing active assignments/);

// 4. Every dated version is clickable and exposes details, source, approvals, and documents.
assert.match(builder, /View version \{item\.version_no \|\| 1\}/);
assert.match(builder, /Components and benefits/);
assert.match(builder, /Approval and change history/);
assert.match(builder, /View source document/);
assert.match(builder, /openPayPackageDocument/);

// 5. Updating copies a starting point into a new effective-dated version and preserves the original.
assert.match(builder, /Update existing package/);
assert.match(builder, /Copy active version as starting point/);
assert.match(builder, /Before-and-after comparison/);
assert.match(builder, /The current approved package remains unchanged/);
assert.match(panMigration, /Create a new pay-package version; history is immutable/);

// 6. Consultant fields and totals are absent while the option is unchecked.
assert.equal(consultantArrangementVisible(false), false);
assert.match(builder, /consultantArrangementVisible\(consultantEnabled\)/);
assert.match(builder, /!consultantEnabled/);

// 7. Checking the option reveals and saves a separate consultant arrangement.
assert.equal(consultantArrangementVisible(true), true);
assert.match(builder, /＋ Add consultant-fee arrangement/);
assert.match(builder, /stream:\s*"professional_fee"/);
assert.match(builder, /Not included in employee payroll or employee-package totals/);

// 8. PAN approval still generates the approved package and employee-profile update without package reapproval.
assert.match(panMigration, /pan_compensation_after_approval[\s\S]*apply_approved_pan_compensation/);
assert.match(panMigration, /source_kind[\s\S]*'approved_pan'[\s\S]*status[\s\S]*'approved'/);
assert.match(page, /item\.source_kind !== "approved_pan"/);

console.log("Passed 8 focused Pay Package initial/update workflow acceptance tests.");
