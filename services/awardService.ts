import { supabase } from './supabaseClient';
import { ApproverStatus, Award, BadgeLevel, ResolutionStatus } from '../types';

export type EmployeeAwardRecord = {
  id: string;
  employeeId: string;
  awardTemplateId: string;
  awardTitle: string;
  badgeIconUrl?: string;
  notes?: string;
  level: BadgeLevel;
  status: ResolutionStatus;
  businessUnitId?: string;
  businessUnitName?: string;
  departmentId?: string;
  certificateUrl?: string;
  createdByUserId?: string;
  dateAwarded?: Date;
  submittedAt?: Date;
  decidedAt?: Date;
  rejectionReason?: string;
  employeeName?: string;
  approverId?: string;
  approverName?: string;
  approverSteps: Array<{ userId: string; userName: string; status: ApproverStatus; order?: number; timestamp?: Date; rejectionReason?: string }>;
  issuedAt?: Date;
};

const mapAward = (row: any): Award => ({
  id: row.id,
  title: row.title,
  description: row.description || '',
  badgeIconUrl: row.badge_icon_url || '',
  isActive: row.is_active,
  design: row.design,
  businessUnitId: row.business_unit_id || undefined,
  category: row.category || undefined,
  awardValueLabel: row.award_value_label || undefined,
  isDefault: !!row.is_default,
  isPreset: !!row.is_preset,
  presetKey: row.preset_key || undefined,
});

const mapEmployeeAward = (row: any): EmployeeAwardRecord => ({
  id: row.id,
  employeeId: row.employee_id,
  awardTemplateId: row.award_template_id,
  awardTitle: row.award_templates?.title || 'Award',
  badgeIconUrl: row.award_templates?.badge_icon_url || undefined,
  notes: row.notes || undefined,
  level: (row.level as BadgeLevel) || BadgeLevel.Bronze,
  status:
    row.status === 'PendingApproval' || row.status === 'Pending' || row.status === 'Pending Approval'
      ? ResolutionStatus.PendingApproval
      : (row.status as ResolutionStatus) || ResolutionStatus.Draft,
  businessUnitId: row.business_unit_id || undefined,
  businessUnitName: row.business_units?.name || undefined,
  departmentId: row.department_id || undefined,
  certificateUrl: row.certificate_snapshot_url || undefined,
  createdByUserId: row.created_by_user_id || undefined,
  dateAwarded: row.issued_at ? new Date(row.issued_at) : row.decided_at ? new Date(row.decided_at) : row.submitted_at ? new Date(row.submitted_at) : undefined,
  submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
  decidedAt: row.decided_at ? new Date(row.decided_at) : undefined,
  rejectionReason: row.rejection_reason || undefined,
  employeeName: row.hris_users?.full_name || undefined,
  approverId: row.approver_id || undefined,
  approverName: row.approver?.full_name || undefined,
  approverSteps: (Array.isArray(row.approver_steps) ? row.approver_steps : []).map((step: any) => ({
    ...step,
    timestamp: step.timestamp ? new Date(step.timestamp) : undefined,
  })),
  issuedAt: row.issued_at ? new Date(row.issued_at) : undefined,
});

const TEMPLATE_BUCKET = 'create_award_template_attachments';

export const fetchAwardTemplates = async (): Promise<Award[]> => {
  const { data, error } = await supabase.from('award_templates').select('*').order('title', { ascending: true });
  if (error || !data) throw new Error(error?.message || 'Failed to load award templates');
  return data.map(mapAward);
};

export const saveAwardTemplate = async (template: {
  id?: string;
  title: string;
  description?: string;
  badgeIconUrl?: string;
  isActive?: boolean;
  design?: any;
  createdByUserId?: string;
  businessUnitId?: string;
  category?: string;
  awardValueLabel?: string;
  isDefault?: boolean;
  isPreset?: boolean;
  presetKey?: string;
}): Promise<Award> => {
  if (template.isDefault && template.businessUnitId) {
    const { error: resetError } = await supabase
      .from('award_templates')
      .update({ is_default: false })
      .eq('business_unit_id', template.businessUnitId)
      .eq('is_default', true);
    if (resetError) throw new Error(resetError.message || 'Failed to update the business-unit default template');
  }
  const payload: any = {
    title: template.title,
    description: template.description || null,
    badge_icon_url: template.badgeIconUrl || null,
    is_active: template.isActive ?? true,
    design: template.design || null,
    created_by_user_id: template.createdByUserId || null,
    business_unit_id: template.businessUnitId || null,
    category: template.category || null,
    award_value_label: template.awardValueLabel || null,
    is_default: template.isDefault ?? false,
    is_preset: template.isPreset ?? false,
    preset_key: template.presetKey || null,
    updated_at: new Date().toISOString(),
  };

  const query = template.id
    ? supabase.from('award_templates').update(payload).eq('id', template.id).select('*').single()
    : supabase.from('award_templates').insert(payload).select('*').single();

  const { data, error } = await query;
  if (error || !data) throw new Error(error?.message || 'Failed to save award template');
  return mapAward(data);
};

export const fetchEmployeeAwards = async (): Promise<EmployeeAwardRecord[]> => {
  const { data, error } = await supabase
    .from('employee_awards')
    .select('*, award_templates(title, badge_icon_url), hris_users:employee_id(full_name), approver:approver_id(full_name), business_units(name)')
    .order('created_at', { ascending: false });
  if (error || !data) throw new Error(error?.message || 'Failed to load awards');
  return data.map(mapEmployeeAward);
};

export const createEmployeeAward = async (payload: {
  employeeId: string;
  awardTemplateId: string;
  notes?: string;
  businessUnitId?: string;
  departmentId?: string;
  createdByUserId?: string;
  approverIds: string[];
}): Promise<EmployeeAwardRecord> => {
  const { data: rpcData, error } = await supabase.rpc('submit_employee_award', {
    p_employee_id: payload.employeeId,
    p_award_template_id: payload.awardTemplateId,
    p_notes: payload.notes || '',
    p_business_unit_id: payload.businessUnitId || null,
    p_department_id: payload.departmentId || null,
    p_approver_ids: payload.approverIds,
  });
  if (error || !rpcData) throw new Error(error?.message || 'Failed to save award');
  const createdRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  const { data, error: readError } = await supabase
    .from('employee_awards')
    .select('*, award_templates(title, badge_icon_url), hris_users:employee_id(full_name), approver:approver_id(full_name), business_units(name)')
    .eq('id', createdRow.id)
    .single();
  if (readError || !data) throw new Error(readError?.message || 'Award was submitted but could not be reloaded');
  return mapEmployeeAward(data);
};

export const uploadTemplateAsset = async (file: File, userId?: string): Promise<{ path: string; signedUrl: string }> => {
  const ext = file.name.split('.').pop();
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${userId || 'system'}/${id}.${ext || 'bin'}`;
  const { data, error } = await supabase.storage.from(TEMPLATE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });
  if (error || !data) throw new Error(error?.message || 'Failed to upload asset');
  const { data: signed, error: signErr } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .createSignedUrl(data.path, 60 * 60 * 24 * 30); // 30 days
  if (signErr || !signed?.signedUrl) throw new Error(signErr?.message || 'Failed to sign asset');
  return { path: data.path, signedUrl: signed.signedUrl };
};

export const getSignedTemplateAssetUrl = async (path?: string): Promise<string | null> => {
  if (!path) return null;
  // If already full URL, return it
  if (path.startsWith('http')) return path;
  const { data, error } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 30);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
};

export const processEmployeeAwardApproval = async (
  id: string,
  approved: boolean,
  rejectionReason?: string
): Promise<EmployeeAwardRecord> => {
  const { data: rpcData, error } = await supabase.rpc('process_employee_award_approval', {
    p_award_id: id,
    p_approved: approved,
    p_rejection_reason: rejectionReason || null,
  });
  if (error || !rpcData) throw new Error(error?.message || 'Failed to process award approval');
  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  const { data, error: readError } = await supabase
    .from('employee_awards')
    .select('*, award_templates(title, badge_icon_url), hris_users:employee_id(full_name), approver:approver_id(full_name), business_units(name)')
    .eq('id', row.id)
    .single();
  if (readError || !data) throw new Error(readError?.message || 'Award approval was saved but could not be reloaded');
  return mapEmployeeAward(data);
};

export const markEmployeeAwardIssued = async (id: string, certificateUrl: string): Promise<EmployeeAwardRecord> => {
  const { data: rpcData, error } = await supabase.rpc('mark_employee_award_issued', {
    p_award_id: id,
    p_certificate_snapshot_url: certificateUrl,
  });
  if (error || !rpcData) throw new Error(error?.message || 'Failed to mark award as issued');
  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  const { data, error: readError } = await supabase
    .from('employee_awards')
    .select('*, award_templates(title, badge_icon_url), hris_users:employee_id(full_name), approver:approver_id(full_name), business_units(name)')
    .eq('id', row.id)
    .single();
  if (readError || !data) throw new Error(readError?.message || 'Issued award could not be reloaded');
  return mapEmployeeAward(data);
};
