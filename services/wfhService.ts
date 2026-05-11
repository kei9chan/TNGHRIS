import { supabase } from './supabaseClient';
import { WFHRequest, WFHRequestStatus, User, Role } from '../types';

// ---------------------------------------------------------------------------
// Row Type
// ---------------------------------------------------------------------------
type WfhRequestRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  end_date?: string | null;
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
  endDate: row.end_date ? new Date(row.end_date) : undefined,
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

export const createWfhRequest = async (request: Partial<WFHRequest>, user: User, isDraft: boolean = false): Promise<WFHRequest> => {
  // Determine if user is a manager
  const managerRoles = [
    Role.Manager, Role.BusinessUnitManager, Role.GeneralManager, 
    Role.OperationsDirector, Role.HRManager, Role.BOD
  ];
  const isManager = managerRoles.includes(user.role);

  let initialStatus = WFHRequestStatus.PendingSubmission;
  if (!isDraft) {
    initialStatus = isManager ? WFHRequestStatus.PendingBOD : WFHRequestStatus.PendingDeptHead;
  }

  const payload = {
    employee_id: user.id,
    employee_name: user.name,
    date: request.date ? new Date(request.date).toISOString().split('T')[0] : null,
    end_date: request.endDate ? new Date(request.endDate).toISOString().split('T')[0] : null,
    reason: request.reason || '',
    status: initialStatus,
    report_link: request.reportLink || null,
    business_unit_id: user.businessUnitId || null,
    department_id: user.departmentId || null,
  };

  const { data, error } = await supabase.from('wfh_requests').insert(payload).select().single();
  if (error) throw new Error(error.message || 'Failed to create WFH request');
  return mapWfhRequest(data as WfhRequestRow);
};

export const updateWfhRequestDetails = async (id: string, request: Partial<WFHRequest>): Promise<WFHRequest> => {
  const payload = {
    date: request.date ? new Date(request.date).toISOString().split('T')[0] : null,
    end_date: request.endDate ? new Date(request.endDate).toISOString().split('T')[0] : null,
    reason: request.reason || '',
    report_link: request.reportLink || null,
  };

  const { data, error } = await supabase
    .from('wfh_requests')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Failed to update WFH request');
  return mapWfhRequest(data as WfhRequestRow);
};

export const submitWfhRequest = async (id: string, user: User): Promise<WFHRequest> => {
  const managerRoles = [
    Role.Manager, Role.BusinessUnitManager, Role.GeneralManager, 
    Role.OperationsDirector, Role.HRManager, Role.BOD
  ];
  const isManager = managerRoles.includes(user.role);
  const newStatus = isManager ? WFHRequestStatus.PendingBOD : WFHRequestStatus.PendingDeptHead;

  const { data, error } = await supabase
    .from('wfh_requests')
    .update({ status: newStatus })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Failed to submit WFH request');
  return mapWfhRequest(data as WfhRequestRow);
};

export const deptHeadApproveWfhRequest = async (id: string, approverId: string): Promise<WFHRequest> => {
  const { data, error } = await supabase
    .from('wfh_requests')
    .update({
      status: WFHRequestStatus.PendingBOD,
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Failed to approve WFH request (Dept Head)');
  return mapWfhRequest(data as WfhRequestRow);
};

export const bodApproveWfhRequest = async (id: string, approverId: string): Promise<WFHRequest> => {
  const { data, error } = await supabase
    .from('wfh_requests')
    .update({
      status: WFHRequestStatus.ForTimekeeping,
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Failed to approve WFH request (BOD)');
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
