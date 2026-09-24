import { supabase } from './supabaseClient';
import { ManpowerApprovalTrailEntry, ManpowerCoverageDay, ManpowerRequest, ManpowerRequestStatus, ManpowerRequestItem, User } from '../types';
import { dedupeRead } from './readCache';
import { normalizeCalendarDate, parseLocalCalendarDate } from '../utils/calendarDate';

// ---------------------------------------------------------------------------
// Row Type
// ---------------------------------------------------------------------------
export type ManpowerRequestRow = {
  id: string;
  business_unit_id?: string | null;
  business_unit_name?: string | null;
  requester_id: string;
  requester_name: string;
  date_needed: string;
  date_mode?: 'single' | 'range' | null;
  start_date?: string | null;
  end_date?: string | null;
  coverage_days?: unknown;
  coverage_day_count?: number | null;
  total_staff_days?: number | null;
  forecasted_pax?: number | null;
  general_note?: string | null;
  attachment_url?: string | null;
  items: any;
  grand_total?: number | null;
  status: string;
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  department_id?: string | null;
  approval_stage?: string | null;
  approval_issue?: string | null;
  clarification_status?: 'none' | 'requested' | 'responded' | null;
  clarification_question?: string | null;
  revision?: number | null;
  approval_history?: unknown;
  approval_route_snapshot?: unknown;
  approval_route_step?: number | null;
  routing_basis?: string | null;
  created_at: string;
};

export interface ManpowerApprovalRoutePreview {
  valid: boolean;
  message?: string;
  rule?: string;
  route: Array<{ approverUserId: string; approverName: string; organizationalLevel: string; authorityKind: string }>;
}

const parseJsonArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
};

const parseTrail = (value: unknown): ManpowerApprovalTrailEntry[] => parseJsonArray<ManpowerApprovalTrailEntry>(value);

const parseCoverageDays = (value: unknown): ManpowerCoverageDay[] => parseJsonArray<any>(value)
  .map((day: any) => ({
      date: String(day.date || ''),
      coverageRequired: day.coverageRequired !== false,
      forecastedPax: Number(day.forecastedPax || 0),
      operationalContext: day.operationalContext || undefined,
      reason: day.reason || undefined,
      items: Array.isArray(day.items) ? day.items as ManpowerRequestItem[] : [],
      totalStaff: Number(day.totalStaff || 0),
      totalCost: Number(day.totalCost || 0),
    })).filter(day => day.date);

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------
export const mapManpowerRequestRow = (row: ManpowerRequestRow): ManpowerRequest => {
  const coverageDays = parseCoverageDays(row.coverage_days);
  const items = parseJsonArray<ManpowerRequestItem>(row.items);
  const fallbackDate = normalizeCalendarDate(row.date_needed);
  const normalizedDays = coverageDays.length ? coverageDays : [{
    date: fallbackDate,
    coverageRequired: true,
    forecastedPax: Number(row.forecasted_pax || 0),
    operationalContext: row.general_note || undefined,
    items,
    totalStaff: items.reduce((sum, item) => sum + Number(item.onCallNeeded ?? item.requestedCount ?? 0), 0),
    totalCost: Number(row.grand_total || 0),
  }];
  return ({
  id: row.id,
  businessUnitId: row.business_unit_id || '',
  departmentId: row.department_id || undefined,
  businessUnitName: row.business_unit_name || '',
  requestedBy: row.requester_id,
  requesterName: row.requester_name,
  date: parseLocalCalendarDate(row.start_date || row.date_needed),
  dateMode: row.date_mode || (normalizedDays.length > 1 ? 'range' : 'single'),
  startDate: row.start_date || normalizedDays[0]?.date || fallbackDate,
  endDate: row.end_date || normalizedDays[normalizedDays.length - 1]?.date || fallbackDate,
  coverageDays: normalizedDays,
  coverageDayCount: Number(row.coverage_day_count || normalizedDays.filter(day => day.coverageRequired).length),
  totalStaffDays: Number(row.total_staff_days || normalizedDays.reduce((sum, day) => sum + day.totalStaff, 0)),
  forecastedPax: row.forecasted_pax || 0,
  generalNote: row.general_note || undefined,
  attachmentUrl: row.attachment_url || undefined,
  items,
  grandTotal: row.grand_total || 0,
  status: row.status as ManpowerRequestStatus,
  approvalStage: row.approval_stage || undefined,
  approvalIssue: row.approval_issue || undefined,
  clarificationStatus: row.clarification_status || 'none',
  clarificationQuestion: row.clarification_question || undefined,
  revision: Number(row.revision || 1),
  approvalTrail: parseTrail(row.approval_history),
  approvalRouteSnapshot: parseJsonArray(row.approval_route_snapshot),
  approvalRouteStep: Number(row.approval_route_step || 0),
  routingBasis: row.routing_basis || undefined,
  createdAt: new Date(row.created_at),
  approvedBy: row.approved_by || undefined,
  approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
  rejectionReason: row.rejection_reason || undefined,
  });
};

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchManpowerRequests = async (): Promise<ManpowerRequest[]> => {
  const { data, error } = await supabase
    .from('manpower_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message || 'Failed to fetch manpower requests');
  return (data as ManpowerRequestRow[]).map(mapManpowerRequestRow);
};

export const fetchManpowerRequestsByBU = async (businessUnitId: string): Promise<ManpowerRequest[]> => {
  const { data, error } = await supabase
    .from('manpower_requests')
    .select('*')
    .eq('business_unit_id', businessUnitId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message || 'Failed to fetch manpower requests');
  return (data as ManpowerRequestRow[]).map(mapManpowerRequestRow);
};

export const fetchManpowerRequestById = async (id: string): Promise<ManpowerRequest | null> => {
  const { data, error } = await supabase
    .from('manpower_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Failed to load the manpower request');
  if (!data) return null;
  return mapManpowerRequestRow(data as ManpowerRequestRow);
};

export const previewManpowerApprovalRoute = async (businessUnitId: string): Promise<ManpowerApprovalRoutePreview> => {
  const { data, error } = await supabase.rpc('preview_manpower_approval_route', { p_business_unit_id: businessUnitId });
  if (error) throw new Error(error.message || 'Unable to load the approval route.');
  return {
    valid: Boolean(data?.valid),
    message: data?.message || undefined,
    rule: data?.rule || undefined,
    route: Array.isArray(data?.route) ? data.route : [],
  };
};

type CreateManpowerRequestInput = Partial<ManpowerRequest> & { dateNeeded?: string };

export const createManpowerRequest = async (request: CreateManpowerRequestInput, user: User): Promise<ManpowerRequest> => {
  const coverageDays = request.coverageDays || [];
  const startDate = request.startDate || coverageDays[0]?.date || normalizeCalendarDate(request.dateNeeded || request.date);
  const endDate = request.endDate || coverageDays[coverageDays.length - 1]?.date || startDate;
  const payload = {
    businessUnitId: request.businessUnitId || user.businessUnitId || null,
    businessUnitName: request.businessUnitName || user.businessUnit || '',
    requesterId: user.id,
    requesterName: user.name,
    dateMode: request.dateMode || (startDate === endDate ? 'single' : 'range'),
    startDate,
    endDate,
    forecastedPax: request.forecastedPax || 0,
    generalNote: request.generalNote || null,
    attachmentUrl: request.attachmentUrl || null,
    coverageDays,
  };

  const { data, error } = await supabase.rpc('create_manpower_request_v2', { p_request: payload });
  if (error) throw new Error(error.message || 'Failed to create manpower request');
  const requestId = typeof data === 'string' ? data : data?.requestId;
  if (!requestId) throw new Error('The new on-call request did not return an ID.');
  const created = await fetchManpowerRequestById(requestId);
  if (!created) throw new Error('The new on-call request could not be reloaded.');
  return created;
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

export const requestManpowerClarification = async (id: string, question: string): Promise<ManpowerRequest> => {
  const { error } = await supabase.rpc('request_manpower_clarification', {
    p_request_id: id,
    p_question: question.trim(),
  });
  if (error) throw new Error(error.message || 'Failed to request clarification');
  const updated = await fetchManpowerRequestById(id);
  if (!updated) throw new Error('The request could not be reloaded after requesting clarification.');
  return updated;
};

export const respondToManpowerClarification = async (
  id: string,
  response: string,
  request: CreateManpowerRequestInput,
): Promise<ManpowerRequest> => {
  const { error } = await supabase.rpc('respond_manpower_request_clarification', {
    p_request_id: id,
    p_response: response.trim(),
    p_request: {
      dateMode: request.dateMode,
      startDate: request.startDate,
      endDate: request.endDate,
      forecastedPax: request.forecastedPax || 0,
      generalNote: request.generalNote || null,
      attachmentUrl: request.attachmentUrl || null,
      coverageDays: request.coverageDays || [],
    },
  });
  if (error) throw new Error(error.message || 'Failed to submit the clarification response');
  const updated = await fetchManpowerRequestById(id);
  if (!updated) throw new Error('The request could not be reloaded after clarification.');
  return updated;
};
