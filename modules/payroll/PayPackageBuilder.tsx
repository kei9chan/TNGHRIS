import React, { useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import {
  arrangementSummary,
  calculatePackagePreview,
  payBasisOptions,
} from "./payPackageBuilderModel";
import {
  ComponentCategory,
  emptyTreatment,
  newComponent,
  PayComponent,
  PayContext,
  PayDirectoryEntry,
  PayPackage,
  openPayPackageDocument,
  savePayPackage,
  submitPayPackageDraft,
  Treatment,
  uploadPayPackageDocument,
} from "./payPackages";
import {
  builderLandingMode,
  consultantArrangementVisible,
  groupPayPackageHistory,
  initialBuilderMode,
  isSecureDocumentLink,
  packageVersionState,
  payFrequencySummary,
} from "./payPackageWorkspaceModel";

const field =
  "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white";
const money = (value: number | string | null | undefined) =>
  value == null
    ? "Pending"
    : `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const categoryLabels: Record<ComponentCategory, string> = {
  de_minimis: "De minimis benefits",
  fixed_allowance: "Fixed allowance",
  reimbursable_allowance: "Reimbursable allowance",
  service_charge: "Service charge",
  variable_pay: "Variable pay",
  employee_deduction: "Employee deduction",
  employee_paid_benefit: "Employee-paid benefit",
  employer_paid_benefit: "Employer-paid benefit",
  employer_contribution: "Employer contribution",
  other: "Other approved component",
};
const receiptLabels = {
  receipt_required: "Receipt required",
  receipt_submitted: "Receipt submitted",
  under_review: "Under review",
  approved_and_payable: "Approved and payable",
  rejected: "Rejected",
  not_payable: "Not payable",
} as const;

const Label: React.FC<{
  title: string;
  children: React.ReactNode;
  hint?: string;
}> = ({ title, children, hint }) => (
  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
    <span>{title}</span>
    {children}
    {hint && (
      <span className="mt-1 block text-xs font-normal text-slate-500">
        {hint}
      </span>
    )}
  </label>
);
const Segmented: React.FC<{
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}> = ({ value, options, onChange }) => (
  <div className="grid overflow-hidden rounded-lg border border-slate-300 bg-slate-50 sm:grid-flow-col dark:border-slate-600 dark:bg-slate-900">
    {options.map((option) => (
      <button
        type="button"
        key={option.value}
        onClick={() => onChange(option.value)}
        className={`min-h-11 px-3 py-2 text-sm font-semibold ${value === option.value ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"}`}
      >
        {option.label}
      </button>
    ))}
  </div>
);
const StatusChip: React.FC<{
  tone: "green" | "amber" | "red" | "gray" | "violet";
  children: React.ReactNode;
}> = ({ tone, children }) => {
  const tones = {
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-rose-100 text-rose-800",
    gray: "bg-slate-100 text-slate-700",
    violet: "bg-violet-100 text-violet-800",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
};

const ComponentEditor: React.FC<{
  components: PayComponent[];
  onChange: (components: PayComponent[]) => void;
}> = ({ components, onChange }) => {
  const [adding, setAdding] = useState<ComponentCategory | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const update = (index: number, patch: Partial<PayComponent>) =>
    onChange(
      components.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const add = (category: ComponentCategory) => {
    const next = newComponent(category);
    next.name = categoryLabels[category].replace(
      / benefits?| allowance| component/g,
      "",
    );
    onChange([...components, next]);
    setEditing(components.length);
    setAdding(null);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Components & benefits</h3>
          <p className="text-sm text-slate-500">
            Add only approved amounts. Receipt-gated items stay outside payable
            totals until approved.
          </p>
        </div>
        <Button onClick={() => setAdding(adding ? null : "fixed_allowance")}>
          + Add component
        </Button>
      </div>
      {adding && (
        <div className="grid gap-2 rounded-xl border border-violet-200 bg-violet-50 p-4 sm:grid-cols-2 lg:grid-cols-3 dark:border-violet-800 dark:bg-violet-950/30">
          {(Object.keys(categoryLabels) as ComponentCategory[]).map(
            (category) => (
              <button
                type="button"
                onClick={() => add(category)}
                className="rounded-lg border bg-white p-3 text-left text-sm font-semibold hover:border-violet-500 dark:bg-slate-800"
                key={category}
              >
                {categoryLabels[category]}
              </button>
            ),
          )}
        </div>
      )}
      {components.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No additional components yet. Basic pay remains separate.
        </div>
      )}
      <div className="space-y-3">
        {components.map((component, index) => {
          const reimbursement =
            component.category === "reimbursable_allowance" ||
            component.legacyField === "reimbursable";
          const deminimis =
            component.category === "de_minimis" ||
            component.legacyField === "deminimis";
          const benefit = [
            "employee_paid_benefit",
            "employer_paid_benefit",
            "employer_contribution",
          ].includes(component.category || "");
          const over =
            deminimis &&
            Number(component.policyLimit || 0) > 0 &&
            Number(component.amount || 0) > Number(component.policyLimit);
          return (
            <section
              key={index}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold">
                      {component.name ||
                        categoryLabels[component.category || "other"]}
                    </h4>
                    <StatusChip
                      tone={
                        component.taxTreatment === "non_taxable"
                          ? "green"
                          : reimbursement
                            ? "amber"
                            : "gray"
                      }
                    >
                      {reimbursement
                        ? receiptLabels[
                            component.receiptStatus || "receipt_required"
                          ]
                        : component.taxTreatment === "non_taxable"
                          ? "Non-taxable"
                          : "Taxable / review"}
                    </StatusChip>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {money(component.amount)} ·{" "}
                    {component.frequency || component.recurrence} ·{" "}
                    {component.paidBy || "employer"}-paid
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing(editing === index ? null : index)}
                  >
                    {editing === index ? "Done" : "Edit"}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      onChange(components.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
              {reimbursement &&
                component.receiptStatus !== "approved_and_payable" && (
                  <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                    Not included in payable amount until the receipt is
                    submitted and approved.
                  </p>
                )}
              {over && (
                <p
                  role="alert"
                  className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
                >
                  Configured amount exceeds the approved policy limit of{" "}
                  {money(component.policyLimit)}.
                </p>
              )}
              {editing === index && (
                <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-3 dark:border-slate-700">
                  <Label title="Component type">
                    <select
                      className={field}
                      value={component.category || "other"}
                      onChange={(e) =>
                        update(index, {
                          category: e.target.value as ComponentCategory,
                        })
                      }
                    >
                      {(Object.keys(categoryLabels) as ComponentCategory[]).map(
                        (category) => (
                          <option key={category} value={category}>
                            {categoryLabels[category]}
                          </option>
                        ),
                      )}
                    </select>
                  </Label>
                  <Label title="Component name">
                    <input
                      className={field}
                      value={component.name}
                      onChange={(e) => update(index, { name: e.target.value })}
                    />
                  </Label>
                  <Label title="Amount or maximum amount">
                    <input
                      className={field}
                      type="number"
                      min="0"
                      step="0.01"
                      value={component.amount}
                      onChange={(e) =>
                        update(index, { amount: e.target.value })
                      }
                    />
                  </Label>
                  <Label title="Frequency">
                    <select
                      className={field}
                      value={component.frequency || "Monthly"}
                      onChange={(e) =>
                        update(index, {
                          frequency: e.target.value,
                          recurrence:
                            e.target.value === "One time"
                              ? "one_time"
                              : "recurring",
                        })
                      }
                    >
                      {[
                        "Monthly",
                        "Per cutoff",
                        "Daily",
                        "Hourly",
                        "One time",
                        "Per invoice",
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </Label>
                  <Label title="Tax treatment">
                    <select
                      className={field}
                      value={component.taxTreatment || "pending"}
                      onChange={(e) =>
                        update(index, {
                          taxTreatment: e.target
                            .value as PayComponent["taxTreatment"],
                          tax:
                            e.target.value === "taxable"
                              ? "included"
                              : e.target.value === "non_taxable"
                                ? "excluded"
                                : "unreviewed",
                        })
                      }
                    >
                      <option value="taxable">Taxable</option>
                      <option value="non_taxable">Non-taxable</option>
                      <option value="reimbursable">Reimbursable</option>
                      <option value="pending">Needs review</option>
                    </select>
                  </Label>
                  <Label title="Paid by">
                    <select
                      className={field}
                      value={component.paidBy || "employer"}
                      onChange={(e) =>
                        update(index, {
                          paidBy: e.target.value as PayComponent["paidBy"],
                        })
                      }
                    >
                      <option value="employee">Employee</option>
                      <option value="employer">Employer</option>
                      <option value="split">Split</option>
                    </select>
                  </Label>
                  <Label title="Effective date">
                    <input
                      className={field}
                      type="date"
                      value={component.effectiveDate || ""}
                      onChange={(e) =>
                        update(index, { effectiveDate: e.target.value })
                      }
                    />
                  </Label>
                  <Label title="Eligibility rule">
                    <input
                      className={field}
                      value={component.eligibilityRule || ""}
                      onChange={(e) =>
                        update(index, { eligibilityRule: e.target.value })
                      }
                    />
                  </Label>
                  <Label title="Policy or source reference">
                    <input
                      className={field}
                      value={component.policyRef || ""}
                      onChange={(e) =>
                        update(index, { policyRef: e.target.value })
                      }
                    />
                  </Label>
                  {deminimis && (
                    <Label title="Applicable policy limit">
                      <input
                        className={field}
                        type="number"
                        min="0"
                        step="0.01"
                        value={component.policyLimit || ""}
                        onChange={(e) =>
                          update(index, { policyLimit: e.target.value })
                        }
                      />
                    </Label>
                  )}
                  {reimbursement && (
                    <>
                      <Label title="Receipt status">
                        <select
                          className={field}
                          value={component.receiptStatus || "receipt_required"}
                          onChange={(e) =>
                            update(index, {
                              receiptStatus: e.target
                                .value as PayComponent["receiptStatus"],
                            })
                          }
                        >
                          {Object.entries(receiptLabels).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      </Label>
                      <Label title="Receipt or document reference">
                        <input
                          className={field}
                          value={component.documentRef || ""}
                          onChange={(e) =>
                            update(index, { documentRef: e.target.value })
                          }
                        />
                      </Label>
                    </>
                  )}
                  {benefit && (
                    <>
                      <Label title="Employee share">
                        <input
                          className={field}
                          type="number"
                          min="0"
                          value={component.employeeShare || "0"}
                          onChange={(e) =>
                            update(index, { employeeShare: e.target.value })
                          }
                        />
                      </Label>
                      <Label title="Employer share">
                        <input
                          className={field}
                          type="number"
                          min="0"
                          value={component.employerShare || "0"}
                          onChange={(e) =>
                            update(index, { employerShare: e.target.value })
                          }
                        />
                      </Label>
                      <Label title="Company-paid employee share">
                        <input
                          className={field}
                          type="number"
                          min="0"
                          value={component.companyPaidEmployeeShare || "0"}
                          onChange={(e) =>
                            update(index, {
                              companyPaidEmployeeShare: e.target.value,
                            })
                          }
                        />
                      </Label>
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

const Review: React.FC<{
  base: string;
  components: PayComponent[];
  treatment: Treatment;
  stream: string;
  scopeName: string;
  consultantFee: string;
}> = ({ base, components, treatment, stream, scopeName, consultantFee }) => {
  const preview = useMemo(
    () => calculatePackagePreview({ baseAmount: base, components, treatment }),
    [base, components, treatment],
  );
  const Line: React.FC<{ label: string; value: number; pending?: boolean }> = ({
    label,
    value,
    pending,
  }) => (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-2 text-sm dark:border-slate-700">
      <span>{label}</span>
      <strong>{pending ? "Pending" : money(value)}</strong>
    </div>
  );
  if (stream === "professional_fee")
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/20">
        <StatusChip tone="amber">
          Separate professional-fee arrangement
        </StatusChip>
        <h3 className="mt-3 text-xl font-bold">
          {money(consultantFee)} per {treatment.payFrequency || "invoice"}
        </h3>
        <p className="mt-2 text-sm">
          {scopeName} · Invoice and reviewed consultant tax document required.
        </p>
        <p className="mt-4 rounded-lg bg-white p-3 text-sm dark:bg-slate-800">
          Not included in employee payroll or this employee-pay company-cost
          total.
        </p>
      </div>
    );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-emerald-50 p-5">
          <p className="text-sm text-emerald-800">Employee receives</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">
            {preview.pending.some((x) => x.includes("Employee-paid"))
              ? "Needs review"
              : money(preview.employee.estimatedNet)}
          </p>
        </div>
        <div className="rounded-xl bg-violet-50 p-5">
          <p className="text-sm text-violet-800">Employer pays</p>
          <p className="mt-1 text-2xl font-bold text-violet-900">
            {preview.pending.some((x) => x.includes("Employer-paid"))
              ? "Needs review"
              : money(preview.employerPays)}
          </p>
        </div>
        <div className="rounded-xl bg-slate-900 p-5 text-white">
          <p className="text-sm text-slate-300">Total actual company cost</p>
          <p className="mt-1 text-2xl font-bold">
            {preview.pending.some((x) => x.includes("Employer-paid"))
              ? "Needs review"
              : money(preview.company.totalActualCost)}
          </p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="What the employee receives">
          <Line label="Basic pay" value={preview.employee.basic} />
          <Line
            label="Taxable allowances"
            value={preview.employee.taxableAllowances}
          />
          <Line
            label="Non-taxable de minimis"
            value={preview.employee.deMinimis}
          />
          <Line
            label="Approved reimbursements"
            value={preview.employee.reimbursements}
          />
          <Line
            label="Employee-paid tax"
            value={preview.employee.employeeTax}
            pending={preview.pending.includes("Employee-paid income tax")}
          />
          <Line
            label="Employee-paid benefits"
            value={preview.employee.employeeBenefits}
          />
          <Line label="Other deductions" value={preview.employee.deductions} />
          <div className="mt-3 flex justify-between text-lg font-bold">
            <span>Estimated net pay</span>
            <span>
              {preview.pending.includes("Employee-paid income tax")
                ? "Needs review"
                : money(preview.employee.estimatedNet)}
            </span>
          </div>
        </Card>
        <Card title="What the company pays">
          <Line
            label="Gross employee pay"
            value={preview.company.grossEmployeePay}
          />
          <Line
            label="Employer-paid income tax"
            value={preview.company.employerTax}
            pending={preview.pending.includes("Employer-paid income tax")}
          />
          <Line
            label="Employer contributions"
            value={preview.company.employerContributions}
          />
          <Line
            label="Employer-paid benefits"
            value={preview.company.employerBenefits}
          />
          <Line
            label="Company-paid employee-share benefits"
            value={preview.company.companyPaidEmployeeShare}
          />
          <Line
            label="13th-month accrual"
            value={preview.company.thirteenthMonthAccrual}
          />
          <Line
            label="Service-charge cost"
            value={preview.company.serviceCharge}
          />
          <Line
            label="Other employer costs"
            value={preview.company.otherEmployerCosts}
          />
          <div className="mt-3 flex justify-between text-lg font-bold">
            <span>Total actual company cost</span>
            <span>
              {preview.pending.includes("Employer-paid income tax")
                ? "Needs review"
                : money(preview.company.totalActualCost)}
            </span>
          </div>
        </Card>
      </div>
      {preview.excludedReimbursements > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {money(preview.excludedReimbursements)} in reimbursements is excluded
          until receipt approval.
        </p>
      )}
      {preview.pending.length > 0 && (
        <p className="text-sm text-slate-500">
          Missing information remains marked Pending or Needs review; it is
          never treated as zero.
        </p>
      )}
    </div>
  );
};

type BuilderMode = "initial" | "update";

const sourceLabel = (item?: PayPackage) =>
  item?.source_kind === "approved_pan"
    ? "Generated from approved PAN"
    : item?.source_kind === "copied_package"
      ? "Copied from previous approved package"
      : item?.source_kind === "correction"
        ? "Correction requiring approval"
        : "Direct compensation entry";

const approvalLabel = (item?: PayPackage) => {
  if (!item) return "Draft";
  if (item.status === "rejected" || item.approval_state === "rejected")
    return "Rejected";
  if (item.approval_state === "returned") return "Needs correction";
  if (item.status === "draft" && item.approval_state === "pending")
    return "Pending approval";
  if (item.status === "draft") return "Draft";
  return item.status === "approved" ? "Approved" : "Historical";
};

const manilaToday = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${read("year")}-${read("month")}-${read("day")}`;
};

const PackageHistory: React.FC<{
  data: PayContext;
  employee?: PayDirectoryEntry;
  selected?: PayPackage;
  onSelect: (item: PayPackage) => void;
  onCopy: (item: PayPackage) => void;
}> = ({ data, employee, selected, onSelect, onCopy }) => {
  const today = manilaToday();
  const groups = useMemo(() => {
    return groupPayPackageHistory(data.packages, today);
  }, [data.packages, today]);
  const primaryScope = data.scopes.find((item) => item.id === data.scopeId);
  return (
    <aside className="space-y-4">
      <Card>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-lg font-bold text-violet-700">
            {data.name
              .split(/\s+/)
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{data.name}</h2>
            <p className="text-sm text-slate-500">
              {employee?.employeeCode || "Employee ID pending"}
            </p>
          </div>
        </div>
        <dl className="mt-4 space-y-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-700">
          <div>
            <dt className="text-slate-500">Business unit</dt>
            <dd className="font-semibold">
              {employee?.businessUnit || primaryScope?.name || "Pending"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Position / department</dt>
            <dd className="font-semibold">
              {employee?.department || "Employment details pending"}
            </dd>
          </div>
        </dl>
      </Card>
      <Card>
        <h2 className="font-bold">Package history</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          These are dated package versions, not simultaneous active packages.
          Only one version can be active for a specific date range.
        </p>
        {groups.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No package recorded yet. Start with the employee payroll package.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {groups.map(({ key, versions, activeId }) => {
              const newest = versions[0];
              const scopeName =
                data.scopes.find((scope) => scope.id === newest.scope_id)
                  ?.name || "Payroll scope";
              return (
                <section
                  key={key}
                  className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
                >
                  <div className="bg-slate-50 p-3 dark:bg-slate-900">
                    <p className="text-sm font-bold">{scopeName}</p>
                    <p className="text-xs text-slate-500">
                      {newest.stream === "professional_fee"
                        ? "Consultant fee"
                        : "Employee payroll"}
                      {newest.engagement_key &&
                      newest.engagement_key !== "employee"
                        ? ` · ${newest.engagement_key}`
                        : ""}
                    </p>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    {versions.map((item) => {
                      const active = item.id === activeId;
                      const versionStatus = packageVersionState(
                        item,
                        activeId,
                        today,
                      );
                      return (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => onSelect(item)}
                          className={`w-full p-3 text-left transition hover:bg-violet-50 dark:hover:bg-violet-950/20 ${selected?.id === item.id ? "bg-violet-50 ring-1 ring-inset ring-violet-500 dark:bg-violet-950/20" : ""}`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <strong className="text-sm">
                              {item.effective_from}
                            </strong>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? "bg-emerald-100 text-emerald-800" : versionStatus === "Historical" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800"}`}
                            >
                              {versionStatus}
                            </span>
                          </span>
                          <span className="mt-1 block text-sm font-semibold">
                            {money(item.base_amount)} / {item.rate_type}
                          </span>
                          <span className="mt-1 block text-xs font-semibold text-violet-700">
                            View version {item.version_no || 1} →
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {newest.stream === "employee_payroll" && (
                    <button
                      type="button"
                      onClick={() =>
                        onCopy(
                          activeId
                            ? versions.find((item) => item.id === activeId)!
                            : newest,
                        )
                      }
                      className="w-full border-t border-slate-200 px-3 py-2 text-left text-xs font-bold text-violet-700 hover:bg-violet-50 dark:border-slate-700"
                    >
                      Copy active version as starting point
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </Card>
    </aside>
  );
};

const VersionDetails: React.FC<{
  item: PayPackage;
  data: PayContext;
  onClose: () => void;
  onCopy: (item: PayPackage) => void;
  onSubmitDraft: (item: PayPackage) => void;
}> = ({ item, data, onClose, onCopy, onSubmitDraft }) => {
  const scope = data.scopes.find((value) => value.id === item.scope_id);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="package-version-title"
    >
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-violet-700">
              Package version {item.version_no || 1}
            </p>
            <h2 id="package-version-title" className="mt-1 text-2xl font-bold">
              {scope?.name || "Payroll scope"} · {item.effective_from}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {item.stream === "professional_fee"
                ? "Consultant fee"
                : "Employee payroll"} · {money(item.base_amount)} / {item.rate_type}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close package details"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-2 font-bold"
          >
            ×
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            ["Status", approvalLabel(item)],
            ["Effective date", item.effective_from],
            ["Effective until", item.effective_until || "Current / open-ended"],
            ["Package source", sourceLabel(item)],
            ["Tax treatment", arrangementSummary(item.treatment)],
            ["Source reference", item.source_ref || "Missing"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <section className="mt-5">
          <h3 className="font-bold">Components and benefits</h3>
          {item.components.length ? (
            <div className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
              {item.components.map((component, index) => (
                <div key={`${component.name}:${index}`} className="flex justify-between gap-4 p-3 text-sm">
                  <span>{component.name}</span>
                  <strong>{money(component.amount)} · {component.frequency || component.recurrence}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No additional components recorded.</p>
          )}
        </section>
        <section className="mt-5 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-700">
          <h3 className="font-bold">Approval and change history</h3>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            Approved {item.approved_at || "Pending"} · {sourceLabel(item)}
          </p>
          {item.source_metadata?.panReference && (
            <p className="mt-2 font-semibold">PAN reference: {item.source_metadata.panReference}</p>
          )}
          {!!item.approval_steps?.length && (
            <ul className="mt-3 space-y-2">
              {item.approval_steps.map((step) => (
                <li key={`${step.userId}:${step.role}`}>
                  {step.name} · {step.role} · {step.status}
                  {step.timestamp ? ` · ${step.timestamp}` : ""}
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="mt-5 flex flex-wrap gap-3">
          {item.source_pan_id && (
            <a className="font-semibold text-violet-700" href={`/employees/pan?item=${item.source_pan_id}`}>
              View approved PAN
            </a>
          )}
          {item.source_metadata?.sourceDocument?.url && (
            <a className="font-semibold text-violet-700" href={item.source_metadata.sourceDocument.url} target="_blank" rel="noreferrer">
              View source document
            </a>
          )}
          {item.treatment.supportingDocumentLink && (
            <a className="font-semibold text-violet-700" href={item.treatment.supportingDocumentLink} target="_blank" rel="noreferrer">
              Open document link
            </a>
          )}
          {item.documents?.map((document) => (
            <button
              type="button"
              className="font-semibold text-violet-700"
              key={document.id}
              onClick={() => void openPayPackageDocument(document.path)}
            >
              View {document.name}
            </button>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {item.status === "draft" && item.approval_state !== "pending" ? (
            <Button onClick={() => onSubmitDraft(item)}>
              Submit existing draft for approval
            </Button>
          ) : item.stream === "employee_payroll" && (
            <Button onClick={() => { onCopy(item); onClose(); }}>
              {item.source_kind === "approved_pan" ? "Create correction" : "Copy as starting point"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const CurrentPackageSummary: React.FC<{
  item: PayPackage;
  data: PayContext;
  onViewDetails: () => void;
  onUpdate: () => void;
}> = ({ item, data, onViewDetails, onUpdate }) => {
  const scope = data.scopes.find((value) => value.id === item.scope_id);
  const preview = calculatePackagePreview({
    baseAmount: item.base_amount,
    components: item.components,
    treatment: item.treatment,
  });
  const recurringComponents = item.components.filter(
    (component) => component.status !== "rejected" && component.status !== "not_payable",
  );
  return (
    <div className="space-y-5 xl:col-span-2">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold">Current approved package</h2>
              <StatusChip tone="green">Active</StatusChip>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {scope?.name || "Payroll scope"} · Effective {item.effective_from}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onViewDetails}>
              View full details
            </Button>
            <Button onClick={onUpdate}>Create package update</Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-violet-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Basic salary</p>
            <p className="mt-2 text-3xl font-bold text-violet-950">{money(item.base_amount)}</p>
            <p className="mt-1 text-sm text-violet-700">{payFrequencySummary(item.rate_type)}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Payroll availability</p>
            <p className="mt-2 text-xl font-bold text-emerald-950">Ready for payroll</p>
            <p className="mt-1 text-sm text-emerald-700">The approved package is the active compensation record.</p>
          </div>
          <div className="rounded-2xl bg-slate-900 p-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Package source</p>
            <p className="mt-2 text-xl font-bold">{sourceLabel(item)}</p>
            <p className="mt-1 text-sm text-slate-300">Version {item.version_no || 1} · Approved</p>
          </div>
        </div>

        <section className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-violet-950">Twice-monthly payroll schedule</p>
              <p className="mt-1 text-sm text-violet-700">The salary basis is monthly; payroll releases it across two cutoffs.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm font-semibold">
              <span className="rounded-full bg-white px-3 py-2 text-violet-800">11–25 cutoff → paid on the 5th</span>
              <span className="rounded-full bg-white px-3 py-2 text-violet-800">26–10 cutoff → paid on the 20th</span>
            </div>
          </div>
        </section>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">Compensation summary</h3>
            <StatusChip tone="green">Approved</StatusChip>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Basic pay</dt><dd className="font-bold">{money(item.base_amount)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Allowances and approved additions</dt><dd className="font-bold">{money(preview.employee.taxableAllowances + preview.employee.deMinimis + preview.employee.reimbursements + preview.employee.serviceCharge)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Known monthly package value</dt><dd className="font-bold text-emerald-700">{money(preview.company.grossEmployeePay + preview.company.serviceCharge)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Tax treatment</dt><dd className="max-w-[60%] text-right font-semibold">{arrangementSummary(item.treatment)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Employee deductions</dt><dd className="font-semibold">Calculated during payroll</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Employer contributions</dt><dd className="font-semibold">Calculated during payroll</dd></div>
          </dl>
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            Statutory tax and government contributions are calculated in the payroll run. Their absence here does not make this approved package incomplete.
          </p>
        </Card>
        <Card>
          <h3 className="text-lg font-bold">Components and documents</h3>
          {recurringComponents.length ? (
            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-700">
              {recurringComponents.map((component, index) => (
                <div className="flex items-center justify-between gap-3 py-3 text-sm" key={`${component.name}:${index}`}>
                  <div><p className="font-semibold">{component.name}</p><p className="text-xs text-slate-500">{component.frequency || component.recurrence}</p></div>
                  <strong>{money(component.amount)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No additional allowances or benefits are attached to this package.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            {item.source_pan_id && <a className="font-semibold text-violet-700" href={`/employees/pan?item=${item.source_pan_id}`}>View approved PAN</a>}
            {item.source_metadata?.sourceDocument?.url && <a className="font-semibold text-violet-700" href={item.source_metadata.sourceDocument.url} target="_blank" rel="noreferrer">Open source document</a>}
            {item.treatment.supportingDocumentLink && <a className="font-semibold text-violet-700" href={item.treatment.supportingDocumentLink} target="_blank" rel="noreferrer">Open document link</a>}
            {item.documents?.map((document) => <button type="button" className="font-semibold text-violet-700" key={document.id} onClick={() => void openPayPackageDocument(document.path)}>View {document.name}</button>)}
            {!item.source_pan_id && !item.source_metadata?.sourceDocument?.url && !item.treatment.supportingDocumentLink && !item.documents?.length && <span className="text-sm text-slate-500">No supporting document attached.</span>}
          </div>
        </Card>
      </div>
    </div>
  );
};

const LiveSummary: React.FC<{
  base: string;
  components: PayComponent[];
  treatment: Treatment;
  effective: string;
  source?: PayPackage;
  mode: BuilderMode;
  consultantEnabled: boolean;
  consultantFee: string;
  consultantScopeName: string;
}> = ({ base, components, treatment, effective, source, mode, consultantEnabled, consultantFee, consultantScopeName }) => {
  const preview = useMemo(
    () => calculatePackagePreview({ baseAmount: base, components, treatment }),
    [base, components, treatment],
  );
  const pending = preview.pending.length > 0;
  return (
    <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">Live package summary</h2>
          <StatusChip tone="amber">
            {mode === "update" ? "Draft update" : "Draft"}
          </StatusChip>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {mode === "initial" ? "Initial package setup" : "New package version"}
        </p>
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-xs font-semibold text-emerald-700">Employee receives</p>
            <p className="mt-1 text-xl font-bold text-emerald-900">
              {pending ? "Needs review" : money(preview.employee.estimatedNet)}
            </p>
          </div>
          <div className="rounded-xl bg-violet-50 p-4">
            <p className="text-xs font-semibold text-violet-700">Employer pays</p>
            <p className="mt-1 text-xl font-bold text-violet-900">
              {pending ? "Needs review" : money(preview.employerPays)}
            </p>
          </div>
          <div className="rounded-xl bg-slate-900 p-4 text-white">
            <p className="text-xs font-semibold text-slate-300">Total company cost</p>
            <p className="mt-1 text-xl font-bold">
              {pending ? "Needs review" : money(preview.company.totalActualCost)}
            </p>
          </div>
        </div>
        <dl className="mt-4 space-y-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-700">
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Employee deductions</dt><dd className="font-semibold">{pending ? "Pending" : money(preview.employee.employeeTax + preview.employee.employeeBenefits + preview.employee.deductions)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Tax treatment</dt><dd className="text-right font-semibold">{arrangementSummary(treatment)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Effective date</dt><dd className="font-semibold">{effective || "Missing"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Package source</dt><dd className="text-right font-semibold">{sourceLabel(source)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Approval status</dt><dd className="font-semibold">Draft — not submitted</dd></div>
        </dl>
        {pending && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            Missing or pending values remain visible and are not treated as zero.
          </p>
        )}
      </Card>
      {consultantEnabled && (
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold">Consultant fee</h3>
            <StatusChip tone="amber">Separate arrangement</StatusChip>
          </div>
          <p className="mt-3 text-xl font-bold">{consultantFee ? money(consultantFee) : "Missing"}</p>
          <p className="mt-1 text-sm text-slate-500">{consultantScopeName || "Business unit missing"}</p>
          <p className="mt-3 text-xs text-slate-500">Not included in employee payroll or employee-package totals.</p>
        </Card>
      )}
      {!consultantEnabled && (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">
          Consultant fees are optional and maintained separately from employee payroll.
        </p>
      )}
    </aside>
  );
};

const PackageComparison: React.FC<{
  current: PayPackage;
  base: string;
  components: PayComponent[];
  treatment: Treatment;
}> = ({ current, base, components, treatment }) => {
  const before = calculatePackagePreview({
    baseAmount: String(current.base_amount),
    components: current.components,
    treatment: current.treatment,
  });
  const after = calculatePackagePreview({ baseAmount: base, components, treatment });
  const componentTotal = (items: PayComponent[], categories: ComponentCategory[]) =>
    items.reduce(
      (total, item) =>
        categories.includes(item.category || "other")
          ? total + Number(item.amount || 0)
          : total,
      0,
    );
  const rows: Array<[string, string, string]> = [
    ["Basic salary", money(current.base_amount), base ? money(base) : "Missing"],
    [
      "Allowances",
      money(componentTotal(current.components, ["de_minimis", "fixed_allowance", "reimbursable_allowance"])),
      money(componentTotal(components, ["de_minimis", "fixed_allowance", "reimbursable_allowance"])),
    ],
    [
      "Benefits",
      money(componentTotal(current.components, ["employee_paid_benefit", "employer_paid_benefit", "employer_contribution"])),
      money(componentTotal(components, ["employee_paid_benefit", "employer_paid_benefit", "employer_contribution"])),
    ],
    [
      "Tax treatment",
      current.treatment.taxResponsibility || "Needs review",
      treatment.taxResponsibility || "Needs review",
    ],
    ["Total company cost", money(before.company.totalActualCost), money(after.company.totalActualCost)],
  ];
  return (
    <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold">Before-and-after comparison</h3>
          <p className="text-sm text-slate-500">The approved version stays unchanged.</p>
        </div>
        <StatusChip tone="violet">New effective-dated version</StatusChip>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[540px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800">
            <tr><th className="p-3">Component</th><th className="p-3">Current package</th><th className="p-3">New version</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {rows.map(([label, currentValue, newValue]) => (
              <tr key={label}><th className="p-3 font-semibold">{label}</th><td className="p-3">{currentValue}</td><td className={`p-3 font-semibold ${currentValue === newValue ? "text-slate-500" : "text-violet-700"}`}>{newValue}{currentValue === newValue ? " · No change" : ""}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const PayPackageBuilder: React.FC<{
  data: PayContext;
  employee?: PayDirectoryEntry;
  onSaved: () => Promise<void> | void;
  initial?: PayPackage;
}> = ({ data, employee, onSaved, initial }) => {
  const approvedEmployeePackages = data.packages
    .filter((item) => item.stream === "employee_payroll" && item.status === "approved")
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  const currentPackage =
    approvedEmployeePackages.find((item) => item.effective_from <= manilaToday()) ||
    approvedEmployeePackages[0];
  const seedPackage = initial || currentPackage;
  const [mode, setMode] = useState<BuilderMode>(
    initial ? "update" : initialBuilderMode(data.packages),
  );
  const [workspaceMode, setWorkspaceMode] = useState<"current" | "edit">(
    initial || builderLandingMode(data.packages) === "initial" ? "edit" : "current",
  );
  const [sourcePackage, setSourcePackage] = useState<PayPackage | undefined>(
    seedPackage,
  );
  const correctionSource =
    sourcePackage?.source_kind === "approved_pan" ? sourcePackage : undefined;
  const [viewingVersion, setViewingVersion] = useState<PayPackage | null>(null);
  const [step, setStep] = useState(1);
  const [scope, setScope] = useState(
    seedPackage?.scope_id || data.scopes.find((s) => s.canEdit)?.id || "",
  );
  const [effective, setEffective] = useState(
    seedPackage ? "" : "",
  );
  const [rate, setRate] = useState(
    seedPackage?.rate_type || data.legacy.rateType || "Monthly",
  );
  const [base, setBase] = useState(
    String(
      seedPackage?.base_amount ??
        data.legacy.rateAmount ??
        data.legacy.salaryBasic ??
        "",
    ),
  );
  const [taxRef, setTaxRef] = useState(seedPackage?.tax_profile_ref || "");
  const [sourceRef, setSourceRef] = useState(
    seedPackage?.source_kind === "approved_pan"
      ? `Correction to ${seedPackage.source_ref || "approved PAN package"}`
      : seedPackage?.source_ref || "",
  );
  const [reason, setReason] = useState("");
  const [components, setComponents] = useState<PayComponent[]>(
    seedPackage?.components?.map((x) => ({ ...x })) || [],
  );
  const [treatment, setTreatment] = useState<Treatment>(
    seedPackage?.treatment
      ? { ...emptyTreatment(), ...seedPackage.treatment }
      : emptyTreatment(),
  );
  const [basisChoice, setBasisChoice] = useState(
    seedPackage?.treatment?.coverageMode === "gross_selected"
      ? "gross_selected"
      : seedPackage?.treatment?.payBasis || "gross",
  );
  const [document, setDocument] = useState<File | null>(null);
  const [documentLink, setDocumentLink] = useState(
    seedPackage?.treatment?.supportingDocumentLink || "",
  );
  const [consultantEnabled, setConsultantEnabled] = useState(false);
  const [consultantScope, setConsultantScope] = useState(
    data.scopes.find((item) => item.canEdit && item.id !== data.scopeId)?.id || "",
  );
  const [consultantEngagement, setConsultantEngagement] = useState("");
  const [consultantEntity, setConsultantEntity] = useState("");
  const [consultantFee, setConsultantFee] = useState("");
  const [consultantFrequency, setConsultantFrequency] = useState("Per invoice");
  const [consultantTax, setConsultantTax] = useState("");
  const [consultantDocument, setConsultantDocument] = useState<File | null>(null);
  const [consultantDocumentLink, setConsultantDocumentLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const submitExistingDraft = async (item: PayPackage) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await submitPayPackageDraft(item.id);
      setViewingVersion(null);
      setNotice("Existing draft submitted for approval. No copy was created.");
      await onSaved();
    } catch (value) {
      setError(value instanceof Error ? value.message : "The draft could not be submitted.");
    } finally {
      setBusy(false);
    }
  };
  const selectedScope = data.scopes.find((s) => s.id === scope);
  const editableScopes = data.scopes.filter((s) => s.canEdit && s.employeePayroll !== false);
  const consultantScopes = data.scopes.filter((s) => s.canEdit);
  const copyPackage = (item: PayPackage) => {
    setWorkspaceMode("edit");
    if (item.stream === "professional_fee") {
      setMode("update");
      setConsultantEnabled(true);
      setConsultantScope(item.scope_id);
      setConsultantEngagement(item.engagement_key || "");
      setConsultantEntity(item.treatment.contractingEntity || "");
      setConsultantFee(String(item.base_amount ?? ""));
      setConsultantFrequency(item.rate_type || "Per invoice");
      setConsultantTax(
        item.treatment.consultantTaxTreatment || item.tax_profile_ref || "",
      );
      setStep(1);
      return;
    }
    setMode("update");
    setSourcePackage(item);
    setScope(item.scope_id);
    setEffective("");
    setRate(item.rate_type);
    setBase(String(item.base_amount ?? ""));
    setComponents(item.components.map((component) => ({ ...component })));
    setTreatment({ ...emptyTreatment(), ...item.treatment });
    setBasisChoice(
      item.treatment.coverageMode === "gross_selected"
        ? "gross_selected"
        : item.treatment.payBasis || "gross",
    );
    setSourceRef(
      item.source_kind === "approved_pan"
        ? `Correction to ${item.source_ref || "approved PAN package"}`
        : item.source_ref || "Copied from previous approved package",
    );
    setReason("");
    setDocumentLink(item.treatment.supportingDocumentLink || "");
    setStep(1);
  };
  const updateBasis = (choice: string) => {
    setBasisChoice(choice);
    const payBasis = choice === "gross_selected" ? "custom_review" : choice;
    setTreatment((old) => ({
      ...old,
      payBasis,
      coverageMode: choice,
      taxResponsibility: choice === "gross" ? "employee" : "employer",
      benefitResponsibility: choice === "net_all" ? "employer" : "employee",
      taxCoverage:
        choice === "gross_selected"
          ? "selected_components"
          : old.taxCoverage || "entire_package",
      netTarget:
        choice === "gross" || choice === "gross_selected"
          ? ""
          : old.netTarget || base,
    }));
  };
  const consultantEvidenceReady = Boolean(
    consultantDocument || isSecureDocumentLink(consultantDocumentLink),
  );
  const documentLinkReady =
    !documentLink || isSecureDocumentLink(documentLink);
  const canContinue =
    step === 1
      ? Boolean(
          scope &&
          effective &&
          rate &&
          base &&
          (!consultantEnabled ||
            (consultantScope &&
              consultantEngagement.trim().length >= 3 &&
              consultantEntity.trim().length >= 2 &&
              Number(consultantFee) > 0 &&
              consultantTax.trim().length >= 3 &&
              consultantEvidenceReady)) &&
          documentLinkReady,
        )
      : step === 2
        ? Boolean(
            basisChoice &&
            (!["net_tax", "net_all"].includes(basisChoice) ||
              (treatment.netTarget && treatment.arrangementRef)),
          )
        : step === 3
          ? Boolean(
              sourceRef.trim().length >= 3 &&
              reason.trim().length >= 3 &&
              components.every(
                (item) => item.name.trim() && Number(item.amount) >= 0,
              ),
            )
          : true;
  const save = async (intent: "draft" | "approval") => {
    if (!data.sourceHash || !canContinue) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const normalized = components.map((item) => ({
        ...item,
        tax:
          item.taxTreatment === "taxable"
            ? "included"
            : item.taxTreatment === "non_taxable"
              ? "excluded"
              : "unreviewed",
        receiptRequired:
          item.category === "reimbursable_allowance" || item.receiptRequired,
      }));
      const payload = {
        effectiveFrom: effective,
        rateType: rate,
        baseAmount: base,
        components: normalized,
        treatment: {
          ...treatment,
          supportingDocumentLink: documentLink.trim(),
          payFrequency:
            rate === "Monthly" ? "twice_monthly_5th_20th" : rate,
          coverageMode: basisChoice,
          submissionIntent: intent,
          calculationVersion: "pay-package-builder-v2",
          entrySource: correctionSource
            ? "approved_pan_correction"
            : "direct_entry",
        },
        sourceRef,
        sourcePanId: null,
        reason,
        stream: "employee_payroll",
        engagementKey: "employee",
        taxProfileRef: taxRef,
        replacesId:
          correctionSource && effective === correctionSource.effective_from
            ? correctionSource.id
            : null,
        sourceKind: correctionSource
          ? "correction"
          : sourcePackage
            ? "copied_package"
            : "direct_entry",
        correctionOfId: correctionSource?.id || null,
      };
      const id = await savePayPackage(
        data.employeeId,
        scope,
        payload,
        data.sourceHash,
      );
      if (document) await uploadPayPackageDocument(id, document);
      if (consultantEnabled) {
        const consultantId = await savePayPackage(
          data.employeeId,
          consultantScope,
          {
            effectiveFrom: effective,
            rateType: consultantFrequency,
            baseAmount: consultantFee,
            components: [],
            treatment: {
              ...emptyTreatment(),
              submissionIntent: intent,
              payFrequency: consultantFrequency,
              contractingEntity: consultantEntity,
              consultantTaxTreatment: consultantTax,
              supportingDocumentLink: consultantDocumentLink.trim(),
              calculationVersion: "pay-package-builder-v3",
              entrySource: "direct_consultant_arrangement",
            },
            sourceRef: `Consultant arrangement · ${consultantEntity}`,
            reason,
            stream: "professional_fee",
            engagementKey: consultantEngagement,
            taxProfileRef: consultantTax,
            replacesId: null,
            sourceKind: "direct_entry",
            correctionOfId: null,
          },
          data.sourceHash,
        );
        if (consultantDocument)
          await uploadPayPackageDocument(consultantId, consultantDocument);
      }
      setNotice(
        intent === "approval"
          ? "Submitted to the HR Manager and Finance approval route."
          : "Draft saved.",
      );
      await onSaved();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The package could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  const steps = [
    "Person & scope",
    "Pay basis",
    "Components & benefits",
    "Review & save",
  ];
  const consultantScopeName =
    data.scopes.find((item) => item.id === consultantScope)?.name || "";
  if (workspaceMode === "current" && currentPackage) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <strong>Approved compensation is active</strong>
              <p className="mt-1 text-sm text-emerald-800">
                Review the current package below. Start an update only when compensation needs to change.
              </p>
            </div>
            <StatusChip tone="green">Ready for payroll</StatusChip>
          </div>
        </div>
        <div className="grid gap-5 xl:grid-cols-[290px,minmax(0,1fr),310px]">
          <PackageHistory
            data={data}
            employee={employee}
            selected={currentPackage}
            onSelect={setViewingVersion}
            onCopy={copyPackage}
          />
          <CurrentPackageSummary
            item={currentPackage}
            data={data}
            onViewDetails={() => setViewingVersion(currentPackage)}
            onUpdate={() => copyPackage(currentPackage)}
          />
        </div>
        {viewingVersion && (
          <VersionDetails
            item={viewingVersion}
            data={data}
            onClose={() => setViewingVersion(null)}
            onCopy={copyPackage}
            onSubmitDraft={(item) => void submitExistingDraft(item)}
          />
        )}
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {currentPackage ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <div>
            <strong className="text-violet-950">Create a new package version</strong>
            <p className="mt-1 text-sm text-violet-700">The current approved package remains active until this change is approved and reaches its effective date.</p>
          </div>
          <Button variant="secondary" onClick={() => setWorkspaceMode("current")}>
            ← Back to current package
          </Button>
        </div>
      ) : (
      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            if (!currentPackage) {
              setMode("initial");
              setSourcePackage(undefined);
              setEffective("");
            }
          }}
          disabled={!!currentPackage}
          className={`rounded-xl border p-4 text-left ${mode === "initial" ? "border-violet-600 bg-violet-50 text-violet-900" : "border-slate-200 bg-white text-slate-600"} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <strong>Set up initial package</strong>
          <span className="mt-1 block text-sm">Use when no package is recorded in HRIS yet.</span>
        </button>
        <button
          type="button"
          onClick={() => currentPackage && copyPackage(currentPackage)}
          disabled={!currentPackage}
          className={`rounded-xl border p-4 text-left ${mode === "update" ? "border-violet-600 bg-violet-50 text-violet-900" : "border-slate-200 bg-white text-slate-600"} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <strong>Update existing package</strong>
          <span className="mt-1 block text-sm">Create a new dated version without replacing history.</span>
        </button>
      </div>
      )}
      <div className="grid gap-2 sm:grid-cols-4">
        {steps.map((label, index) => {
          const value = index + 1;
          return (
            <button
              type="button"
              key={label}
              onClick={() => value < step && setStep(value)}
              className={`rounded-xl border p-3 text-left ${step === value ? "border-violet-600 bg-violet-50 text-violet-800" : value < step ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-500 dark:bg-slate-800"}`}
            >
              <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-current/10 text-sm font-bold">
                {value < step ? "✓" : value}
              </span>
              <span className="text-sm font-semibold">{label}</span>
            </button>
          );
        })}
      </div>
      <div className="grid gap-5 xl:grid-cols-[290px,minmax(0,1fr),310px]">
        <PackageHistory
          data={data}
          employee={employee}
          selected={sourcePackage}
          onSelect={setViewingVersion}
          onCopy={copyPackage}
        />
        <main className="min-w-0 space-y-5">
      {step === 1 && (
        <Card>
          {correctionSource && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <strong>Create correction to locked PAN package</strong>
              <p className="mt-1">
                The approved package stays unchanged. This creates a new
                effective-dated version with HR and Finance approval.
              </p>
            </div>
          )}
          <div className="space-y-5">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold">
                  {mode === "initial" ? "Initial package setup" : "Create new package version"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {mode === "initial"
                    ? "This creates the employee’s first dated compensation record. It will not replace an existing package."
                    : "The current approved package remains unchanged. Payroll will use this version only from its effective date."}
                </p>
              </div>
              <Label title="Business unit / payroll group">
                <select
                  className={field}
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                >
                  {editableScopes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Label>
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Primary arrangement</p>
                <p className="mt-1 font-bold text-violet-900">Employee payroll</p>
                <p className="mt-1 text-sm text-violet-700">Default arrangement for every employee.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Label title="Effective date">
                  <input
                    className={field}
                    type="date"
                    value={effective}
                    onChange={(e) => setEffective(e.target.value)}
                  />
                </Label>
                <Label title="Salary basis">
                  <select
                    className={field}
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  >
                    <option value="Monthly">Monthly salary</option>
                    <option value="Daily">Daily rate</option>
                    <option value="Hourly">Hourly rate</option>
                    <option value="Per invoice">Per invoice</option>
                  </select>
                </Label>
              </div>
              {rate === "Monthly" && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-violet-950">Paid twice monthly</p>
                      <p className="mt-1 text-sm text-violet-700">“Monthly” is the salary basis—not one payment per month.</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold text-violet-800">
                      <span className="rounded-full bg-white px-3 py-2">11–25 → release on the 5th</span>
                      <span className="rounded-full bg-white px-3 py-2">26–10 → release on the 20th</span>
                    </div>
                  </div>
                </div>
              )}
              <>
                  <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">
                    <strong>
                      {correctionSource
                        ? "Correction source"
                        : "Compensation source"}
                    </strong>
                    <p className="mt-1 text-slate-500">
                      {correctionSource
                        ? "Generated from approved PAN. The original is read-only."
                        : "Direct compensation entry — HR Manager and Finance approval is required."}
                    </p>
                  </div>
                  <Label title="Basic pay">
                    <input
                      className={field}
                      type="number"
                      min="0"
                      value={base}
                      onChange={(e) => setBase(e.target.value)}
                    />
                  </Label>
                </>
              <Label title="Supporting document or source">
                <input className={field} value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="Approved source, policy, or document reference" />
              </Label>
              <div>
                <p className="text-sm font-medium">Supporting evidence</p>
                <p className="mt-1 text-xs text-slate-500">Choose an upload, a secure link, or provide both.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Label title="Upload document" hint="PDF, JPG, or PNG.">
                    <input className={field} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setDocument(event.target.files?.[0] || null)} />
                  </Label>
                  <Label title="Add secure document link" hint="Google Drive, SharePoint, Dropbox, or another approved HTTPS source.">
                    <input className={field} type="url" value={documentLink} onChange={(event) => setDocumentLink(event.target.value)} placeholder="https://..." />
                  </Label>
                </div>
                {documentLink && !isSecureDocumentLink(documentLink) && (
                  <p className="mt-2 text-xs font-semibold text-rose-700">Use a complete secure link beginning with https://</p>
                )}
              </div>
            </div>
            <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-violet-600" checked={consultantEnabled} onChange={(event) => setConsultantEnabled(event.target.checked)} />
                <span><strong>＋ Add consultant-fee arrangement</strong><span className="mt-1 block text-sm text-slate-500">Consultant fees are optional and maintained separately from employee payroll.</span></span>
              </label>
              {consultantArrangementVisible(consultantEnabled) && (
                <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 dark:border-slate-700">
                  <Label title="Consultant business unit / contracting scope"><select className={field} value={consultantScope} onChange={(event) => setConsultantScope(event.target.value)}><option value="">Select scope</option>{consultantScopes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Label>
                  <Label title="Contracting entity"><input className={field} value={consultantEntity} onChange={(event) => setConsultantEntity(event.target.value)} /></Label>
                  <Label title="Engagement or project scope"><input className={field} value={consultantEngagement} onChange={(event) => setConsultantEngagement(event.target.value)} /></Label>
                  <Label title="Fee amount"><input className={field} type="number" min="0" value={consultantFee} onChange={(event) => setConsultantFee(event.target.value)} /></Label>
                  <Label title="Fee frequency"><select className={field} value={consultantFrequency} onChange={(event) => setConsultantFrequency(event.target.value)}>{["Per invoice", "Monthly", "Daily", "Hourly"].map((value) => <option key={value}>{value}</option>)}</select></Label>
                  <Label title="Tax treatment"><input className={field} value={consultantTax} onChange={(event) => setConsultantTax(event.target.value)} placeholder="Reviewed withholding treatment" /></Label>
                  <Label title="Upload invoice or supporting document"><input className={field} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setConsultantDocument(event.target.files?.[0] || null)} /></Label>
                  <Label title="Or add secure document link" hint="Required when no file is uploaded."><input className={field} type="url" value={consultantDocumentLink} onChange={(event) => setConsultantDocumentLink(event.target.value)} placeholder="https://..." /></Label>
                </div>
              )}
            </section>
            {mode === "update" && sourcePackage && (
              <>
                <div className="flex flex-wrap gap-3">
                  <Button variant="secondary" onClick={() => setViewingVersion(sourcePackage)}>
                    View current package
                  </Button>
                  <Button variant="secondary" onClick={() => copyPackage(sourcePackage)}>
                    Copy as starting point
                  </Button>
                  <span className="inline-flex items-center rounded-full bg-violet-100 px-3 py-2 text-sm font-semibold text-violet-800">
                    Create new package version
                  </span>
                </div>
                <PackageComparison current={sourcePackage} base={base} components={components} treatment={treatment} />
              </>
            )}
          </div>
        </Card>
      )}
      {step === 2 && (
        <Card>
          <h2 className="text-xl font-bold">
            How should this package be paid?
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose a structured arrangement; custom wording cannot replace these
            controls.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {payBasisOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => updateBasis(option.value)}
                className={`rounded-xl border p-4 text-left ${basisChoice === option.value ? "border-violet-600 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 hover:border-violet-300 dark:border-slate-700"}`}
              >
                <strong>{option.label}</strong>
                <p className="mt-1 text-sm text-slate-500">
                  {option.description}
                </p>
              </button>
            ))}
          </div>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <Label title="Who pays income tax?">
              <Segmented
                value={treatment.taxResponsibility || "employee"}
                onChange={(value) =>
                  setTreatment({ ...treatment, taxResponsibility: value })
                }
                options={[
                  { value: "employee", label: "Employee" },
                  { value: "employer", label: "Employer" },
                  { value: "split", label: "Split" },
                ]}
              />
            </Label>
            <Label title="Tax coverage">
              <Segmented
                value={treatment.taxCoverage || "entire_package"}
                onChange={(value) =>
                  setTreatment({ ...treatment, taxCoverage: value })
                }
                options={[
                  { value: "basic_only", label: "Basic pay only" },
                  {
                    value: "selected_components",
                    label: "Selected components",
                  },
                  { value: "entire_package", label: "Entire package" },
                ]}
              />
            </Label>
            <Label title="Who pays benefits?">
              <Segmented
                value={treatment.benefitResponsibility || "employee"}
                onChange={(value) =>
                  setTreatment({ ...treatment, benefitResponsibility: value })
                }
                options={[
                  { value: "employee", label: "Employee" },
                  { value: "employer", label: "Employer" },
                  { value: "split", label: "Split" },
                ]}
              />
            </Label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm font-medium">Payroll release schedule</p>
              <p className="mt-2 font-bold">
                {rate === "Monthly"
                  ? "Twice monthly — releases on the 5th and 20th"
                  : payFrequencySummary(rate)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Monthly salary is split across the standard 11–25 and 26–10 payroll cutoffs.
              </p>
            </div>
            {["net_tax", "net_all"].includes(basisChoice) && (
              <>
                <Label title="Agreed net amount">
                  <input
                    className={field}
                    type="number"
                    min="0"
                    value={treatment.netTarget || ""}
                    onChange={(e) =>
                      setTreatment({ ...treatment, netTarget: e.target.value })
                    }
                  />
                </Label>
                <Label title="Approved arrangement document">
                  <input
                    className={field}
                    value={treatment.arrangementRef || ""}
                    onChange={(e) =>
                      setTreatment({
                        ...treatment,
                        arrangementRef: e.target.value,
                      })
                    }
                  />
                </Label>
              </>
            )}
          </div>
          <p className="mt-6 rounded-xl bg-violet-50 p-4 text-sm font-medium text-violet-900">
            {arrangementSummary(treatment)}
          </p>
          {basisChoice === "gross_selected" && (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Selected-component coverage is recorded structurally and remains
              Needs review until Finance confirms the supported payroll-engine
              treatment.
            </p>
          )}
        </Card>
      )}
      {step === 3 && (
        <Card>
          <ComponentEditor components={components} onChange={setComponents} />
          <div className="mt-6 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2 dark:border-slate-700">
            <Label title="Approved source or policy reference">
              <input
                className={field}
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
              />
            </Label>
            <Label title="Reason and reconciliation note">
              <input
                className={field}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Label>
          </div>
        </Card>
      )}
      {step === 4 && (
        <Card>
          <Review
            base={base}
            components={components}
            treatment={treatment}
            stream="employee_payroll"
            scopeName={selectedScope?.name || "Selected scope"}
            consultantFee={base}
          />
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 dark:border-slate-700">
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setStep(3)}>
                Back to edit
              </Button>
              {initial && !correctionSource && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStep(1);
                    setEffective("");
                  }}
                >
                  Copy package
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void save("draft")}
              >
                Save draft
              </Button>
              <Button isLoading={busy} onClick={() => void save("approval")}>
                Submit for approval
              </Button>
            </div>
          </div>
        </Card>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {step < 4 && (
        <div className="flex justify-end">
          <Button disabled={!canContinue} onClick={() => setStep(step + 1)}>
            Continue →
          </Button>
        </div>
      )}
        </main>
        <LiveSummary
          base={base}
          components={components}
          treatment={treatment}
          effective={effective}
          source={sourcePackage}
          mode={mode}
          consultantEnabled={consultantEnabled}
          consultantFee={consultantFee}
          consultantScopeName={consultantScopeName}
        />
      </div>
      {viewingVersion && (
        <VersionDetails item={viewingVersion} data={data} onClose={() => setViewingVersion(null)} onCopy={copyPackage} onSubmitDraft={(item) => void submitExistingDraft(item)} />
      )}
    </div>
  );
};

export default PayPackageBuilder;
