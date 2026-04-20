import { supabase } from './supabaseClient';
import { OnboardingChecklistTemplate, OnboardingChecklist, OnboardingTask, OnboardingTaskTemplate, OnboardingTaskStatus, Resignation, ResignationStatus, User } from '../types';

// ---------------------------------------------------------------------------
// Row Types
// ---------------------------------------------------------------------------
type OnboardingTemplateRow = {
  id: string;
  name: string;
  target_role: string;
  tasks: any;
  template_type: string;
};

type OnboardingChecklistRow = {
  id: string;
  employee_id: string;
  template_id: string;
  created_at: string;
  status: string;
  tasks: any;
  signature_name?: string | null;
  signature_data_url?: string | null;
  signed_at?: string | null;
};

type ResignationRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  submission_date: string;
  last_working_day: string;
  reason: string;
  status: string;
  attachment_url?: string | null;
  offboarding_checklist_id?: string | null;
  rejection_reason?: string | null;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const mapOnboardingTemplate = (row: OnboardingTemplateRow): OnboardingChecklistTemplate => ({
  id: row.id,
  name: row.name,
  targetRole: row.target_role as any,
  tasks: Array.isArray(row.tasks) ? (row.tasks as OnboardingTaskTemplate[]) : [],
  templateType: row.template_type as 'Onboarding' | 'Offboarding',
});

const mapOnboardingChecklist = (row: OnboardingChecklistRow): OnboardingChecklist => ({
  id: row.id,
  employeeId: row.employee_id,
  templateId: row.template_id,
  createdAt: new Date(row.created_at),
  status: row.status as OnboardingChecklist['status'],
  tasks: Array.isArray(row.tasks) ? (row.tasks as OnboardingTask[]) : [],
  signatureName: row.signature_name || undefined,
  signatureDataUrl: row.signature_data_url || undefined,
  signedAt: row.signed_at ? new Date(row.signed_at) : undefined,
});

const mapResignation = (row: ResignationRow): Resignation => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeName: row.employee_name,
  submissionDate: new Date(row.submission_date),
  lastWorkingDay: new Date(row.last_working_day),
  reason: row.reason,
  status: row.status as ResignationStatus,
  attachmentUrl: row.attachment_url || undefined,
  offboardingChecklistId: row.offboarding_checklist_id || undefined,
  rejectionReason: row.rejection_reason || undefined,
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchOnboardingTemplates = async (): Promise<OnboardingChecklistTemplate[]> => {
  const { data, error } = await supabase.from('onboarding_templates').select('*').order('name', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to fetch onboarding templates');
  return (data as OnboardingTemplateRow[]).map(mapOnboardingTemplate);
};

export const saveOnboardingTemplate = async (template: Partial<OnboardingChecklistTemplate>): Promise<OnboardingChecklistTemplate> => {
  const payload = {
    name: template.name,
    target_role: template.targetRole,
    tasks: template.tasks || [],
    template_type: template.templateType || 'Onboarding',
  };

  const { data, error } = template.id
    ? await supabase.from('onboarding_templates').update(payload).eq('id', template.id).select().single()
    : await supabase.from('onboarding_templates').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save onboarding template');
  return mapOnboardingTemplate(data as OnboardingTemplateRow);
};

export const fetchOnboardingChecklists = async (): Promise<OnboardingChecklist[]> => {
  const { data, error } = await supabase.from('onboarding_checklists').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to fetch onboarding checklists');
  return (data as OnboardingChecklistRow[]).map(mapOnboardingChecklist);
};

export const fetchOnboardingChecklistByEmployee = async (employeeId: string): Promise<OnboardingChecklist | null> => {
  const { data, error } = await supabase
    .from('onboarding_checklists')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapOnboardingChecklist(data as OnboardingChecklistRow);
};

export const saveOnboardingChecklist = async (checklist: Partial<OnboardingChecklist>): Promise<OnboardingChecklist> => {
  const payload = {
    employee_id: checklist.employeeId,
    template_id: checklist.templateId,
    status: checklist.status || 'InProgress',
    tasks: checklist.tasks || [],
    signature_name: checklist.signatureName || null,
    signature_data_url: checklist.signatureDataUrl || null,
    signed_at: checklist.signedAt ? new Date(checklist.signedAt).toISOString() : null,
  };

  const { data, error } = checklist.id
    ? await supabase.from('onboarding_checklists').update(payload).eq('id', checklist.id).select().single()
    : await supabase.from('onboarding_checklists').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save onboarding checklist');
  return mapOnboardingChecklist(data as OnboardingChecklistRow);
};

// ---------------------------------------------------------------------------
// Resignation Service Methods
// ---------------------------------------------------------------------------

export const fetchResignations = async (): Promise<Resignation[]> => {
  const { data, error } = await supabase.from('resignations').select('*').order('submission_date', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to fetch resignations');
  return (data as ResignationRow[]).map(mapResignation);
};

export const createResignation = async (resignation: Partial<Resignation>, user: User): Promise<Resignation> => {
  const payload = {
    employee_id: user.id,
    employee_name: user.name,
    submission_date: new Date().toISOString(),
    last_working_day: resignation.lastWorkingDay ? new Date(resignation.lastWorkingDay).toISOString().split('T')[0] : null,
    reason: resignation.reason || '',
    status: ResignationStatus.PendingHRReview,
    attachment_url: resignation.attachmentUrl || null,
  };

  const { data, error } = await supabase.from('resignations').insert(payload).select().single();
  if (error) throw new Error(error.message || 'Failed to create resignation');
  return mapResignation(data as ResignationRow);
};

export const updateResignation = async (id: string, updates: Partial<Resignation>): Promise<Resignation> => {
  const payload: Record<string, any> = {};
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.offboardingChecklistId !== undefined) payload.offboarding_checklist_id = updates.offboardingChecklistId;
  if (updates.rejectionReason !== undefined) payload.rejection_reason = updates.rejectionReason;

  const { data, error } = await supabase.from('resignations').update(payload).eq('id', id).select().single();
  if (error) throw new Error(error.message || 'Failed to update resignation');
  return mapResignation(data as ResignationRow);
};
