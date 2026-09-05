import { supabase } from './supabaseClient';

export type PayrollScheduleWorkflowStatus =
  | 'pending_manager'
  | 'pending_counterparty'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'applied';

export type PayrollScheduleOption = {
  id: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  workerAssignmentId: string;
  shiftPresetId: string;
  presetCode: string;
  presetName: string;
  shiftKind: string;
  version: number;
  status: string;
  scheduleSource: string;
};

export type PayrollShiftPresetOption = {
  id: string;
  code: string;
  name: string;
  shiftKind: string;
  scheduledMinutes: number;
  breakMinutes: number;
  payrollGroupId?: string | null;
  businessUnitId?: string | null;
  siteId?: string | null;
};

export type PayrollScheduleWorkflowEmployee = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type PayrollScheduleWorkflowContext = {
  actorId: string;
  canManageAll: boolean;
  employees: PayrollScheduleWorkflowEmployee[];
  schedules: PayrollScheduleOption[];
  presets: PayrollShiftPresetOption[];
};

export type PayrollScheduleChangeRequest = {
  id: string;
  employeeId: string;
  workDate: string;
  currentScheduleId: string;
  requestedShiftPresetId: string;
  directManagerId?: string | null;
  approvalMode: 'direct_manager' | 'payroll_exception';
  requestedByUserId: string;
  reason: string;
  sourceDocumentRef?: string | null;
  sourceSnapshot: Record<string, unknown>;
  status: PayrollScheduleWorkflowStatus;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  appliedScheduleId?: string | null;
  appliedAt?: string | null;
  requiresReinterpretation: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PayrollShiftSwapRequest = {
  id: string;
  swapDate: string;
  requesterEmployeeId: string;
  counterpartEmployeeId: string;
  requesterScheduleId: string;
  counterpartScheduleId: string;
  directManagerId?: string | null;
  approvalMode: 'direct_manager' | 'payroll_exception';
  requestedByUserId: string;
  reason: string;
  sourceDocumentRef?: string | null;
  sourceSnapshot: Record<string, unknown>;
  status: PayrollScheduleWorkflowStatus;
  counterpartyStatus: 'pending' | 'accepted' | 'declined';
  counterpartyRespondedByUserId?: string | null;
  counterpartyRespondedAt?: string | null;
  counterpartyNote?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  appliedRequesterScheduleId?: string | null;
  appliedCounterpartScheduleId?: string | null;
  appliedAt?: string | null;
  requiresReinterpretation: boolean;
  createdAt: string;
  updatedAt: string;
};

const friendlyError = (error: any, fallback: string): Error => {
  const message = error?.message || fallback;
  if (/schema cache|could not find the function/i.test(message)) {
    return new Error(`${message} Refresh the staging session once, then try again.`);
  }
  return new Error(message);
};

const mapScheduleOption = (row: any): PayrollScheduleOption => ({
  id: row.id,
  employeeId: row.employeeId,
  employeeName: row.employeeName,
  workDate: row.workDate,
  workerAssignmentId: row.workerAssignmentId,
  shiftPresetId: row.shiftPresetId,
  presetCode: row.presetCode,
  presetName: row.presetName,
  shiftKind: row.shiftKind,
  version: Number(row.version || 0),
  status: row.status,
  scheduleSource: row.scheduleSource,
});

const mapChangeRequest = (row: any): PayrollScheduleChangeRequest => ({
  id: row.id,
  employeeId: row.employee_id,
  workDate: row.work_date,
  currentScheduleId: row.current_schedule_id,
  requestedShiftPresetId: row.requested_shift_preset_id,
  directManagerId: row.direct_manager_id,
  approvalMode: row.approval_mode,
  requestedByUserId: row.requested_by_user_id,
  reason: row.reason,
  sourceDocumentRef: row.source_document_ref,
  sourceSnapshot: row.source_snapshot || {},
  status: row.status,
  reviewedByUserId: row.reviewed_by_user_id,
  reviewedAt: row.reviewed_at,
  reviewNote: row.review_note,
  appliedScheduleId: row.applied_schedule_id,
  appliedAt: row.applied_at,
  requiresReinterpretation: Boolean(row.requires_reinterpretation),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapSwapRequest = (row: any): PayrollShiftSwapRequest => ({
  id: row.id,
  swapDate: row.swap_date,
  requesterEmployeeId: row.requester_employee_id,
  counterpartEmployeeId: row.counterpart_employee_id,
  requesterScheduleId: row.requester_schedule_id,
  counterpartScheduleId: row.counterpart_schedule_id,
  directManagerId: row.direct_manager_id,
  approvalMode: row.approval_mode,
  requestedByUserId: row.requested_by_user_id,
  reason: row.reason,
  sourceDocumentRef: row.source_document_ref,
  sourceSnapshot: row.source_snapshot || {},
  status: row.status,
  counterpartyStatus: row.counterparty_status,
  counterpartyRespondedByUserId: row.counterparty_responded_by_user_id,
  counterpartyRespondedAt: row.counterparty_responded_at,
  counterpartyNote: row.counterparty_note,
  reviewedByUserId: row.reviewed_by_user_id,
  reviewedAt: row.reviewed_at,
  reviewNote: row.review_note,
  appliedRequesterScheduleId: row.applied_requester_schedule_id,
  appliedCounterpartScheduleId: row.applied_counterpart_schedule_id,
  appliedAt: row.applied_at,
  requiresReinterpretation: Boolean(row.requires_reinterpretation),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const fetchPayrollScheduleWorkflowContext = async (
  startDate: string,
  endDate: string,
): Promise<PayrollScheduleWorkflowContext> => {
  const { data, error } = await supabase.rpc('get_payroll_schedule_workflow_context', {
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw friendlyError(error, 'Failed to load schedule workflow context');
  const payload = (data || {}) as any;
  return {
    actorId: payload.actorId,
    canManageAll: Boolean(payload.canManageAll),
    employees: Array.isArray(payload.employees) ? payload.employees : [],
    schedules: Array.isArray(payload.schedules) ? payload.schedules.map(mapScheduleOption) : [],
    presets: Array.isArray(payload.presets) ? payload.presets : [],
  };
};

export const fetchPayrollScheduleChangeRequests = async (
  startDate: string,
  endDate: string,
): Promise<PayrollScheduleChangeRequest[]> => {
  const { data, error } = await supabase
    .from('payroll_schedule_change_requests')
    .select('*')
    .gte('work_date', startDate)
    .lte('work_date', endDate)
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw friendlyError(error, 'Failed to load change-of-shift requests');
  return (data || []).map(mapChangeRequest);
};

export const fetchPayrollShiftSwapRequests = async (
  startDate: string,
  endDate: string,
): Promise<PayrollShiftSwapRequest[]> => {
  const { data, error } = await supabase
    .from('payroll_shift_swap_requests')
    .select('*')
    .gte('swap_date', startDate)
    .lte('swap_date', endDate)
    .order('swap_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw friendlyError(error, 'Failed to load shift-swap requests');
  return (data || []).map(mapSwapRequest);
};

export const submitPayrollScheduleChangeRequest = async (input: {
  employeeId: string;
  currentScheduleId: string;
  requestedShiftPresetId: string;
  reason: string;
  sourceDocumentRef?: string;
}) => {
  const { data, error } = await supabase.rpc('submit_payroll_schedule_change_request', {
    p_employee_id: input.employeeId,
    p_current_schedule_id: input.currentScheduleId,
    p_requested_shift_preset_id: input.requestedShiftPresetId,
    p_reason: input.reason,
    p_source_document_ref: input.sourceDocumentRef || null,
  });
  if (error) throw friendlyError(error, 'Failed to submit change-of-shift request');
  return data;
};

export const reviewPayrollScheduleChangeRequest = async (input: {
  requestId: string;
  action: 'approve' | 'reject' | 'cancel';
  note?: string;
}) => {
  const { data, error } = await supabase.rpc('review_payroll_schedule_change_request', {
    p_request_id: input.requestId,
    p_action: input.action,
    p_note: input.note || null,
  });
  if (error) throw friendlyError(error, 'Failed to review change-of-shift request');
  return data;
};

export const submitPayrollShiftSwapRequest = async (input: {
  requesterEmployeeId: string;
  requesterScheduleId: string;
  counterpartEmployeeId: string;
  counterpartScheduleId: string;
  reason: string;
  sourceDocumentRef?: string;
}) => {
  const { data, error } = await supabase.rpc('submit_payroll_shift_swap_request', {
    p_requester_employee_id: input.requesterEmployeeId,
    p_requester_schedule_id: input.requesterScheduleId,
    p_counterpart_employee_id: input.counterpartEmployeeId,
    p_counterpart_schedule_id: input.counterpartScheduleId,
    p_reason: input.reason,
    p_source_document_ref: input.sourceDocumentRef || null,
  });
  if (error) throw friendlyError(error, 'Failed to submit shift-swap request');
  return data;
};

export const respondPayrollShiftSwapRequest = async (input: {
  requestId: string;
  action: 'accept' | 'decline';
  note?: string;
}) => {
  const { data, error } = await supabase.rpc('respond_payroll_shift_swap_request', {
    p_request_id: input.requestId,
    p_action: input.action,
    p_note: input.note || null,
  });
  if (error) throw friendlyError(error, 'Failed to respond to shift-swap request');
  return data;
};

export const reviewPayrollShiftSwapRequest = async (input: {
  requestId: string;
  action: 'approve' | 'reject' | 'cancel';
  note?: string;
}) => {
  const { data, error } = await supabase.rpc('review_payroll_shift_swap_request', {
    p_request_id: input.requestId,
    p_action: input.action,
    p_note: input.note || null,
  });
  if (error) throw friendlyError(error, 'Failed to review shift-swap request');
  return data;
};
