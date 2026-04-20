import { supabase } from './supabaseClient';
import { ContractTemplate, Envelope, EnvelopeStatus, RoutingStep, EnvelopeEvent, ContractTemplateSection, SignatoryBlock } from '../types';

// ---------------------------------------------------------------------------
// Row Types
// ---------------------------------------------------------------------------
type ContractTemplateRow = {
  id: string;
  title: string;
  description: string;
  owning_business_unit_id: string;
  is_default: boolean;
  logo_url?: string | null;
  logo_position?: string | null;
  logo_max_width?: number | null;
  body: string;
  sections: any;
  footer: string;
  company_signatory?: any;
  employee_signatory?: any;
  witnesses?: any;
  acknowledgment_body?: string | null;
  acknowledgment_parties?: any;
  versions?: any;
  active_version?: number | null;
};

type EnvelopeRow = {
  id: string;
  template_id: string;
  template_title: string;
  employee_id: string;
  employee_name: string;
  title: string;
  routing_steps: any;
  due_date: string;
  status: string;
  created_by_user_id: string;
  created_at: string;
  events: any;
  content_snapshot?: any;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const mapContractTemplate = (row: ContractTemplateRow): ContractTemplate => ({
  id: row.id,
  title: row.title,
  description: row.description,
  owningBusinessUnitId: row.owning_business_unit_id,
  isDefault: row.is_default,
  logoUrl: row.logo_url || undefined,
  logoPosition: (row.logo_position as 'left' | 'center' | 'right') || undefined,
  logoMaxWidth: row.logo_max_width ?? undefined,
  body: row.body,
  sections: Array.isArray(row.sections) ? (row.sections as ContractTemplateSection[]) : [],
  footer: row.footer,
  companySignatory: row.company_signatory as SignatoryBlock | undefined,
  employeeSignatory: row.employee_signatory as SignatoryBlock | undefined,
  witnesses: Array.isArray(row.witnesses) ? row.witnesses : [],
  acknowledgmentBody: row.acknowledgment_body || undefined,
  acknowledgmentParties: Array.isArray(row.acknowledgment_parties) ? row.acknowledgment_parties : [],
  versions: Array.isArray(row.versions) ? row.versions : [],
  activeVersion: row.active_version ?? undefined,
});

const mapEnvelope = (row: EnvelopeRow): Envelope => ({
  id: row.id,
  templateId: row.template_id,
  templateTitle: row.template_title,
  employeeId: row.employee_id,
  employeeName: row.employee_name,
  title: row.title,
  routingSteps: Array.isArray(row.routing_steps) ? (row.routing_steps as RoutingStep[]) : [],
  dueDate: new Date(row.due_date),
  status: row.status as EnvelopeStatus,
  createdByUserId: row.created_by_user_id,
  createdAt: new Date(row.created_at),
  events: Array.isArray(row.events) ? (row.events as EnvelopeEvent[]) : [],
  contentSnapshot: row.content_snapshot || undefined,
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchContractTemplates = async (): Promise<ContractTemplate[]> => {
  const { data, error } = await supabase.from('contract_templates').select('*').order('title', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to fetch contract templates');
  return (data as ContractTemplateRow[]).map(mapContractTemplate);
};

export const saveContractTemplate = async (template: Partial<ContractTemplate>): Promise<ContractTemplate> => {
  const payload = {
    title: template.title,
    description: template.description,
    owning_business_unit_id: template.owningBusinessUnitId,
    is_default: template.isDefault ?? false,
    logo_url: template.logoUrl || null,
    logo_position: template.logoPosition || null,
    logo_max_width: template.logoMaxWidth ?? null,
    body: template.body || '',
    sections: template.sections || [],
    footer: template.footer || '',
    company_signatory: template.companySignatory || null,
    employee_signatory: template.employeeSignatory || null,
    witnesses: template.witnesses || [],
    acknowledgment_body: template.acknowledgmentBody || null,
    acknowledgment_parties: template.acknowledgmentParties || [],
    versions: template.versions || [],
    active_version: template.activeVersion ?? null,
  };

  const { data, error } = template.id
    ? await supabase.from('contract_templates').update(payload).eq('id', template.id).select().single()
    : await supabase.from('contract_templates').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save contract template');
  return mapContractTemplate(data as ContractTemplateRow);
};

export const fetchEnvelopes = async (): Promise<Envelope[]> => {
  const { data, error } = await supabase.from('envelopes').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to fetch envelopes');
  return (data as EnvelopeRow[]).map(mapEnvelope);
};

export const fetchEnvelopesByEmployee = async (employeeId: string): Promise<Envelope[]> => {
  const { data, error } = await supabase
    .from('envelopes')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to fetch envelopes');
  return (data as EnvelopeRow[]).map(mapEnvelope);
};

export const saveEnvelope = async (envelope: Partial<Envelope>): Promise<Envelope> => {
  const payload = {
    template_id: envelope.templateId,
    template_title: envelope.templateTitle || '',
    employee_id: envelope.employeeId,
    employee_name: envelope.employeeName || '',
    title: envelope.title || '',
    routing_steps: envelope.routingSteps || [],
    due_date: envelope.dueDate ? new Date(envelope.dueDate).toISOString() : null,
    status: envelope.status || EnvelopeStatus.Draft,
    created_by_user_id: envelope.createdByUserId || '',
    events: envelope.events || [],
    content_snapshot: envelope.contentSnapshot || null,
  };

  const { data, error } = envelope.id
    ? await supabase.from('envelopes').update(payload).eq('id', envelope.id).select().single()
    : await supabase.from('envelopes').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save envelope');
  return mapEnvelope(data as EnvelopeRow);
};
