import { Application, Candidate, Interview, InterviewStatus, JobPost, User } from '../types';
import { supabase } from './supabaseClient';
import { logActivity } from './auditService';

export interface InterviewApplicantOption {
  appId: string;
  candidateId: string;
  name: string;
  firstName: string;
  email: string;
  position: string;
  businessUnit: string;
  department: string;
  stage: string;
}

export interface InterviewScheduleContext {
  application: Application;
  candidate: Candidate;
  jobPost?: JobPost;
  businessUnitName?: string;
  departmentName?: string;
  panelUsers: User[];
  currentUser?: User | null;
}

export interface InterviewScheduleResult {
  interview: Interview;
  warnings: string[];
}

const getFunctionErrorMessage = async (error: any): Promise<string> => {
  try {
    const payload = await error?.context?.json?.();
    return payload?.error || payload?.message || error?.message || 'Unable to schedule interview.';
  } catch {
    return error?.message || 'Unable to schedule interview.';
  }
};

const localDateTime = (value: Date) => {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
};

const mapInterviewRow = (row: any): Interview => ({
  id: row.id,
  applicationId: row.application_id,
  interviewerId: row.interviewer_id || undefined,
  interviewType: row.type === 'Remote' ? 'Virtual' : row.type === 'Phone' ? 'Phone Screen' : row.type,
  scheduledStart: new Date(row.start_at),
  scheduledEnd: new Date(row.end_at),
  location: row.location || '',
  panelUserIds: row.panel_user_ids || (row.interviewer_id ? [row.interviewer_id] : []),
  calendarEventId: row.calendar_event_id || undefined,
  googleCalendarLink: row.google_calendar_link || undefined,
  googleMeetLink: row.google_meet_link || undefined,
  calendarInviteStatus: row.calendar_invite_status || 'not_requested',
  applicantInviteStatus: row.applicant_invite_status || 'not_requested',
  panelInviteStatus: row.panel_invite_status || 'not_requested',
  confirmationEmailStatus: row.confirmation_email_status || 'not_requested',
  applicantInviteSentAt: row.applicant_invite_sent_at ? new Date(row.applicant_invite_sent_at) : undefined,
  panelInviteSentAt: row.panel_invite_sent_at ? new Date(row.panel_invite_sent_at) : undefined,
  confirmationEmailSentAt: row.confirmation_email_sent_at ? new Date(row.confirmation_email_sent_at) : undefined,
  calendarError: row.calendar_error || undefined,
  status: row.status as InterviewStatus,
  notes: row.notes || '',
});

export const saveInterviewSchedule = async (
  draft: Interview,
  context: InterviewScheduleContext,
): Promise<InterviewScheduleResult> => {
  const position = context.application.roleTitleSnapshot || context.jobPost?.title || 'General Application';
  const { data, error } = await supabase.functions.invoke('schedule-interview', {
    body: {
      interviewId: draft.id || null,
      applicationId: draft.applicationId,
      panelUserIds: draft.panelUserIds || [],
      startAt: draft.scheduledStart.toISOString(),
      endAt: draft.scheduledEnd.toISOString(),
      localStart: localDateTime(draft.scheduledStart),
      localEnd: localDateTime(draft.scheduledEnd),
      interviewType: draft.interviewType,
      location: draft.location || null,
      notes: draft.notes || null,
      createCalendarEvent: draft.createCalendarEvent !== false,
      includeScheduler: false,
    },
  });
  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (!data?.interview) throw new Error(data?.error || 'The interview could not be saved.');

  const warnings = data.warning ? [data.warning] : [];
  const interview = mapInterviewRow(data.interview);
  if (context.currentUser) {
    await logActivity(
      context.currentUser,
      draft.id ? 'UPDATE' : 'CREATE',
      'Interview',
      interview.id,
      `${draft.id ? 'Updated' : 'Scheduled'} interview for ${context.candidate.firstName} — ${position}`,
    );
  }

  return { interview, warnings };
};

export const buildInterviewApplicantOption = ({
  application,
  candidate,
  jobPost,
  businessUnitName,
  departmentName,
}: {
  application: Application;
  candidate: Candidate;
  jobPost?: JobPost;
  businessUnitName?: string;
  departmentName?: string;
}): InterviewApplicantOption => ({
  appId: application.id,
  candidateId: candidate.id,
  name: `${candidate.firstName} ${candidate.lastName}`.trim(),
  firstName: candidate.firstName,
  email: candidate.email,
  position: application.roleTitleSnapshot || jobPost?.title || 'General Application',
  businessUnit: businessUnitName || 'N/A',
  department: departmentName || application.departmentSnapshot || 'N/A',
  stage: application.stage,
});
