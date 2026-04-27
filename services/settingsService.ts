// settingsService.ts — mockDataCompat removed
import { supabase } from './supabaseClient';
import { Settings, AuditLog, PermissionsMatrix, COETemplate, COERequest } from '../types';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export const fetchSettings = async (): Promise<Settings> => {
  const { data, error } = await supabase.from('app_settings').select('*').single();
  if (error || !data) {
    // Return sensible defaults
    return {
      appName: 'TNG HRIS', appLogoUrl: '', reminderCadence: 3,
      emailProvider: 'SendGrid', smsProvider: 'Twilio',
      pdfHeader: 'The Nines Group', pdfFooter: 'Confidential', currency: 'PHP',
    };
  }
  return {
    appName: data.app_name || 'TNG HRIS',
    appLogoUrl: data.app_logo_url || '',
    reminderCadence: data.reminder_cadence ?? 3,
    emailProvider: data.email_provider || 'SendGrid',
    smsProvider: data.sms_provider || 'Twilio',
    pdfHeader: data.pdf_header || '',
    pdfFooter: data.pdf_footer || '',
    currency: data.currency || 'PHP',
  };
};

export const saveSettings = async (settings: Partial<Settings>): Promise<void> => {
  const payload = {
    app_name: settings.appName,
    app_logo_url: settings.appLogoUrl,
    reminder_cadence: settings.reminderCadence,
    email_provider: settings.emailProvider,
    sms_provider: settings.smsProvider,
    pdf_header: settings.pdfHeader,
    pdf_footer: settings.pdfFooter,
    currency: settings.currency,
  };
  const { error } = await supabase.from('app_settings').upsert(payload);
  if (error) throw new Error(error.message);
};

// ---------------------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------------------
export const fetchAuditLogs = async (limit = 200): Promise<AuditLog[]> => {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    userEmail: r.user_email || r.user_name || '',
    action: r.action,
    entity: r.resource || r.entity || '',
    entityId: r.resource_id || r.entity_id || '',
    details: r.details,
    timestamp: new Date(r.timestamp),
  }));
};

export const createAuditLog = async (log: Partial<AuditLog>): Promise<void> => {
  const payload = {
    user_id: log.userId,
    user_email: log.userEmail,
    action: log.action,
    entity: log.entity,
    entity_id: log.entityId,
    details: log.details,
  };
  const { error } = await supabase.from('audit_logs').insert(payload);
  if (error) throw new Error(error.message);
};

// ---------------------------------------------------------------------------
// Permissions (can be stored in DB or kept static)
// ---------------------------------------------------------------------------
export const fetchPermissionsMatrix = async (): Promise<PermissionsMatrix> => {
  const { data, error } = await supabase.from('permissions_matrix').select('*').single();
  if (error || !data) {
    return {} as PermissionsMatrix;
  }
  return data.matrix as PermissionsMatrix;
};

// ---------------------------------------------------------------------------
// COE Templates & Requests
// ---------------------------------------------------------------------------
type COETemplateRow = {
  id: string; business_unit_id: string; logo_url?: string | null;
  address: string; body: string; signatory_name: string;
  signatory_position: string; is_active: boolean;
};

type COERequestRow = {
  id: string; employee_id: string; employee_name: string;
  employee_position?: string | null; business_unit_id: string;
  employee_department_id?: string | null; purpose: string;
  other_purpose_detail?: string | null; date_requested: string;
  status: string; rejection_reason?: string | null;
  generated_document_url?: string | null;
  approved_by?: string | null; approved_at?: string | null;
};

const mapCOETemplate = (r: COETemplateRow): COETemplate => ({
  id: r.id, businessUnitId: r.business_unit_id,
  logoUrl: r.logo_url || undefined, address: r.address,
  body: r.body, signatoryName: r.signatory_name,
  signatoryPosition: r.signatory_position, isActive: r.is_active,
});

const mapCOERequest = (r: COERequestRow): COERequest => ({
  id: r.id, employeeId: r.employee_id, employeeName: r.employee_name,
  employeePosition: r.employee_position || undefined,
  businessUnitId: r.business_unit_id,
  employeeDepartmentId: r.employee_department_id || undefined,
  purpose: r.purpose as any,
  otherPurposeDetail: r.other_purpose_detail || undefined,
  dateRequested: new Date(r.date_requested),
  status: r.status as any,
  rejectionReason: r.rejection_reason || undefined,
  generatedDocumentUrl: r.generated_document_url || undefined,
  approvedBy: r.approved_by || undefined,
  approvedAt: r.approved_at ? new Date(r.approved_at) : undefined,
});

export const fetchCOETemplates = async (): Promise<COETemplate[]> => {
  const { data, error } = await supabase.from('coe_templates').select('*');
  if (error) throw new Error(error.message);
  return (data as COETemplateRow[]).map(mapCOETemplate);
};

export const saveCOETemplate = async (tpl: Partial<COETemplate>): Promise<COETemplate> => {
  const payload = {
    business_unit_id: tpl.businessUnitId, logo_url: tpl.logoUrl || null,
    address: tpl.address, body: tpl.body,
    signatory_name: tpl.signatoryName, signatory_position: tpl.signatoryPosition,
    is_active: tpl.isActive ?? true,
  };
  const { data, error } = tpl.id
    ? await supabase.from('coe_templates').update(payload).eq('id', tpl.id).select().single()
    : await supabase.from('coe_templates').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return mapCOETemplate(data as COETemplateRow);
};

export const fetchCOERequests = async (): Promise<COERequest[]> => {
  const { data, error } = await supabase.from('coe_requests').select('*').order('date_requested', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as COERequestRow[]).map(mapCOERequest);
};

export const saveCOERequest = async (req: Partial<COERequest>): Promise<COERequest> => {
  const payload = {
    employee_id: req.employeeId, employee_name: req.employeeName,
    employee_position: req.employeePosition || null,
    business_unit_id: req.businessUnitId,
    employee_department_id: req.employeeDepartmentId || null,
    purpose: req.purpose, other_purpose_detail: req.otherPurposeDetail || null,
    date_requested: req.dateRequested ? new Date(req.dateRequested).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    status: req.status, rejection_reason: req.rejectionReason || null,
    generated_document_url: req.generatedDocumentUrl || null,
    approved_by: req.approvedBy || null,
    approved_at: req.approvedAt ? new Date(req.approvedAt).toISOString() : null,
  };
  const { data, error } = req.id
    ? await supabase.from('coe_requests').update(payload).eq('id', req.id).select().single()
    : await supabase.from('coe_requests').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return mapCOERequest(data as COERequestRow);
};
