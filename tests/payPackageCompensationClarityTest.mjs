import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

async function load(path) {
  const source = await fs.readFile(new URL(path, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const { calculatePackagePreview, componentClassification, validatePayPackage } = await load("../modules/payroll/payPackageBuilderModel.ts");
const fixed = { name: "Fixed allowance", amount: "3000", category: "fixed_allowance", frequency: "Monthly", recurrence: "recurring", legacyField: "", payableDate: "", classification: "guaranteed", includedInGuaranteedPay: true, affectsEmployerCost: true, taxTreatment: "taxable" };
const deminimis = { ...fixed, name: "De minimis", amount: "1500", category: "de_minimis", classification: "guaranteed_benefit", taxTreatment: "non_taxable" };
const reimbursable = { ...fixed, name: "Transport reimbursement", amount: "2000", category: "reimbursable_allowance", classification: "receipt_based", includedInGuaranteedPay: false, receiptRequired: true, receiptStatus: "receipt_required", taxTreatment: "reimbursable" };
const treatment = { payBasis: "gross", coverageMode: "gross", estimatedEmployeeDeductions: "2500", estimatedEmployerContributions: "5700", estimatedEmployerTax: "0", expectedReimbursableCost: "2000" };
const preview = calculatePackagePreview({ baseAmount: "40000", components: [fixed, deminimis, reimbursable], treatment });

assert.equal(preview.guaranteedMonthlyPay, 44500);
assert.equal(preview.reimbursableMaximum, 2000);
assert.equal(preview.estimatedEmployeeDeductions, 2500);
assert.equal(preview.estimatedEmployerContributions, 5700);
assert.equal(preview.estimatedCompanyCost, 52200);
assert.equal(componentClassification(reimbursable), "receipt_based");
assert.deepEqual(validatePayPackage({ baseAmount: "40000", components: [fixed, deminimis, reimbursable], treatment }), []);

const invalid = validatePayPackage({ baseAmount: "40000", components: [{ ...fixed, name: "", amount: "", taxTreatment: "pending" }], treatment });
assert(invalid.some((message) => message.includes("needs a name")));
assert(invalid.some((message) => message.includes("exact amount")));
assert(invalid.some((message) => message.includes("tax treatment")));

const builder = await fs.readFile(new URL("../modules/payroll/PayPackageBuilder.tsx", import.meta.url), "utf8");
const approval = await fs.readFile(new URL("../components/payroll/PayPackageApprovalModal.tsx", import.meta.url), "utf8");
for (const phrase of ["Guaranteed monthly pay", "Reimbursable maximum", "Estimated total monthly company cost", "Exact compensation breakdown", "＋ Add consultant-fee arrangement", "HR Manager — Jedidiah", "Finance — Lenny Rose Casas"]) assert.match(builder, new RegExp(phrase));
assert.match(approval, /fetchPayPackages\(item\.employeeId\)/);
assert.match(approval, /Exact compensation breakdown/);

console.log("Passed exact-compensation builder, detail, and approval checks.");
