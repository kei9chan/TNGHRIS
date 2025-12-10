import { supabase } from './supabaseClient';
import { Award, BadgeLevel, ResolutionStatus } from '../types';

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
  certificateUrl?: string;
  createdByUserId?: string;
  dateAwarded?: Date;
  submittedAt?: Date;
  decidedAt?: Date;
  rejectionReason?: string;
  employeeName?: string;
  approverId?: string;
  approverName?: string;
};

const mapAward = (row: any): Award => ({
  id: row.id,
  title: row.title,
  description: row.description || '',
  badgeIconUrl: row.badge_icon_url || '',
  isActive: row.is_active,
  design: row.design,
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
  certificateUrl: row.certificate_snapshot_url || undefined,
  createdByUserId: row.created_by_user_id || undefined,
  dateAwarded: row.decided_at ? new Date(row.decided_at) : row.submitted_at ? new Date(row.submitted_at) : undefined,
  submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
  decidedAt: row.decided_at ? new Date(row.decided_at) : undefined,
  rejectionReason: row.rejection_reason || undefined,
  employeeName: row.hris_users?.full_name || undefined,
  approverId: row.approver_id || undefined,
  approverName: row.approver?.full_name || undefined,
});

const TEMPLATE_BUCKET = 'create_award_template_attachments';

export const fetchAwardTemplates = async (): Promise<Award[]> => {
  const { data, error } = await supabase.from('award_templates').select('*');
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
}): Promise<Award> => {
  const payload: any = {
    title: template.title,
    description: template.description || null,
    badge_icon_url: template.badgeIconUrl || null,
    is_active: template.isActive ?? true,
    design: template.design || null,
    created_by_user_id: template.createdByUserId || null,
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

const toDbStatus = (status: ResolutionStatus | string) =>
  status === ResolutionStatus.PendingApproval || status === 'Pending Approval' ? 'PendingApproval' : status;

export const createEmployeeAward = async (payload: {
  employeeId: string;
  awardTemplateId: string;
  notes?: string;
  businessUnitId?: string;
  certificateUrl?: string;
  createdByUserId?: string;
  approverId?: string;
}): Promise<EmployeeAwardRecord> => {
  const insertPayload: any = {
    employee_id: payload.employeeId,
    award_template_id: payload.awardTemplateId,
    notes: payload.notes || null,
    business_unit_id: payload.businessUnitId || null,
    certificate_snapshot_url: payload.certificateUrl || null,
    created_by_user_id: payload.createdByUserId || null,
    status: 'PendingApproval',
    submitted_at: new Date().toISOString(),
    level: 'Bronze',
    approver_id: payload.approverId || null,
  };

  const { data, error } = await supabase
    .from('employee_awards')
    .insert(insertPayload)
    .select('*, award_templates(title, badge_icon_url), hris_users:employee_id(full_name), business_units(name)')
    .single();
  if (error || !data) throw new Error(error?.message || 'Failed to save award');
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

export const updateEmployeeAwardStatus = async (id: string, status: ResolutionStatus, rejectionReason?: string) => {
  const updatePayload: any = {
    status: toDbStatus(status),
    decided_at: new Date().toISOString(),
    rejection_reason: rejectionReason || null,
  };

  const { data, error } = await supabase
    .from('employee_awards')
    .update(updatePayload)
    .eq('id', id)
    .select('*, award_templates(title, badge_icon_url), hris_users:employee_id(full_name), business_units(name)')
    .single();
  if (error || !data) throw new Error(error?.message || 'Failed to update award');
  return mapEmployeeAward(data);
};
