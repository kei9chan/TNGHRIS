import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { useAuth } from "../../hooks/useAuth";
import { EmployeePolicyPanel } from "./ConfirmedPolicyPanels";
import PayPackageBatchUpload from "./PayPackageBatchUpload";
import PayPackageBuilder from "./PayPackageBuilder";
import ProcessingModeBadge from "./ProcessingModeBadge";
import { arrangements } from "./payPackageImport";
import {
  fetchPayDirectory,
  fetchPayPackages,
  openPayPackageDocument,
  PayContext,
  PayDirectoryEntry,
  PayPackage,
  reviewPayPackage,
} from "./payPackages";

type View = "builder" | "batch" | "review";
const field =
  "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white";
const money = (value: string | number | null | undefined) =>
  value == null
    ? "Pending"
    : `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const streamLabel = (value: string) =>
  value === "professional_fee" ? "Consultant fee" : "Employee payroll";
const statusTone: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-800",
  draft: "bg-amber-100 text-amber-800",
  rejected: "bg-rose-100 text-rose-800",
};

const PayPackagesPage: React.FC = () => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [directory, setDirectory] = useState<PayDirectoryEntry[]>([]);
  const [employeeId, setEmployeeId] = useState(params.get("employee") || "");
  const [view, setView] = useState<View>(
    (params.get("view") as View) || "builder",
  );
  const [data, setData] = useState<PayContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [businessUnit, setBusinessUnit] = useState("");
  const [department, setDepartment] = useState("");
  const [initial, setInitial] = useState<PayPackage | undefined>();
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const list = await fetchPayDirectory();
      if (current !== sequence.current) return;
      setDirectory(list);
      const selected =
        employeeId && list.some((item) => item.id === employeeId)
          ? employeeId
          : list[0]?.id || "";
      if (selected !== employeeId) setEmployeeId(selected);
      if (selected) {
        const result = await fetchPayPackages(selected);
        if (current === sequence.current) setData(result);
      } else setData(null);
    } catch (reason) {
      if (current === sequence.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Pay packages could not be loaded.",
        );
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [employeeId, user?.id]);
  useEffect(() => {
    void refresh();
    return () => {
      ++sequence.current;
    };
  }, [refresh]);
  const units = useMemo(
    () =>
      [
        ...new Set(directory.map((item) => item.businessUnit).filter(Boolean)),
      ] as string[],
    [directory],
  );
  const departments = useMemo(
    () =>
      [
        ...new Set(
          directory
            .filter(
              (item) => !businessUnit || item.businessUnit === businessUnit,
            )
            .map((item) => item.department)
            .filter(Boolean),
        ),
      ] as string[],
    [directory, businessUnit],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return directory.filter(
      (item) =>
        (!businessUnit || item.businessUnit === businessUnit) &&
        (!department || item.department === department) &&
        (!query ||
          [
            item.name,
            item.employeeCode,
            item.businessUnit,
            item.department,
          ].some((value) => value?.toLowerCase().includes(query))),
    );
  }, [directory, businessUnit, department, search]);
  const select = (id: string) => {
    setEmployeeId(id);
    setInitial(undefined);
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("employee", id);
      next.set("view", view);
      return next;
    });
  };
  const show = (next: View) => {
    setView(next);
    setParams((current) => {
      const value = new URLSearchParams(current);
      value.set("view", next);
      if (employeeId) value.set("employee", employeeId);
      return value;
    });
  };
  return (
    <div className="space-y-6 text-slate-800 dark:text-slate-200">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
            Payroll workspace
          </p>
          <h1 className="mt-1 text-3xl font-bold">Pay Package Builder</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Build dated employee-pay and consultant-fee arrangements with guided
            validation, cost review, documents, and approval.
          </p>
        </div>
        <ProcessingModeBadge scopeId={data?.scopeId} />
      </header>
      <nav aria-label="Pay package views" className="flex flex-wrap gap-2">
        {(
          [
            ["builder", "Build package"],
            ["batch", "Excel batch upload"],
            ["review", "Review & history"],
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            key={key}
            onClick={() => show(key)}
            className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold ${view === key ? "bg-violet-600 text-white" : "border border-slate-300 bg-white text-slate-700 hover:border-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {view !== "batch" && (
        <div className="grid gap-5 lg:grid-cols-[310px,minmax(0,1fr)]">
          <aside className="space-y-4">
            <Card>
              <h2 className="font-semibold">Find a person</h2>
              <label className="mt-4 block text-sm font-medium">
                Search
                <input
                  className={`${field} mt-1`}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name or employee ID"
                />
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <label className="text-sm font-medium">
                  Business unit
                  <select
                    className={`${field} mt-1`}
                    value={businessUnit}
                    onChange={(event) => {
                      setBusinessUnit(event.target.value);
                      setDepartment("");
                    }}
                  >
                    <option value="">All business units</option>
                    {units.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Department
                  <select
                    className={`${field} mt-1`}
                    value={department}
                    onChange={(event) => setDepartment(event.target.value)}
                  >
                    <option value="">All departments</option>
                    {departments.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div
                className="mt-4 max-h-96 space-y-2 overflow-y-auto"
                role="listbox"
                aria-label="Employees"
              >
                {filtered.map((item) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={item.id === employeeId}
                    key={item.id}
                    onClick={() => select(item.id)}
                    className={`w-full rounded-xl border p-3 text-left ${item.id === employeeId ? "border-violet-600 bg-violet-50 dark:bg-violet-950/30" : "border-slate-200 hover:border-violet-300 dark:border-slate-700"}`}
                  >
                    <span className="block font-semibold">{item.name}</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {item.employeeCode} ·{" "}
                      {item.businessUnit || "Business unit pending"} ·{" "}
                      {item.department || "Department pending"}
                    </span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
                    No accessible employees match these filters.
                  </p>
                )}
              </div>
            </Card>
            <p className="px-1 text-xs text-slate-500">
              Results follow your payroll permissions and row-level access.{" "}
              <Link
                className="font-semibold text-violet-700"
                to="/payroll/access"
              >
                Manage access
              </Link>
            </p>
          </aside>
          <main>
            {error && (
              <p
                role="alert"
                className="mb-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-800"
              >
                {error}
              </p>
            )}
            {loading ? (
              <p
                role="status"
                className="rounded-xl border border-dashed p-8 text-center"
              >
                Loading authorized pay records…
              </p>
            ) : data ? (
              view === "builder" ? (
                <PayPackageBuilder
                  key={`${data.employeeId}:${initial?.id || "new"}`}
                  data={data}
                  initial={initial}
                  onSaved={refresh}
                />
              ) : (
                <ReviewWorkspace
                  data={data}
                  onRefresh={refresh}
                  onEdit={(item) => {
                    setInitial(item);
                    show("builder");
                  }}
                />
              )
            ) : (
              <Card>
                <p>No accessible employee records.</p>
              </Card>
            )}
          </main>
        </div>
      )}
      {view === "batch" && (
        <PayPackageBatchUpload
          key={user?.id}
          directory={directory}
          onSaved={() => void refresh()}
        />
      )}
    </div>
  );
};

const ReviewWorkspace: React.FC<{
  data: PayContext;
  onRefresh: () => Promise<void>;
  onEdit: (item: PayPackage) => void;
}> = ({ data, onRefresh, onEdit }) => {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [asOf, setAsOf] = useState("");
  const visible = asOf
    ? data.packages.filter(
        (item) =>
          item.status === "approved" &&
          item.effective_from <= asOf &&
          (!item.effective_until || asOf < item.effective_until),
      )
    : data.packages;
  const review = async (item: PayPackage, approve: boolean) => {
    setBusy(true);
    setError("");
    try {
      await reviewPayPackage(item.id, approve, reason);
      setReason("");
      await onRefresh();
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Review action failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <EmployeePolicyPanel
        employeeId={data.employeeId}
        canApprove={data.canApprove}
      />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Packages and prior versions</h2>
            <p className="text-sm text-slate-500">
              Approved packages remain effective-dated. Draft issues do not
              invalidate other ready packages.
            </p>
          </div>
          <label className="text-sm font-medium">
            Applicable on date
            <input
              className={`${field} ml-2 max-w-48`}
              type="date"
              value={asOf}
              onChange={(event) => setAsOf(event.target.value)}
            />
          </label>
        </div>
      </Card>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      {visible.length === 0 ? (
        <Card>
          <p>No package matches this view.</p>
        </Card>
      ) : (
        visible.map((item) => {
          const scope = data.scopes.find((value) => value.id === item.scope_id);
          const nextApprover = item.approval_steps?.find(
            (step) => step.status === "Pending",
          );
          const canApprove =
            item.source_kind !== "approved_pan" &&
            item.status === "draft" &&
            item.approval_state === "pending" &&
            (!!scope?.canApprove || nextApprover?.userId === user?.id);
          const sourceLabel =
            item.source_kind === "approved_pan"
              ? "Generated from approved PAN"
              : item.source_kind === "copied_package"
                ? "Copied from previous approved package"
                : item.source_kind === "correction"
                  ? "Correction requiring approval"
                  : "Direct compensation entry";
          return (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold">
                      {scope?.name || "Payroll scope"}
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.stream === "professional_fee" ? "bg-amber-100 text-amber-800" : "bg-violet-100 text-violet-800"}`}
                    >
                      {streamLabel(item.stream)}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusTone[item.status] || "bg-slate-100 text-slate-700"}`}
                    >
                      {item.status}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {sourceLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {item.effective_from} →{" "}
                    {item.effective_until || "next approved change"} ·{" "}
                    {money(item.base_amount)} / {item.rate_type}
                  </p>
                </div>
                {item.source_kind === "approved_pan" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onEdit(item)}
                  >
                    Create correction
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onEdit(item)}
                  >
                    Copy package
                  </Button>
                )}
              </div>
              <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2 dark:bg-slate-900">
                <p>
                  <span className="text-slate-500">Arrangement</span>
                  <br />
                  <strong>
                    {Object.entries(arrangements).find(
                      ([, value]) =>
                        value === (item.treatment.payBasis || "gross"),
                    )?.[0] || "Needs review"}
                  </strong>
                </p>
                <p>
                  <span className="text-slate-500">Compensation source</span>
                  <br />
                  <strong>{sourceLabel}</strong>
                </p>
                <p>
                  <span className="text-slate-500">Tax responsibility</span>
                  <br />
                  <strong className="capitalize">
                    {item.treatment.taxResponsibility || "Needs review"}
                  </strong>
                </p>
                <p>
                  <span className="text-slate-500">Benefit responsibility</span>
                  <br />
                  <strong className="capitalize">
                    {item.treatment.benefitResponsibility || "Needs review"}
                  </strong>
                </p>
              </div>
              {item.stream === "professional_fee" && (
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  Not included in employee payroll or employee-pay company-cost
                  totals.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold text-violet-700">
                    View calculation details
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {item.components.map((component, index) => (
                      <li key={index}>
                        {component.name}: {money(component.amount)} ·{" "}
                        {component.frequency || component.recurrence}
                      </li>
                    ))}
                  </ul>
                </details>
                {item.source_pan_id ? (
                  <Link
                    className="text-sm font-semibold text-violet-700"
                    to={`/employees/pan?item=${item.source_pan_id}`}
                  >
                    View approved PAN
                  </Link>
                ) : (
                  <span className="text-sm font-semibold text-violet-700">
                    Source record: {item.source_ref || "Missing"}
                  </span>
                )}
                {item.source_metadata?.sourceDocument?.url && (
                  <Link
                    className="text-sm font-semibold text-violet-700"
                    to={item.source_metadata.sourceDocument.url}
                  >
                    View source document
                  </Link>
                )}
                {item.documents?.map((document) => (
                  <button
                    type="button"
                    className="text-sm font-semibold text-violet-700"
                    key={document.id}
                    onClick={() => void openPayPackageDocument(document.path)}
                  >
                    View {document.name}
                  </button>
                ))}
              </div>
              {!!item.approval_steps?.length && (
                <div className="mt-4 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-700">
                  <strong>Compensation approval</strong>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.approval_steps.map((step) => (
                      <span
                        key={`${step.userId}:${step.role}`}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs"
                      >
                        {step.name} · {step.role} · {step.status}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {canApprove && (
                <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <label className="block text-sm font-medium">
                    Approval note
                    <input
                      className={`${field} mt-1`}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Reason and approval reference"
                    />
                  </label>
                  <div className="mt-3 flex gap-3">
                    <Button
                      disabled={busy || reason.trim().length < 3}
                      onClick={() => void review(item, true)}
                    >
                      Approve package
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy || reason.trim().length < 3}
                      onClick={() => void review(item, false)}
                    >
                      Reject draft
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
};

export default PayPackagesPage;
