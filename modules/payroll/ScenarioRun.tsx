import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabaseClient";

type Employee = {
  id: string;
  name: string;
  code: string;
  hireDate: string | null;
  endDate: string | null;
};
type Day = {
  employeeId: string;
  date: string;
  ready?: boolean;
  scheduleState?: string;
  lateMinutes: number;
  undertimeMinutes: number;
  actualMinutes: number;
  breakMinutes: number;
  approvedOtMinutes: number;
  issues: string[];
};
type Line = {
  date?: string;
  label: string;
  quantity: string;
  rate: string;
  factor: string;
  amount: string;
};
type Gross = {
  employeeId: string;
  gross: string | null;
  lines: Line[];
  issues: string[];
};
type Net = {
  employeeId: string;
  gross: string;
  deductions: string;
  net: string;
};
type Event = { employeeId: string; timestamp: string; type: string };
type Shift = {
  employeeId: string;
  date: string;
  kind: string;
  name?: string;
  start?: string;
  end?: string;
};
type Source = { events: Event[]; shifts: Shift[] };
type Demo = {
  calculatedAt: string;
  assumptions: string[];
  timeResult: { rows: Day[] };
  scenarioGross: { employees: Gross[] };
  comparisonNet: {
    ready: boolean;
    gross: string;
    deductions: string;
    net: string;
    employees: Net[];
  };
  scenarioSource?: Source;
};
type Package = {
  employee_id: string;
  effective_from: string;
  base_amount: number;
  rate_type: string;
  status: string;
  source_ref: string;
  treatment: Record<string, unknown>;
  components: unknown[];
  isMock?: boolean;
};
type FormValues = {
  scheduleKind: string;
  scheduleStart: string;
  scheduleEnd: string;
  clockIn: string;
  breakStart: string;
  breakEnd: string;
  clockOut: string;
};
type Correction = {
  employee_id: string;
  work_date: string;
  issue_type: string;
  original_value: FormValues;
  corrected_value: FormValues;
  reason: string;
  status: string;
  failure_message?: string;
  updated_at: string;
};
type Audit = {
  employeeId: string;
  workDate: string;
  action: string;
  reason: string;
  createdAt: string;
};
type Snapshot = {
  employees: Employee[];
  packages: Package[];
  demo?: Demo;
  blockers: { employeeId: string; reason: string }[];
  scenarios: { employeeId: string; date: string; scenario: string }[];
  timeResult: { rows: Day[] };
  source: Source;
};
type Run = {
  label: string;
  status: string;
  date_from: string;
  date_to: string;
  pay_date: string;
  timezone: string;
  canCalculateTest: boolean;
  canApproveTestCorrections: boolean;
  corrections: Correction[];
  correctionAudit: Audit[];
  snapshot: Snapshot;
};
type Issue = {
  employee: Employee;
  day: Day;
  label: string;
  action:
    | "Fix attendance"
    | "Review schedule"
    | "Review overtime"
    | "Review pay package"
    | "Send for approval";
  severity: "attention" | "blocked" | "pending";
};
type IssueCategory = "Attendance" | "Schedule" | "Payroll setup" | "Overtime";
type IssueGroup = {
  employee: Employee;
  items: Issue[];
  status: "Needs attention" | "Blocking payroll";
  counts: Record<IssueCategory, number>;
};
type CorrectionPreset = {
  id: string;
  title: string;
  body: string;
  reason: string;
  values: Partial<FormValues>;
  approval?: boolean;
  navigate?: boolean;
};
type GeneratedOutput = {
  id: string;
  status: string;
  errorMessage?: string;
  payload: Record<string, unknown>;
};
type GovernmentOutput = {
  id: string;
  code: string;
  status: string;
  errorMessage?: string;
  payload: Record<string, unknown>;
};
type ApprovalStep = {
  step: number;
  label: string;
  status: "Ready" | "Waiting" | "Approved" | "Rejected" | "Needs attention";
  actorId?: string;
  reason?: string;
  occurredAt?: string;
  canAct: boolean;
};
type Completion = {
  seedRunId: string;
  status: string;
  gross: number;
  net: number;
  employees: number;
  unresolvedIssues: number;
  canGenerate: boolean;
  batch: null | {
    status: string;
    failureMessage?: string;
    generatedAt?: string;
    releasedAt?: string;
    snapshotHash: string;
  };
  payslips: GeneratedOutput[];
  governmentReports: GovernmentOutput[];
  approvals: ApprovalStep[];
  approvalStarted: boolean;
  allApprovalsComplete: boolean;
  canRelease: boolean;
  audit: {
    action: string;
    detail: Record<string, unknown>;
    createdAt: string;
  }[];
};

const money = (value: string | number | null | undefined) =>
  value == null
    ? "Held"
    : new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
      }).format(Number(value));
const displayDate = (value: string, withYear = false) =>
  new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
  });
const time = (stamp?: string) =>
  stamp
    ? new Date(stamp).toLocaleTimeString("en-PH", {
        timeZone: "Asia/Manila",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
const emptyForm: FormValues = {
  scheduleKind: "work",
  scheduleStart: "09:00",
  scheduleEnd: "18:00",
  clockIn: "",
  breakStart: "",
  breakEnd: "",
  clockOut: "",
};
const issueActionForLabel = (label: string): Issue["action"] => {
  const text = label.toLowerCase();
  if (text.includes("schedule")) return "Review schedule";
  if (text.includes("overtime") || text.includes("ot approval"))
    return "Review overtime";
  return "Fix attendance";
};
const issueLabel = (issues: string[]) => {
  const text = issues.join(" ").toLowerCase();
  if (text.includes("clock-out") || text.includes("unpaired"))
    return "Missing punches";
  if (text.includes("lunch") || text.includes("break"))
    return "Missing or extended break";
  if (text.includes("schedule")) return "Published schedule missing";
  if (text.includes("ot ") || text.includes("overtime"))
    return "OT approval incomplete";
  if (text.includes("employment start"))
    return "Timekeeping setup needed — employment start date missing";
  if (text.includes("absence")) return "Attendance or absence needs review";
  return (issues[0] || "Attendance needs review").replace(
    /Employee profile information incomplete/gi,
    "Timekeeping setup needed",
  );
};
const issueCategory = (item: Issue): IssueCategory => {
  const label = item.label.toLowerCase();
  if (label.includes("schedule")) return "Schedule";
  if (/setup|salary source|employment start/.test(label))
    return "Payroll setup";
  if (label.includes("overtime") || label.includes("ot approval"))
    return "Overtime";
  return "Attendance";
};

function StatusPill({ status }: { status: string }) {
  const color =
    status === "Ready" || status === "Ready after correction"
      ? "bg-emerald-100 text-emerald-800"
      : status === "Blocked" || status === "Recalculation failed"
        ? "bg-rose-100 text-rose-800"
        : status === "Pending approval"
          ? "bg-blue-100 text-blue-800"
          : "bg-amber-100 text-amber-800";
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${color}`}
    >
      {status}
    </span>
  );
}

function CorrectionDrawer({
  open,
  scope,
  run,
  employee,
  day,
  values,
  issue,
  title,
  onClose,
  onSaved,
  onRecalculate,
  onOpenSchedule,
}: {
  open: boolean;
  scope: string;
  run: Run;
  employee: Employee | null;
  day: Day | null;
  values: FormValues;
  issue: string;
  title: string;
  onClose: () => void;
  onSaved: (openNext: boolean) => void;
  onRecalculate: () => Promise<void>;
  onOpenSchedule: () => void;
}) {
  const [form, setForm] = useState(values),
    [reason, setReason] = useState(""),
    [preset, setPreset] = useState(""),
    [openNext, setOpenNext] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setForm(values);
    setReason("");
    setPreset("");
    setError("");
  }, [values, employee?.id, day?.date, open]);
  if (!open || !employee || !day) return null;
  const issueText = issue.toLowerCase();
  const presets: CorrectionPreset[] = issueText.includes("break")
    ? [
        {
          id: "scheduled-break",
          title: "Use scheduled break",
          body: "Set break to 12:00 PM–1:00 PM.",
          reason: "Used the published scheduled break.",
          values: { breakStart: "12:00", breakEnd: "13:00" },
        },
        {
          id: "compliant-break",
          title: "Mark break compliant",
          body: "No pay impact; retain original punch evidence.",
          reason: "Break marked compliant; original punch evidence retained.",
          values: {},
        },
        {
          id: "exception",
          title: "Keep as exception",
          body: "Send to manager for review.",
          reason: "Kept as an attendance exception for manager review.",
          values: {},
          approval: true,
        },
      ]
    : issueText.includes("schedule")
      ? [
          {
            id: "open-schedule",
            title: "Open Schedule Builder",
            body: "Publish the employee schedule for this date.",
            reason: "",
            values: {},
            navigate: true,
          },
          {
            id: "copy-schedule",
            title: "Copy previous schedule",
            body: "Use the last published 9:00 AM–6:00 PM schedule.",
            reason: "Copied the previous published schedule.",
            values: {
              scheduleKind: "work",
              scheduleStart: "09:00",
              scheduleEnd: "18:00",
            },
          },
          {
            id: "request-schedule",
            title: "Request schedule confirmation",
            body: "Send this date to the manager.",
            reason: "Schedule confirmation requested from manager.",
            values: {},
            approval: true,
          },
        ]
      : issueText.includes("punch") || !values.clockOut
        ? [
            {
              id: "scheduled-end",
              title: "Use scheduled end time",
              body: `Set clock-out to ${values.scheduleEnd || "6:00 PM"}.`,
              reason: "Used the published scheduled end time.",
              values: { clockOut: values.scheduleEnd || "18:00" },
            },
            {
              id: "clarification",
              title: "Send for clarification",
              body: "Ask the employee or manager to confirm the clock-out.",
              reason: "Clock-out clarification requested.",
              values: {},
              approval: true,
            },
            {
              id: "exception",
              title: "Keep as exception",
              body: "Retain the issue for payroll review.",
              reason: "Kept as an attendance exception for review.",
              values: {},
              approval: true,
            },
          ]
        : [
            {
              id: "approved-adjustment",
              title: "Apply approved adjustment",
              body: "Apply the approved attendance adjustment and recalculate.",
              reason: "Approved attendance adjustment applied.",
              values: {},
            },
            {
              id: "manager-review",
              title: "Send to manager",
              body: "Keep the current punches and request approval.",
              reason: "Attendance issue sent to manager for approval.",
              values: {},
              approval: true,
            },
            {
              id: "exception",
              title: "Keep as exception",
              body: "Retain the issue for payroll review.",
              reason: "Kept as an attendance exception for review.",
              values: {},
              approval: true,
            },
          ];
  const choose = (choice: (typeof presets)[number]) => {
    if (choice.navigate) {
      onOpenSchedule();
      return;
    }
    setPreset(choice.id);
    setForm((current) => ({ ...current, ...choice.values }));
    setReason(choice.reason);
  };
  const selectedPreset = presets.find((choice) => choice.id === preset);
  const save = async (_mode: "save" | "recalculate") => {
    setError("");
    if (!preset && reason.trim().length < 3) {
      setError(
        "Choose a preset correction or enter a correction note in advanced fields.",
      );
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_test_payroll_correction", {
        p_scope: scope,
        p_from: run.date_from,
        p_to: run.date_to,
        p_employee: employee.id,
        p_date: day.date,
        p_issue: issue,
        p_values: form,
        p_reason: reason || "Approved preset correction applied.",
        p_submit_for_approval: !!selectedPreset?.approval,
      });
      if (error) throw error;
      await onRecalculate();
      onClose();
      onSaved(openNext);
    } catch (e) {
      setError(
        (e as { message?: string }).message ||
          "The correction could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  const set = (key: keyof FormValues, value: string) =>
    setForm((v) => ({ ...v, [key]: value }));
  return (
    <div
      className="fixed inset-0 z-[90] bg-slate-950/35"
      role="dialog"
      aria-modal="true"
      aria-label="Detailed attendance correction"
    >
      <aside className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-violet-600">
              Detailed correction · {run.label}
            </p>
            <h2 className="mt-1 text-2xl font-black">{title}</h2>
            <p className="mt-2 font-semibold">
              {employee.name} · Bakebe – SM Aura · {displayDate(day.date, true)}
            </p>
            <p className="text-amber-700">{issue}</p>
          </div>
          <button
            className="min-h-11 px-3 text-2xl"
            onClick={onClose}
            aria-label="Close correction drawer"
          >
            ×
          </button>
        </div>
        <div className="mt-6 rounded-xl bg-violet-50 p-4 text-sm text-violet-900">
          <b>Common corrections use a preset.</b> Open advanced fields only when
          needed.
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {presets.map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => choose(choice)}
              className={`min-h-32 rounded-2xl border p-4 text-left transition ${preset === choice.id ? "border-violet-600 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 hover:border-violet-300"}`}
            >
              <span className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-violet-100 text-lg text-violet-700">
                {choice.navigate ? "↗" : choice.approval ? "↪" : "✓"}
              </span>
              <b className="block">{choice.title}</b>
              <span className="mt-1 block text-sm text-slate-500">
                {choice.body}
              </span>
            </button>
          ))}
        </div>
        <details className="mt-5 rounded-xl border p-4">
          <summary className="cursor-pointer font-bold">
            Advanced time fields
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold">
              Schedule
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
                value={form.scheduleKind}
                onChange={(e) => set("scheduleKind", e.target.value)}
              >
                <option value="work">Work day</option>
                <option value="rest">Rest day</option>
              </select>
            </label>
            {form.scheduleKind === "work" && (
              <>
                <label className="text-sm font-bold">
                  Schedule start
                  <input
                    type="time"
                    className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
                    value={form.scheduleStart}
                    onChange={(e) => set("scheduleStart", e.target.value)}
                  />
                </label>
                <label className="text-sm font-bold">
                  Schedule end
                  <input
                    type="time"
                    className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
                    value={form.scheduleEnd}
                    onChange={(e) => set("scheduleEnd", e.target.value)}
                  />
                </label>
              </>
            )}
            {[
              ["Clock in", "clockIn"],
              ["Break start", "breakStart"],
              ["Break end", "breakEnd"],
              ["Clock out", "clockOut"],
            ].map(([label, key]) => (
              <label className="text-sm font-bold" key={key}>
                {label}
                <input
                  type="time"
                  className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
                  value={form[key as keyof FormValues]}
                  onChange={(e) => set(key as keyof FormValues, e.target.value)}
                />
              </label>
            ))}
          </div>
          <label className="mt-4 block text-sm font-bold">
            Correction note{" "}
            <span className="font-normal text-slate-500">
              (optional for presets)
            </span>
            <textarea
              className="mt-1 min-h-20 w-full rounded-lg border p-3 font-normal"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Add context only when needed"
            />
          </label>
        </details>
        <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
          <p>
            <b>Attendance:</b> Needs attention → Ready after correction
          </p>
          <p>
            <b>Pay impact:</b> Recalculate after saving
          </p>
          <p className="mt-3 text-sm font-semibold">
            This correction affects only this employee and this date.
          </p>
        </div>
        {error && (
          <div
            className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700"
            role="alert"
          >
            {error}
          </div>
        )}
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={openNext}
            onChange={(e) => setOpenNext(e.target.checked)}
          />{" "}
          Open next issue after saving
        </label>
        <div className="mt-auto flex flex-wrap justify-end gap-2 pt-6">
          <button
            disabled={busy}
            className="min-h-11 rounded-lg border px-4"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            disabled={busy}
            className="min-h-11 rounded-lg border border-violet-300 px-4 font-bold text-violet-700"
            onClick={() => void save("save")}
          >
            Save correction
          </button>
          <button
            disabled={busy}
            className="min-h-11 rounded-lg bg-violet-600 px-4 font-bold text-white"
            onClick={() => void save("recalculate")}
          >
            {busy ? "Saving…" : "Save & recalculate"}
          </button>
        </div>
      </aside>
    </div>
  );
}

const workflowSteps = [
  "Review attendance",
  "Finalize payroll",
  "Generate outputs",
  "Approve & release",
];
const governmentLabels: Record<string, string> = {
  SSS_R3: "SSS R3",
  PHILHEALTH_RF1: "PhilHealth RF-1",
  PAGIBIG_MCRF: "Pag-IBIG MCRF",
  BIR_2316: "BIR 2316",
};
const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function WorkflowStepper({
  current,
  released = false,
}: {
  current: number;
  released?: boolean;
}) {
  return (
    <ol
      className="grid gap-3 md:grid-cols-4"
      aria-label="Payroll completion progress"
    >
      {workflowSteps.map((label, index) => {
        const number = index + 1,
          complete = released || number < current,
          active = !released && number === current;
        return (
          <li key={label} className="relative">
            <div
              className={`flex min-h-16 items-center gap-3 rounded-xl border px-4 ${complete ? "border-emerald-200 bg-emerald-50 text-emerald-800" : active ? "border-violet-500 bg-violet-50 text-violet-800 ring-2 ring-violet-100" : "border-slate-200 bg-white text-slate-400"}`}
              aria-current={active ? "step" : undefined}
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-black ${complete ? "bg-emerald-600 text-white" : active ? "bg-violet-600 text-white" : "bg-slate-100"}`}
              >
                {complete ? "✓" : number}
              </span>
              <span>
                <b className="block">{label}</b>
                <small>
                  {complete ? "Complete" : active ? "Current step" : "Waiting"}
                </small>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function PreviewModal({
  title,
  data,
  onClose,
}: {
  title: string;
  data: Record<string, unknown>;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[95] grid place-items-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-violet-600">
              Draft preview
            </p>
            <h3 className="mt-1 text-2xl font-black">{title}</h3>
          </div>
          <button
            className="min-h-11 px-3 text-2xl"
            onClick={onClose}
            aria-label="Close preview"
          >
            ×
          </button>
        </div>
        {String(data.employeeName || "") && (
          <div className="mt-6 rounded-xl bg-violet-50 p-5">
            <p className="text-lg font-bold">{String(data.employeeName)}</p>
            <p>
              {String(data.employeeCode || "")} ·{" "}
              {String(data.businessUnit || "")}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ["Gross pay", data.gross],
                ["Deductions", data.deductions],
                ["Net pay", data.net],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <p className="text-sm text-slate-500">{label as string}</p>
                  <b className="text-xl">{money(value as string | number)}</b>
                </div>
              ))}
            </div>
          </div>
        )}
        <pre className="mt-5 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
          {JSON.stringify(data, null, 2)}
        </pre>
      </section>
    </div>
  );
}

function PayrollCompletion({
  scope,
  run,
  onViewAttendance,
}: {
  scope: string;
  run: Run;
  onViewAttendance: () => void;
}) {
  const [state, setState] = useState<Completion | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<{
      title: string;
      data: Record<string, unknown>;
    } | null>(null),
    [register, setRegister] = useState(false),
    [reason, setReason] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    const { data, error } = await supabase.rpc("get_test_payroll_completion", {
      p_scope: scope,
      p_from: run.date_from,
      p_to: run.date_to,
    });
    if (error) setError(error.message);
    else setState(data as Completion);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [scope, run.date_from, run.date_to]);
  const call = async (
    name:
      | "generate_test_payroll_outputs"
      | "start_test_payroll_approval"
      | "release_test_payroll_outputs",
    args: Record<string, unknown> = {},
  ) => {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.rpc(name, {
        p_scope: scope,
        p_from: run.date_from,
        p_to: run.date_to,
        ...args,
      });
      if (error) throw error;
      setState(data as Completion);
    } catch (e) {
      setError(
        (e as { message?: string }).message ||
          "The action could not be completed.",
      );
      await load();
    } finally {
      setBusy(false);
    }
  };
  const decide = async (step: ApprovalStep, action: "approve" | "reject") => {
    if (action === "reject" && reason.trim().length < 3) {
      setError("Enter a clear rejection reason.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.rpc(
        "act_test_payroll_completion",
        {
          p_scope: scope,
          p_from: run.date_from,
          p_to: run.date_to,
          p_step: step.step,
          p_action: action,
          p_reason: reason || null,
        },
      );
      if (error) throw error;
      setState(data as Completion);
      setReason("");
    } catch (e) {
      setError(
        (e as { message?: string }).message ||
          "The approval decision could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  const downloadReport = (report: GovernmentOutput) =>
    saveBlob(
      new Blob([JSON.stringify(report.payload, null, 2)], {
        type: "application/json",
      }),
      `${report.code}-${run.date_from}-${run.date_to}.json`,
    );
  const downloadZip = async () => {
    setBusy(true);
    setError("");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const slip of state?.payslips || [])
        zip.file(
          `${String(slip.payload.employeeCode || slip.payload.employeeName)}-payslip.json`,
          JSON.stringify(slip.payload, null, 2),
        );
      saveBlob(
        await zip.generateAsync({ type: "blob" }),
        `TEST-Bakebe-SM-Aura-${run.pay_date}-payslips.zip`,
      );
    } catch (e) {
      setError(
        (e as { message?: string }).message ||
          "The payslip ZIP could not be prepared.",
      );
    } finally {
      setBusy(false);
    }
  };
  if (loading)
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm" role="status">
        Loading payroll completion workflow…
      </div>
    );
  if (!state)
    return (
      <div
        className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800"
        role="alert"
      >
        {error || "Payroll completion status is unavailable."}{" "}
        <button className="font-bold underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  const released = state.batch?.status === "Released",
    current = released ? 4 : state.approvalStarted ? 4 : state.batch ? 3 : 2,
    readyPayslips = state.payslips.filter(
      (x) => x.status === "Ready" || x.status === "Released",
    ).length,
    readyReports = state.governmentReports.filter(
      (x) => x.status === "Ready" || x.status === "Released",
    ).length,
    currentApproval = state.approvals.find(
      (x) =>
        x.status === "Ready" ||
        x.status === "Rejected" ||
        x.status === "Needs attention",
    );
  const checklist = [
    ["Payroll register locked", !!state.batch],
    ["Payroll snapshot saved", !!state.batch?.snapshotHash],
    ["Payslips generated", readyPayslips === state.employees],
    ["Government reports ready", readyReports === 4],
    ["All attendance exceptions resolved", state.unresolvedIssues === 0],
    ["Required approvals completed", state.allApprovalsComplete],
  ] as const;
  return (
    <section
      className="space-y-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900 sm:p-6"
      aria-label="Payroll completion workflow"
    >
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-lg bg-amber-100 px-4 py-2 text-sm font-black text-amber-900">
            TEST
          </span>
          <h2 className="text-2xl font-black sm:text-3xl">
            Bakebe SM Aura · September 5, 2026 Payroll
          </h2>
        </div>
        <p className="mt-2 text-slate-600">
          August 11–25, 2026 · Pay date September 5, 2026 · Asia/Manila
        </p>
      </header>
      <WorkflowStepper current={current} released={released} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Gross pay", money(state.gross), "bg-emerald-50 text-emerald-700"],
          ["Net pay", money(state.net), "bg-violet-50 text-violet-700"],
          ["Employees", state.employees, "bg-sky-50 text-sky-700"],
          [
            "Unresolved issues",
            state.unresolvedIssues,
            state.unresolvedIssues
              ? "bg-amber-50 text-amber-800"
              : "bg-emerald-50 text-emerald-700",
          ],
        ].map(([label, value, tone]) => (
          <div
            key={label as string}
            className="rounded-2xl bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-semibold text-slate-500">
              {label as string}
            </p>
            <strong className={`mt-2 block rounded-xl p-3 text-2xl ${tone}`}>
              {value as React.ReactNode}
            </strong>
          </div>
        ))}
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 font-semibold text-rose-800"
        >
          {error}
        </div>
      )}
      {!state.batch && (
        <section className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">
              {state.status}
            </span>
            <h3 className="mt-4 text-2xl font-black">
              Payroll is ready for output generation
            </h3>
            <p className="mt-2 text-slate-600">
              The current payroll register and calculation inputs will be frozen
              into an immutable test snapshot before draft outputs are created.
            </p>
            <button
              disabled={busy || !state.canGenerate}
              className="mt-6 min-h-12 w-full rounded-xl bg-violet-600 px-5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void call("generate_test_payroll_outputs")}
            >
              {busy
                ? "Freezing snapshot and generating…"
                : "Generate payslips & reports"}
            </button>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                className="min-h-11 rounded-xl border px-4 font-bold"
                onClick={() => setRegister(true)}
              >
                View payroll register
              </button>
              <button
                className="min-h-11 rounded-xl border px-4 font-bold"
                onClick={onViewAttendance}
              >
                View attendance corrections
              </button>
            </div>
            <p className="mt-5 border-t pt-4 text-sm text-slate-500">
              Draft outputs only · nothing is released or sent yet.
            </p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-black">What will be created</h3>
            <ul className="mt-4 space-y-4">
              {[
                `${state.employees} employee payslips`,
                "SSS R3",
                "PhilHealth RF-1",
                "Pag-IBIG MCRF",
                "BIR 2316",
              ].map((x) => (
                <li className="flex items-center gap-3" key={x}>
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 font-black text-emerald-700">
                    ✓
                  </span>
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      {state.batch && state.batch.status === "Failed" && (
        <section className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <StatusPill status="Recalculation failed" />
          <h3 className="mt-4 text-2xl font-black">Output generation failed</h3>
          <p className="mt-2 text-rose-700">
            {state.batch.failureMessage ||
              "A required output could not be created."}
          </p>
          <button
            disabled={busy}
            className="mt-5 min-h-12 rounded-xl bg-violet-600 px-6 font-bold text-white"
            onClick={() => void call("generate_test_payroll_outputs")}
          >
            {busy ? "Retrying…" : "Retry generation"}
          </button>
        </section>
      )}
      {state.batch &&
        state.batch.status !== "Failed" &&
        !state.approvalStarted &&
        !released && (
          <section className="space-y-5">
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sky-900">
              Outputs generated from frozen payroll snapshot · Draft only
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <article className="rounded-2xl bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-widest text-violet-600">
                  Employee payslips
                </p>
                <h3 className="mt-3 text-3xl font-black text-emerald-700">
                  {readyPayslips} of {state.employees} ready
                </h3>
                <p className="mt-1 text-slate-500">
                  Private until final approval
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    disabled={!state.payslips.length}
                    className="min-h-11 flex-1 rounded-xl bg-violet-600 px-4 font-bold text-white disabled:opacity-50"
                    onClick={() =>
                      state.payslips[0] &&
                      setPreview({
                        title: `${String(state.payslips[0].payload.employeeName)} payslip`,
                        data: state.payslips[0].payload,
                      })
                    }
                  >
                    Preview payslips
                  </button>
                  <button
                    disabled={busy || !state.payslips.length}
                    className="min-h-11 flex-1 rounded-xl border border-violet-300 px-4 font-bold text-violet-700 disabled:opacity-50"
                    onClick={() => void downloadZip()}
                  >
                    Download ZIP
                  </button>
                </div>
              </article>
              <article className="rounded-2xl bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-widest text-violet-600">
                  Government reports
                </p>
                <h3 className="mt-3 text-3xl font-black text-emerald-700">
                  {readyReports} of 4 ready
                </h3>
                <div className="mt-4 divide-y">
                  {state.governmentReports.map((report) => (
                    <div
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                      key={report.id}
                    >
                      <div>
                        <b>{governmentLabels[report.code] || report.code}</b>
                        <p
                          className={
                            report.status === "Failed"
                              ? "text-sm text-rose-700"
                              : "text-sm text-emerald-700"
                          }
                        >
                          {report.status}
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <button
                          className="font-bold text-violet-700"
                          onClick={() =>
                            setPreview({
                              title:
                                governmentLabels[report.code] || report.code,
                              data: report.payload,
                            })
                          }
                        >
                          Preview
                        </button>
                        <button
                          className="font-bold text-violet-700"
                          onClick={() => downloadReport(report)}
                        >
                          Export
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Prepared for review and export only. Nothing is automatically
                  submitted to a government agency.
                </p>
              </article>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p>
                <b>Draft outputs only</b> · nothing has been released or sent
                yet.
              </p>
              <button
                disabled={
                  busy ||
                  readyPayslips !== state.employees ||
                  readyReports !== 4
                }
                className="mt-4 min-h-12 w-full rounded-xl bg-violet-600 px-5 font-bold text-white disabled:opacity-50"
                onClick={() => void call("start_test_payroll_approval")}
              >
                {busy ? "Opening approval…" : "Continue to approval"}
              </button>
            </div>
          </section>
        )}
      {(state.approvalStarted || released) && (
        <section className="space-y-5">
          <div className="rounded-2xl bg-emerald-50 p-5 text-emerald-900">
            <h3 className="text-xl font-black">
              {released
                ? "Payroll released in the isolated test run"
                : "All payroll checks passed"}
            </h3>
            <p>
              {state.employees} employees · {money(state.gross)} gross ·{" "}
              {money(state.net)} net
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl bg-white p-6 shadow-sm">
              <h3 className="text-xl font-black">Approval workflow</h3>
              <p className="text-sm text-slate-500">
                Each decision is recorded in the test payroll audit trail.
              </p>
              <ol className="mt-5 space-y-1">
                {state.approvals.map((step) => (
                  <li
                    key={step.step}
                    className="flex items-center justify-between gap-3 border-l-2 border-slate-200 py-3 pl-4"
                  >
                    <div>
                      <b>{step.label}</b>
                      {step.reason && (
                        <p className="text-xs text-rose-700">{step.reason}</p>
                      )}
                    </div>
                    <StatusPill status={step.status} />
                  </li>
                ))}
              </ol>
              {currentApproval && !released && (
                <div className="mt-5 rounded-xl bg-slate-50 p-4">
                  <p className="font-bold">
                    Current owner: {currentApproval.label}
                  </p>
                  {currentApproval.canAct ? (
                    <>
                      <label className="mt-3 block text-sm font-semibold">
                        Decision note
                        <input
                          className="mt-1 min-h-11 w-full rounded-lg border px-3"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Optional for approval; required for rejection"
                        />
                      </label>
                      <div className="mt-3 flex gap-3">
                        <button
                          disabled={busy}
                          className="min-h-11 flex-1 rounded-xl bg-violet-600 px-4 font-bold text-white"
                          onClick={() =>
                            void decide(currentApproval, "approve")
                          }
                        >
                          Approve {currentApproval.label}
                        </button>
                        <button
                          disabled={busy}
                          className="min-h-11 rounded-xl border border-rose-300 px-4 font-bold text-rose-700"
                          onClick={() => void decide(currentApproval, "reject")}
                        >
                          Reject
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">
                      Waiting for an authorized user assigned to this approval
                      stage.
                    </p>
                  )}
                </div>
              )}
            </article>
            <article className="rounded-2xl bg-white p-6 shadow-sm">
              <h3 className="text-xl font-black">Release checklist</h3>
              <ul className="mt-5 space-y-4">
                {checklist.map(([label, done]) => (
                  <li className="flex items-center gap-3" key={label}>
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-full font-black ${done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
                    >
                      {done ? "✓" : "·"}
                    </span>
                    {label}
                  </li>
                ))}
              </ul>
              <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                Employees receive access only after final approval and the test
                payment-release stage. This isolated test does not create a real
                payment or alter official payroll history.
              </div>
            </article>
          </div>
          <button
            disabled={busy || !state.canRelease || released}
            className="min-h-12 w-full rounded-xl bg-violet-600 px-6 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            onClick={() => void call("release_test_payroll_outputs")}
          >
            {released
              ? "Released & distributed for test"
              : state.canRelease
                ? "Release & distribute"
                : "Release & distribute · Complete all requirements first"}
          </button>
        </section>
      )}
      <details className="rounded-2xl bg-white p-5 shadow-sm">
        <summary className="cursor-pointer font-bold">
          View audit details
        </summary>
        <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap text-xs">
          {JSON.stringify(state.audit, null, 2)}
        </pre>
      </details>
      {register && (
        <PreviewModal
          title="Payroll register"
          data={{
            businessUnit: "Bakebe – SM Aura",
            period: `${run.date_from} to ${run.date_to}`,
            payDate: run.pay_date,
            gross: state.gross,
            net: state.net,
            employees: state.payslips.map((x) => x.payload),
          }}
          onClose={() => setRegister(false)}
        />
      )}
      {preview && (
        <PreviewModal
          title={preview.title}
          data={preview.data}
          onClose={() => setPreview(null)}
        />
      )}
    </section>
  );
}

export default function ScenarioRun({
  scope,
  from,
  to,
}: {
  scope: string;
  from: string;
  to: string;
}) {
  const navigate = useNavigate();
  const employeeReviewRef = useRef<HTMLElement | null>(null);
  const [run, setRun] = useState<Run | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(""),
    [actionNotice, setActionNotice] = useState(""),
    [employeeId, setEmployeeId] = useState<string | null>(null),
    [focusDate, setFocusDate] = useState<string | null>(null),
    [activeIssue, setActiveIssue] = useState<Issue | null>(null),
    [drawer, setDrawer] = useState(false),
    [drawerTitle, setDrawerTitle] = useState("Fix attendance"),
    [queueView, setQueueView] = useState<"employees" | "quick">("employees"),
    [selectedGrace, setSelectedGrace] = useState<Set<string>>(new Set()),
    [showCompletion, setShowCompletion] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.resolve(
      supabase.rpc("get_payroll_scenario_run", {
        p_scope: scope,
        p_from: from,
        p_to: to,
      }),
    )
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        else setRun(data as Run | null);
        setLoading(false);
      })
      .catch((e) => {
        if (active) {
          setError(e.message || "Unable to load test run");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [scope, from, to, revision]);
  const calculate = async () => {
    if (!run) return;
    setBusy(true);
    setActionError("");
    setActionNotice("");
    try {
      const { error } = await supabase.rpc("calculate_payroll_scenario_demo", {
        p_scope: scope,
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      setRevision((v) => v + 1);
    } catch (e) {
      const message =
        (e as { message?: string }).message ||
        "Recalculation failed. Your saved corrections were kept.";
      setActionError(message);
      if (employeeId && focusDate)
        await supabase.rpc("mark_test_payroll_recalculation_failed", {
          p_scope: scope,
          p_from: from,
          p_to: to,
          p_employee: employeeId,
          p_date: focusDate,
          p_message: message,
        });
      setRevision((v) => v + 1);
    } finally {
      setBusy(false);
    }
  };
  const approve = async (c: Correction) => {
    setBusy(true);
    setActionError("");
    try {
      const { error } = await supabase.rpc("approve_test_payroll_correction", {
        p_scope: scope,
        p_from: from,
        p_to: to,
        p_employee: c.employee_id,
        p_date: c.work_date,
        p_reason: "Approved for isolated test payroll",
      });
      if (error) throw error;
      await calculate();
    } catch (e) {
      setActionError((e as { message?: string }).message || "Approval failed.");
    } finally {
      setBusy(false);
    }
  };
  const s = run?.snapshot,
    demo = s?.demo,
    source = demo?.scenarioSource || s?.source;
  const issues = useMemo<Issue[]>(() => {
    if (!run || !s) return [];
    const rows = (demo?.timeResult || s.timeResult).rows;
    const found: Issue[] = [];
    for (const b of s.blockers) {
      const employee = s.employees.find((e) => e.id === b.employeeId),
        hasTestPackage = s.packages.some((p) => p.employee_id === b.employeeId);
      if (employee && !hasTestPackage)
        found.push({
          employee,
          day: {
            employeeId: employee.id,
            date: run.date_from,
            lateMinutes: 0,
            undertimeMinutes: 0,
            actualMinutes: 0,
            breakMinutes: 0,
            approvedOtMinutes: 0,
            issues: [b.reason],
          },
          label: b.reason,
          action: "Review pay package",
          severity: "blocked",
        });
    }
    for (const day of rows.filter((r) => r.issues?.length)) {
      const employee = s.employees.find((e) => e.id === day.employeeId);
      if (!employee) continue;
      const correction = run.corrections?.find(
        (c) => c.employee_id === day.employeeId && c.work_date === day.date,
      );
      if (correction?.status === "Ready after correction") continue;
      const label =
        correction?.status === "Pending approval"
          ? "Attendance correction awaiting approval"
          : correction?.status === "Recalculation failed"
            ? "Recalculation failed"
            : issueLabel(day.issues);
      found.push({
        employee,
        day,
        label,
        action:
          correction?.status === "Pending approval"
            ? "Send for approval"
            : issueActionForLabel(label),
        severity:
          correction?.status === "Pending approval"
            ? "pending"
            : day.issues.some((x) =>
                  x.toLowerCase().includes("employment start"),
                )
              ? "blocked"
              : "attention",
      });
    }
    return found.sort(
      (a, b) =>
        ({ blocked: 0, pending: 1, attention: 2 })[a.severity] -
          { blocked: 0, pending: 1, attention: 2 }[b.severity] ||
        a.day.date.localeCompare(b.day.date),
    );
  }, [run, s, demo]);
  const issueGroups = useMemo<IssueGroup[]>(() => {
    const byEmployee = new Map<string, Issue[]>();
    for (const item of issues)
      byEmployee.set(item.employee.id, [
        ...(byEmployee.get(item.employee.id) || []),
        item,
      ]);
    return [...byEmployee.values()].map((items) => {
      const counts: Record<IssueCategory, number> = {
        Attendance: 0,
        Schedule: 0,
        "Payroll setup": 0,
        Overtime: 0,
      };
      for (const item of items) counts[issueCategory(item)]++;
      return {
        employee: items[0].employee,
        items,
        status: items.some((item) => item.severity === "blocked")
          ? "Blocking payroll"
          : "Needs attention",
        counts,
      } as IssueGroup;
    });
  }, [issues]);
  const quickCandidates = useMemo(() => {
    if (!run || !s || !source) return [];
    const rows = (demo?.timeResult || s.timeResult).rows;
    return rows.flatMap((day) => {
      const employee = s.employees.find((item) => item.id === day.employeeId),
        shift = source.shifts.find(
          (item) =>
            item.employeeId === day.employeeId && item.date === day.date,
        ),
        clockIn = source.events.find(
          (item) =>
            item.employeeId === day.employeeId &&
            item.timestamp.slice(0, 10) === day.date &&
            item.type === "CLOCK_IN",
        );
      if (!employee || !shift?.start || !clockIn) return [];
      const scheduled = new Date(
          `${day.date}T${shift.start}:00+08:00`,
        ).getTime(),
        actual = new Date(clockIn.timestamp).getTime(),
        minutes = Math.max(0, Math.round((actual - scheduled) / 60000)),
        correction = run.corrections?.find(
          (item) =>
            item.employee_id === employee.id && item.work_date === day.date,
        );
      if (
        minutes < 1 ||
        minutes > 5 ||
        correction?.status === "Ready after correction"
      )
        return [];
      return [
        {
          employee,
          day,
          shift,
          clockIn,
          minutes,
          key: `${employee.id}:${day.date}`,
        },
      ];
    });
  }, [run, s, source, demo]);
  if (loading)
    return (
      <div className="rounded-xl border bg-white p-6" role="status">
        Loading test payroll…
      </div>
    );
  if (error)
    return (
      <div
        className="rounded-xl border border-rose-300 bg-rose-50 p-5 text-rose-800"
        role="alert"
      >
        Test payroll could not be loaded. {error}{" "}
        <button
          className="font-bold underline"
          onClick={() => setRevision((v) => v + 1)}
        >
          Retry
        </button>
      </div>
    );
  if (!run || !s || !source) return null;
  const blockedEmployees = new Set(
      issues.filter((i) => i.severity === "blocked").map((i) => i.employee.id),
    ),
    attentionEmployees = new Set(
      issues.filter((i) => i.severity !== "blocked").map((i) => i.employee.id),
    ),
    ready = Math.max(
      0,
      s.employees.length -
        new Set([...blockedEmployees, ...attentionEmployees]).size,
    );
  const selected = s.employees.find((e) => e.id === employeeId) || null,
    selectedIssues = issues.filter((item) => item.employee.id === employeeId),
    selectedRows = (demo?.timeResult || s.timeResult).rows.filter(
      (r) => r.employeeId === employeeId,
    ),
    selectedPackage = s.packages.find((p) => p.employee_id === employeeId),
    selectedGross = demo?.scenarioGross.employees.find(
      (e) => e.employeeId === employeeId,
    ),
    selectedNet = demo?.comparisonNet.employees.find(
      (e) => e.employeeId === employeeId,
    ),
    selectedStatus = selected
      ? blockedEmployees.has(selected.id)
        ? "Blocked"
        : attentionEmployees.has(selected.id)
          ? "Needs attention"
          : "Ready after correction"
      : "";
  const resolveAllEmployeeIssues = async () => {
    if (!selected || !selectedIssues.length) return;
    setBusy(true);
    setActionError("");
    setActionNotice("");
    try {
      const { data, error } = await supabase.rpc(
        "resolve_test_payroll_employee_issues",
        {
          p_scope: scope,
          p_from: run.date_from,
          p_to: run.date_to,
          p_employee: selected.id,
        },
      );
      if (error) throw error;
      const result = data as {
        corrected?: number;
        remaining?: number;
        ready?: boolean;
      } | null;
      if (result?.remaining) {
        throw new Error(
          `${selected.name} still has ${result.remaining} unresolved issue${result.remaining === 1 ? "" : "s"} after recalculation.`,
        );
      }
      setActionNotice(
        `${selected.name}'s ${result?.corrected || selectedIssues.length} attendance issue${(result?.corrected || selectedIssues.length) === 1 ? " was" : "s were"} corrected and recalculated. Review pay is now available.`,
      );
      setFocusDate(null);
      setActiveIssue(null);
      setDrawer(false);
      setRevision((value) => value + 1);
    } catch (e) {
      setActionError(
        (e as { message?: string }).message ||
          `The attendance issues for ${selected.name} could not be resolved.`,
      );
    } finally {
      setBusy(false);
    }
  };
  const open = (item: Issue) => {
    setEmployeeId(item.employee.id);
    setFocusDate(item.day.date);
    setActiveIssue(item);
    if (item.action === "Review pay package") {
      navigate(`/payroll/pay-packages?employee=${item.employee.id}`);
      return;
    }
    const action = issueActionForLabel(item.label);
    setDrawerTitle(
      action === "Review schedule"
        ? "Review schedule"
        : action === "Review overtime"
          ? "Review overtime"
          : "Fix attendance",
    );
    setDrawer(true);
  };
  const reviewEmployee = (employee: string, date?: string) => {
    setQueueView("employees");
    setEmployeeId(employee);
    setFocusDate(
      date ||
        issues.find((item) => item.employee.id === employee)?.day.date ||
        null,
    );
    requestAnimationFrame(() =>
      employeeReviewRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  };
  const openNextIssue = (employee: string, date: string) => {
    const employeeIssues = issues.filter(
        (item) => item.employee.id === employee,
      ),
      current = employeeIssues.findIndex((item) => item.day.date === date),
      next =
        employeeIssues[current + 1] ||
        employeeIssues.find((item) => item.day.date !== date);
    if (next) open(next);
    else {
      setDrawer(false);
      setFocusDate(null);
      requestAnimationFrame(() =>
        employeeReviewRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
    }
  };
  const applyGrace = async (keys: string[]) => {
    if (!keys.length) return;
    setBusy(true);
    setActionError("");
    try {
      for (const candidate of quickCandidates.filter((item) =>
        keys.includes(item.key),
      )) {
        const events = source.events.filter(
            (event) =>
              event.employeeId === candidate.employee.id &&
              event.timestamp.slice(0, 10) === candidate.day.date,
          ),
          values: FormValues = {
            scheduleKind: candidate.shift.kind || "work",
            scheduleStart: candidate.shift.start || "09:00",
            scheduleEnd: candidate.shift.end || "18:00",
            clockIn: candidate.clockIn.timestamp.slice(11, 16),
            breakStart:
              events
                .find((event) => event.type === "START_BREAK")
                ?.timestamp.slice(11, 16) || "",
            breakEnd:
              events
                .find((event) => event.type === "END_BREAK")
                ?.timestamp.slice(11, 16) || "",
            clockOut:
              events
                .find((event) => event.type === "CLOCK_OUT")
                ?.timestamp.slice(11, 16) || "",
          };
        const { error } = await supabase.rpc("save_test_payroll_correction", {
          p_scope: scope,
          p_from: run.date_from,
          p_to: run.date_to,
          p_employee: candidate.employee.id,
          p_date: candidate.day.date,
          p_issue: `${candidate.minutes}-minute late arrival`,
          p_values: values,
          p_reason:
            "Within approved 5-minute grace period. Original punch retained.",
          p_submit_for_approval: false,
        });
        if (error) throw error;
      }
      await calculate();
      setSelectedGrace(new Set());
    } catch (e) {
      setActionError(
        (e as { message?: string }).message ||
          "Grace could not be applied to the selected records.",
      );
    } finally {
      setBusy(false);
    }
  };
  const currentDay = selectedRows.find((r) => r.date === focusDate) || null,
    drawerEmployee = activeIssue?.employee || selected,
    drawerDay = activeIssue?.day || currentDay,
    existingCorrection = run.corrections?.find(
      (c) =>
        c.employee_id === drawerEmployee?.id && c.work_date === drawerDay?.date,
    ),
    dayEvents = source.events.filter(
      (e) =>
        e.employeeId === drawerEmployee?.id &&
        e.timestamp.slice(0, 10) === drawerDay?.date,
    ),
    dayShift = source.shifts.find(
      (x) => x.employeeId === drawerEmployee?.id && x.date === drawerDay?.date,
    ),
    drawerValues: FormValues = existingCorrection?.corrected_value || {
      ...emptyForm,
      scheduleKind: dayShift?.kind || "work",
      scheduleStart: dayShift?.start || "09:00",
      scheduleEnd: dayShift?.end || "18:00",
      clockIn:
        dayEvents.find((x) => x.type === "CLOCK_IN")?.timestamp.slice(11, 16) ||
        "",
      breakStart:
        dayEvents
          .find((x) => x.type === "START_BREAK")
          ?.timestamp.slice(11, 16) || "",
      breakEnd:
        dayEvents
          .find((x) => x.type === "END_BREAK")
          ?.timestamp.slice(11, 16) || "",
      clockOut:
        dayEvents
          .find((x) => x.type === "CLOCK_OUT")
          ?.timestamp.slice(11, 16) || "",
    };
  if (issues.length === 0 && demo && showCompletion)
    return (
      <PayrollCompletion
        scope={scope}
        run={run}
        onViewAttendance={() => setShowCompletion(false)}
      />
    );
  return (
    <section
      className="space-y-6 rounded-2xl border bg-slate-50 p-4 sm:p-6 dark:bg-slate-950"
      aria-label="Isolated payroll test run"
    >
      <header className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-900">
        <div className="bg-gradient-to-r from-violet-700 to-indigo-600 p-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[.2em] text-violet-100">
                Payroll cycle dashboard
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-black">
                  {displayDate(run.pay_date, true)} Payroll
                </h2>
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black">
                  TEST RUN
                </span>
              </div>
              <p className="mt-2 text-violet-100">
                Cutoff {displayDate(run.date_from, true)}–
                {displayDate(run.date_to, true)} · Asia/Manila
              </p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 text-sm">
              <b className="block">
                Same cutoff rules across all business units
              </b>
              <span className="text-violet-100">
                Bakebe – SM Aura uses the global payroll calendar
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <button
              className={`min-h-10 rounded-lg px-4 text-sm font-bold ${queueView === "employees" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}
              onClick={() => {
                setQueueView("employees");
                setEmployeeId(null);
                setFocusDate(null);
              }}
            >
              Employee readiness
            </button>
            <button
              className={`min-h-10 rounded-lg px-4 text-sm font-bold ${queueView === "quick" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}
              onClick={() => {
                setQueueView("quick");
                setEmployeeId(null);
                setFocusDate(null);
              }}
            >
              Quick attendance fixes{" "}
              <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5">
                {quickCandidates.length}
              </span>
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {issues.length === 0 && demo && (
              <button
                onClick={() => setShowCompletion(true)}
                className="min-h-11 rounded-xl bg-violet-600 px-5 font-bold text-white"
              >
                Continue to payroll completion
              </button>
            )}
            <button
              disabled={busy || !run.canCalculateTest}
              onClick={() => void calculate()}
              className="min-h-11 rounded-xl border border-violet-300 px-5 font-bold text-violet-700 disabled:opacity-50"
            >
              {busy ? "Recalculating…" : "Recalculate payroll"}
            </button>
          </div>
        </div>
        {actionError && (
          <div
            role="alert"
            className="mx-4 mb-4 rounded-lg bg-rose-50 p-3 font-semibold text-rose-700"
          >
            {actionError}{" "}
            <button className="underline" onClick={() => void calculate()}>
              Retry
            </button>
          </div>
        )}
        {actionNotice && (
          <div
            role="status"
            className="mx-4 mb-4 rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-800"
          >
            {actionNotice}
          </div>
        )}
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Employees", value: s.employees.length, tone: "slate" },
          { label: "Ready", value: ready, tone: "green" },
          {
            label: "Needs attention",
            value: attentionEmployees.size + blockedEmployees.size,
            tone: "amber",
          },
        ].map((card) => (
          <div
            key={card.label}
            className={`rounded-2xl border-l-4 bg-white p-5 shadow-sm ${card.tone === "green" ? "border-emerald-500" : card.tone === "amber" ? "border-amber-500" : "border-slate-400"}`}
          >
            <p className="font-semibold text-slate-500">{card.label}</p>
            <strong className="mt-1 block text-3xl">{card.value}</strong>
            {card.label === "Needs attention" && (
              <p className="mt-1 text-xs text-rose-600">
                {blockedEmployees.size} blocked
              </p>
            )}
          </div>
        ))}
      </div>
      {!selected &&
        (queueView === "employees" ? (
          <section className="space-y-4" aria-label="Employee readiness queue">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-xl font-black">Resolve by employee</h3>
                <p className="text-sm text-slate-500">
                  One card per employee and business unit. Setup dependencies
                  appear once, even when they affect multiple dates.
                </p>
              </div>
              <StatusPill
                status={issues.length ? "Needs attention" : "Ready"}
              />
            </div>
            {issueGroups.length ? (
              issueGroups.map((group) => {
                const uniqueItems = group.items.filter(
                  (item, index, list) =>
                    list.findIndex(
                      (other) =>
                        issueCategory(other) === issueCategory(item) &&
                        other.label === item.label,
                    ) === index,
                );
                return (
                  <article
                    key={group.employee.id}
                    className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${group.status === "Blocking payroll" ? "border-rose-200" : "border-amber-200"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                      <div className="flex items-center gap-4">
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-lg font-black text-violet-700">
                          {group.employee.name
                            .split(" ")
                            .map((part) => part[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <div>
                          <h4 className="text-xl font-black">
                            {group.employee.name}
                          </h4>
                          <p className="text-sm text-slate-500">
                            {group.employee.code || "Employee ID unavailable"} ·
                            Bakebe · SM Aura
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {displayDate(run.pay_date, true)} payroll ·{" "}
                            {group.items.length} issue
                            {group.items.length === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      <StatusPill status={group.status} />
                    </div>
                    <div className="grid gap-2 border-y bg-slate-50 p-4 sm:grid-cols-4">
                      {(
                        [
                          "Attendance",
                          "Schedule",
                          "Payroll setup",
                          "Overtime",
                        ] as IssueCategory[]
                      ).map((category) => (
                        <div
                          key={category}
                          className="rounded-xl bg-white px-3 py-2"
                        >
                          <span className="text-xs text-slate-500">
                            {category}
                          </span>
                          <b className="float-right">
                            {group.counts[category]}
                          </b>
                        </div>
                      ))}
                    </div>
                    <div className="overflow-x-auto">
                      <div className="grid min-w-[760px] grid-cols-[130px_1fr_1.2fr_110px_190px] gap-3 border-b bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
                        <span>Category</span>
                        <span>Issue</span>
                        <span>Affected dates</span>
                        <span>Status</span>
                        <span className="text-right">Action</span>
                      </div>
                      {uniqueItems.map((item, index) => {
                        const category = issueCategory(item),
                          dates = group.items
                            .filter(
                              (other) =>
                                issueCategory(other) === category &&
                                other.label === item.label,
                            )
                            .map((other) => displayDate(other.day.date));
                        const correction = run.corrections?.find(
                          (c) =>
                            c.employee_id === item.employee.id &&
                            c.work_date === item.day.date,
                        );
                        return (
                          <div
                            key={`${item.label}:${index}`}
                            className={`grid min-w-[760px] grid-cols-[130px_1fr_1.2fr_110px_190px] items-center gap-3 border-b px-5 py-4 last:border-b-0 ${item.severity === "blocked" ? "bg-rose-50/70" : "bg-white"}`}
                          >
                            <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                              {category}
                            </span>
                            <div>
                              <b className="block">{item.label}</b>
                              {category === "Payroll setup" && (
                                <p className="mt-1 text-xs text-rose-700">
                                  This is one setup dependency affecting
                                  multiple dates. Fix it once and affected
                                  payroll dates refresh automatically.
                                </p>
                              )}
                            </div>
                            <span className="text-sm text-slate-500">
                              {dates.join(", ")}
                            </span>
                            <span className="w-fit rounded-full bg-white px-2 py-1 text-xs font-bold">
                              {item.severity === "blocked"
                                ? "Blocking"
                                : "Review"}
                            </span>
                            <div className="flex justify-end">
                              {correction?.status === "Pending approval" &&
                              run.canApproveTestCorrections ? (
                                <button
                                  disabled={busy}
                                  className="min-h-10 rounded-lg bg-violet-600 px-4 text-sm font-bold text-white"
                                  onClick={() => void approve(correction)}
                                >
                                  Approve correction
                                </button>
                              ) : (
                                <button
                                  className="min-h-10 rounded-lg font-bold text-violet-700"
                                  onClick={() => open(item)}
                                >
                                  {item.action === "Review pay package"
                                    ? "Open employee setup"
                                    : item.action === "Review schedule"
                                      ? "Open correction options"
                                      : "Fix next"}{" "}
                                  →
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-2 border-t p-4">
                      <button
                        className="min-h-10 rounded-lg bg-violet-600 px-4 text-sm font-bold text-white"
                        onClick={() => open(group.items[0])}
                      >
                        Fix next
                      </button>
                      <button
                        className="min-h-10 rounded-lg border px-4 text-sm font-bold"
                        onClick={() =>
                          reviewEmployee(
                            group.employee.id,
                            group.items[0]?.day.date,
                          )
                        }
                      >
                        Review all issues
                      </button>
                      <button
                        className="min-h-10 rounded-lg border px-4 text-sm font-bold"
                        onClick={() => setQueueView("quick")}
                      >
                        Quick attendance fixes
                      </button>
                      <button
                        className="min-h-10 rounded-lg border px-4 text-sm font-bold"
                        onClick={() =>
                          navigate(
                            `/payroll/pay-packages?employee=${group.employee.id}`,
                          )
                        }
                      >
                        Open employee setup
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="rounded-2xl bg-white p-8 text-center text-emerald-700 shadow-sm">
                <b>All employees are ready for this payroll cycle.</b>
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-4" aria-label="Quick attendance fixes">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-xl font-black">Quick attendance fixes</h3>
                <p className="text-sm text-slate-500">
                  Minor late arrivals within the approved 5-minute grace period.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={busy || !selectedGrace.size}
                  className="min-h-11 rounded-xl border border-violet-300 px-4 font-bold text-violet-700 disabled:opacity-50"
                  onClick={() => void applyGrace([...selectedGrace])}
                >
                  Apply grace to selected
                </button>
                <button
                  disabled={busy || !quickCandidates.length}
                  className="min-h-11 rounded-xl bg-violet-600 px-4 font-bold text-white disabled:opacity-50"
                  onClick={() =>
                    void applyGrace(quickCandidates.map((item) => item.key))
                  }
                >
                  Apply grace to all eligible
                </button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["Minor late arrivals", quickCandidates.length],
                ["Eligible for grace", quickCandidates.length],
                ["Pay impact", "Recalculate"],
                [
                  "Needs detailed review",
                  issues.filter((item) => issueCategory(item) === "Attendance")
                    .length,
                ],
              ].map(([label, value]) => (
                <div
                  key={label as string}
                  className="rounded-xl bg-white p-4 shadow-sm"
                >
                  <p className="text-xs font-semibold text-slate-500">
                    {label}
                  </p>
                  <b className="mt-1 block text-xl">{value}</b>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {quickCandidates.map((candidate) => (
                <article
                  key={candidate.key}
                  className="grid gap-4 rounded-2xl bg-white p-5 shadow-sm md:grid-cols-[auto_1.2fr_repeat(3,1fr)_auto] md:items-center"
                >
                  <input
                    aria-label={`Select ${candidate.employee.name} on ${candidate.day.date}`}
                    type="checkbox"
                    checked={selectedGrace.has(candidate.key)}
                    onChange={(e) =>
                      setSelectedGrace((current) => {
                        const next = new Set(current);
                        e.target.checked
                          ? next.add(candidate.key)
                          : next.delete(candidate.key);
                        return next;
                      })
                    }
                  />
                  <div>
                    <b>{candidate.employee.name}</b>
                    <p className="text-sm text-slate-500">
                      Bakebe · SM Aura · {displayDate(candidate.day.date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Scheduled</p>
                    <b>{candidate.shift.start}</b>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Clock-in</p>
                    <b>{time(candidate.clockIn.timestamp)}</b>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Difference</p>
                    <b>
                      {candidate.minutes} minute
                      {candidate.minutes === 1 ? "" : "s"}
                    </b>
                    <p className="text-xs text-emerald-700">Within grace</p>
                  </div>
                  <button
                    disabled={busy}
                    className="min-h-11 rounded-xl bg-violet-600 px-4 font-bold text-white"
                    onClick={() => void applyGrace([candidate.key])}
                  >
                    Apply grace
                  </button>
                </article>
              ))}
              {!quickCandidates.length && (
                <div className="rounded-2xl bg-white p-8 text-center text-slate-500">
                  No eligible minor lateness records remain for this payroll
                  cycle.
                </div>
              )}
            </div>
            <div className="rounded-xl bg-violet-50 p-4 text-sm text-violet-900">
              Applying grace removes the late flag and records an automatic
              audit note: <b>Within approved grace period.</b> Original punch
              data remains unchanged.
            </div>
          </section>
        ))}
      {selected && (
        <section
          ref={employeeReviewRef}
          className="scroll-mt-6 rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <button
                className="mb-3 text-sm font-bold text-violet-700"
                onClick={() => {
                  setEmployeeId(null);
                  setFocusDate(null);
                }}
              >
                ← Back to employee list
              </button>
              <h3 className="text-2xl font-black">{selected.name}</h3>
              <p className="text-slate-500">
                {selected.code || "Employee code unavailable"} · Bakebe · SM
                Aura ·{" "}
                {selectedPackage
                  ? `${money(selectedPackage.base_amount)} / ${selectedPackage.rate_type}`
                  : "No pay package"}
              </p>
            </div>
            <StatusPill status={selectedStatus} />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-violet-950">
            <div>
              <b className="block">Finish {selected.name} before moving on</b>
              <span className="text-sm">
                {selectedIssues.length
                  ? `${selectedIssues.length} unresolved issue${selectedIssues.length === 1 ? "" : "s"} remain. Saving opens only this employee's next issue.`
                  : "All issues for this employee are cleared. You can return to the employee list."}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedIssues.length > 0 && (
                <button
                  disabled={busy}
                  className="min-h-11 rounded-xl border border-violet-300 bg-white px-5 font-bold text-violet-700 disabled:opacity-50"
                  onClick={() => void resolveAllEmployeeIssues()}
                >
                  {busy
                    ? `Fixing ${selected.name.split(" ")[0]}…`
                    : `Fix all attendance issues (${selectedIssues.length})`}
                </button>
              )}
              {selectedIssues.length > 0 && (
                <button
                  disabled={busy}
                  className="min-h-11 rounded-xl bg-violet-600 px-5 font-bold text-white disabled:opacity-50"
                  onClick={() => open(selectedIssues[0])}
                >
                  Fix next for {selected.name.split(" ")[0]}
                </button>
              )}
            </div>
          </div>
          <ol className="my-6 grid gap-2 rounded-xl bg-slate-100 p-2 text-center text-sm font-bold sm:grid-cols-3 dark:bg-slate-800">
            <li className="rounded-lg bg-violet-600 p-3 text-white">
              1. Review attendance
            </li>
            <li
              className={`rounded-lg p-3 ${selectedStatus === "Ready after correction" ? "bg-violet-100 text-violet-700" : ""}`}
            >
              2. Review pay
            </li>
            <li className="rounded-lg p-3">3. Ready for approval</li>
          </ol>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Gross pay", selectedGross?.gross],
              [
                "Total deductions",
                selectedGross?.gross ? selectedNet?.deductions : null,
              ],
              [
                "Net pay",
                selectedGross?.gross && selectedNet
                  ? Number(selectedGross.gross) - Number(selectedNet.deductions)
                  : null,
              ],
            ].map(([label, value]) => (
              <div className="rounded-xl border p-4" key={label as string}>
                <p className="text-sm text-slate-500">{label}</p>
                <b className="text-xl">
                  {money(value as string | number | null)}
                </b>
              </div>
            ))}
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Date",
                    "Schedule",
                    "Clock in",
                    "Break",
                    "Clock out",
                    "Result",
                    "Action",
                  ].map((h) => (
                    <th className="border-b p-3" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedRows.map((row) => {
                  const ev = source.events.filter(
                      (e) =>
                        e.employeeId === selected.id &&
                        e.timestamp.slice(0, 10) === row.date,
                    ),
                    sh = source.shifts.find(
                      (x) =>
                        x.employeeId === selected.id && x.date === row.date,
                    ),
                    correction = run.corrections?.find(
                      (c) =>
                        c.employee_id === selected.id &&
                        c.work_date === row.date,
                    ),
                    result =
                      correction?.status ||
                      (!row.issues.length
                        ? "Ready"
                        : row.lateMinutes
                          ? `${time(ev.find((x) => x.type === "CLOCK_IN")?.timestamp)} · ${row.lateMinutes} minute${row.lateMinutes === 1 ? "" : "s"} late`
                          : issueLabel(row.issues)),
                    label = issueLabel(row.issues),
                    action = issueActionForLabel(label);
                  return (
                    <tr
                      key={row.date}
                      className={focusDate === row.date ? "bg-violet-50" : ""}
                    >
                      <td className="border-b p-3">{displayDate(row.date)}</td>
                      <td className="border-b p-3">
                        {sh
                          ? sh.kind === "rest"
                            ? "Rest day"
                            : `${sh.start}–${sh.end}`
                          : "Missing schedule"}
                      </td>
                      <td className="border-b p-3">
                        {time(ev.find((x) => x.type === "CLOCK_IN")?.timestamp)}
                      </td>
                      <td className="border-b p-3">
                        {time(
                          ev.find((x) => x.type === "START_BREAK")?.timestamp,
                        )}
                        –
                        {time(
                          ev.find((x) => x.type === "END_BREAK")?.timestamp,
                        )}
                      </td>
                      <td className="border-b p-3">
                        {time(
                          ev.find((x) => x.type === "CLOCK_OUT")?.timestamp,
                        )}
                      </td>
                      <td className="border-b p-3">
                        <StatusPill status={result} />
                      </td>
                      <td className="border-b p-3">
                        {row.issues.length &&
                        correction?.status !== "Ready after correction" ? (
                          <button
                            className="min-h-11 font-bold text-violet-700 underline"
                            onClick={() =>
                              open({
                                employee: selected,
                                day: row,
                                label,
                                action,
                                severity: "attention",
                              })
                            }
                          >
                            {action}
                          </button>
                        ) : (
                          <span className="text-emerald-700">No action</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <details className="rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
        <summary className="cursor-pointer font-bold">
          View audit details
        </summary>
        <div className="mt-4 space-y-4 text-sm">
          <p>
            Test-only package snapshots: {s.packages.length} · Seeded attendance
            scenarios: {s.scenarios.length} · Saved calculations:{" "}
            {demo
              ? new Date(demo.calculatedAt).toLocaleString("en-PH", {
                  timeZone: "Asia/Manila",
                })
              : "Not calculated"}
          </p>
          {demo && (
            <details>
              <summary className="cursor-pointer font-semibold">
                Mock assumptions
              </summary>
              <ul className="mt-2 list-disc pl-5">
                {demo.assumptions.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </details>
          )}
          <details>
            <summary className="cursor-pointer font-semibold">
              Pay package snapshots
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap">
              {JSON.stringify(s.packages, null, 2)}
            </pre>
          </details>
          <details>
            <summary className="cursor-pointer font-semibold">
              Correction audit history
            </summary>
            {run.correctionAudit?.length ? (
              <ul className="mt-2 space-y-2">
                {run.correctionAudit.map((a, i) => (
                  <li key={i}>
                    {displayDate(a.workDate, true)} ·{" "}
                    {s.employees.find((e) => e.id === a.employeeId)?.name} ·{" "}
                    {a.action} · {a.reason} ·{" "}
                    {new Date(a.createdAt).toLocaleString("en-PH", {
                      timeZone: "Asia/Manila",
                    })}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2">No corrections saved yet.</p>
            )}
          </details>
        </div>
      </details>
      <CorrectionDrawer
        open={drawer}
        scope={scope}
        run={run}
        employee={drawerEmployee}
        day={drawerDay}
        values={drawerValues}
        issue={
          activeIssue?.label ||
          (drawerDay ? issueLabel(drawerDay.issues) : "Attendance issue")
        }
        title={drawerTitle}
        onClose={() => setDrawer(false)}
        onSaved={(openNext) => {
          setRevision((v) => v + 1);
          if (openNext && drawerEmployee && drawerDay)
            openNextIssue(drawerEmployee.id, drawerDay.date);
        }}
        onRecalculate={calculate}
        onOpenSchedule={() =>
          drawerEmployee && drawerDay
            ? navigate(
                `/payroll/timekeeping?employee=${drawerEmployee.id}&week=${drawerDay.date}&source=readiness`,
              )
            : navigate("/payroll/timekeeping")
        }
      />
    </section>
  );
}
