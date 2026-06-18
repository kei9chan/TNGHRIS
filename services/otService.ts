import { supabase } from './supabaseClient';
import { OTRequest, OTStatus, OTRequestHistory, User, Role } from '../types';

type OtRequestRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  start_time: string;
  end_time: string;
  reason: string;
  status: OTStatus;
  submitted_at?: string;
  approved_hours?: number | null;
  manager_note?: string | null;
  history_log?: any;
  attachment_url?: string | null;
  ot_type?: string;
  paid_ot_type?: string;
  created_at?: string;
  updated_at?: string;
};

const mapRow = (row: OtRequestRow): OTRequest => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeName: row.employee_name,
  date: row.date ? new Date(row.date) : new Date(),
  startTime: row.start_time,
  endTime: row.end_time,
  reason: row.reason,
  status: row.status as OTStatus,
  submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
  approvedHours: row.approved_hours ?? undefined,
  managerNote: row.manager_note ?? undefined,
  historyLog: (row.history_log as OTRequestHistory[]) || [],
  attachmentUrl: row.attachment_url ?? undefined,
  otType: (row.ot_type as 'Paid' | 'Offset') || 'Paid',
  paidOtType: (row.paid_ot_type as 'Regular Overtime' | 'Legal Holiday' | 'Special Holiday' | 'Rest Day') || undefined,
});

export const fetchOtRequests = async (): Promise<OTRequest[]> => {
  const { data, error } = await supabase
    .from('ot_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to load OT requests');
  return (data as OtRequestRow[]).map(mapRow);
};

export const saveOtRequest = async (
  request: Partial<OTRequest>,
  status: OTStatus,
  user: User
): Promise<OTRequest> => {
  const payload: Partial<OtRequestRow> = {
    employee_id: request.employeeId || user.id,
    employee_name: request.employeeName || user.name,
    date: request.date ? new Date(request.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    start_time: request.startTime || '',
    end_time: request.endTime || '',
    reason: request.reason || '',
    status: status,
    submitted_at: status === OTStatus.Submitted ? new Date().toISOString() : request.submittedAt?.toISOString(),
    approved_hours: request.approvedHours ?? null,
    manager_note: request.managerNote || null,
    history_log: request.historyLog || [],
    attachment_url: request.attachmentUrl || null,
    ot_type: request.otType || 'Paid',
    paid_ot_type: request.paidOtType || null,
  };

  const query = request.id
    ? supabase.from('ot_requests').update(payload).eq('id', request.id).select().single()
    : supabase.from('ot_requests').insert(payload).select().single();

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to save OT request');
  return mapRow(data as OtRequestRow);
};

export const approveRejectOtRequest = async (
  requestId: string,
  newStatus: OTStatus.Approved | OTStatus.Rejected,
  details: { approvedHours?: number; managerNote?: string }
): Promise<OTRequest> => {
  const updates: Partial<OtRequestRow> = {
    status: newStatus,
    approved_hours: details.approvedHours ?? null,
    manager_note: details.managerNote || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ot_requests')
    .update(updates)
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Failed to update OT request');

  if (data && newStatus === OTStatus.Approved && data.ot_type === 'Offset' && data.approved_hours) {
    const { data: userRecord } = await supabase.from('hris_users').select('leave_quota_offset').eq('id', data.employee_id).single();
    if (userRecord) {
      const currentOffset = Number(userRecord.leave_quota_offset) || 0;
      const earnedDays = data.approved_hours / 8;
      await supabase.from('hris_users').update({ leave_quota_offset: currentOffset + earnedDays }).eq('id', data.employee_id);
    }
  }

  return mapRow(data as OtRequestRow);
};

export const deleteOtRequest = async (requestId: string): Promise<void> => {
  const { error } = await supabase.from('ot_requests').delete().eq('id', requestId);
  if (error) throw new Error(error.message || 'Failed to delete OT request');
};

export const withdrawOtRequest = async (
  requestToUpdate: OTRequest,
  user: User
): Promise<OTRequest> => {
  const newHistoryEntry: OTRequestHistory = {
    userId: user.id,
    userName: user.name,
    timestamp: new Date(),
    action: 'Withdrawn',
    details: 'Request withdrawn by employee.'
  };

  const payload: Partial<OtRequestRow> = {
    status: OTStatus.Draft,
    submitted_at: null as any,
    history_log: [...(requestToUpdate.historyLog || []), newHistoryEntry],
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ot_requests')
    .update(payload)
    .eq('id', requestToUpdate.id)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Failed to withdraw OT request');
  return mapRow(data as OtRequestRow);
};

/** Reporting Manager approves a rank-and-file employee's OT request, advancing it to PendingBOD */
export const managerApproveOtRequest = async (
  requestId: string,
  details: { approvedHours?: number; managerNote?: string }
): Promise<OTRequest> => {
  const updates: Partial<OtRequestRow> = {
    status: OTStatus.PendingBOD,
    approved_hours: details.approvedHours ?? null,
    manager_note: details.managerNote || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ot_requests')
    .update(updates)
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Failed to approve OT request (Reporting Manager)');
  return mapRow(data as OtRequestRow);
};



/** BOD gives final approval to a manager's OT request */
export const bodApproveOtRequest = async (
  requestId: string,
  details: { approvedHours?: number; managerNote?: string }
): Promise<OTRequest> => {
  const updates: Partial<OtRequestRow> = {
    status: OTStatus.Approved,
    approved_hours: details.approvedHours ?? null,
    manager_note: details.managerNote || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ot_requests')
    .update(updates)
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Failed to approve OT request (BOD)');

  if (data && data.ot_type === 'Offset' && data.approved_hours) {
    const { data: userRecord } = await supabase.from('hris_users').select('leave_quota_offset').eq('id', data.employee_id).single();
    if (userRecord) {
      const currentOffset = Number(userRecord.leave_quota_offset) || 0;
      const earnedDays = data.approved_hours / 8;
      await supabase.from('hris_users').update({ leave_quota_offset: currentOffset + earnedDays }).eq('id', data.employee_id);
    }
  }

  return mapRow(data as OtRequestRow);
};
