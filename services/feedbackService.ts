import { supabase } from './supabaseClient';
import { NTE, Resolution, IncidentReport, FeedbackTemplate, PipelineStage } from '../types';

// ---------------------------------------------------------------------------
// Row Types
// ---------------------------------------------------------------------------
type NTERow = {
  id: string; employee_id: string; employee_name: string; issued_by_user_id: string;
  issued_by_name: string; date_issued: string; subject: string; body: string;
  status: string; incident_report_id?: string | null; response?: string | null;
  response_date?: string | null; business_unit_id?: string | null;
};

type ResolutionRow = {
  id: string; nte_id: string; employee_id: string; employee_name: string;
  issued_by_user_id: string; issued_by_name: string; date_issued: string;
  subject: string; body: string; discipline_entry_id?: string | null;
  offense_number?: number | null; sanction_text?: string | null;
  status: string; approver_steps?: any; rejection_reason?: string | null;
  business_unit_id?: string | null; signature_data_url?: string | null;
  signature_name?: string | null; signed_at?: string | null;
};

type IncidentReportRow = {
  id: string; reported_by_user_id: string; reported_by_name: string;
  date_of_incident: string; date_reported: string; subject: string;
  description: string; involved_employee_ids: any; witness_names?: any;
  status: string; business_unit_id?: string | null;
};

type FeedbackTemplateRow = {
  id: string; name: string; type: string; subject_template: string;
  body_template: string; created_at: string; updated_at: string;
};

type PipelineStageRow = {
  id: string; name: string; color: string; order: number;
  is_terminal: boolean; label_for_next?: string | null;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const mapNTE = (r: NTERow): NTE => ({
  id: r.id, employeeId: r.employee_id, employeeName: r.employee_name,
  issuedByUserId: r.issued_by_user_id, issuedByName: r.issued_by_name,
  dateIssued: new Date(r.date_issued), subject: r.subject, body: r.body,
  status: r.status as any,
  incidentReportId: r.incident_report_id || undefined,
  response: r.response || undefined,
  responseDate: r.response_date ? new Date(r.response_date) : undefined,
  businessUnitId: r.business_unit_id || undefined,
} as any);

const mapResolution = (r: ResolutionRow): Resolution => ({
  id: r.id, nteId: r.nte_id, employeeId: r.employee_id, employeeName: r.employee_name,
  issuedByUserId: r.issued_by_user_id, issuedByName: r.issued_by_name,
  dateIssued: new Date(r.date_issued), subject: r.subject, body: r.body,
  disciplineEntryId: r.discipline_entry_id || undefined,
  offenseNumber: r.offense_number ?? undefined,
  sanctionText: r.sanction_text || undefined,
  status: r.status as any,
  approverSteps: Array.isArray(r.approver_steps) ? r.approver_steps : [],
  rejectionReason: r.rejection_reason || undefined,
  businessUnitId: r.business_unit_id || undefined,
  signatureDataUrl: r.signature_data_url || undefined,
  signatureName: r.signature_name || undefined,
  signedAt: r.signed_at ? new Date(r.signed_at) : undefined,
} as any);

const mapIncidentReport = (r: IncidentReportRow): IncidentReport => ({
  id: r.id, reportedByUserId: r.reported_by_user_id, reportedByName: r.reported_by_name,
  dateOfIncident: new Date(r.date_of_incident), dateReported: new Date(r.date_reported),
  subject: r.subject, description: r.description,
  involvedEmployeeIds: Array.isArray(r.involved_employee_ids) ? r.involved_employee_ids : [],
  witnessNames: Array.isArray(r.witness_names) ? r.witness_names : [],
  status: r.status as any,
  businessUnitId: r.business_unit_id || undefined,
} as any);

const mapFeedbackTemplate = (r: FeedbackTemplateRow): FeedbackTemplate => ({
  id: r.id, name: r.name, type: r.type as any,
  subjectTemplate: r.subject_template, bodyTemplate: r.body_template,
  createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
} as any);

const mapPipelineStage = (r: PipelineStageRow): PipelineStage => ({
  id: r.id, name: r.name, color: r.color, order: r.order,
  isTerminal: r.is_terminal, labelForNext: r.label_for_next || undefined,
} as any);

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

// NTEs
export const fetchNTEs = async (): Promise<NTE[]> => {
  const { data, error } = await supabase.from('ntes').select('*').order('date_issued', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as NTERow[]).map(mapNTE);
};

export const saveNTE = async (nte: Partial<NTE> & Record<string, any>): Promise<NTE> => {
  const payload = {
    employee_id: nte.employeeId, employee_name: nte.employeeName,
    issued_by_user_id: nte.issuedByUserId, issued_by_name: nte.issuedByName,
    date_issued: nte.dateIssued ? new Date(nte.dateIssued).toISOString() : new Date().toISOString(),
    subject: nte.subject, body: nte.body, status: nte.status,
    incident_report_id: nte.incidentReportId || null,
    response: nte.response || null,
    response_date: nte.responseDate ? new Date(nte.responseDate).toISOString() : null,
    business_unit_id: nte.businessUnitId || null,
  };
  const { data, error } = nte.id
    ? await supabase.from('ntes').update(payload).eq('id', nte.id).select().single()
    : await supabase.from('ntes').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return mapNTE(data as NTERow);
};

// Resolutions
export const fetchResolutions = async (): Promise<Resolution[]> => {
  const { data, error } = await supabase.from('resolutions').select('*').order('date_issued', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as ResolutionRow[]).map(mapResolution);
};

export const saveResolution = async (res: Partial<Resolution> & Record<string, any>): Promise<Resolution> => {
  const payload = {
    nte_id: res.nteId, employee_id: res.employeeId, employee_name: res.employeeName,
    issued_by_user_id: res.issuedByUserId, issued_by_name: res.issuedByName,
    date_issued: res.dateIssued ? new Date(res.dateIssued).toISOString() : new Date().toISOString(),
    subject: res.subject, body: res.body,
    discipline_entry_id: res.disciplineEntryId || null,
    offense_number: res.offenseNumber ?? null,
    sanction_text: res.sanctionText || null,
    status: res.status,
    approver_steps: res.approverSteps || [],
    rejection_reason: res.rejectionReason || null,
    business_unit_id: res.businessUnitId || null,
    signature_data_url: res.signatureDataUrl || null,
    signature_name: res.signatureName || null,
    signed_at: res.signedAt ? new Date(res.signedAt).toISOString() : null,
  };
  const { data, error } = res.id
    ? await supabase.from('resolutions').update(payload).eq('id', res.id).select().single()
    : await supabase.from('resolutions').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return mapResolution(data as ResolutionRow);
};

// Incident Reports
export const fetchIncidentReports = async (): Promise<IncidentReport[]> => {
  const { data, error } = await supabase.from('incident_reports').select('*').order('date_reported', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as IncidentReportRow[]).map(mapIncidentReport);
};

// Feedback Templates
export const fetchFeedbackTemplates = async (): Promise<FeedbackTemplate[]> => {
  const { data, error } = await supabase.from('feedback_templates').select('*').order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as FeedbackTemplateRow[]).map(mapFeedbackTemplate);
};

// Pipeline Stages
export const fetchPipelineStages = async (): Promise<PipelineStage[]> => {
  const { data, error } = await supabase.from('pipeline_stages').select('*').order('order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as PipelineStageRow[]).map(mapPipelineStage);
};
