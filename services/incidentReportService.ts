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

export const fetchIncidentReportById = async (id: string): Promise<IncidentReport | null> => {
  const { data, error } = await supabase
    .from('incident_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Failed to fetch incident report');
  return data ? mapRow(data as IncidentReportRow) : null;
};

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
  const isUpdate = !!report.id;

  const payload: Partial<IncidentReportRow> = {};
  const hasBuInput =
    report.businessUnitId !== undefined || report.businessUnitName !== undefined;

  if (isUpdate) {
    if (report.category !== undefined) payload.category = report.category;
    if (report.description !== undefined) payload.description = report.description;
    if (report.location !== undefined) payload.location = report.location;
    if (report.dateTime !== undefined) {
      payload.date_time = report.dateTime.toISOString();
    }
    if (report.reportedBy !== undefined) payload.reported_by = report.reportedBy;
    if (report.involvedEmployeeIds !== undefined) {
      payload.involved_employee_ids = report.involvedEmployeeIds;
    }
    if (report.involvedEmployeeNames !== undefined) {
      payload.involved_employee_names = report.involvedEmployeeNames;
    }
    if (report.witnessIds !== undefined) payload.witness_ids = report.witnessIds;
    if (report.witnessNames !== undefined) payload.witness_names = report.witnessNames;
    if (report.status !== undefined) payload.status = report.status;
    if (report.pipelineStage !== undefined) payload.pipeline_stage = report.pipelineStage;
    if (report.nteIds !== undefined) payload.nte_ids = report.nteIds;
    if (report.resolutionId !== undefined) payload.resolution_id = report.resolutionId;
    if (report.chatThread !== undefined) {
      payload.chat_thread = report.chatThread.map(m => ({
        ...m,
        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
      }));
    }
    if (report.attachmentUrl !== undefined) payload.attachment_url = report.attachmentUrl;
    if (report.signatureDataUrl !== undefined) {
      payload.signature_data_url = report.signatureDataUrl;
    }
    if (report.assignedToId !== undefined) payload.assigned_to_id = report.assignedToId;
    if (report.assignedToName !== undefined) payload.assigned_to_name = report.assignedToName;

    if (hasBuInput) {
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

      payload.business_unit_id = isUuid(buId) ? buId : null;
      payload.business_unit_name = buName || null;
    }
  } else {
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

    payload.category = report.category;
    payload.description = report.description;
    payload.location = report.location;
    payload.date_time = (report.dateTime || new Date()).toISOString();
    payload.reported_by = report.reportedBy || user.id;
    payload.involved_employee_ids = report.involvedEmployeeIds || [];
    payload.involved_employee_names = report.involvedEmployeeNames || [];
    payload.witness_ids = report.witnessIds || [];
    payload.witness_names = report.witnessNames || [];
    payload.status = report.status || IRStatus.Submitted;
    payload.pipeline_stage = report.pipelineStage || 'ir-review';
    payload.nte_ids = report.nteIds || [];
    payload.resolution_id = report.resolutionId || null;
    payload.chat_thread = chatThread;
    payload.attachment_url = report.attachmentUrl || null;
    payload.signature_data_url = report.signatureDataUrl || null;
    payload.assigned_to_id = report.assignedToId || null;
    payload.assigned_to_name = report.assignedToName || null;
    payload.business_unit_id = isUuid(buId) ? buId : null;
    payload.business_unit_name = buName || null;
  }

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
