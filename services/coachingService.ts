import { supabase } from './supabaseClient';
import { CoachingSession, CoachingStatus, CoachingTrigger, User } from '../types';

// ---------------------------------------------------------------------------
// Row Type
// ---------------------------------------------------------------------------
type CoachingSessionRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  coach_id: string;
  coach_name: string;
  trigger: string;
  context: string;
  date: string;
  status: string;
  root_cause?: string | null;
  action_plan?: string | null;
  follow_up_date?: string | null;
  employee_signature_url?: string | null;
  coach_signature_url?: string | null;
  acknowledged_at?: string | null;
};

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------
const mapCoachingSession = (row: CoachingSessionRow): CoachingSession => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeName: row.employee_name,
  coachId: row.coach_id,
  coachName: row.coach_name,
  trigger: row.trigger as CoachingTrigger,
  context: row.context,
  date: new Date(row.date),
  status: row.status as CoachingStatus,
  rootCause: row.root_cause || undefined,
  actionPlan: row.action_plan || undefined,
  followUpDate: row.follow_up_date ? new Date(row.follow_up_date) : undefined,
  employeeSignatureUrl: row.employee_signature_url || undefined,
  coachSignatureUrl: row.coach_signature_url || undefined,
  acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchCoachingSessions = async (): Promise<CoachingSession[]> => {
  const { data, error } = await supabase.from('coaching_sessions').select('*').order('date', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to fetch coaching sessions');
  return (data as CoachingSessionRow[]).map(mapCoachingSession);
};

export const fetchCoachingSessionsByEmployee = async (employeeId: string): Promise<CoachingSession[]> => {
  const { data, error } = await supabase.from('coaching_sessions').select('*').eq('employee_id', employeeId).order('date', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to fetch coaching sessions');
  return (data as CoachingSessionRow[]).map(mapCoachingSession);
};

export const createCoachingSession = async (session: Partial<CoachingSession>, coach: User): Promise<CoachingSession> => {
  const payload = {
    employee_id: session.employeeId,
    employee_name: session.employeeName || '',
    coach_id: coach.id,
    coach_name: coach.name,
    trigger: session.trigger || CoachingTrigger.Performance,
    context: session.context || '',
    date: session.date ? new Date(session.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    status: CoachingStatus.Draft,
    root_cause: session.rootCause || null,
    action_plan: session.actionPlan || null,
    follow_up_date: session.followUpDate ? new Date(session.followUpDate).toISOString().split('T')[0] : null,
  };

  const { data, error } = await supabase.from('coaching_sessions').insert(payload).select().single();
  if (error) throw new Error(error.message || 'Failed to create coaching session');
  return mapCoachingSession(data as CoachingSessionRow);
};

export const updateCoachingSession = async (id: string, updates: Partial<CoachingSession>): Promise<CoachingSession> => {
  const payload: Record<string, any> = {};
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.rootCause !== undefined) payload.root_cause = updates.rootCause;
  if (updates.actionPlan !== undefined) payload.action_plan = updates.actionPlan;
  if (updates.followUpDate !== undefined) payload.follow_up_date = new Date(updates.followUpDate).toISOString().split('T')[0];
  if (updates.employeeSignatureUrl !== undefined) payload.employee_signature_url = updates.employeeSignatureUrl;
  if (updates.coachSignatureUrl !== undefined) payload.coach_signature_url = updates.coachSignatureUrl;
  if (updates.acknowledgedAt !== undefined) payload.acknowledged_at = new Date(updates.acknowledgedAt).toISOString();

  const { data, error } = await supabase.from('coaching_sessions').update(payload).eq('id', id).select().single();
  if (error) throw new Error(error.message || 'Failed to update coaching session');
  return mapCoachingSession(data as CoachingSessionRow);
};
