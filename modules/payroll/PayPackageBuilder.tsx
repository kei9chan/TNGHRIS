import React, { useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import {
  arrangementSummary,
  calculatePackagePreview,
  classificationLabels,
  componentClassification,
  componentTaxLabel,
  includedInGuaranteedPay,
  payBasisOptions,
  validatePayPackage,
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
  updatePayPackageDraft,
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
  `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const displayDate = (value?: string | null) =>
  value
    ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Not set";
const displayDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Pending";
const shortReference = (value?: string | null) => {
  if (!value) return "Not provided";
  const uuid = value.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0];
  return uuid ? value.replace(uuid, uuid.slice(0, 8).toUpperCase()) : value;
};
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
  tone: "green" | "amber" | "red" | "gray" | "violet" | "blue";
  children: React.ReactNode;
}> = ({ tone, children }) => {
  const tones = {
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-rose-100 text-rose-800",
    gray: "bg-slate-100 text-slate-700",
    violet: "bg-violet-100 text-violet-800",
    blue: "bg-blue-100 text-blue-800",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
};

const SummaryCards: React.FC<{
  base: string | number;
  components: PayComponent[];
  treatment: Treatment;
}> = ({ base, components, treatment }) => {
  const preview = useMemo(
    () => calculatePackagePreview({ baseAmount: base, components, treatment }),
    [base, components, treatment],
  );
  const cards = [
    ["Guaranteed monthly pay", preview.guaranteedMonthlyPay, "green", "Fixed approved compensation"],
    ["Conditional maximum", preview.conditionalMaximum, "amber", "Paid only when conditions are met"],
    ["Reimbursable maximum", preview.reimbursableMaximum, "amber", "Receipt and approval required"],
    ["Estimated employee deductions", preview.estimatedEmployeeDeductions, "blue", "Final amount is payroll-period specific"],
    ["Estimated employer contributions", preview.estimatedEmployerContributions, "blue", "Company-paid statutory estimate"],
    ["Estimated total monthly company cost", preview.estimatedCompanyCost, "violet", "Earnings and employer costs combined"],
  ] as const;
  const tones = {
    green: "bg-emerald-50 text-emerald-950",
    amber: "bg-amber-50 text-amber-950",
    blue: "bg-blue-50 text-blue-950",
    violet: "bg-violet-50 text-violet-950",
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map(([label, amount, tone, note]) => (
        <div key={label} className={`rounded-2xl p-4 ${tones[tone]}`}>
          <p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p>
          <p className="mt-2 text-2xl font-black tabular-nums">{money(amount)}</p>
          <p className="mt-1 text-xs opacity-75">{note}</p>
        </div>
      ))}
    </div>
  );
};

const CompensationBreakdown: React.FC<{
  base: string | number;
  components: PayComponent[];
}> = ({ base, components }) => {
  const rows: PayComponent[] = [
    {
      ...newComponent("fixed_allowance"),
      name: "Basic salary",
      amount: String(base || 0),
      frequency: "Monthly",
      classification: "guaranteed",
      includedInGuaranteedPay: true,
      affectsEmployerCost: true,
      taxTreatment: "taxable",
    },
    ...components,
  ];
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800">
          <tr>
            <th className="p-3">Component</th><th className="p-3">Exact amount</th><th className="p-3">Frequency</th><th className="p-3">Classification</th><th className="p-3">Tax treatment</th><th className="p-3">Guaranteed pay</th><th className="p-3">Employer cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {rows.map((component, index) => {
            const classification = componentClassification(component);
            const tone = classification === "receipt_based" || classification === "conditional" ? "amber" : classification === "payroll_calculated" ? "blue" : "green";
            return (
              <tr key={`${component.name}:${index}`}>
                <th className="p-3 font-semibold">{component.name}</th>
                <td className="p-3 font-bold tabular-nums">{classification === "receipt_based" ? `Up to ${money(component.amount)}` : money(component.amount)}</td>
                <td className="p-3">{component.frequency || component.recurrence || "Monthly"}</td>
                <td className="p-3"><StatusChip tone={tone}>{classificationLabels[classification]}</StatusChip></td>
                <td className="p-3">{componentTaxLabel(component)}</td>
                <td className="p-3 font-semibold">{includedInGuaranteedPay(component) ? "Yes" : "No"}</td>
                <td className="p-3 font-semibold">{component.affectsEmployerCost === false ? "No" : "Yes"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
          Only basic salary is active. Add a component only when it applies.
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
                    {component.frequency || component.recurrence}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusChip tone={componentClassification(component) === "receipt_based" || componentClassification(component) === "conditional" ? "amber" : componentClassification(component) === "payroll_calculated" ? "blue" : "green"}>{classificationLabels[componentClassification(component)]}</StatusChip>
                    <StatusChip tone={includedInGuaranteedPay(component) ? "green" : "gray"}>{includedInGuaranteedPay(component) ? "Included in guaranteed pay" : "Not included in guaranteed pay"}</StatusChip>
                    <StatusChip tone={component.affectsEmployerCost === false ? "gray" : "violet"}>{component.affectsEmployerCost === false ? "Does not affect employer cost" : "Affects employer cost"}</StatusChip>
                  </div>
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
                  <Label title="Classification">
                    <select
                      className={field}
                      value={componentClassification(component)}
                      onChange={(e) => {
                        const classification = e.target.value as PayComponent["classification"];
                        update(index, {
                          classification,
                          includedInGuaranteedPay: ["guaranteed", "guaranteed_benefit"].includes(classification || ""),
                        });
                      }}
                    >
                      {Object.entries(classificationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
                  <Label title="Included in guaranteed pay?">
                    <select className={field} value={includedInGuaranteedPay(component) ? "yes" : "no"} onChange={(e) => update(index, { includedInGuaranteedPay: e.target.value === "yes" })}>
                      <option value="yes">Yes — included</option><option value="no">No — separate or conditional</option>
                    </select>
                  </Label>
                  <Label title="Affects employer cost?">
                    <select className={field} value={component.affectsEmployerCost === false ? "no" : "yes"} onChange={(e) => update(index, { affectsEmployerCost: e.target.value === "yes" })}>
                      <option value="yes">Yes</option><option value="no">No</option>
                    </select>
                  </Label>
                  <Label title="Plain-language explanation">
                    <input className={field} value={component.description || ""} onChange={(e) => update(index, { description: e.target.value })} placeholder="How and when this item is paid" />
                  </Label>
                  {component.taxTreatment === "taxable" && (
                    <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">
                      <input type="checkbox" checked={Boolean(component.employerPaidTax)} onChange={(e) => update(index, { employerPaidTax: e.target.checked })} /> Employer pays tax on this component
                    </label>
                  )}
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
  const errors = validatePayPackage({ baseAmount: base, components, treatment });
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
    <div className="space-y-5">
      <div><h3 className="text-xl font-bold">Review exact compensation</h3><p className="text-sm text-slate-500">Fixed pay, conditional exposure, payroll estimates, and company cost are intentionally separated.</p></div>
      <SummaryCards base={base} components={components} treatment={treatment} />
      <section><h3 className="mb-3 font-bold">Compensation breakdown</h3><CompensationBreakdown base={base} components={components} /></section>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <h3 className="font-bold">Items calculated per payroll run</h3>
          <p className="mt-2">Employee deductions estimate: <strong>{money(preview.estimatedEmployeeDeductions)}</strong></p>
          <p>Employer contributions estimate: <strong>{money(preview.estimatedEmployerContributions)}</strong></p>
          <p className="mt-2 text-xs">Withholding tax and government contributions depend on payroll-period earnings. Loans, attendance, overtime, and authorized deductions apply only when approved and active.</p>
        </div>
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
          <h3 className="font-bold">Approval route</h3>
          <p className="mt-2"><strong>1. HR Manager — Jedidiah</strong></p><p><strong>2. Finance — Lenny Rose Casas</strong></p>
          <p className="mt-2 text-xs">A submitter cannot approve their own package. The other required independent approver remains due; an assigned authorized BOD alternative is shown in the live approval trail.</p>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-700">
        <h3 className="font-bold">Pay basis and financial effect</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><dt className="text-slate-500">Basis</dt><dd className="font-semibold">{arrangementSummary(treatment)}</dd></div>
          <div><dt className="text-slate-500">Approved gross amount</dt><dd className="font-bold">{money(preview.approvedGrossAmount)}</dd></div>
          {preview.targetNetAmount > 0 && <div><dt className="text-slate-500">Target net amount</dt><dd className="font-bold">{money(preview.targetNetAmount)}</dd></div>}
          <div><dt className="text-slate-500">Estimated employer-paid tax</dt><dd className="font-bold">{money(preview.estimatedEmployerTax)}</dd></div>
        </dl>
      </div>
      {errors.length > 0 && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><h3 className="font-bold">Complete before submission</h3><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
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
  onEditDraft: (item: PayPackage) => void;
  onSubmitDraft: (item: PayPackage) => void;
}> = ({ item, data, onClose, onCopy, onEditDraft, onSubmitDraft }) => {
  const scope = data.scopes.find((value) => value.id === item.scope_id);
  const editableDraft = item.status === "draft" && item.approval_state !== "pending";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="package-version-title"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-violet-700">Package version {item.version_no || 1}</p>
              <StatusChip tone={editableDraft ? "amber" : item.status === "approved" ? "green" : "gray"}>{approvalLabel(item)}</StatusChip>
            </div>
            <h2 id="package-version-title" className="mt-2 text-2xl font-bold">{money(item.base_amount)} <span className="text-base font-semibold text-slate-500">/ {item.rate_type}</span></h2>
            <p className="mt-1 text-sm text-slate-500">{scope?.name || "Payroll scope"} · Effective {displayDate(item.effective_from)}</p>
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
        {editableDraft && (
          <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>This is editable work.</strong> Edit this same draft, then submit it when it is ready. No copy is created.</p>
        )}
        <div className="mt-5"><SummaryCards base={item.base_amount} components={item.components} treatment={item.treatment} /></div>
        <dl className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 px-4 text-sm dark:divide-slate-700 dark:border-slate-700">
          <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Effective period</dt><dd className="text-right font-semibold">{displayDate(item.effective_from)}{item.effective_until ? ` to ${displayDate(item.effective_until)}` : " onward"}</dd></div>
          <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Record source</dt><dd className="text-right font-semibold">{sourceLabel(item)}</dd></div>
          <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Source reference</dt><dd className="max-w-[65%] text-right font-semibold">{shortReference(item.source_ref)}</dd></div>
          <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Tax setup</dt><dd className="max-w-[65%] text-right font-semibold">{arrangementSummary(item.treatment)}</dd></div>
        </dl>
        <section className="mt-5">
          <h3 className="mb-2 font-bold">Exact compensation breakdown</h3>
          <CompensationBreakdown base={item.base_amount} components={item.components} />
        </section>
        <section className="mt-5 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-700">
          <h3 className="font-bold">Approval history</h3>
          <p className="mt-2 text-slate-600 dark:text-slate-300">{item.approved_at ? `Approved ${displayDateTime(item.approved_at)}` : editableDraft ? "Not submitted yet" : "Approval in progress"}</p>
          {item.source_metadata?.panReference && (
            <p className="mt-2 font-semibold">PAN reference: {shortReference(item.source_metadata.panReference)}</p>
          )}
          {!!item.approval_steps?.length && (
            <ul className="mt-3 space-y-2">
              {item.approval_steps.map((step) => (
                <li key={`${step.userId}:${step.role}`}>
                  <span className="font-semibold">{step.name}</span> · {step.role} · {step.status}
                  {step.timestamp ? ` · ${displayDateTime(step.timestamp)}` : ""}
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
          {editableDraft ? (
            <>
              <Button variant="secondary" onClick={() => { onEditDraft(item); onClose(); }}>Edit draft</Button>
              <Button onClick={() => onSubmitDraft(item)}>Submit for approval</Button>
            </>
          ) : item.stream === "employee_payroll" && (
            <Button onClick={() => { onCopy(item); onClose(); }}>
              {item.source_kind === "approved_pan" ? "Create salary correction" : "Create salary change"}
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
  return (
    <div className="space-y-5 xl:col-span-2">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold">{data.isSelf ? "My Pay Package" : "Compensation overview"}</h2>
              <StatusChip tone="green">Active</StatusChip>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {scope?.name || "Payroll scope"} · Effective {displayDate(item.effective_from)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onViewDetails}>
              Approval &amp; source details
            </Button>
            {data.canEdit && <Button onClick={onUpdate}>Create salary change</Button>}
          </div>
        </div>

        <div className="mt-6"><SummaryCards base={item.base_amount} components={item.components} treatment={item.treatment} /></div>

        <section className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-violet-950">Twice-monthly payroll schedule</p>
              <p className="mt-1 text-sm text-violet-700">One monthly salary, released in two payroll payouts.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm font-semibold">
              <span className="rounded-full bg-white px-3 py-2 text-violet-800">11–25 cutoff → paid on the 5th</span>
              <span className="rounded-full bg-white px-3 py-2 text-violet-800">26–10 cutoff → paid on the 20th</span>
            </div>
          </div>
        </section>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold">Exact compensation breakdown</h3><StatusChip tone="green">Approved</StatusChip></div>
        <div className="mt-4"><CompensationBreakdown base={item.base_amount} components={item.components} /></div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="text-lg font-bold">What may change each payroll</h3>
          <ul className="mt-4 space-y-2 text-sm"><li>Government contributions — recorded estimate {money(preview.estimatedEmployerContributions)}</li><li>Withholding tax and employee deductions — recorded estimate {money(preview.estimatedEmployeeDeductions)}</li><li>Approved loans, authorized NTE deductions, attendance adjustments, overtime, and eligible service charge apply only to the relevant payroll period.</li></ul>
          <p className="mt-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-900">Take-home pay is not presented as guaranteed. It is calculated for a specific payroll period using approved attendance and deductions.</p>
        </Card>
        <Card>
          <h3 className="text-lg font-bold">Source and approval</h3>
          <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt>Source</dt><dd className="font-semibold">{sourceLabel(item)}</dd></div><div className="flex justify-between gap-3"><dt>Version</dt><dd className="font-semibold">{item.version_no || 1}</dd></div><div className="flex justify-between gap-3"><dt>Effective date</dt><dd className="font-semibold">{displayDate(item.effective_from)}</dd></div></dl>
          <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            {item.source_pan_id && <a className="font-semibold text-violet-700" href={`/employees/pan?item=${item.source_pan_id}`}>View approved PAN</a>}
            {item.source_metadata?.sourceDocument?.url && <a className="font-semibold text-violet-700" href={item.source_metadata.sourceDocument.url} target="_blank" rel="noreferrer">Open source document</a>}
            {item.treatment.supportingDocumentLink && <a className="font-semibold text-violet-700" href={item.treatment.supportingDocumentLink} target="_blank" rel="noreferrer">Open document link</a>}
            {item.documents?.map((document) => <button type="button" className="font-semibold text-violet-700" key={document.id} onClick={() => void openPayPackageDocument(document.path)}>View {document.name}</button>)}
            {!item.source_pan_id && !item.source_metadata?.sourceDocument?.url && !item.treatment.supportingDocumentLink && !item.documents?.length && <span className="text-sm text-slate-500">Source document was not attached to this version.</span>}
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
            <p className="text-xs font-semibold text-emerald-700">Guaranteed monthly pay</p>
            <p className="mt-1 text-xl font-bold text-emerald-900">{money(preview.guaranteedMonthlyPay)}</p>
          </div>
          <div className="rounded-xl bg-violet-50 p-4">
            <p className="text-xs font-semibold text-violet-700">Conditional + reimbursable maximum</p>
            <p className="mt-1 text-xl font-bold text-violet-900">{money(preview.conditionalMaximum + preview.reimbursableMaximum)}</p>
          </div>
          <div className="rounded-xl bg-slate-900 p-4 text-white">
            <p className="text-xs font-semibold text-slate-300">Total company cost</p>
            <p className="mt-1 text-xl font-bold">
              {money(preview.estimatedCompanyCost)}
            </p>
          </div>
        </div>
        <dl className="mt-4 space-y-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-700">
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Estimated employee deductions</dt><dd className="font-semibold">{money(preview.estimatedEmployeeDeductions)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Estimated employer contributions</dt><dd className="font-semibold">{money(preview.estimatedEmployerContributions)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Tax treatment</dt><dd className="text-right font-semibold">{arrangementSummary(treatment)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Effective date</dt><dd className="font-semibold">{effective || "Missing"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Package source</dt><dd className="text-right font-semibold">{sourceLabel(source)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Approval status</dt><dd className="font-semibold">Draft — not submitted</dd></div>
        </dl>
        {preview.pending.length > 0 && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            {preview.pending.length} component treatment field(s) must be completed before submission.
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
  const initialDraft =
    initial?.status === "draft" && initial.approval_state !== "pending"
      ? initial
      : undefined;
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
  const [editingDraft, setEditingDraft] = useState<PayPackage | undefined>(initialDraft);
  const correctionSource =
    !editingDraft && sourcePackage?.source_kind === "approved_pan" ? sourcePackage : undefined;
  const [viewingVersion, setViewingVersion] = useState<PayPackage | null>(null);
  const [step, setStep] = useState(1);
  const [scope, setScope] = useState(
    seedPackage?.scope_id || data.scopes.find((s) => s.canEdit)?.id || "",
  );
  const [effective, setEffective] = useState(initialDraft?.effective_from || "");
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
  const [reason, setReason] = useState(initialDraft?.reason || "");
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
    setEditingDraft(undefined);
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
  const editDraft = (item: PayPackage) => {
    setWorkspaceMode("edit");
    setEditingDraft(item);
    setMode("update");
    setSourcePackage(item);
    setScope(item.scope_id);
    setEffective(item.effective_from);
    setRate(item.rate_type);
    setBase(String(item.base_amount ?? ""));
    setTaxRef(item.tax_profile_ref || "");
    setComponents(item.components.map((component) => ({ ...component })));
    setTreatment({ ...emptyTreatment(), ...item.treatment, submissionIntent: "draft" });
    setBasisChoice(
      item.treatment.coverageMode === "gross_selected"
        ? "gross_selected"
        : item.treatment.payBasis || "gross",
    );
    setSourceRef(item.source_ref || "");
    setReason(item.reason || "");
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
  const packageValidationErrors = validatePayPackage({
    baseAmount: base,
    components,
    treatment,
  });
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
              packageValidationErrors.length === 0,
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
        sourceKind: editingDraft
          ? editingDraft.source_kind || "direct_entry"
          : correctionSource
          ? "correction"
          : sourcePackage
            ? "copied_package"
            : "direct_entry",
        correctionOfId: correctionSource?.id || null,
      };
      const id = editingDraft?.id || await savePayPackage(
          data.employeeId,
          scope,
          payload,
          data.sourceHash,
        );
      if (editingDraft) {
        await updatePayPackageDraft(editingDraft.id, scope, payload, data.sourceHash);
      }
      if (document) await uploadPayPackageDocument(id, document);
      if (editingDraft && intent === "approval") {
        await submitPayPackageDraft(editingDraft.id);
      }
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
      setNotice(intent === "approval"
        ? "Submitted to the HR Manager and Finance approval route."
        : editingDraft
          ? "Draft changes saved."
          : "Draft saved.");
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
            onEditDraft={editDraft}
            onSubmitDraft={(item) => void submitExistingDraft(item)}
          />
        )}
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {editingDraft ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div>
            <strong className="text-amber-950">Editing saved draft</strong>
            <p className="mt-1 text-sm text-amber-800">Changes update this same draft. No duplicate package version will be created.</p>
          </div>
          <StatusChip tone="amber">Not submitted</StatusChip>
        </div>
      ) : currentPackage ? (
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
                  {editingDraft ? "Edit pay-package draft" : mode === "initial" ? "Initial package setup" : "Create new package version"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editingDraft
                    ? "Update the saved values below, then save again or submit this same draft for approval."
                    : mode === "initial"
                    ? "This creates the employee’s first dated compensation record. It will not replace an existing package."
                    : "The current approved package remains unchanged. Payroll will use this version only from its effective date."}
                </p>
              </div>
              <Label title={editingDraft ? "Business unit / payroll group (locked for this draft)" : "Business unit / payroll group"}>
                <select
                  className={field}
                  value={scope}
                  disabled={Boolean(editingDraft)}
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
            {mode === "update" && sourcePackage && !editingDraft && (
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
            <Label title="Estimated employee deductions" hint="Exact approved estimate; the final amount is payroll-period specific.">
              <input className={field} type="number" min="0" step="0.01" value={treatment.estimatedEmployeeDeductions || "0"} onChange={(e) => setTreatment({ ...treatment, estimatedEmployeeDeductions: e.target.value })} />
            </Label>
            <Label title="Estimated employer contributions" hint="Company-paid statutory contribution estimate.">
              <input className={field} type="number" min="0" step="0.01" value={treatment.estimatedEmployerContributions || "0"} onChange={(e) => setTreatment({ ...treatment, estimatedEmployerContributions: e.target.value })} />
            </Label>
            <Label title="Estimated employer-paid tax">
              <input className={field} type="number" min="0" step="0.01" value={treatment.estimatedEmployerTax || "0"} onChange={(e) => setTreatment({ ...treatment, estimatedEmployerTax: e.target.value })} />
            </Label>
            <Label title="Expected reimbursable cost" hint="Separate from guaranteed salary.">
              <input className={field} type="number" min="0" step="0.01" value={treatment.expectedReimbursableCost || "0"} onChange={(e) => setTreatment({ ...treatment, expectedReimbursableCost: e.target.value })} />
            </Label>
          </div>
          <p className="mt-6 rounded-xl bg-violet-50 p-4 text-sm font-medium text-violet-900">
            {arrangementSummary(treatment)}
          </p>
          {basisChoice === "gross_selected" && (
            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
              <h3 className="font-bold">Select components with employer-paid tax</h3>
              <div className="mt-3 space-y-2">{components.filter((component) => component.taxTreatment === "taxable").map((component, index) => <label key={`${component.name}:${index}`} className="flex items-center gap-3 rounded-lg bg-white p-3"><input type="checkbox" checked={Boolean(component.employerPaidTax)} onChange={(e) => setComponents(components.map((item) => item === component ? { ...item, employerPaidTax: e.target.checked } : item))} /><span><strong>{component.name || `Component ${index + 1}`}</strong> · {money(component.amount)}</span></label>)}</div>
              {components.every((component) => component.taxTreatment !== "taxable") && <p className="mt-2">Add a taxable component first.</p>}
            </div>
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
              {initial && !correctionSource && !editingDraft && (
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
                {editingDraft ? "Save changes" : "Save draft"}
              </Button>
              <Button disabled={packageValidationErrors.length > 0} isLoading={busy} onClick={() => void save("approval")}>
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
        <VersionDetails item={viewingVersion} data={data} onClose={() => setViewingVersion(null)} onCopy={copyPackage} onEditDraft={editDraft} onSubmitDraft={(item) => void submitExistingDraft(item)} />
      )}
    </div>
  );
};

export default PayPackageBuilder;
