import { supabase } from './supabaseClient';
import { Resolution, ResolutionStatus, ResolutionType, ApproverStep } from '../types';

type ResolutionRow = {
  id: string;
  incident_report_id: string;
  employee_id: string;
  resolution_type: string;
  details: string;
  decision_date: string | null;
  closed_by_user_id: string;
  status: string;
  approver_steps: any[] | null;
  decision_maker_signature_url: string | null;
  supporting_document_url: string | null;
  employee_acknowledged_at: string | null;
  employee_acknowledgement_signature_url: string | null;
  acknowledgement_deadline: string | null;
  sent_to_employee_at: string | null;
  manual_closure_reason: string | null;
  suspension_type: string | null;
  suspension_days: number | null;
  suspension_start_date: string | null;
  suspension_end_date: string | null;
  suspension_dates: any[] | null;
  created_at: string;
  updated_at: string;
};

const mapRow = (row: ResolutionRow): Resolution => {
  return {
    id: row.id,
    incidentReportId: row.incident_report_id,
    employeeId: row.employee_id,
    resolutionType: row.resolution_type as ResolutionType,
    details: row.details,
    decisionDate: row.decision_date ? new Date(row.decision_date) : new Date(),
    closedByUserId: row.closed_by_user_id,
    status: row.status as ResolutionStatus,
    approverSteps: (row.approver_steps as ApproverStep[]) || [],
    decisionMakerSignatureUrl: row.decision_maker_signature_url || undefined,
    supportingDocumentUrl: row.supporting_document_url || undefined,
    employeeAcknowledgedAt: row.employee_acknowledged_at ? new Date(row.employee_acknowledged_at) : undefined,
    employeeAcknowledgementSignatureUrl: row.employee_acknowledgement_signature_url || undefined,
    acknowledgementDeadline: row.acknowledgement_deadline ? new Date(row.acknowledgement_deadline) : undefined,
    sentToEmployeeAt: row.sent_to_employee_at ? new Date(row.sent_to_employee_at) : undefined,
    manualClosureReason: row.manual_closure_reason || undefined,
    suspensionType: (row.suspension_type as any) || undefined,
    suspensionDays: row.suspension_days || undefined,
    suspensionStartDate: row.suspension_start_date ? new Date(row.suspension_start_date) : undefined,
    suspensionEndDate: row.suspension_end_date ? new Date(row.suspension_end_date) : undefined,
    suspensionDates: row.suspension_dates ? row.suspension_dates.map((d: string) => new Date(d)) : undefined,
  };
};



export const fetchResolutions = async (): Promise<Resolution[]> => {
  const { data, error } = await supabase
    .from('resolutions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to fetch resolutions');
  return (data as ResolutionRow[]).map(mapRow);
};

export const fetchResolutionsByIncidentReportId = async (incidentReportId: string): Promise<Resolution[]> => {
  const { data, error } = await supabase.from('resolutions').select('*').eq('incident_report_id', incidentReportId);
  if (error) throw new Error(error.message || 'Failed to fetch resolutions');
  return (data as ResolutionRow[]).map(mapRow);
};

export const createResolution = async (resolution: Partial<Resolution>): Promise<Resolution> => {
  const payload: Partial<ResolutionRow> = {
    incident_report_id: resolution.incidentReportId,
    employee_id: resolution.employeeId,
    resolution_type: resolution.resolutionType,
    details: resolution.details || '',
    decision_date: resolution.decisionDate ? resolution.decisionDate.toISOString() : undefined,
    closed_by_user_id: resolution.closedByUserId,
    status: resolution.status || ResolutionStatus.Draft,
    approver_steps: resolution.approverSteps || [],
    decision_maker_signature_url: resolution.decisionMakerSignatureUrl,
    supporting_document_url: resolution.supportingDocumentUrl,
    employee_acknowledged_at: resolution.employeeAcknowledgedAt ? resolution.employeeAcknowledgedAt.toISOString() : undefined,
    employee_acknowledgement_signature_url: resolution.employeeAcknowledgementSignatureUrl,
    acknowledgement_deadline: resolution.acknowledgementDeadline ? resolution.acknowledgementDeadline.toISOString() : undefined,
    sent_to_employee_at: resolution.sentToEmployeeAt ? resolution.sentToEmployeeAt.toISOString() : undefined,
    manual_closure_reason: resolution.manualClosureReason,
    suspension_type: resolution.suspensionType,
    suspension_days: resolution.suspensionDays,
    suspension_start_date: resolution.suspensionStartDate ? resolution.suspensionStartDate.toISOString() : undefined,
    suspension_end_date: resolution.suspensionEndDate ? resolution.suspensionEndDate.toISOString() : undefined,
    suspension_dates: resolution.suspensionDates ? resolution.suspensionDates.map(d => d.toISOString()) : undefined,
  };

  const { data, error } = await supabase
    .from('resolutions')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(error.message || 'Failed to create resolution');
  return mapRow(data as ResolutionRow);
};

export const updateResolution = async (id: string, updates: Partial<Resolution>): Promise<Resolution> => {
  const payload: Partial<ResolutionRow> = {};
  if (updates.resolutionType !== undefined) payload.resolution_type = updates.resolutionType;
  if (updates.details !== undefined) payload.details = updates.details;
  if (updates.decisionDate !== undefined) payload.decision_date = updates.decisionDate.toISOString();
  if (updates.closedByUserId !== undefined) payload.closed_by_user_id = updates.closedByUserId;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.approverSteps !== undefined) payload.approver_steps = updates.approverSteps;
  if (updates.decisionMakerSignatureUrl !== undefined) payload.decision_maker_signature_url = updates.decisionMakerSignatureUrl;
  if (updates.supportingDocumentUrl !== undefined) payload.supporting_document_url = updates.supportingDocumentUrl;
  if (updates.employeeAcknowledgedAt !== undefined) payload.employee_acknowledged_at = updates.employeeAcknowledgedAt.toISOString();
  if (updates.employeeAcknowledgementSignatureUrl !== undefined) payload.employee_acknowledgement_signature_url = updates.employeeAcknowledgementSignatureUrl;
  if (updates.acknowledgementDeadline !== undefined) payload.acknowledgement_deadline = updates.acknowledgementDeadline.toISOString();
  if (updates.sentToEmployeeAt !== undefined) payload.sent_to_employee_at = updates.sentToEmployeeAt.toISOString();
  if (updates.manualClosureReason !== undefined) payload.manual_closure_reason = updates.manualClosureReason;
  if (updates.suspensionType !== undefined) payload.suspension_type = updates.suspensionType;
  if (updates.suspensionDays !== undefined) payload.suspension_days = updates.suspensionDays;
  if (updates.suspensionStartDate !== undefined) payload.suspension_start_date = updates.suspensionStartDate.toISOString();
  if (updates.suspensionEndDate !== undefined) payload.suspension_end_date = updates.suspensionEndDate.toISOString();
  if (updates.suspensionDates !== undefined) payload.suspension_dates = updates.suspensionDates.map(d => d.toISOString());

  const { data, error } = await supabase
    .from('resolutions')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message || 'Failed to update resolution');
  return mapRow(data as ResolutionRow);
};
