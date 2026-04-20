import { supabase } from './supabaseClient';
import { ManpowerRequest, ManpowerRequestStatus, ManpowerRequestItem, User } from '../types';

// ---------------------------------------------------------------------------
// Row Type
// ---------------------------------------------------------------------------
type ManpowerRequestRow = {
  id: string;
  business_unit_id?: string | null;
  business_unit_name?: string | null;
  requester_id: string;
  requester_name: string;
  date_needed: string;
  forecasted_pax?: number | null;
  general_note?: string | null;
  items: any;
  grand_total?: number | null;
  status: string;
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  justification?: string | null;
  department_id?: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------
const mapManpowerRequest = (row: ManpowerRequestRow): ManpowerRequest => ({
  id: row.id,
  businessUnitId: row.business_unit_id || '',
  departmentId: row.department_id || undefined,
  businessUnitName: row.business_unit_name || '',
  requestedBy: row.requester_id,
  requesterName: row.requester_name,
  date: new Date(row.date_needed),
  forecastedPax: row.forecasted_pax || 0,
  generalNote: row.general_note || undefined,
  items: Array.isArray(row.items) ? (row.items as ManpowerRequestItem[]) : [],
  grandTotal: row.grand_total || 0,
  status: row.status as ManpowerRequestStatus,
  createdAt: new Date(row.created_at),
  approvedBy: row.approved_by || undefined,
  approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
  rejectionReason: row.rejection_reason || undefined,
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchManpowerRequests = async (): Promise<ManpowerRequest[]> => {
  const { data, error } = await supabase
    .from('manpower_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message || 'Failed to fetch manpower requests');
  return (data as ManpowerRequestRow[]).map(mapManpowerRequest);
};

export const fetchManpowerRequestsByBU = async (businessUnitId: string): Promise<ManpowerRequest[]> => {
  const { data, error } = await supabase
    .from('manpower_requests')
    .select('*')
    .eq('business_unit_id', businessUnitId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message || 'Failed to fetch manpower requests');
  return (data as ManpowerRequestRow[]).map(mapManpowerRequest);
};

export const createManpowerRequest = async (request: Partial<ManpowerRequest>, user: User): Promise<ManpowerRequest> => {
  const payload = {
    business_unit_id: request.businessUnitId || user.businessUnitId || null,
    business_unit_name: request.businessUnitName || user.businessUnit || '',
    requester_id: user.id,
    requester_name: user.name,
    date_needed: request.date ? new Date(request.date).toISOString().split('T')[0] : null,
    forecasted_pax: request.forecastedPax || 0,
    general_note: request.generalNote || null,
    items: request.items || [],
    grand_total: request.grandTotal || 0,
    status: ManpowerRequestStatus.Pending,
    department_id: request.departmentId || user.departmentId || null,
  };

  const { data, error } = await supabase.from('manpower_requests').insert(payload).select().single();
  if (error) throw new Error(error.message || 'Failed to create manpower request');
  return mapManpowerRequest(data as ManpowerRequestRow);
};

export const approveManpowerRequest = async (id: string, approverId: string): Promise<ManpowerRequest> => {
  const { data, error } = await supabase
    .from('manpower_requests')
    .update({
      status: ManpowerRequestStatus.Approved,
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Failed to approve manpower request');
  return mapManpowerRequest(data as ManpowerRequestRow);
};

export const rejectManpowerRequest = async (id: string, approverId: string, reason: string): Promise<ManpowerRequest> => {
  const { data, error } = await supabase
    .from('manpower_requests')
    .update({
      status: ManpowerRequestStatus.Rejected,
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message || 'Failed to reject manpower request');
  return mapManpowerRequest(data as ManpowerRequestRow);
};
