import React, { useEffect, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import EmployeePayslipDocument from "./EmployeePayslipDocument";
import DetailedPayrollCalculationReport from "./DetailedPayrollCalculationReport";
import { buildStyledPayslipPdf } from "./payslipPdf";

type Line = { label: string; amount: string; date?: string };
type Slip = {
  employeeName: string;
  employeeCode: string;
  businessUnit: string;
  from: string;
  to: string;
  payDate: string;
  gross: string;
  deductions: string;
  net: string;
  tax: string;
  employer: string;
  employerTotalCost: string;
  contributions: Line[];
  lines: Line[];
  assumptions: string[];
  calculationVersion: string;
  snapshotHash: string;
  department?: string;
  position?: string;
  payrollStatus?: string;
  attendanceSummary?: Record<string, string | number>;
};
type Output = {
  payload: Slip;
  snapshotId: string | null;
  generatedAt: string | null;
  canGenerate: boolean;
};
const money = (v: string | number | null | undefined) =>
  v == null
    ? "Missing"
    : new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
      }).format(Number(v));
const labels: Record<string, string> = {
  sssEE: "SSS employee share",
  sssER: "SSS employer share",
  mpfEE: "SSS MPF employee share",
  mpfER: "SSS MPF employer share",
  ecER: "Employees compensation - employer",
  philhealthEE: "PhilHealth employee share",
  philhealthER: "PhilHealth employer share",
  pagibigEE: "Pag-IBIG employee share",
  pagibigER: "Pag-IBIG employer share",
};
const button =
  "min-h-11 rounded-lg border border-violet-300 px-4 py-2 font-semibold text-violet-700 disabled:opacity-50";
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvCell(value: unknown) {
  const text = String(value ?? "Missing");
  return (
    '"' +
    (/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') +
    '"'
  );
}
export async function payslipPdf(s: Slip, snapshotId: string) {
  void snapshotId;
  return (await buildStyledPayslipPdf(s, true)).output("blob");
}
export default function EmployeeTestOutputs({
  scope,
  from,
  to,
  employeeId,
}: {
  scope: string;
  from: string;
  to: string;
  employeeId: string;
}) {
  const [output, setOutput] = useState<Output | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [showSlip, setShowSlip] = useState(false);
  const args = {
    p_scope: scope,
    p_from: from,
    p_to: to,
    p_employee: employeeId,
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    setOutput(null);
    setError("");
    Promise.resolve(
      supabase.rpc("employee_test_payroll_output", { ...args, p_save: false }),
    )
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        else setOutput(data);
      })
      .catch((e) => {
        if (active) setError(e.message || "Pay review could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope, from, to, employeeId]);
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.rpc(
        "employee_test_payroll_output",
        { ...args, p_save: true },
      );
      if (error) throw error;
      setOutput(data);
      setShowSlip(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pdf() {
    if (!output?.snapshotId) return;
    setBusy(true);
    setError("");
    try {
      download(
        await payslipPdf(output.payload, output.snapshotId),
        `TEST-${output.payload.employeeCode}-${to}-payslip.pdf`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const s = output?.payload;
  function worksheet(agency: string, items: Line[]) {
    if (!s || !output?.snapshotId) return;
    const rows = [
      ["TEST WORKSHEET - NOT FOR SUBMISSION"],
      [
        "Employee",
        "Employee ID",
        "Business unit",
        "Cutoff from",
        "Cutoff to",
        "Pay date",
        "Contribution",
        "Amount",
        "Snapshot",
      ],
      ...items.map((x) => [
        s.employeeName,
        s.employeeCode,
        s.businessUnit,
        from,
        to,
        s.payDate,
        labels[x.label] || x.label,
        x.amount,
        output.snapshotId,
      ]),
    ];
    download(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
      `TEST-${s.employeeCode}-${agency}-${to}.csv`,
    );
  }
  return (
    <section
      aria-label="Employee pay and outputs"
      className="mt-6 space-y-5 rounded-2xl border border-violet-200 bg-white p-5 dark:bg-slate-900"
    >
      <header>
        <p className="font-bold text-violet-700">
          Next step · Review pay & benefits
        </p>
        <h3 className="mt-1 text-2xl font-bold">
          Payslip & government contributions
        </h3>
        <p className="mt-2 text-sm">
          This employee can generate draft outputs independently. Other
          employees' unresolved issues do not block this test.
        </p>
      </header>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        TEST payroll · mock assumptions. Attendance ready does not mean payroll
        approved or paid. Nothing is sent to the employee, bank, or government.
      </p>
      {loading && (
        <p role="status">Calculating this employee's pay and contributions…</p>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {s && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Gross pay", s.gross],
              ["Total deductions", s.deductions],
              ["Net pay", s.net],
            ].map(([k, v]) => (
              <div
                className="rounded-xl bg-violet-50 p-4 text-slate-900"
                key={k}
              >
                <p>{k}</p>
                <strong className="text-2xl">{money(v)}</strong>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="mb-2 text-left text-lg font-bold">
                Government benefits · selected cutoff allocation
              </caption>
              <thead>
                <tr>
                  <th className="p-2">Contribution</th>
                  <th className="p-2">Employee deduction</th>
                  <th className="p-2">Employer cost</th>
                </tr>
              </thead>
              <tbody>
                {s.contributions.map((x) => (
                  <tr className="border-t" key={x.label}>
                    <td className="p-2">{labels[x.label] || x.label}</td>
                    <td className="p-2">
                      {x.label.endsWith("EE")
                        ? money(x.amount)
                        : "Not applicable"}
                    </td>
                    <td className="p-2">
                      {x.label.endsWith("ER")
                        ? money(x.amount)
                        : "Not applicable"}
                    </td>
                  </tr>
                ))}
                <tr className="border-t">
                  <td className="p-2">Withholding tax</td>
                  <td className="p-2">{money(s.tax)}</td>
                  <td className="p-2">See pay arrangement</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="font-semibold">
            Employer contributions: {money(s.employer)} · Total company cost:{" "}
            {money(s.employerTotalCost)}
          </p>
          {!output.snapshotId ? (
            <button
              disabled={busy || !output.canGenerate}
              className={button + " bg-violet-600 !text-white"}
              onClick={() => void generate()}
            >
              {busy
                ? "Generating…"
                : "Generate this employee’s draft payslip & worksheets"}
            </button>
          ) : (
            <div className="space-y-3">
              <p role="status" className="font-bold text-emerald-700">
                Draft outputs saved · 1 employee · private, not released
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  className={button}
                  onClick={() => setShowSlip((v) => !v)}
                >
                  {showSlip ? "Hide payslip" : "View payslip"}
                </button>
                <button
                  disabled={busy}
                  className={button}
                  onClick={() => void pdf()}
                >
                  Download payslip PDF
                </button>
              </div>
              <h4 className="text-lg font-bold">Government worksheets</h4>
              <p className="text-sm">
                Preview the contribution rows above or download each worksheet.
                These are not agency upload files. Employer/member identifiers,
                full reporting-period reconciliation and approved payroll must
                be verified before filing. BIR 2316 is not generated from a
                single cutoff.
              </p>
              <div className="flex flex-wrap gap-3">
                {[
                  ["SSS", /^(sss|mpf|ec)/],
                  ["PhilHealth", /^philhealth/],
                  ["Pag-IBIG", /^pagibig/],
                ].map(([name, re]) => (
                  <button
                    key={String(name)}
                    className={button}
                    onClick={() =>
                      worksheet(
                        String(name),
                        s.contributions.filter((x) =>
                          (re as RegExp).test(x.label),
                        ),
                      )
                    }
                  >
                    Download {String(name)} worksheet
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Snapshot: {output.snapshotId} · {output.generatedAt} ·{" "}
                {s.calculationVersion}
              </p>
            </div>
          )}
          {showSlip && output.snapshotId && (
            <div aria-label="Draft payslip preview">
              <EmployeePayslipDocument slip={s} test />
            </div>
          )}
          <details>
            <summary className="cursor-pointer font-semibold text-violet-700">
              View detailed payroll calculation in HRIS
            </summary>
            <div className="mt-4">
              <DetailedPayrollCalculationReport slip={s} assumptions={s.assumptions} calculationVersion={s.calculationVersion} snapshotId={output.snapshotId} />
            </div>
          </details>
          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
            <strong>
              Next step after testing: prepare verified payroll for approval
            </strong>
            <p className="mt-1 text-sm">
              These mock draft outputs cannot authorize payment or government
              filing. Official payroll still requires verified pay inputs and
              the existing approval workflow.
            </p>
            <a
              className="mt-2 inline-block font-bold text-violet-700 underline"
              href="/payroll/gross-pay"
            >
              Open official payroll calculation →
            </a>
          </div>
        </>
      )}
    </section>
  );
}
