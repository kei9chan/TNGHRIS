import { supabase } from './supabaseClient';

export type PayrollAttendanceInterpretation = {
  id: string;
  employeeId: string;
  workDate: string;
  employeeScheduleId: string | null;
  attendanceRuleSetId: string;
  interpretationVersion: number;
  recordStatus: string;
  interpretationSource: string;
  scheduleTimezone: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  scheduledWorkMinutes: number;
  scheduledBreakMinutes: number;
  firstClockInAt: string | null;
  lastClockOutAt: string | null;
  actualWorkMinutes: number;
  breakMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  absenceMinutes: number;
  absenceStatus: string;
  missingClockIn: boolean;
  missingClockOut: boolean;
  sourceEventCount: number;
  statusReason: string;
};

export type PayrollAttendanceRunSummary = {
  request_key?: string;
  payroll_group_id?: string | null;
  period_start?: string;
  period_end?: string;
  scheduled_records_seen?: number;
  interpretations_created?: number;
  existing_interpretations_skipped?: number;
  missing_active_rule_records?: number;
  no_show_count?: number;
  exceptions_created?: number;
  generated_at?: string;
};

export type PayrollAttendanceException = {
  id: string;
  attendanceInterpretationId: string | null;
  employeeId: string;
  workDate: string;
  exceptionType: string;
  severity: string;
  status: string;
  details: string;
  acknowledgedByUserId: string | null;
  acknowledgedAt: string | null;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  resolutionCode: string | null;
  resolutionNote: string | null;
  resolutionDocumentRef: string | null;
  resolutionApprovedByUserId: string | null;
  resolutionApprovedAt: string | null;
};

export type PayrollAttendanceExceptionAction =
  | 'acknowledge'
  | 'resolve'
  | 'reject'
  | 'waive'
  | 'reopen';

type PayrollAttendanceInterpretationRow = {
  id: string;
  employee_id: string;
  work_date: string;
  employee_schedule_id: string | null;
  attendance_rule_set_id: string;
  interpretation_version: number;
  record_status: string;
  interpretation_source: string;
  schedule_timezone: string;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  scheduled_work_minutes: number;
  scheduled_break_minutes: number;
  first_clock_in_at: string | null;
  last_clock_out_at: string | null;
  actual_work_minutes: number;
  break_minutes: number;
  late_minutes: number;
  undertime_minutes: number;
  absence_minutes: number;
  absence_status: string;
  missing_clock_in: boolean;
  missing_clock_out: boolean;
  source_event_count: number;
  status_reason: string;
};

const mapInterpretation = (row: PayrollAttendanceInterpretationRow): PayrollAttendanceInterpretation => ({
  id: row.id,
  employeeId: row.employee_id,
  workDate: row.work_date,
  employeeScheduleId: row.employee_schedule_id,
  attendanceRuleSetId: row.attendance_rule_set_id,
  interpretationVersion: row.interpretation_version,
  recordStatus: row.record_status,
  interpretationSource: row.interpretation_source,
  scheduleTimezone: row.schedule_timezone,
  scheduledStartAt: row.scheduled_start_at,
  scheduledEndAt: row.scheduled_end_at,
  scheduledWorkMinutes: Number(row.scheduled_work_minutes || 0),
  scheduledBreakMinutes: Number(row.scheduled_break_minutes || 0),
  firstClockInAt: row.first_clock_in_at,
  lastClockOutAt: row.last_clock_out_at,
  actualWorkMinutes: Number(row.actual_work_minutes || 0),
  breakMinutes: Number(row.break_minutes || 0),
  lateMinutes: Number(row.late_minutes || 0),
  undertimeMinutes: Number(row.undertime_minutes || 0),
  absenceMinutes: Number(row.absence_minutes || 0),
  absenceStatus: row.absence_status,
  missingClockIn: row.missing_clock_in,
  missingClockOut: row.missing_clock_out,
  sourceEventCount: Number(row.source_event_count || 0),
  statusReason: row.status_reason,
});

export const fetchPayrollAttendanceInterpretations = async (
  startDate: string,
  endDate: string
): Promise<PayrollAttendanceInterpretation[]> => {
  const { data, error } = await supabase
    .from('payroll_attendance_interpretations')
    .select('*')
    .gte('work_date', startDate)
    .lte('work_date', endDate)
    .in('record_status', ['draft', 'needs_review', 'resolved', 'approved'])
    .order('work_date', { ascending: true })
    .order('employee_id', { ascending: true });

  if (error) throw new Error(error.message);
  return ((data || []) as PayrollAttendanceInterpretationRow[]).map(mapInterpretation);
};

export const fetchPayrollAttendanceExceptions = async (
  startDate: string,
  endDate: string
): Promise<PayrollAttendanceException[]> => {
  const { data, error } = await supabase
    .from('payroll_attendance_exceptions')
    .select(`
      id,
      attendance_interpretation_id,
      employee_id,
      work_date,
      exception_type,
      severity,
      status,
      details,
      acknowledged_by_user_id,
      acknowledged_at,
      resolved_by_user_id,
      resolved_at,
      resolution_code,
      resolution_note,
      resolution_document_ref,
      resolution_approved_by_user_id,
      resolution_approved_at
    `)
    .gte('work_date', startDate)
    .lte('work_date', endDate)
    .order('work_date', { ascending: true })
    .order('exception_type', { ascending: true });

  if (error) throw new Error(error.message);
  return ((data || []) as Array<{
    id: string;
    attendance_interpretation_id: string | null;
    employee_id: string;
    work_date: string;
    exception_type: string;
    severity: string;
    status: string;
    details: string;
    acknowledged_by_user_id: string | null;
    acknowledged_at: string | null;
    resolved_by_user_id: string | null;
    resolved_at: string | null;
    resolution_code: string | null;
    resolution_note: string | null;
    resolution_document_ref: string | null;
    resolution_approved_by_user_id: string | null;
    resolution_approved_at: string | null;
  }>).map(row => ({
    id: row.id,
    attendanceInterpretationId: row.attendance_interpretation_id,
    employeeId: row.employee_id,
    workDate: row.work_date,
    exceptionType: row.exception_type,
    severity: row.severity,
    status: row.status,
    details: row.details,
    acknowledgedByUserId: row.acknowledged_by_user_id,
    acknowledgedAt: row.acknowledged_at,
    resolvedByUserId: row.resolved_by_user_id,
    resolvedAt: row.resolved_at,
    resolutionCode: row.resolution_code,
    resolutionNote: row.resolution_note,
    resolutionDocumentRef: row.resolution_document_ref,
    resolutionApprovedByUserId: row.resolution_approved_by_user_id,
    resolutionApprovedAt: row.resolution_approved_at,
  }));
};

export const resolvePayrollAttendanceException = async ({
  exceptionId,
  action,
  resolutionCode,
  resolutionNote,
  resolutionDocumentRef,
}: {
  exceptionId: string;
  action: PayrollAttendanceExceptionAction;
  resolutionCode?: string | null;
  resolutionNote?: string | null;
  resolutionDocumentRef?: string | null;
}) => {
  const { data, error } = await supabase.rpc('resolve_payroll_attendance_exception', {
    p_exception_id: exceptionId,
    p_action: action,
    p_resolution_code: resolutionCode || null,
    p_resolution_note: resolutionNote || null,
    p_resolution_document_ref: resolutionDocumentRef || null,
  });

  if (error) {
    if (error.code === 'PGRST202' || error.message.toLowerCase().includes('schema cache')) {
      throw new Error('The staging API has not refreshed its payroll workflow schema yet. Refresh the page and retry.');
    }
    throw new Error(error.message);
  }
  return (data || {}) as Record<string, unknown>;
};

export const runPayrollAttendanceInterpretations = async ({
  payrollGroupId,
  startDate,
  endDate,
  requestKey,
}: {
  payrollGroupId?: string | null;
  startDate: string;
  endDate: string;
  requestKey?: string;
}): Promise<PayrollAttendanceRunSummary> => {
  const { data, error } = await supabase.rpc('generate_payroll_attendance_interpretations', {
    p_payroll_group_id: payrollGroupId || null,
    p_start_date: startDate,
    p_end_date: endDate,
    p_request_key: requestKey || null,
  });

  if (error) {
    if (error.code === 'PGRST202' || error.message.toLowerCase().includes('schema cache')) {
      throw new Error('The staging API has not refreshed its attendance interpretation schema yet. Refresh the page and retry.');
    }
    throw new Error(error.message);
  }
  return (data || {}) as PayrollAttendanceRunSummary;
};
