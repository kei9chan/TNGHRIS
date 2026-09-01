import { Application, Candidate, Interview, InterviewIntegrationStatus, InterviewStatus, JobPost, User } from '../types';
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

export const mapInterviewRow = (row: any): Interview => ({
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
  meetingProvider: row.meeting_provider || (row.google_meet_link ? 'Google Meet' : undefined),
  attendeeMeetingUrl: row.attendee_meeting_url || row.google_meet_link || (String(row.location || '').startsWith('https://') ? row.location : undefined),
  zoomMeetingId: row.zoom_meeting_id || undefined,
  zoomHostUserId: row.zoom_host_user_id || undefined,
  zoomHostEmail: row.zoom_host_email || undefined,
  zoomAlternativeHostEmails: row.zoom_alternative_host_emails || [],
  customProviderName: row.custom_provider_name || undefined,
  integrationStatus: row.integration_status || undefined,
  calendarAttendeeStatuses: row.calendar_attendee_statuses || [],
  createdByUserId: row.created_by_user_id || undefined,
  updatedByUserId: row.updated_by_user_id || undefined,
  updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
  interviewRound: row.interview_round || 'Round 1',
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

const getProviderFromInterview = (interview: Interview): Interview['meetingProvider'] => {
  if (interview.meetingProvider) return interview.meetingProvider;
  if (interview.googleMeetLink || interview.location?.startsWith('https://meet.google.com/')) return 'Google Meet';
  if (interview.location?.startsWith('https://')) return 'Custom';
  return undefined;
};

export const fetchInterviewIntegrationStatus = async (panelUserIds: string[] = []): Promise<InterviewIntegrationStatus> => {
  const { data, error } = await supabase.functions.invoke('interview-integrations', {
    body: { panelUserIds },
  });
  if (error) throw new Error(await getFunctionErrorMessage(error));
  return data as InterviewIntegrationStatus;
};

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
      interviewRound: draft.interviewRound || 'Round 1',
      meetingProvider: getProviderFromInterview(draft) || (draft.interviewType === 'Virtual' ? 'Custom' : null),
      meetingLink: draft.attendeeMeetingUrl || (draft.meetingProvider === 'Google Meet' ? draft.googleMeetLink : undefined) || (draft.meetingProvider === 'Custom' ? draft.location : undefined) || null,
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

export const cancelInterviewSchedule = async (interviewId: string): Promise<Interview> => {
  const { data, error } = await supabase.functions.invoke('schedule-interview', {
    body: { action: 'cancel', interviewId },
  });
  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (!data?.interview) throw new Error(data?.error || 'The interview could not be cancelled.');
  return mapInterviewRow(data.interview);
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
