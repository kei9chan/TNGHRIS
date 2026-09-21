import type { PayPackage } from "./payPackages.ts";

export type PackageHistoryGroup = {
  key: string;
  versions: PayPackage[];
  activeId?: string;
};

export const packageArrangementKey = (item: PayPackage) =>
  `${item.scope_id}:${item.stream}:${item.engagement_key || "employee"}`;

export const groupPayPackageHistory = (
  packages: PayPackage[],
  today: string,
): PackageHistoryGroup[] => {
  const arrangements = new Map<string, PayPackage[]>();
  packages.forEach((item) => {
    const key = packageArrangementKey(item);
    arrangements.set(key, [...(arrangements.get(key) || []), item]);
  });
  return [...arrangements.entries()].map(([key, versions]) => {
    const sorted = [...versions].sort((a, b) =>
      b.effective_from.localeCompare(a.effective_from),
    );
    const active = sorted.find(
      (item) => item.status === "approved" && item.effective_from <= today,
    );
    return { key, versions: sorted, activeId: active?.id };
  });
};

export const packageVersionState = (
  item: PayPackage,
  activeId: string | undefined,
  today: string,
) => {
  if (item.id === activeId) return "Active";
  if (item.status === "approved" && item.effective_from > today)
    return "Approved";
  if (item.status === "approved" || item.status === "superseded")
    return "Historical";
  if (item.status === "rejected" || item.approval_state === "rejected")
    return "Rejected";
  if (item.approval_state === "returned") return "Needs correction";
  if (item.status === "draft" && item.approval_state === "pending")
    return "Pending approval";
  return "Draft";
};

export const initialBuilderMode = (packages: PayPackage[]) =>
  packages.some(
    (item) => item.stream === "employee_payroll" && item.status === "approved",
  )
    ? "update"
    : "initial";

export const consultantArrangementVisible = (enabled: boolean) => enabled;
