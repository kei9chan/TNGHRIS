import { supabase } from './supabaseClient';
import { LeaveRequest, LeaveRequestStatus, LeaveType, LeavePolicy, AccrualTier, User } from '../types';

// ---------------------------------------------------------------------------
// Row Types
// ---------------------------------------------------------------------------
type LeaveRequestRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  duration_days: number;
  reason?: string | null;
  status: string;
  approver_chain?: any | null;
  history_log?: any | null;
  attachment_url?: string | null;
  approver_id?: string | null;
  business_unit_id?: string | null;
  department_id?: string | null;
  created_at?: string | null;
};

type LeaveTypeRow = {
  id: string;
  name: string;
  paid: boolean;
  unit: string;
  min_increment: number;
  requires_doc_after_days?: number | null;
};

type LeavePolicyRow = {
  id: string;
  leave_type_id: string;
  accrual_rule: string;
  carry_over_cap?: number | null;
  allow_negative: boolean;
  default_entitlement?: number | null;
  tiers?: any | null;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const mapLeaveRequest = (row: LeaveRequestRow): LeaveRequest => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeName: row.employee_name,
  businessUnitId: row.business_unit_id || undefined,
  departmentId: row.department_id || undefined,
  leaveTypeId: row.leave_type_id,
  startDate: new Date(row.start_date),
  endDate: new Date(row.end_date),
  startTime: row.start_time || undefined,
  endTime: row.end_time || undefined,
  durationDays: row.duration_days,
  reason: row.reason || '',
  status: row.status as LeaveRequestStatus,
  approverChain: Array.isArray(row.approver_chain) ? row.approver_chain : [],
  historyLog: Array.isArray(row.history_log) ? row.history_log : [],
  attachmentUrl: row.attachment_url || undefined,
  approverId: row.approver_id || undefined,
});

const mapLeaveType = (row: LeaveTypeRow): LeaveType => ({
  id: row.id,
  name: row.name,
  paid: row.paid,
  unit: row.unit as 'day' | 'hour',
  minIncrement: row.min_increment,
  requiresDocAfterDays: row.requires_doc_after_days ?? null,
});

const mapLeavePolicy = (row: LeavePolicyRow): LeavePolicy => ({
  id: row.id,
  leaveTypeId: row.leave_type_id,
  accrualRule: row.accrual_rule as 'monthly' | 'annually' | 'none',
  accrualRate: row.default_entitlement || 0,
  tiers: Array.isArray(row.tiers) ? (row.tiers as AccrualTier[]) : [],
  carryOverCap: row.carry_over_cap || 0,
  allowNegative: row.allow_negative,
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchLeaveRequests = async (): Promise<LeaveRequest[]> => {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message || 'Failed to fetch leave requests');
  return (data as LeaveRequestRow[]).map(mapLeaveRequest);
};

export const fetchLeaveRequestsByEmployee = async (employeeId: string): Promise<LeaveRequest[]> => {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message || 'Failed to fetch leave requests');
  return (data as LeaveRequestRow[]).map(mapLeaveRequest);
};

export const fetchLeaveRequestById = async (id: string): Promise<LeaveRequest | null> => {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return mapLeaveRequest(data as LeaveRequestRow);
};

export const createLeaveRequest = async (request: Partial<LeaveRequest>, user: User): Promise<LeaveRequest> => {
  const payload = {
    employee_id: user.id,
    employee_name: user.name,
    leave_type_id: request.leaveTypeId,
    start_date: request.startDate ? new Date(request.startDate).toISOString().split('T')[0] : null,
    end_date: request.endDate ? new Date(request.endDate).toISOString().split('T')[0] : null,
    start_time: request.startTime || null,
    end_time: request.endTime || null,
    duration_days: request.durationDays || 1,
    reason: request.reason || '',
    status: LeaveRequestStatus.Pending,
    approver_chain: request.approverChain || [],
    history_log: [{
      userId: user.id,
      userName: user.name,
      timestamp: new Date().toISOString(),
      action: 'Submitted',
    }],
    attachment_url: request.attachmentUrl || null,
    approver_id: request.approverId || null,
    business_unit_id: user.businessUnitId || null,
    department_id: user.departmentId || null,
  };

  const { data, error } = await supabase.from('leave_requests').insert(payload).select().single();
  if (error) throw new Error(error.message || 'Failed to create leave request');
  return mapLeaveRequest(data as LeaveRequestRow);
};

export const updateLeaveRequest = async (id: string, updates: Partial<LeaveRequest>): Promise<LeaveRequest> => {
  const payload: Record<string, any> = {};
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.approverChain !== undefined) payload.approver_chain = updates.approverChain;
  if (updates.historyLog !== undefined) payload.history_log = updates.historyLog;
  if (updates.attachmentUrl !== undefined) payload.attachment_url = updates.attachmentUrl;
  if (updates.approverId !== undefined) payload.approver_id = updates.approverId;
  if (updates.reason !== undefined) payload.reason = updates.reason;

  const { data, error } = await supabase
    .from('leave_requests')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Failed to update leave request');
  return mapLeaveRequest(data as LeaveRequestRow);
};

export const fetchLeaveTypes = async (): Promise<LeaveType[]> => {
  const { data, error } = await supabase
    .from('leave_types')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message || 'Failed to fetch leave types');
  return (data as LeaveTypeRow[]).map(mapLeaveType);
};

export const fetchLeavePolicies = async (): Promise<LeavePolicy[]> => {
  const { data, error } = await supabase
    .from('leave_policies')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message || 'Failed to fetch leave policies');
  return (data as LeavePolicyRow[]).map(mapLeavePolicy);
};

export const saveLeavePolicyUpsert = async (policy: Partial<LeavePolicy>): Promise<LeavePolicy> => {
  const payload = {
    leave_type_id: policy.leaveTypeId,
    accrual_rule: policy.accrualRule || 'none',
    carry_over_cap: policy.carryOverCap ?? 0,
    allow_negative: policy.allowNegative ?? false,
    default_entitlement: policy.accrualRate ?? 0,
    tiers: policy.tiers || [],
  };

  if (policy.id) {
    const { data, error } = await supabase
      .from('leave_policies')
      .update(payload)
      .eq('id', policy.id)
      .select()
      .single();
    if (error) throw new Error(error.message || 'Failed to update leave policy');
    return mapLeavePolicy(data as LeavePolicyRow);
  } else {
    const { data, error } = await supabase
      .from('leave_policies')
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message || 'Failed to create leave policy');
    return mapLeavePolicy(data as LeavePolicyRow);
  }
};
