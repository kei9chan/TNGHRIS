import { supabase } from './supabaseClient';
import { NTE, NTEStatus, ApproverStep, User } from '../types';

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
    employeeResponse: '',
    memoIds: [],
    disciplineCodeIds: [],
    evidenceUrl: row.evidence_link || undefined,
    issuedByUserId: row.issued_by_user_id || '',
    approverSteps: (row.approval_log as ApproverStep[]) || [],
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
  return (data as NTERow[]).map(mapRow);
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
  };
  const { data, error } = await supabase.from('ntes').update(payload).eq('id', nte.id).select().single();
  if (error) throw new Error(error.message || 'Failed to update NTE');
  return mapRow(data as NTERow);
};
