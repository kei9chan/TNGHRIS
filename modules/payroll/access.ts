import { supabase } from '../../services/supabaseClient';

export const PAYROLL_PERMISSIONS = [
  ['finalize_timekeeping', 'Finalize and submit timekeeping'],
  ['prepare_pr', 'Prepare Payroll Register'],
  ['review_endorse', 'Review and endorse'],
  ['authorize_hr', 'HR Manager authorization'],
  ['authorize_finance', 'Finance authorization'],
  ['approve_bod', 'BOD final approval'],
  ['release_payroll', 'Release and disburse'],
  ['manage_access', 'Manage Payroll Access'],
] as const;
export type PayrollPermission = typeof PAYROLL_PERMISSIONS[number][0];
export type PayrollScope = {
  id: string; name: string; kind: 'organization' | 'business_unit' | 'payroll_group';
  businessUnitId: string | null; mode: 'off' | 'shadow' | 'live'; canManage: boolean;
};
export type PayrollGrant = { id: string; scopeId: string; permission: PayrollPermission; grantedAt?: string };
export type PayrollAccessContext = {
  canBootstrap: boolean; isSelf: boolean; targetLinked: boolean;
  scopes: PayrollScope[]; myGrants: PayrollGrant[]; grants: PayrollGrant[];
  history: { action: string; permission: PayrollPermission | null; reason: string; scopeId: string; occurredAt: string }[];
};
export type PayrollRecipient = { id: string; name: string; employeeCode: string | null };
export const payrollPermissionLabel = (key: string) => PAYROLL_PERMISSIONS.find(([id]) => id === key)?.[1] || key;

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || 'Payroll access could not be verified.');
  return data as T;
}
export const fetchPayrollAccess = (employeeId?: string) => rpc<PayrollAccessContext>('get_payroll_access_context', { p_employee_id: employeeId || null });
export const fetchPayrollRecipients = () => rpc<PayrollRecipient[]>('get_payroll_access_recipients');
export const bootstrapPayrollAccess = (reason: string) => rpc<string>('bootstrap_payroll_access', { p_reason: reason });
export const grantPayrollAccess = (employeeId: string, scopeId: string, permission: PayrollPermission, reason: string) => rpc<string>('grant_payroll_access', {
  p_employee_id: employeeId, p_scope_id: scopeId, p_permission: permission, p_reason: reason,
});
export const revokePayrollAccess = (grantId: string, reason: string) => rpc<void>('revoke_payroll_access', { p_grant_id: grantId, p_reason: reason });
export const createPayrollGroupScope = (businessUnitId: string, name: string, reason: string) => rpc<string>('create_payroll_group_scope', {
  p_business_unit_id: businessUnitId, p_name: name, p_reason: reason,
});

export const PAYROLL_ACCESS_CHANGED = 'payroll-access-changed';
export const notifyPayrollAccessChanged = () => window.dispatchEvent(new Event(PAYROLL_ACCESS_CHANGED));
