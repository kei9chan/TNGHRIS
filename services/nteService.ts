import { supabase } from './supabaseClient';
import { NTE, NTEStatus, ApproverStep, User, NotificationType } from '../types';
import { createNotification } from './notificationService';

// Maps a DB row to our NTE type (single-recipient view)
type NTERow = {
  id: string;
  incident_report_id: string;
  template_id?: string | null;
  issued_by_user_id?: string | null;
  issued_by_name?: string | null;
  recipients?: string[] | null;
  recipient_names?: string[] | null;
  response_deadline?: string | null;
  details?: string | null;
  evidence_link?: string | null;
  status: NTEStatus;
  approver_ids?: string[] | null;
  approver_names?: string[] | null;
  approval_log?: any[] | null;
  created_at?: string;
  updated_at?: string;
  nte_number?: number;
  employee_response?: string | null;
  employee_response_evidence_url?: string | null;
  employee_response_signature_url?: string | null;
  response_date?: string | null;
};

const mapRow = (row: NTERow): NTE => {
  const employeeId = row.recipients?.[0] || '';
  const employeeName = row.recipient_names?.[0] || '';
  return {
    id: row.id,
    incidentReportId: row.incident_report_id,
    employeeId,
    employeeName,
    status: row.status as NTEStatus,
    issuedDate: row.created_at ? new Date(row.created_at) : new Date(),
    deadline: row.response_deadline ? new Date(row.response_deadline) : new Date(),
    details: row.details || '',
    body: '',
    employeeResponse: row.employee_response || '',
    employeeResponseEvidenceUrl: row.employee_response_evidence_url || undefined,
    employeeResponseSignatureUrl: row.employee_response_signature_url || undefined,
    responseDate: row.response_date ? new Date(row.response_date) : undefined,
    memoIds: [],
    disciplineCodeIds: [],
    evidenceUrl: row.evidence_link || undefined,
    issuedByUserId: row.issued_by_user_id || '',
    approverSteps: (row.approval_log as ApproverStep[]) || [],
    nteNumber: row.nte_number || undefined,
  };
};

export const saveNTEs = async (ntes: Partial<NTE>[], user: User): Promise<NTE[]> => {
  if (!ntes || ntes.length === 0) return [];

  const payloads = ntes.map(n => ({
    incident_report_id: n.incidentReportId,
    issued_by_user_id: user.id,
    issued_by_name: user.name,
    recipients: [n.employeeId],
    recipient_names: [n.employeeName],
    response_deadline: n.deadline ? n.deadline.toISOString() : null,
    details: n.details || '',
    evidence_link: n.evidenceUrl || null,
    status: n.status || NTEStatus.PendingApproval,
    approver_ids: n.approverSteps?.map(a => a.userId) || [],
    approver_names: n.approverSteps?.map(a => a.userName) || [],
    approval_log: n.approverSteps || [],
  }));

  const { data, error } = await supabase
    .from('ntes')
    .insert(payloads)
    .select('*');

  if (error) throw new Error(error.message || 'Failed to save NTE');
  
  const savedNTEs = (data as NTERow[]).map(mapRow);

  // Send notifications to approvers
  for (const nte of savedNTEs) {
    if (nte.approverSteps) {
      for (const step of nte.approverSteps) {
        await createNotification({
          userId: step.userId,
          title: 'NTE Approval Required',
          message: `You have been requested to approve an NTE for ${nte.employeeName}.`,
          type: NotificationType.NTE_ISSUED,
          isRead: false,
          link: `/feedback/nte/${nte.id}`,
        }).catch(err => console.warn('Failed to send notification:', err));
      }
    }
  }

  return savedNTEs;
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

