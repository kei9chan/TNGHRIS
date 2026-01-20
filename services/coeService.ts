import { supabase } from './supabaseClient';
import { COERequest, COERequestStatus, COEPurpose, COETemplate, User } from '../types';

type CoeRequestRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_position?: string | null;
  employee_business_unit_id?: string | null;
  employee_department_id?: string | null;
  purpose: COEPurpose;
  other_purpose_detail?: string | null;
  date_requested?: string | null;
  status: COERequestStatus;
  rejection_reason?: string | null;
  generated_document_url?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  requested_by?: string | null;
  created_at?: string | null;
};

const isUuid = (value?: string | null) =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const mapCoeRequest = (row: CoeRequestRow): COERequest => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeName: row.employee_name,
  businessUnitId: row.employee_business_unit_id || '',
  employeeDepartmentId: row.employee_department_id || undefined,
  purpose: row.purpose as COEPurpose,
  otherPurposeDetail: row.other_purpose_detail || undefined,
  dateRequested: row.date_requested ? new Date(row.date_requested) : row.created_at ? new Date(row.created_at) : new Date(),
  status: row.status as COERequestStatus,
  rejectionReason: row.rejection_reason || undefined,
  generatedDocumentUrl: row.generated_document_url || undefined,
  approvedBy: row.approved_by || undefined,
  approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
});

export const createCoeRequest = async (request: Partial<COERequest>, user: User): Promise<COERequest> => {
  // Fetch authoritative BU/Dept ids and role from hris_users to avoid non-UUIDs (e.g., "bu3")
  const { data: employeeRow } = await supabase
    .from('hris_users')
    .select('business_unit_id, business_unit, department_id, role')
    .eq('id', user.id)
    .maybeSingle();

  let buId = request.businessUnitId || employeeRow?.business_unit_id || user.businessUnitId || null;
  // If no UUID BU id, try to resolve by business_unit name
  if (!isUuid(buId) && (employeeRow?.business_unit || user.businessUnit)) {
    const { data: buRow } = await supabase
      .from('business_units')
      .select('id')
      .ilike('name', employeeRow?.business_unit || user.businessUnit || '')
      .maybeSingle();
    if (buRow?.id) {
      buId = buRow.id;
    }
  }
  const employeePosition = request.employeePosition ?? employeeRow?.role ?? user.position ?? user.role ?? null;

  const payload = {
    employee_id: user.id,
    employee_name: request.employeeName || user.name,
    employee_position: employeePosition,
    employee_business_unit_id: isUuid(buId) ? buId : null,
    employee_department_id: isUuid(employeeRow?.department_id || user.departmentId) ? (employeeRow?.department_id || user.departmentId) : null,
    purpose: request.purpose,
    other_purpose_detail: request.otherPurposeDetail || null,
    status: COERequestStatus.Pending,
    requested_by: user.id,
  };

  const { data, error } = await supabase.from('coe_requests').insert(payload).select().single();
  if (error) {
    throw new Error(error.message || 'Failed to submit COE request');
  }
  return mapCoeRequest(data as CoeRequestRow);
};

export const approveCoeRequest = async (requestId: string, approverId: string, generatedDocumentUrl?: string): Promise<COERequest> => {
  const updates = {
    status: COERequestStatus.Approved,
    approved_by: approverId,
    approved_at: new Date().toISOString(),
    generated_document_url: generatedDocumentUrl || null,
    rejection_reason: null,
  };

  const { data, error } = await supabase.from('coe_requests').update(updates).eq('id', requestId).select().single();
  if (error) {
    throw new Error(error.message || 'Failed to approve COE request');
  }
  return mapCoeRequest(data as CoeRequestRow);
};

export const rejectCoeRequest = async (requestId: string, approverId: string, reason: string): Promise<COERequest> => {
  const updates = {
    status: COERequestStatus.Rejected,
    rejection_reason: reason,
    approved_by: approverId,
    approved_at: new Date().toISOString(),
    generated_document_url: null,
  };

  const { data, error } = await supabase.from('coe_requests').update(updates).eq('id', requestId).select().single();
  if (error) {
    throw new Error(error.message || 'Failed to reject COE request');
  }
  return mapCoeRequest(data as CoeRequestRow);
};

export const fetchCoeRequests = async (): Promise<COERequest[]> => {
  const { data, error } = await supabase
    .from('coe_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to load COE requests');
  }

  return (data as CoeRequestRow[]).map(mapCoeRequest);
};

export const fetchCoeRequestById = async (requestId: string): Promise<COERequest | null> => {
  const { data, error } = await supabase
    .from('coe_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapCoeRequest(data as CoeRequestRow);
};

type CoeTemplateRow = {
  id: string;
  business_unit_id: string;
  logo_url?: string | null;
  address?: string | null;
  body: string;
  signatory_name: string;
  signatory_position: string;
  is_active: boolean;
};

export const fetchActiveCoeTemplates = async (): Promise<COETemplate[]> => {
  const { data, error } = await supabase
    .from('coe_templates')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to load COE templates');
  }

  return (data as CoeTemplateRow[]).map((row) => ({
    id: row.id,
    businessUnitId: row.business_unit_id,
    logoUrl: row.logo_url || undefined,
    address: row.address || '',
    body: row.body,
    signatoryName: row.signatory_name,
    signatoryPosition: row.signatory_position,
    isActive: row.is_active,
  }));
};
