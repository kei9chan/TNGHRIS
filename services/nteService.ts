import { supabase } from './supabaseClient';
import { NTE, NTEStatus, ApproverStep, ApproverStatus, User } from '../types';

// Compatibility mapper for the legacy NTE row plus its canonical recipient and
// normalized approval snapshot.
type NTERow = {
  id: string;
  incident_report_id: string;
  template_id?: string | null;
  issued_by_user_id?: string | null;
  issued_by_name?: string | null;
  recipients?: string[] | null;
  recipient_names?: string[] | null;
  recipient_employee_id?: string | null;
  recipient_name_snapshot?: string | null;
  response_deadline?: string | null;
  details?: string | null;
  evidence_link?: string | null;
  status: NTEStatus;
  approver_ids?: string[] | null;
  approver_names?: string[] | null;
  approval_log?: any[] | null;
  created_at?: string;
  updated_at?: string;
  nte_number?: number | string;
  body?: string | null;
  revision_note?: string | null;
  revision_requested_at?: string | null;
  revision_requested_by?: string | null;
  closure_reason?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  workflow_history?: any[] | null;
  employee_response?: string | null;
  employee_response_evidence_url?: string | null;
  employee_response_signature_url?: string | null;
  response_date?: string | null;
};

export const cleanNteDocumentApproverLabels = (html: string): string =>
  html.replace(/(\(([^()<>]+)\))\s*\1/gi, '$1');

const mapRow = (row: NTERow): NTE => {
  const employeeId = row.recipient_employee_id || row.recipients?.[0] || '';
  const employeeName = row.recipient_name_snapshot || row.recipient_names?.[0] || '';
  const approverSteps = ((row.approval_log as any[]) || []).map((step): ApproverStep => ({
    ...step,
    status: step.status as ApproverStatus,
    assignedAt: step.assignedAt ? new Date(step.assignedAt) : undefined,
    timestamp: step.timestamp ? new Date(step.timestamp) : undefined,
  }));
  return {
    id: row.id,
    incidentReportId: row.incident_report_id,
    employeeId,
    employeeName,
    status: row.status as NTEStatus,
    issuedDate: row.created_at ? new Date(row.created_at) : new Date(),
    deadline: row.response_deadline ? new Date(row.response_deadline) : new Date(),
    details: row.details || '',
    body: cleanNteDocumentApproverLabels(row.body || ''),
    employeeResponse: row.employee_response || '',
    employeeResponseEvidenceUrl: row.employee_response_evidence_url || undefined,
    employeeResponseSignatureUrl: row.employee_response_signature_url || undefined,
    responseDate: row.response_date ? new Date(row.response_date) : undefined,
    memoIds: [],
    disciplineCodeIds: [],
    evidenceUrl: row.evidence_link || undefined,
    issuedByUserId: row.issued_by_user_id || '',
    approverSteps,
    nteNumber: row.nte_number || undefined,
    revisionNote: row.revision_note || undefined,
    revisionRequestedAt: row.revision_requested_at ? new Date(row.revision_requested_at) : undefined,
    revisionRequestedBy: row.revision_requested_by || undefined,
    closureReason: row.closure_reason || undefined,
    closedAt: row.closed_at ? new Date(row.closed_at) : undefined,
    closedBy: row.closed_by || undefined,
    workflowHistory: row.workflow_history || [],
  };
};

export type EligibleNTEApprover = {
  id: string;
  name: string;
  email: string;
  position: string;
  businessUnitId?: string;
  businessUnit: string;
  eligibleRoleIds: string[];
  eligibleRoleLabels: string[];
  hasBodRole: boolean;
  preferredRoleId: string;
};

export type NTEApproverSelection = {
  approver: EligibleNTEApprover;
  roleId: string;
  selectionReason?: string;
};

export const fetchEligibleNTEApprovers = async (
  incidentReportId: string,
  recipientEmployeeId: string
): Promise<EligibleNTEApprover[]> => {
  const { data, error } = await supabase.rpc('get_eligible_nte_approvers', {
    p_incident_report_id: incidentReportId,
    p_recipient_employee_id: recipientEmployeeId,
  });
  if (error) throw new Error(error.message || 'Failed to load eligible NTE approvers.');
  return (data || []).map((row: any) => ({
    id: row.id,
    name: row.full_name || 'Approver',
    email: row.email || '',
    position: row.job_position || '',
    businessUnitId: row.business_unit_id || undefined,
    businessUnit: row.business_unit || '',
    eligibleRoleIds: row.eligible_role_ids || [],
    eligibleRoleLabels: row.eligible_role_labels || [],
    hasBodRole: !!row.has_bod_role,
    preferredRoleId: row.preferred_role_id || row.eligible_role_ids?.[0] || '',
  }));
};

export type NTEBodOutcome = 'revision' | 'closure';

export const processNTEBodOutcome = async (nteId: string, outcome: NTEBodOutcome, note: string): Promise<NTE> => {
  const { data, error } = await supabase.rpc('process_nte_bod_outcome', {
    p_nte_id: nteId,
    p_outcome: outcome,
    p_note: note,
  });
  if (error) throw new Error(error.message || 'Failed to process BOD decision');
  if (!data) throw new Error('The updated NTE was not returned');
  return mapRow(data as NTERow);
};

export type NTEApprovalAction = 'approve' | 'return' | 'reject';

export const processNTEApproval = async (
  nteId: string,
  action: NTEApprovalAction,
  comments = ''
): Promise<NTE> => {
  const { data, error } = await supabase.rpc('act_on_nte_approval', {
    p_nte_id: nteId,
    p_action: action,
    p_comments: comments || null,
  });
  if (error) throw new Error(error.message || 'Failed to process the NTE approval.');
  if (!data) throw new Error('The updated NTE was not returned.');
  return mapRow(data as NTERow);
};

export const resubmitNTERevision = async (nte: Partial<NTE>): Promise<NTE> => {
  if (!nte.id) throw new Error('NTE id is required');
  const { data, error } = await supabase.rpc('resubmit_nte_revision', {
    p_nte_id: nte.id,
    p_details: nte.details || '',
    p_body: nte.body || null,
    p_response_deadline: nte.deadline ? nte.deadline.toISOString() : null,
    p_evidence_link: nte.evidenceUrl || null,
  });
  if (error) throw new Error(error.message || 'Failed to resubmit revised NTE');
  if (!data) throw new Error('The resubmitted NTE was not returned');
  return mapRow(data as NTERow);
};

export const saveNTEs = async (ntes: Partial<NTE>[], _user: User): Promise<NTE[]> => {
  if (!ntes || ntes.length === 0) return [];
  const saved: NTE[] = [];
  for (const nte of ntes) {
    if (!nte.incidentReportId || !nte.employeeId) throw new Error('Incident Report and recipient are required.');
    const { data, error } = await supabase.rpc('create_nte_for_employee', {
      p_incident_report_id: nte.incidentReportId,
      p_recipient_employee_id: nte.employeeId,
      p_template_id: nte.templateId || null,
      p_response_deadline: nte.deadline ? nte.deadline.toISOString() : null,
      p_details: nte.details || '',
      p_body: nte.body || '',
      p_evidence_link: nte.evidenceUrl || null,
      p_memo_ids: nte.memoIds || [],
      p_discipline_code_ids: nte.disciplineCodeIds || [],
      p_approvers: (nte.approverSteps || []).map(step => ({
        userId: step.userId,
        roleId: step.roleId,
        selectionReason: step.comments || null,
      })),
      p_nte_number: nte.nteNumber ? String(nte.nteNumber) : null,
    });
    if (error) throw new Error(error.message || 'Failed to create the employee-specific NTE.');
    if (!data) throw new Error('The created NTE was not returned.');
    saved.push(mapRow(data as NTERow));
  }
  return saved;
};

export const updateNTE = async (nte: Partial<NTE>): Promise<NTE> => {
  if (!nte.id) throw new Error('NTE id is required');
  const payload: Partial<NTERow> = {
    response_deadline: nte.deadline ? nte.deadline.toISOString() : undefined,
    details: nte.details,
    evidence_link: nte.evidenceUrl,
    status: nte.status as NTEStatus,
    approval_log: nte.approverSteps || [],
    approver_ids: nte.approverSteps?.map(a => a.userId),
    approver_names: nte.approverSteps?.map(a => a.userName),
    employee_response: nte.employeeResponse || undefined,
    employee_response_evidence_url: nte.employeeResponseEvidenceUrl || undefined,
    employee_response_signature_url: nte.employeeResponseSignatureUrl || undefined,
    response_date: nte.responseDate ? nte.responseDate.toISOString() : undefined,
  };
  // Use separate update + fetch to avoid 406 when RLS SELECT policy
  // doesn't cover the approver after the row is modified
  const { error } = await supabase.from('ntes').update(payload).eq('id', nte.id);
  if (error) throw new Error(error.message || 'Failed to update NTE');
  
  // Fetch the updated row separately
  const { data: updated, error: fetchError } = await supabase
    .from('ntes')
    .select('*')
    .eq('id', nte.id)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message || 'Failed to fetch updated NTE');
  if (!updated) throw new Error('NTE not found after update');
  return mapRow(updated as NTERow);
};

export const fetchNTEById = async (id: string): Promise<NTE | null> => {
  const { data, error } = await supabase.from('ntes').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message || 'Failed to fetch NTE');
  return data ? mapRow(data as NTERow) : null;
};

export const fetchNTEs = async (): Promise<NTE[]> => {
  const { data, error } = await supabase.from('ntes').select('*');
  if (error) throw new Error(error.message || 'Failed to fetch NTEs');
  return (data as NTERow[]).map(mapRow);
};

export const fetchNTEsByIncidentReportId = async (incidentReportId: string): Promise<NTE[]> => {
  const { data, error } = await supabase.from('ntes').select('*').eq('incident_report_id', incidentReportId);
  if (error) throw new Error(error.message || 'Failed to fetch NTEs');
  return (data as NTERow[]).map(mapRow);
};
