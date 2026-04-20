import { supabase } from './supabaseClient';
import { WFHRequest, WFHRequestStatus, User } from '../types';

// ---------------------------------------------------------------------------
// Row Type
// ---------------------------------------------------------------------------
type WfhRequestRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  reason?: string | null;
  status: string;
  report_link?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  business_unit_id?: string | null;
  department_id?: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------
const mapWfhRequest = (row: WfhRequestRow): WFHRequest => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeName: row.employee_name,
  date: new Date(row.date),
  reason: row.reason || '',
  status: row.status as WFHRequestStatus,
  reportLink: row.report_link || undefined,
  approvedBy: row.approved_by || undefined,
  approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
  rejectionReason: row.rejection_reason || undefined,
  createdAt: new Date(row.created_at),
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchWfhRequests = async (): Promise<WFHRequest[]> => {
  const { data, error } = await supabase
    .from('wfh_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message || 'Failed to fetch WFH requests');
  return (data as WfhRequestRow[]).map(mapWfhRequest);
};

export const fetchWfhRequestsByEmployee = async (employeeId: string): Promise<WFHRequest[]> => {
  const { data, error } = await supabase
    .from('wfh_requests')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message || 'Failed to fetch WFH requests');
  return (data as WfhRequestRow[]).map(mapWfhRequest);
};

export const createWfhRequest = async (request: Partial<WFHRequest>, user: User): Promise<WFHRequest> => {
  const payload = {
    employee_id: user.id,
    employee_name: user.name,
    date: request.date ? new Date(request.date).toISOString().split('T')[0] : null,
    reason: request.reason || '',
    status: WFHRequestStatus.Pending,
    report_link: request.reportLink || null,
    business_unit_id: user.businessUnitId || null,
    department_id: user.departmentId || null,
  };

  const { data, error } = await supabase.from('wfh_requests').insert(payload).select().single();
  if (error) throw new Error(error.message || 'Failed to create WFH request');
  return mapWfhRequest(data as WfhRequestRow);
};

export const approveWfhRequest = async (id: string, approverId: string): Promise<WFHRequest> => {
  const { data, error } = await supabase
    .from('wfh_requests')
    .update({
      status: WFHRequestStatus.Approved,
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Failed to approve WFH request');
  return mapWfhRequest(data as WfhRequestRow);
};

export const rejectWfhRequest = async (id: string, approverId: string, reason: string): Promise<WFHRequest> => {
  const { data, error } = await supabase
    .from('wfh_requests')
    .update({
      status: WFHRequestStatus.Rejected,
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Failed to reject WFH request');
  return mapWfhRequest(data as WfhRequestRow);
};

export const updateWfhReportLink = async (id: string, reportLink: string): Promise<WFHRequest> => {
  const { data, error } = await supabase
    .from('wfh_requests')
    .update({ report_link: reportLink })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Failed to update report link');
  return mapWfhRequest(data as WfhRequestRow);
};
