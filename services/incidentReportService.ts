import { supabase } from './supabaseClient';
import { IncidentReport, IRStatus, ChatMessage, User } from '../types';

const isUuid = (value?: string | null) =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

type IncidentReportRow = {
  id: string;
  category: string;
  description: string;
  location?: string | null;
  date_time: string;
  reported_by?: string | null;
  involved_employee_ids: string[];
  involved_employee_names: string[];
  witness_ids: string[];
  witness_names: string[];
  status: IRStatus;
  pipeline_stage?: string | null;
  nte_ids: string[];
  resolution_id?: string | null;
  chat_thread: any[];
  attachment_url?: string | null;
  signature_data_url?: string | null;
  assigned_to_id?: string | null;
  assigned_to_name?: string | null;
  business_unit_id?: string | null;
  business_unit_name?: string | null;
  created_at?: string;
  updated_at?: string;
};

const mapRow = (row: IncidentReportRow): IncidentReport => ({
  id: row.id,
  category: row.category,
  description: row.description,
  location: row.location || '',
  dateTime: row.date_time ? new Date(row.date_time) : new Date(),
  involvedEmployeeIds: row.involved_employee_ids || [],
  involvedEmployeeNames: row.involved_employee_names || [],
  witnessIds: row.witness_ids || [],
  witnessNames: row.witness_names || [],
  reportedBy: row.reported_by || '',
  status: row.status as IRStatus,
  pipelineStage: row.pipeline_stage || 'ir-review',
  nteIds: row.nte_ids || [],
  resolutionId: row.resolution_id || undefined,
  chatThread: (row.chat_thread || []).map((m: any) => ({
    ...m,
    timestamp: m?.timestamp ? new Date(m.timestamp) : new Date(),
  })) as ChatMessage[],
  attachmentUrl: row.attachment_url || undefined,
  signatureDataUrl: row.signature_data_url || undefined,
  assignedToId: row.assigned_to_id || undefined,
  assignedToName: row.assigned_to_name || undefined,
  businessUnitId: row.business_unit_id || undefined,
  businessUnitName: row.business_unit_name || undefined,
});

export const fetchIncidentReports = async (): Promise<IncidentReport[]> => {
  const { data, error } = await supabase
    .from('incident_reports')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to load incident reports');
  return (data as IncidentReportRow[]).map(mapRow);
};

export const saveIncidentReport = async (
  report: Partial<IncidentReport>,
  user: User
): Promise<IncidentReport> => {
  // resolve BU from hris_users if missing or not uuid
  let buId = report.businessUnitId || null;
  let buName = report.businessUnitName || undefined;

  if (!isUuid(buId) && user.id) {
    const { data: requester } = await supabase
      .from('hris_users')
      .select('business_unit_id, business_unit')
      .eq('id', user.id)
      .maybeSingle();
    buId = buId || requester?.business_unit_id || null;
    buName = buName || requester?.business_unit || undefined;
  }

  const chatThread = (report.chatThread || []).map(m => ({
    ...m,
    timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
  }));

  const payload: Partial<IncidentReportRow> = {
    category: report.category,
    description: report.description,
    location: report.location,
    date_time: (report.dateTime || new Date()).toISOString(),
    reported_by: report.reportedBy || user.id,
    involved_employee_ids: report.involvedEmployeeIds || [],
    involved_employee_names: report.involvedEmployeeNames || [],
    witness_ids: report.witnessIds || [],
    witness_names: report.witnessNames || [],
    status: report.status || IRStatus.Submitted,
    pipeline_stage: report.pipelineStage || 'ir-review',
    nte_ids: report.nteIds || [],
    resolution_id: report.resolutionId || null,
    chat_thread: chatThread,
    attachment_url: report.attachmentUrl || null,
    signature_data_url: report.signatureDataUrl || null,
    assigned_to_id: report.assignedToId || null,
    assigned_to_name: report.assignedToName || null,
    business_unit_id: isUuid(buId) ? buId : null,
    business_unit_name: buName || null,
  };

  const query = report.id
    ? supabase.from('incident_reports').update(payload).eq('id', report.id).select().single()
    : supabase.from('incident_reports').insert(payload).select().single();

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to save incident report');
  return mapRow(data as IncidentReportRow);
};

export const addIncidentReportMessage = async (
  report: IncidentReport,
  message: ChatMessage,
  user: User
): Promise<IncidentReport> => {
  const updated: Partial<IncidentReport> = {
    ...report,
    chatThread: [...(report.chatThread || []), message],
  };
  return saveIncidentReport(updated, user);
};
