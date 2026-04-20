import { supabase } from './supabaseClient';
import { Asset, AssetAssignment, AssetRequest, AssetRepair, AssetStatus, AssetRequestStatus, User } from '../types';

// ---------------------------------------------------------------------------
// Row Types
// ---------------------------------------------------------------------------
type AssetRow = {
  id: string;
  asset_tag: string;
  name: string;
  type: string;
  business_unit_id: string;
  serial_number?: string | null;
  purchase_date: string;
  value: number;
  status: string;
  notes?: string | null;
};

type AssetAssignmentRow = {
  id: string;
  asset_id: string;
  employee_id: string;
  date_assigned: string;
  date_returned?: string | null;
  condition_on_assign: string;
  condition_on_return?: string | null;
  manager_proof_url_on_return?: string | null;
  is_acknowledged?: boolean | null;
  acknowledged_at?: string | null;
  signed_document_url?: string | null;
};

type AssetRequestRow = {
  id: string;
  request_type: string;
  employee_id: string;
  employee_name: string;
  asset_description: string;
  justification: string;
  status: string;
  requested_at: string;
  manager_id: string;
  manager_notes?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  fulfilled_at?: string | null;
  asset_id?: string | null;
  employee_submission_notes?: string | null;
  employee_proof_url?: string | null;
  employee_submitted_at?: string | null;
  rejection_reason?: string | null;
};

type AssetRepairRow = {
  id: string;
  asset_id: string;
  date_in: string;
  date_out?: string | null;
  notes: string;
  cost?: number | null;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const mapAsset = (row: AssetRow): Asset => ({
  id: row.id,
  assetTag: row.asset_tag,
  name: row.name,
  type: row.type as Asset['type'],
  businessUnitId: row.business_unit_id,
  serialNumber: row.serial_number || undefined,
  purchaseDate: new Date(row.purchase_date),
  value: row.value,
  status: row.status as AssetStatus,
  notes: row.notes || undefined,
});

const mapAssetAssignment = (row: AssetAssignmentRow): AssetAssignment => ({
  id: row.id,
  assetId: row.asset_id,
  employeeId: row.employee_id,
  dateAssigned: new Date(row.date_assigned),
  dateReturned: row.date_returned ? new Date(row.date_returned) : undefined,
  conditionOnAssign: row.condition_on_assign,
  conditionOnReturn: row.condition_on_return || undefined,
  managerProofUrlOnReturn: row.manager_proof_url_on_return || undefined,
  isAcknowledged: row.is_acknowledged ?? undefined,
  acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
  signedDocumentUrl: row.signed_document_url || undefined,
});

const mapAssetRequest = (row: AssetRequestRow): AssetRequest => ({
  id: row.id,
  requestType: row.request_type as 'Request' | 'Return',
  employeeId: row.employee_id,
  employeeName: row.employee_name,
  assetDescription: row.asset_description,
  justification: row.justification,
  status: row.status as AssetRequestStatus,
  requestedAt: new Date(row.requested_at),
  managerId: row.manager_id,
  managerNotes: row.manager_notes || undefined,
  approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
  rejectedAt: row.rejected_at ? new Date(row.rejected_at) : undefined,
  fulfilledAt: row.fulfilled_at ? new Date(row.fulfilled_at) : undefined,
  assetId: row.asset_id || undefined,
  employeeSubmissionNotes: row.employee_submission_notes || undefined,
  employeeProofUrl: row.employee_proof_url || undefined,
  employeeSubmittedAt: row.employee_submitted_at ? new Date(row.employee_submitted_at) : undefined,
  rejectionReason: row.rejection_reason || undefined,
});

const mapAssetRepair = (row: AssetRepairRow): AssetRepair => ({
  id: row.id,
  assetId: row.asset_id,
  dateIn: new Date(row.date_in),
  dateOut: row.date_out ? new Date(row.date_out) : undefined,
  notes: row.notes,
  cost: row.cost ?? undefined,
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchAssets = async (): Promise<Asset[]> => {
  const { data, error } = await supabase.from('assets').select('*').order('name', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to fetch assets');
  return (data as AssetRow[]).map(mapAsset);
};

export const fetchAssetsByBU = async (businessUnitId: string): Promise<Asset[]> => {
  const { data, error } = await supabase.from('assets').select('*').eq('business_unit_id', businessUnitId).order('name', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to fetch assets by BU');
  return (data as AssetRow[]).map(mapAsset);
};

export const saveAsset = async (asset: Partial<Asset>): Promise<Asset> => {
  const payload = {
    asset_tag: asset.assetTag,
    name: asset.name,
    type: asset.type,
    business_unit_id: asset.businessUnitId,
    serial_number: asset.serialNumber || null,
    purchase_date: asset.purchaseDate ? new Date(asset.purchaseDate).toISOString().split('T')[0] : null,
    value: asset.value ?? 0,
    status: asset.status || AssetStatus.Available,
    notes: asset.notes || null,
  };

  const { data, error } = asset.id
    ? await supabase.from('assets').update(payload).eq('id', asset.id).select().single()
    : await supabase.from('assets').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save asset');
  return mapAsset(data as AssetRow);
};

export const fetchAssetAssignments = async (): Promise<AssetAssignment[]> => {
  const { data, error } = await supabase.from('asset_assignments').select('*').order('date_assigned', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to fetch asset assignments');
  return (data as AssetAssignmentRow[]).map(mapAssetAssignment);
};

export const saveAssetAssignment = async (assignment: Partial<AssetAssignment>): Promise<AssetAssignment> => {
  const payload = {
    asset_id: assignment.assetId,
    employee_id: assignment.employeeId,
    date_assigned: assignment.dateAssigned ? new Date(assignment.dateAssigned).toISOString() : null,
    date_returned: assignment.dateReturned ? new Date(assignment.dateReturned).toISOString() : null,
    condition_on_assign: assignment.conditionOnAssign || 'Good',
    condition_on_return: assignment.conditionOnReturn || null,
    manager_proof_url_on_return: assignment.managerProofUrlOnReturn || null,
    is_acknowledged: assignment.isAcknowledged ?? false,
    acknowledged_at: assignment.acknowledgedAt ? new Date(assignment.acknowledgedAt).toISOString() : null,
    signed_document_url: assignment.signedDocumentUrl || null,
  };

  const { data, error } = assignment.id
    ? await supabase.from('asset_assignments').update(payload).eq('id', assignment.id).select().single()
    : await supabase.from('asset_assignments').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save asset assignment');
  return mapAssetAssignment(data as AssetAssignmentRow);
};

export const fetchAssetRequests = async (): Promise<AssetRequest[]> => {
  const { data, error } = await supabase.from('asset_requests').select('*').order('requested_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to fetch asset requests');
  return (data as AssetRequestRow[]).map(mapAssetRequest);
};

export const saveAssetRequest = async (request: Partial<AssetRequest>, user: User): Promise<AssetRequest> => {
  const payload = {
    request_type: request.requestType || 'Request',
    employee_id: user.id,
    employee_name: user.name,
    asset_description: request.assetDescription || '',
    justification: request.justification || '',
    status: request.status || AssetRequestStatus.Pending,
    requested_at: new Date().toISOString(),
    manager_id: request.managerId || user.reportsTo || '',
    asset_id: request.assetId || null,
  };

  const { data, error } = request.id
    ? await supabase.from('asset_requests').update(payload).eq('id', request.id).select().single()
    : await supabase.from('asset_requests').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save asset request');
  return mapAssetRequest(data as AssetRequestRow);
};

export const fetchAssetRepairs = async (): Promise<AssetRepair[]> => {
  const { data, error } = await supabase.from('asset_repairs').select('*').order('date_in', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to fetch asset repairs');
  return (data as AssetRepairRow[]).map(mapAssetRepair);
};
