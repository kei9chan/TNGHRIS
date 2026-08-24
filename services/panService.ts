import { supabase } from './supabaseClient';
import { PAN, PANTemplate, PANRoutingStep, PANStatus, PANActionTaken, PANActionType, PANTemplateStatus } from '../types';
import { normalizeTemplateFields, normalizeTemplateSections } from './panTemplateUtils';

// ---------------------------------------------------------------------------
// Row Types
// ---------------------------------------------------------------------------
type PANRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  effective_date: string;
  updated_at?: string | null;
  created_at?: string | null;
  status: string;
  action_taken: any;
  particulars: any;
  tenure: string;
  notes: string;
  routing_steps: any;
  signed_at?: string | null;
  signature_data_url?: string | null;
  signature_name?: string | null;
  logo_url?: string | null;
  pdf_hash?: string | null;
  preparer_name?: string | null;
  preparer_signature_url?: string | null;
  template_id?: string | null;
  business_unit_id?: string | null;
  template_version?: number | null;
  template_name?: string | null;
  template_snapshot?: any;
  action_type?: string | null;
  created_by_user_id?: string | null;
  workflow_version?: number | null;
  approval_completed_at?: string | null;
  rejection_reason?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  accepted_at?: string | null;
  accepted_by?: string | null;
  applied_at?: string | null;
};

type PANTemplateRow = {
  id: string;
  name: string;
  action_taken: any;
  notes: string;
  logo_url?: string | null;
  preparer_name?: string | null;
  preparer_signature_url?: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  is_default?: boolean | null;
  business_unit_id?: string | null;
  action_type?: string | null;
  status?: string | null;
  version?: number | null;
  document_title?: string | null;
  document_code?: string | null;
  footer_text?: string | null;
  color_accent?: string | null;
  paper_size?: string | null;
  orientation?: string | null;
  sections?: any;
  field_config?: any;
  published_at?: string | null;
  published_by?: string | null;
  updated_by?: string | null;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const mapPAN = (row: PANRow): PAN => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeName: row.employee_name,
  effectiveDate: new Date(row.effective_date),
  updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
  createdAt: row.created_at ? new Date(row.created_at) : undefined,
  status: row.status as PANStatus,
  actionTaken: row.action_taken as PANActionTaken,
  particulars: row.particulars || { from: {}, to: {} },
  tenure: row.tenure,
  notes: row.notes,
  routingSteps: Array.isArray(row.routing_steps) ? (row.routing_steps as PANRoutingStep[]) : [],
  signedAt: row.signed_at ? new Date(row.signed_at) : undefined,
  signatureDataUrl: row.signature_data_url || undefined,
  signatureName: row.signature_name || undefined,
  logoUrl: row.logo_url || undefined,
  pdfHash: row.pdf_hash || undefined,
  preparerName: row.preparer_name || undefined,
  preparerSignatureUrl: row.preparer_signature_url || undefined,
  templateId: row.template_id || undefined,
  businessUnitId: row.business_unit_id || undefined,
  templateVersion: row.template_version ?? undefined,
  templateName: row.template_name || undefined,
  templateSnapshot: row.template_snapshot || undefined,
  actionType: (row.action_type as PANActionType) || undefined,
  createdByUserId: row.created_by_user_id || undefined,
  workflowVersion: row.workflow_version ?? 1,
  approvalCompletedAt: row.approval_completed_at ? new Date(row.approval_completed_at) : undefined,
  rejectionReason: row.rejection_reason || undefined,
  cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : undefined,
  cancelledBy: row.cancelled_by || undefined,
  cancellationReason: row.cancellation_reason || undefined,
  acceptedAt: row.accepted_at ? new Date(row.accepted_at) : undefined,
  acceptedBy: row.accepted_by || undefined,
  appliedAt: row.applied_at ? new Date(row.applied_at) : undefined,
});

const mapPANTemplate = (row: PANTemplateRow): PANTemplate => ({
  id: row.id,
  name: row.name,
  actionTaken: row.action_taken as Partial<PANActionTaken>,
  notes: row.notes,
  logoUrl: row.logo_url || undefined,
  preparerName: row.preparer_name || undefined,
  preparerSignatureUrl: row.preparer_signature_url || undefined,
  createdByUserId: row.created_by_user_id,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
  isDefault: row.is_default ?? undefined,
  businessUnitId: row.business_unit_id || undefined,
  actionType: (row.action_type as PANActionType) || 'general',
  status: (row.status as PANTemplateStatus) || 'published',
  version: row.version ?? 1,
  documentTitle: row.document_title || 'PERSONNEL ACTION NOTICE',
  documentCode: row.document_code || 'TNG-HRD-022',
  footerText: row.footer_text || '',
  colorAccent: row.color_accent || '#172554',
  paperSize: row.paper_size === 'Letter' ? 'Letter' : 'A4',
  orientation: row.orientation === 'landscape' ? 'landscape' : 'portrait',
  sections: normalizeTemplateSections(row.sections),
  fieldConfig: normalizeTemplateFields(row.field_config),
  publishedAt: row.published_at ? new Date(row.published_at) : undefined,
  publishedByUserId: row.published_by || undefined,
  updatedByUserId: row.updated_by || undefined,
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchPANs = async (): Promise<PAN[]> => {
  const { data, error } = await supabase.from('pans').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to fetch PANs');
  return (data as PANRow[]).map(mapPAN);
};

export const savePAN = async (pan: Partial<PAN>): Promise<PAN> => {
  const payload = {
    employee_id: pan.employeeId,
    employee_name: pan.employeeName,
    effective_date: pan.effectiveDate ? new Date(pan.effectiveDate).toISOString().split('T')[0] : null,
    status: pan.status,
    action_taken: pan.actionTaken || {},
    particulars: pan.particulars || { from: {}, to: {} },
    tenure: pan.tenure || '',
    notes: pan.notes || '',
    routing_steps: pan.routingSteps || [],
    signed_at: pan.signedAt ? new Date(pan.signedAt).toISOString() : null,
    signature_data_url: pan.signatureDataUrl || null,
    signature_name: pan.signatureName || null,
    logo_url: pan.logoUrl || null,
    pdf_hash: pan.pdfHash || null,
    preparer_name: pan.preparerName || null,
    preparer_signature_url: pan.preparerSignatureUrl || null,
    template_id: pan.templateId || null,
    business_unit_id: pan.businessUnitId || pan.particulars?.from?.businessUnitId || null,
    template_version: pan.templateVersion || null,
    template_name: pan.templateName || null,
    template_snapshot: pan.templateSnapshot || null,
    action_type: pan.actionType || null,
  };

  const { data, error } = pan.id
    ? await supabase.from('pans').update(payload).eq('id', pan.id).select().single()
    : await supabase.from('pans').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save PAN');
  return mapPAN(data as PANRow);
};

export const fetchPANTemplates = async (): Promise<PANTemplate[]> => {
  const { data, error } = await supabase.from('pan_templates').select('*').order('name', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to fetch PAN templates');
  return (data as PANTemplateRow[]).map(mapPANTemplate);
};

export const savePANTemplate = async (template: Partial<PANTemplate>): Promise<PANTemplate> => {
  const payload = {
    name: template.name,
    action_taken: template.actionTaken || {},
    notes: template.notes || '',
    logo_url: template.logoUrl || null,
    preparer_name: template.preparerName || null,
    preparer_signature_url: template.preparerSignatureUrl || null,
    created_by_user_id: template.createdByUserId,
    is_default: template.isDefault ?? false,
    business_unit_id: template.businessUnitId || null,
    action_type: template.actionType || 'general',
    status: template.status || 'draft',
    version: template.version || 1,
    document_title: template.documentTitle || 'PERSONNEL ACTION NOTICE',
    document_code: template.documentCode || 'TNG-HRD-022',
    footer_text: template.footerText || '',
    color_accent: template.colorAccent || '#172554',
    paper_size: template.paperSize || 'A4',
    orientation: template.orientation || 'portrait',
    sections: template.sections || [],
    field_config: template.fieldConfig || [],
    updated_by: template.updatedByUserId || template.createdByUserId,
  };

  const { data, error } = template.id
    ? await supabase.from('pan_templates').update(payload).eq('id', template.id).select().single()
    : await supabase.from('pan_templates').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save PAN template');
  return mapPANTemplate(data as PANTemplateRow);
};
