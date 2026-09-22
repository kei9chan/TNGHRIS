import { supabase } from './supabaseClient';

export type PayPackageApprovalStep = {
  userId: string;
  name: string;
  role: string;
  status: string;
  timestamp?: string;
  notes?: string;
};

export type PendingPayPackageApproval = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  businessUnitId?: string;
  businessUnit: string;
  departmentId?: string;
  department: string;
  scopeId: string;
  scopeName: string;
  stream: string;
  sourceKind: string;
  effectiveFrom: string;
  baseAmount: number;
  rateType: string;
  createdAt: string;
  submittedBy: string;
  approvalSteps: PayPackageApprovalStep[];
  pendingApprovers: string[];
  isActionable: boolean;
};

export async function fetchPendingPayPackageApprovals(): Promise<PendingPayPackageApproval[]> {
  const { data, error } = await supabase.rpc('get_payroll_pay_package_approval_workspace');
  if (error) throw new Error(error.message);
  return Array.isArray(data?.pending) ? data.pending : [];
}
