import { supabase } from './supabaseClient';
import { ManpowerApprovalTrailEntry, ManpowerRequest, ManpowerRequestStatus, ManpowerRequestItem, User } from '../types';
import { dedupeRead } from './readCache';
import { normalizeCalendarDate, parseLocalCalendarDate } from '../utils/calendarDate';

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
  department_id?: string | null;
  approval_stage?: string | null;
  approval_issue?: string | null;
  approval_history?: unknown;
  created_at: string;
};

const parseTrail = (value: unknown): ManpowerApprovalTrailEntry[] => {
  if (!Array.isArray(value)) return [];
  return value as ManpowerApprovalTrailEntry[];
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
  date: parseLocalCalendarDate(row.date_needed),
  forecastedPax: row.forecasted_pax || 0,
  generalNote: row.general_note || undefined,
  items: Array.isArray(row.items) ? (row.items as ManpowerRequestItem[]) : [],
  grandTotal: row.grand_total || 0,
  status: row.status as ManpowerRequestStatus,
  approvalStage: row.approval_stage || undefined,
  approvalIssue: row.approval_issue || undefined,
  approvalTrail: parseTrail(row.approval_history),
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

export const fetchManpowerRequestById = async (id: string): Promise<ManpowerRequest | null> => {
  const { data, error } = await supabase
    .from('manpower_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Failed to load the manpower request');
  if (!data) return null;
  return mapManpowerRequest(data as ManpowerRequestRow);
};

type CreateManpowerRequestInput = Partial<ManpowerRequest> & { dateNeeded?: string };

export const createManpowerRequest = async (request: CreateManpowerRequestInput, user: User): Promise<ManpowerRequest> => {
  const payload = {
    business_unit_id: request.businessUnitId || user.businessUnitId || null,
    business_unit_name: request.businessUnitName || user.businessUnit || '',
    requester_id: user.id,
    requester_name: user.name,
    date_needed: normalizeCalendarDate(request.dateNeeded || request.date),
    forecasted_pax: request.forecastedPax || 0,
    general_note: request.generalNote || null,
    items: request.items || [],
    grand_total: request.grandTotal || 0,
    status: ManpowerRequestStatus.Pending,
    department_id: request.departmentId || request.items?.[0]?.departmentId || user.departmentId || null,
  };

  const { data, error } = await supabase.from('manpower_requests').insert(payload).select().single();
  if (error) throw new Error(error.message || 'Failed to create manpower request');
  return mapManpowerRequest(data as ManpowerRequestRow);
};

export const fetchMyPendingManpowerApprovalIds = async (userId?: string): Promise<string[]> => {
  const load = async () => {
    const { data, error } = await supabase.rpc('get_my_pending_manpower_approval_ids');
    if (error) throw new Error(error.message || 'Failed to load assigned manpower approvals');
    return (data || []).map((row: { request_id: string }) => row.request_id).filter(Boolean);
  };
  return userId ? dedupeRead(`pending-manpower-approvals:${userId}`, load, 2_000) : load();
};

const processManpowerApproval = async (
  id: string,
  decision: 'approve' | 'reject',
  comments?: string,
): Promise<ManpowerRequest> => {
  const { error } = await supabase.rpc('process_manpower_request_approval', {
    p_request_id: id,
    p_decision: decision,
    p_comments: comments?.trim() || null,
  });
  if (error) throw new Error(error.message || `Failed to ${decision} manpower request`);

  const updated = await fetchManpowerRequestById(id);
  if (!updated) throw new Error('The manpower request could not be reloaded after processing.');
  return updated;
};

export const approveManpowerRequest = async (id: string, _approverId?: string, comments?: string): Promise<ManpowerRequest> =>
  processManpowerApproval(id, 'approve', comments);

export const rejectManpowerRequest = async (id: string, _approverId?: string, reason?: string): Promise<ManpowerRequest> =>
  processManpowerApproval(id, 'reject', reason);
