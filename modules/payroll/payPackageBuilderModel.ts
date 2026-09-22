import type { ComponentClassification, PayComponent, Treatment } from "./payPackages";

const number = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const rounded = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const componentClassification = (component: PayComponent): ComponentClassification => {
  if (component.classification) return component.classification;
  if (component.category === "reimbursable_allowance" || component.legacyField === "reimbursable") return "receipt_based";
  if (["service_charge", "variable_pay"].includes(component.category || "")) return "conditional";
  if (["employee_deduction", "employee_paid_benefit", "employer_paid_benefit", "employer_contribution"].includes(component.category || "")) return "payroll_calculated";
  if (component.category === "de_minimis" || component.legacyField === "deminimis") return "guaranteed_benefit";
  return "guaranteed";
};

export const classificationLabels: Record<ComponentClassification, string> = {
  guaranteed: "Guaranteed",
  guaranteed_benefit: "Guaranteed benefit",
  conditional: "Conditional",
  receipt_based: "Receipt required",
  payroll_calculated: "Payroll-calculated",
};

export const componentTaxLabel = (component: PayComponent) =>
  component.taxTreatment === "non_taxable" ? "Non-taxable" : component.taxTreatment === "reimbursable" ? "Based on reimbursement policy" : component.taxTreatment === "taxable" ? "Taxable" : "Tax treatment required";

export const includedInGuaranteedPay = (component: PayComponent) =>
  component.includedInGuaranteedPay ?? ["guaranteed", "guaranteed_benefit"].includes(componentClassification(component));

export type PackagePreviewInput = { baseAmount: string | number; components: PayComponent[]; treatment: Treatment; employeeTax?: string | number | null; employerTax?: string | number | null; thirteenthMonthAccrual?: string | number | null; otherEmployerCosts?: string | number | null };
export type PackagePreview = {
  guaranteedMonthlyPay: number; conditionalMaximum: number; reimbursableMaximum: number; estimatedEmployeeDeductions: number; estimatedEmployerContributions: number; estimatedEmployerTax: number; estimatedCompanyCost: number; approvedGrossAmount: number; targetNetAmount: number; grossUpAmount: number;
  employee: { basic: number; taxableAllowances: number; deMinimis: number; reimbursements: number; serviceCharge: number; employeeTax: number; employeeBenefits: number; deductions: number; estimatedNet: number };
  company: { grossEmployeePay: number; employerTax: number; employerContributions: number; employerBenefits: number; companyPaidEmployeeShare: number; thirteenthMonthAccrual: number; serviceCharge: number; otherEmployerCosts: number; totalActualCost: number };
  employerPays: number; pending: string[]; excludedReimbursements: number;
};

export function calculatePackagePreview(input: PackagePreviewInput): PackagePreview {
  const base = number(input.baseAmount);
  let guaranteedComponents = 0, conditionalMaximum = 0, reimbursableMaximum = 0, taxableAllowances = 0, deMinimis = 0, serviceCharge = 0, employeeBenefits = 0, componentDeductions = 0, componentEmployerContributions = 0, employerBenefits = 0, companyPaidEmployeeShare = 0;
  const pending: string[] = [];
  for (const component of input.components.filter((item) => item.status !== "rejected" && item.status !== "not_payable")) {
    const value = number(component.amount);
    const classification = componentClassification(component);
    if (includedInGuaranteedPay(component)) guaranteedComponents += value;
    if (classification === "conditional") conditionalMaximum += value;
    if (classification === "receipt_based") reimbursableMaximum += value;
    if (component.category === "de_minimis") deMinimis += value;
    else if (component.category === "service_charge") serviceCharge += value;
    else if (component.category === "employee_deduction") componentDeductions += value;
    else if (component.category === "employer_contribution") componentEmployerContributions += number(component.employerShare || value);
    else if (component.category === "employee_paid_benefit") { employeeBenefits += number(component.employeeShare || value); employerBenefits += number(component.employerShare); }
    else if (component.category === "employer_paid_benefit") employerBenefits += number(component.employerShare || value);
    else if (classification !== "receipt_based") taxableAllowances += value;
    if (component.policyLimit && value > number(component.policyLimit)) pending.push(`${component.name || "Component"}: exceeds policy limit`);
    companyPaidEmployeeShare += number(component.companyPaidEmployeeShare);
    if (!component.taxTreatment || component.taxTreatment === "pending") pending.push(`${component.name || "Component"}: tax treatment required`);
  }
  const estimatedEmployeeDeductions = number(input.treatment.estimatedEmployeeDeductions ?? input.employeeTax);
  const estimatedEmployerContributions = number(input.treatment.estimatedEmployerContributions) + componentEmployerContributions;
  const estimatedEmployerTax = number(input.treatment.estimatedEmployerTax ?? input.employerTax);
  const expectedReimbursement = number(input.treatment.expectedReimbursableCost || reimbursableMaximum);
  const guaranteedMonthlyPay = base + guaranteedComponents;
  const targetNetAmount = number(input.treatment.netTarget) || base;
  const netBasis = ["net_tax", "net_all"].includes(input.treatment.coverageMode || input.treatment.payBasis);
  const approvedGrossAmount = netBasis ? targetNetAmount + estimatedEmployeeDeductions : guaranteedMonthlyPay;
  const grossUpAmount = Math.max(approvedGrossAmount - guaranteedMonthlyPay, 0);
  const otherEmployerCosts = number(input.otherEmployerCosts);
  const thirteenthMonthAccrual = input.thirteenthMonthAccrual == null ? 0 : number(input.thirteenthMonthAccrual);
  const estimatedCompanyCost = guaranteedMonthlyPay + conditionalMaximum + estimatedEmployerContributions + estimatedEmployerTax + employerBenefits + companyPaidEmployeeShare + expectedReimbursement + thirteenthMonthAccrual + otherEmployerCosts;
  const approvedReimbursements = input.components.reduce((total, component) => total + (componentClassification(component) === "receipt_based" && component.receiptStatus === "approved_and_payable" ? number(component.amount) : 0), 0);
  return {
    guaranteedMonthlyPay: rounded(guaranteedMonthlyPay), conditionalMaximum: rounded(conditionalMaximum), reimbursableMaximum: rounded(reimbursableMaximum), estimatedEmployeeDeductions: rounded(estimatedEmployeeDeductions), estimatedEmployerContributions: rounded(estimatedEmployerContributions), estimatedEmployerTax: rounded(estimatedEmployerTax), estimatedCompanyCost: rounded(estimatedCompanyCost), approvedGrossAmount: rounded(approvedGrossAmount), targetNetAmount: rounded(targetNetAmount), grossUpAmount: rounded(grossUpAmount),
    employee: { basic: rounded(base), taxableAllowances: rounded(taxableAllowances), deMinimis: rounded(deMinimis), reimbursements: rounded(approvedReimbursements), serviceCharge: rounded(serviceCharge), employeeTax: rounded(estimatedEmployeeDeductions), employeeBenefits: rounded(employeeBenefits), deductions: rounded(componentDeductions), estimatedNet: rounded(approvedGrossAmount - estimatedEmployeeDeductions - employeeBenefits - componentDeductions) },
    company: { grossEmployeePay: rounded(guaranteedMonthlyPay), employerTax: rounded(estimatedEmployerTax), employerContributions: rounded(estimatedEmployerContributions), employerBenefits: rounded(employerBenefits), companyPaidEmployeeShare: rounded(companyPaidEmployeeShare), thirteenthMonthAccrual: rounded(thirteenthMonthAccrual), serviceCharge: rounded(serviceCharge), otherEmployerCosts: rounded(otherEmployerCosts), totalActualCost: rounded(estimatedCompanyCost) },
    employerPays: rounded(estimatedEmployerContributions + estimatedEmployerTax + employerBenefits + companyPaidEmployeeShare + expectedReimbursement + thirteenthMonthAccrual + otherEmployerCosts), pending: [...new Set(pending)], excludedReimbursements: rounded(Math.max(reimbursableMaximum - approvedReimbursements, 0)),
  };
}

export function validatePayPackage(input: PackagePreviewInput): string[] {
  const errors: string[] = [];
  if (number(input.baseAmount) <= 0) errors.push("Basic salary must have an amount.");
  const names = new Set<string>();
  input.components.forEach((component, index) => {
    const label = component.name.trim() || `Component ${index + 1}`;
    if (!component.name.trim()) errors.push(`Component ${index + 1} needs a name.`);
    if (component.amount === "" || number(component.amount) < 0) errors.push(`${label} needs an exact amount, including ₱0.00 when intentional.`);
    if (!component.taxTreatment || component.taxTreatment === "pending") errors.push(`${label} needs a tax treatment.`);
    if (componentClassification(component) === "receipt_based" && !component.receiptRequired) errors.push(`${label} needs a receipt rule.`);
    const key = `${component.name.trim().toLowerCase()}:${component.category}`;
    if (names.has(key)) errors.push(`${label} is duplicated.`);
    names.add(key);
  });
  const basis = input.treatment.coverageMode || input.treatment.payBasis;
  if (["net_tax", "net_all"].includes(basis)) {
    if (number(input.treatment.netTarget) <= 0) errors.push("Net target pay needs an exact amount.");
    if (!input.treatment.arrangementRef?.trim()) errors.push("Net target pay needs an approved gross-up source.");
  }
  if (basis === "gross_selected" && !input.components.some((component) => component.employerPaidTax)) errors.push("Select at least one component for employer-paid tax.");
  return [...new Set(errors)];
}

export const payBasisOptions = [
  { value: "gross", label: "Gross pay", description: "The approved gross amount is fixed. Tax and statutory deductions are calculated per payroll run." },
  { value: "net_tax", label: "Net target pay", description: "The target net is fixed; the system shows the required gross-up and employer cost." },
  { value: "gross_selected", label: "Employer-paid tax on selected components", description: "Choose exactly which components receive employer-paid tax treatment." },
  { value: "net_all", label: "Net after selected benefits and deductions", description: "Show the target net and the approved benefits or deductions used to reach it." },
] as const;

export function arrangementSummary(treatment: Treatment) {
  const basis = treatment.coverageMode || treatment.payBasis || "gross";
  if (basis === "net_tax") return "Net target pay with documented gross-up.";
  if (basis === "net_all") return "Net target after selected benefits and approved deductions.";
  if (basis === "gross_selected") return "Gross pay with employer-paid tax on selected components only.";
  if (treatment.taxCoverage === "selected_components") return `Employer covers tax on selected components. ${treatment.benefitResponsibility === "employee" ? "Other benefits remain employee-paid." : "Benefit responsibility follows the approved package."}`;
  return "Gross pay; statutory deductions are calculated per payroll run.";
}
