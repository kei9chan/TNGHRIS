import { supabase } from "../../services/supabaseClient";

export const treatmentFields = [
  ["tax", "Taxable base"],
  ["sss", "SSS base"],
  ["philhealth", "PhilHealth base"],
  ["pagibig", "Pag-IBIG base"],
  ["thirteenthMonth", "13th-month base"],
  ["proration", "Proration"],
] as const;
export type Treatment = Record<string, string>;
export type ComponentCategory =
  | "de_minimis"
  | "fixed_allowance"
  | "reimbursable_allowance"
  | "service_charge"
  | "variable_pay"
  | "employee_deduction"
  | "employee_paid_benefit"
  | "employer_paid_benefit"
  | "employer_contribution"
  | "other";
export type Responsibility = "employee" | "employer" | "split";
export type ReceiptStatus =
  | "receipt_required"
  | "receipt_submitted"
  | "under_review"
  | "approved_and_payable"
  | "rejected"
  | "not_payable";
export type PayComponent = {
  tax?: string;
  sss?: string;
  philhealth?: string;
  pagibig?: string;
  thirteenthMonth?: string;
  proration?: string;
  name: string;
  amount: string;
  recurrence: string;
  legacyField: string;
  payableDate: string;
  category?: ComponentCategory;
  frequency?: string;
  paidBy?: Responsibility;
  taxTreatment?: "taxable" | "non_taxable" | "reimbursable" | "pending";
  employeeShare?: string;
  employerShare?: string;
  companyPaidEmployeeShare?: string;
  effectiveDate?: string;
  eligibilityRule?: string;
  policyRef?: string;
  policyLimit?: string;
  receiptRequired?: boolean;
  receiptStatus?: ReceiptStatus;
  documentRef?: string;
  status?: string;
};
export type PayPackageDocument = {
  id: string;
  path: string;
  name: string;
  uploadedAt: string;
};
export type PayPackage = {
  id: string;
  scope_id: string;
  engagement_key: string;
  stream: string;
  effective_from: string;
  effective_until: string | null;
  rate_type: string;
  base_amount: string | number;
  components: PayComponent[];
  treatment: Treatment;
  tax_profile_ref: string | null;
  status: string;
  source_ref: string;
  reason: string;
  approved_at: string | null;
  source_pan_id: string | null;
  documents?: PayPackageDocument[];
  source_kind?:
    "approved_pan" | "direct_entry" | "copied_package" | "correction";
  source_metadata?: {
    label?: string;
    panReference?: string;
    panApprovalDate?: string;
    approvers?: Array<{
      userId: string;
      name: string;
      role: string;
      approvedAt?: string;
    }>;
    sourceDocument?: { label: string; url: string };
    effectiveDate?: string;
  };
  version_no?: number;
  correction_of_id?: string | null;
  approval_state?: "draft" | "pending" | "approved" | "returned" | "rejected";
  approval_steps?: Array<{
    userId: string;
    name: string;
    role: string;
    status: string;
    timestamp?: string;
    notes?: string;
  }>;
};
export type PayScope = {
  id: string;
  name: string;
  businessUnitId?: string | null;
  canEdit: boolean;
  canApprove: boolean;
  employeePayroll?: boolean;
};
export type PayDirectoryEntry = {
  id: string;
  name: string;
  employeeCode: string;
  businessUnit?: string;
  businessUnitId?: string | null;
  department?: string;
  departmentId?: string | null;
  status?: string;
};
export type PayContext = {
  employeeId: string;
  name: string;
  isSelf: boolean;
  managed: boolean;
  scopeId: string;
  canEdit: boolean;
  canApprove: boolean;
  sourceHash: string | null;
  scopes: PayScope[];
  legacy: {
    rateType: string | null;
    rateAmount: number | null;
    salaryBasic: number | null;
    deminimis: number | null;
    reimbursable: number | null;
    taxStatus: string | null;
  };
  packages: PayPackage[];
  sources: {
    id: string | null;
    label: string;
    baseAmount: number | null;
    rateType: string | null;
    deminimis: number | null;
    reimbursable: number | null;
    payBasis?: "gross" | "net_tax";
    effectiveFrom?: string;
    conflict: boolean;
  }[];
  sourceMatches: boolean | null;
  settings: {
    id: string;
    effective_from: string;
    holiday_handling: string;
    policy_ref: string;
    calendar: {
      startDay: number;
      endDay: number;
      payDay: number;
      payMonthOffset: number;
    }[];
  }[];
  bank: {
    bankName: string;
    accountLast4: string;
    accountType: string;
    fingerprint: string;
    canVerify: boolean;
    verified: boolean;
  } | null;
};

async function rpc<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const fetchPayDirectory = () =>
  rpc<PayDirectoryEntry[]>("get_payroll_package_directory");
export const fetchPayPackages = (id: string) =>
  rpc<PayContext>("get_payroll_pay_packages", { p_employee_id: id });
export const savePayPackage = (
  id: string,
  scope: string,
  payload: Record<string, unknown>,
  hash: string,
) =>
  rpc<string>("save_payroll_pay_package", {
    p_employee_id: id,
    p_scope_id: scope,
    p_package: payload,
    p_source_hash: hash,
  });
export const reviewPayPackage = (
  id: string,
  approve: boolean,
  reason: string,
) =>
  rpc<void>("review_payroll_pay_package", {
    p_package_id: id,
    p_approve: approve,
    p_reason: reason,
  });
export const submitPayPackageDraft = (id: string) =>
  rpc<void>("submit_payroll_pay_package_draft", {
    p_package_id: id,
  });
export const updatePayPackageDraft = (
  id: string,
  scope: string,
  payload: Record<string, unknown>,
  hash: string,
) =>
  rpc<void>("update_payroll_pay_package_draft", {
    p_package_id: id,
    p_scope_id: scope,
    p_package: payload,
    p_source_hash: hash,
  });
export const verifyPaymentDetails = (
  id: string,
  fingerprint: string,
  source: string,
) =>
  rpc<void>("verify_payroll_payment_details", {
    p_employee_id: id,
    p_fingerprint: fingerprint,
    p_source_ref: source,
  });
export const savePaySettings = (
  scope: string,
  date: string,
  calendar: unknown,
  holiday: string,
  source: string,
) =>
  rpc<string>("save_payroll_pay_settings", {
    p_scope_id: scope,
    p_effective_from: date,
    p_calendar: calendar,
    p_holiday_handling: holiday,
    p_policy_ref: source,
  });

export async function uploadPayPackageDocument(packageId: string, file: File) {
  const safe =
    file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-180) ||
    "supporting-document";
  const path = `${packageId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage
    .from("payroll-pay-package-documents")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error)
    throw new Error(`Supporting document upload failed: ${error.message}`);
  try {
    return await rpc<string>("attach_payroll_pay_package_document", {
      p_package_id: packageId,
      p_path: path,
      p_name: file.name,
    });
  } catch (error) {
    await supabase.storage.from("payroll-pay-package-documents").remove([path]);
    throw error;
  }
}

export async function openPayPackageDocument(path: string) {
  const { data, error } = await supabase.storage
    .from("payroll-pay-package-documents")
    .createSignedUrl(path, 60);
  if (error || !data?.signedUrl)
    throw new Error(
      error?.message || "Supporting document could not be opened.",
    );
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export const emptyTreatment = (): Treatment => ({
  ...Object.fromEntries(treatmentFields.map(([key]) => [key, "unreviewed"])),
  payBasis: "gross",
  taxResponsibility: "employee",
  taxCoverage: "entire_package",
  benefitResponsibility: "employee",
  calculationVersion: "pay-package-builder-v1",
});
export const newComponent = (
  category: ComponentCategory = "fixed_allowance",
): PayComponent => ({
  ...emptyTreatment(),
  name: "",
  amount: "",
  recurrence: "recurring",
  legacyField: "",
  payableDate: "",
  category,
  frequency: "Monthly",
  paidBy: "employer",
  taxTreatment:
    category === "de_minimis"
      ? "non_taxable"
      : category === "reimbursable_allowance"
        ? "reimbursable"
        : "taxable",
  employeeShare: "0",
  employerShare: "0",
  companyPaidEmployeeShare: "0",
  effectiveDate: "",
  eligibilityRule: "All eligible employees",
  policyRef: "",
  policyLimit: "",
  receiptRequired: category === "reimbursable_allowance",
  receiptStatus:
    category === "reimbursable_allowance" ? "receipt_required" : undefined,
  documentRef: "",
  status: "active",
});
export const treatmentPending = (treatment: Treatment) =>
  treatmentFields.some(
    ([key]) => !treatment[key] || treatment[key] === "unreviewed",
  );
