import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  builderLandingMode,
  isSecureDocumentLink,
  payFrequencySummary,
} from "../modules/payroll/payPackageWorkspaceModel.ts";

const builder = await fs.readFile(
  new URL("../modules/payroll/PayPackageBuilder.tsx", import.meta.url),
  "utf8",
);
const page = await fs.readFile(
  new URL("../modules/payroll/PayPackagesPage.tsx", import.meta.url),
  "utf8",
);

const approvedPackage = {
  id: "approved-1",
  scope_id: "bakebe-sm-aura",
  engagement_key: "employee",
  stream: "employee_payroll",
  effective_from: "2026-09-01",
  status: "approved",
};

// 1. An approved employee lands on the current-package summary, not an empty correction draft.
assert.equal(builderLandingMode([approvedPackage]), "current");
assert.match(builder, /Active pay package/);
assert.match(builder, /Approved compensation is active/);
assert.match(builder, /Create salary change/);

// 2. Search results are directly clickable and Enter opens the first result.
assert.match(page, /Click a person, or press Enter to open the first result/);
assert.match(page, /onClick=\{\(\) => select\(item\.id\)\}/);
assert.match(page, /event\.key === "Enter"/);

// 3. Monthly salary is clearly separated from the twice-monthly release schedule.
assert.equal(
  payFrequencySummary("Monthly"),
  "Monthly salary · released twice monthly on the 5th and 20th",
);
assert.match(builder, /Paid twice monthly/);
assert.match(builder, /11–25 → release on the 5th/);
assert.match(builder, /26–10 → release on the 20th/);

// 4. Supporting evidence accepts secure links as well as uploads.
assert.equal(isSecureDocumentLink("https://drive.google.com/file/test"), true);
assert.equal(isSecureDocumentLink("http://example.com/file"), false);
assert.equal(isSecureDocumentLink("not-a-url"), false);
assert.match(builder, /Add secure document link/);
assert.match(builder, /supportingDocumentLink: documentLink\.trim\(\)/);

// 5. Approved-package viewing avoids false review warnings for payroll-calculated values.
assert.match(builder, /Estimated amount per payout/);
assert.match(builder, /Package total before payroll deductions/);
assert.match(builder, /The final take-home pay is calculated during each payroll run/);
assert.match(builder, /Approval &amp; source details/);
assert.match(builder, /shortReference/);

console.log("Passed 5 focused Pay Package usability tests.");
