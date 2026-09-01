import { supabase } from './supabaseClient';
import {
  COEDocumentData,
  COEEmployeeSnapshot,
  COERequest,
  COERequestStatus,
  COEPurpose,
  COETemplate,
  COETemplateStyle,
  COETemplateStatus,
  NotificationType,
  User,
} from '../types';

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
  template_id?: string | null;
  template?: { name?: string | null } | null;
  snapshot_created_at?: string | null;
  generation_source?: 'template' | 'fallback' | 'historical_snapshot' | null;
  fallback_reason?: string | null;
  document_version?: number | null;
  approved_by?: string | null;
  approved_at?: string | null;
  return_reason?: string | null;
  returned_by?: string | null;
  returned_at?: string | null;
  requested_by?: string | null;
  created_at?: string | null;
};

const isUuid = (value?: string | null) =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const mapCoeRequest = (row: CoeRequestRow): COERequest => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeName: row.employee_name,
  employeePosition: row.employee_position || undefined,
  businessUnitId: row.employee_business_unit_id || '',
  employeeDepartmentId: row.employee_department_id || undefined,
  purpose: row.purpose as COEPurpose,
  otherPurposeDetail: row.other_purpose_detail || undefined,
  dateRequested: row.date_requested ? new Date(row.date_requested) : row.created_at ? new Date(row.created_at) : new Date(),
  status: row.status as COERequestStatus,
  rejectionReason: row.rejection_reason || undefined,
  generatedDocumentUrl: row.generated_document_url || undefined,
  templateId: row.template_id || undefined,
  templateName: row.template?.name || undefined,
  snapshotCreatedAt: row.snapshot_created_at ? new Date(row.snapshot_created_at) : undefined,
  generationSource: row.generation_source || undefined,
  fallbackReason: row.fallback_reason || undefined,
  documentVersion: row.document_version || 1,
  approvedBy: row.approved_by || undefined,
  approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
  returnReason: row.return_reason || undefined,
  returnedBy: row.returned_by || undefined,
  returnedAt: row.returned_at ? new Date(row.returned_at) : undefined,
});

export const createCoeRequest = async (request: Partial<COERequest>, user: User): Promise<COERequest> => {
  if (!request.purpose) {
    throw new Error('Please choose what the COE is for.');
  }
  if (!request.templateId || !isUuid(request.templateId)) {
    throw new Error('Please choose a COE template.');
  }

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
    status: COERequestStatus.PendingHRManagerApproval,
    template_id: request.templateId,
    requested_by: user.id,
  };

  const { data, error } = await supabase.from('coe_requests').insert(payload).select().single();
  if (error) {
    throw new Error(error.message || 'Failed to submit COE request');
  }

  const savedRequest = mapCoeRequest(data as CoeRequestRow);
  return {
    ...savedRequest,
    templateName: savedRequest.templateName || request.templateName || undefined,
  };
};

export const approveCoeRequest = async (
  requestId: string,
  _approverId?: string,
  _generatedDocumentUrl?: string,
): Promise<COERequest> => {
  const { data, error } = await supabase.rpc('approve_coe_request_with_snapshot', {
    p_request_id: requestId,
  });
  if (error) {
    throw new Error(error.message || 'Failed to approve COE request');
  }

  const requestRow = (data as any)?.request as CoeRequestRow | undefined;
  if (!requestRow) {
    throw new Error('The approved COE document could not be prepared.');
  }
  
  // Notify employee
  try {
      if (requestRow.employee_id) {
          await supabase.from('notifications').upsert({
              id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${requestRow.employee_id}`,
              user_id: requestRow.employee_id,
              type: NotificationType.COE_UPDATE,
              title: 'COE Request Approved',
              message: `Your Certificate of Employment request has been approved.`,
              link: `/employees/coe/requests?requestId=${requestRow.id}`,
              is_read: false,
              created_at: new Date().toISOString(),
              related_entity_id: requestRow.id,
              dedupe_key: `coe-decision:${requestRow.id}:approved`,
          }, { onConflict: 'user_id,dedupe_key' });
      }
  } catch (notifyErr) {
      console.warn('Failed to notify employee about approved COE request', notifyErr);
  }

  return mapCoeRequest(requestRow);
};

export const rejectCoeRequest = async (requestId: string, approverId: string, reason: string): Promise<COERequest> => {
  void approverId;
  const { data, error } = await supabase.rpc('reject_coe_request', {
    p_request_id: requestId,
    p_reason: reason,
  });
  if (error) {
    throw new Error(error.message || 'Failed to reject COE request');
  }
  
  // Notify employee
  try {
      if (data.employee_id) {
          await supabase.from('notifications').upsert({
              id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${data.employee_id}`,
              user_id: data.employee_id,
              type: NotificationType.COE_UPDATE,
              title: 'COE Request Rejected',
              message: `Your Certificate of Employment request has been rejected. Reason: ${reason}`,
              link: `/employees/coe/requests?requestId=${data.id}`,
              is_read: false,
              created_at: new Date().toISOString(),
              related_entity_id: data.id,
              dedupe_key: `coe-decision:${data.id}:rejected`,
          }, { onConflict: 'user_id,dedupe_key' });
      }
  } catch (notifyErr) {
      console.warn('Failed to notify employee about rejected COE request', notifyErr);
  }

  return mapCoeRequest(data as CoeRequestRow);
};

export const returnCoeRequest = async (requestId: string, approverId: string, reason: string): Promise<COERequest> => {
  void approverId;
  const { data, error } = await supabase.rpc('return_coe_request', {
    p_request_id: requestId,
    p_reason: reason,
  });
  if (error) {
    throw new Error(error.message || 'Failed to return COE request');
  }
  if (!data) {
    throw new Error('The COE request could not be returned.');
  }
  return mapCoeRequest(data as CoeRequestRow);
};

export const fetchCoeRequests = async (): Promise<COERequest[]> => {
  const { data, error } = await supabase
    .from('coe_requests')
    .select('*, template:coe_templates(name)')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to load COE requests');
  }

  return (data as CoeRequestRow[]).map(mapCoeRequest);
};

export const fetchCoeRequestById = async (requestId: string): Promise<COERequest | null> => {
  const { data, error } = await supabase
    .from('coe_requests')
    .select('*, template:coe_templates(name)')
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
  name?: string | null;
  description?: string | null;
  document_title?: string | null;
  signature_url?: string | null;
  footer_text?: string | null;
  style_key?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  font_family?: string | null;
  layout_settings?: Record<string, unknown> | null;
  status?: string | null;
  version?: number | null;
  is_preset?: boolean | null;
  preset_key?: string | null;
  created_from_template_id?: string | null;
  purposes?: string[] | null;
  recommended_purposes?: string[] | null;
};

const mapPurposeArray = (value: unknown): COEPurpose[] =>
  Array.isArray(value) ? value.filter(Boolean).map(item => String(item) as COEPurpose) : [];

export const mapCoeTemplate = (row: any): COETemplate => ({
  id: row.id || '',
  businessUnitId: row.businessUnitId || row.business_unit_id || '',
  businessUnitName: row.businessUnitName || row.business_unit_name || undefined,
  name: row.name || 'Certificate of Employment',
  description: row.description || undefined,
  documentTitle: row.documentTitle || row.document_title || 'Certificate of Employment',
  logoUrl: row.logoUrl || row.logo_url || undefined,
  address: row.address || '',
  body: row.body || '',
  signatoryName: row.signatoryName || row.signatory_name || '',
  signatoryPosition: row.signatoryPosition || row.signatory_position || '',
  signatureUrl: row.signatureUrl || row.signature_url || undefined,
  footerText: row.footerText || row.footer_text || undefined,
  styleKey: (row.styleKey || row.style_key || 'classic-corporate') as COETemplateStyle,
  primaryColor: row.primaryColor || row.primary_color || '#1e3a8a',
  accentColor: row.accentColor || row.accent_color || '#64748b',
  fontFamily: row.fontFamily || row.font_family || 'Times New Roman',
  layoutSettings: row.layoutSettings || row.layout_settings || undefined,
  status: (row.status || (row.is_active ? 'Published' : 'Draft')) as COETemplateStatus,
  version: Number(row.version || 1),
  isPreset: Boolean(row.isPreset ?? row.is_preset),
  presetKey: row.presetKey || row.preset_key || undefined,
  createdFromTemplateId: row.createdFromTemplateId || row.created_from_template_id || undefined,
  purposes: mapPurposeArray(row.purposes),
  recommendedPurposes: mapPurposeArray(row.recommendedPurposes || row.recommended_purposes),
  isActive: Boolean(row.isActive ?? row.is_active),
});

export const fetchActiveCoeTemplates = async (): Promise<COETemplate[]> => {
  const { data, error } = await supabase
    .from('coe_templates')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to load COE templates');
  }

  return (data as CoeTemplateRow[]).map(mapCoeTemplate);
};

export const fetchAllCoeTemplates = async (): Promise<COETemplate[]> => {
  const { data, error } = await supabase
    .from('coe_templates')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to load COE templates');
  return (data || []).map(mapCoeTemplate);
};

const mapEmployeeSnapshot = (value: Record<string, any>): COEEmployeeSnapshot => ({
  id: value.id || '',
  name: value.name || 'Employee',
  email: value.email || undefined,
  position: value.position || '',
  department: value.department || '',
  departmentId: value.departmentId || value.department_id || undefined,
  businessUnit: value.businessUnit || value.business_unit || '',
  businessUnitId: value.businessUnitId || value.business_unit_id || '',
  dateHired: value.dateHired || value.date_hired || undefined,
  endDate: value.endDate || value.end_date || undefined,
  employmentStatus: value.employmentStatus || value.employment_status || undefined,
  salary: value.salary == null ? undefined : Number(value.salary),
  purpose: value.purpose || '',
  issueDate: value.issueDate || value.issue_date || new Date().toISOString(),
  requestDate: value.requestDate || value.request_date || undefined,
});

const mapCoeDocument = (data: any): COEDocumentData => {
  if (!data?.request || !data?.template || !data?.employee) {
    throw new Error('The COE document response is incomplete.');
  }
  return {
    request: mapCoeRequest(data.request as CoeRequestRow),
    template: mapCoeTemplate(data.template),
    employee: mapEmployeeSnapshot(data.employee),
    meta: {
      generationSource: data.meta?.generationSource || data.meta?.generation_source || 'historical_snapshot',
      fallbackReason: data.meta?.fallbackReason || data.meta?.fallback_reason || undefined,
      snapshotCreatedAt: data.meta?.snapshotCreatedAt || data.meta?.snapshot_created_at || undefined,
      documentVersion: Number(data.meta?.documentVersion || data.meta?.document_version || 1),
      salaryRedacted: Boolean(data.meta?.salaryRedacted ?? data.meta?.salary_redacted),
    },
  };
};

export const fetchCoeDocument = async (requestId: string): Promise<COEDocumentData> => {
  const { data, error } = await supabase.rpc('get_coe_document', { p_request_id: requestId });
  if (error) throw new Error(error.message || 'Failed to load the COE document');
  return mapCoeDocument(data);
};

export const approveAndFetchCoeDocument = async (requestId: string): Promise<COEDocumentData> => {
  const { data, error } = await supabase.rpc('approve_coe_request_with_snapshot', {
    p_request_id: requestId,
  });
  if (error) throw new Error(error.message || 'Failed to approve the COE request');
  return mapCoeDocument(data);
};

export const saveCoeTemplate = async (template: COETemplate): Promise<COETemplate> => {
  const { data, error } = await supabase.rpc('save_coe_template', { p_template: template });
  if (error) throw new Error(error.message || 'Failed to save COE template');
  return mapCoeTemplate(data);
};

export const archiveCoeTemplate = async (templateId: string): Promise<COETemplate> => {
  const { data, error } = await supabase.rpc('archive_coe_template', { p_template_id: templateId });
  if (error) throw new Error(error.message || 'Failed to archive COE template');
  return mapCoeTemplate(data);
};

export const recordCoeDocumentEvent = async (
  requestId: string,
  action: 'PRINT' | 'DOWNLOAD' | 'EMAIL',
): Promise<void> => {
  const { error } = await supabase.rpc('record_coe_document_event', {
    p_request_id: requestId,
    p_action: action,
  });
  if (error) console.warn(`Failed to record COE ${action.toLowerCase()} event`, error.message);
};
