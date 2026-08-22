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

interface CalendarResult {
  eventId?: string;
  meetLink?: string;
  htmlLink?: string;
  warning?: string;
  calendarInviteStatus?: string;
  applicantInviteStatus?: string;
  panelInviteStatus?: string;
  applicantInviteSentAt?: string;
  panelInviteSentAt?: string;
}

export interface InterviewScheduleResult {
  interview: Interview;
  warnings: string[];
}

const apiError = async (response: Response, fallback: string) => {
  const body = await response.json().catch(() => ({}));
  return body?.error || body?.message || fallback;
};

const getSessionToken = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Your session has expired. Please sign in again.');
  }
  return data.session.access_token;
};

const requestCalendarEvent = async (
  draft: Interview,
  context: InterviewScheduleContext,
  position: string,
): Promise<CalendarResult> => {
  const token = await getSessionToken();
  const attendeeEmails = [
    context.candidate.email,
    ...context.panelUsers.map((panelUser) => panelUser.email),
    context.currentUser?.email,
  ].filter((email): email is string => Boolean(email && email.includes('@')));

  const response = await fetch('/api/google-calendar-event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      applicant: {
        name: `${context.candidate.firstName} ${context.candidate.lastName}`.trim(),
        firstName: context.candidate.firstName,
        email: context.candidate.email,
      },
      position,
      businessUnit: context.businessUnitName || 'TNG HRIS',
      interviewType: draft.interviewType,
      startAt: draft.scheduledStart.toISOString(),
      endAt: draft.scheduledEnd.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Manila',
      location: draft.interviewType === 'Onsite' ? draft.location : undefined,
      panel: context.panelUsers.map((panelUser) => ({
        name: panelUser.name,
        email: panelUser.email,
        role: panelUser.position || panelUser.role,
      })),
      attendeeEmails: Array.from(new Set(attendeeEmails)),
      generateMeet: draft.interviewType === 'Virtual' && draft.generateMeetLink !== false,
    }),
  });

  if (!response.ok) {
    throw new Error(await apiError(response, 'Unable to create Google Calendar event. Check the Google integration settings.'));
  }
  return response.json();
};

const sendConfirmationEmail = async (
  draft: Interview,
  context: InterviewScheduleContext,
  position: string,
  meetLink?: string,
) => {
  const token = await getSessionToken();
  const panelNames = context.panelUsers.map((panelUser) => panelUser.name).join(', ') || 'Interview panel';
  const lines = [
    `Hello ${context.candidate.firstName},`,
    '',
    `Your interview for ${position} with ${context.businessUnitName || 'TNG HRIS'} is scheduled.`,
    '',
    `Date: ${draft.scheduledStart.toLocaleDateString()}`,
    `Time: ${draft.scheduledStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${draft.scheduledEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    `Type: ${draft.interviewType}`,
    `Panel: ${panelNames}`,
    draft.interviewType === 'Virtual' ? `Google Meet: ${meetLink || 'Link will be provided by HR'}` : `Location: ${draft.location || 'To be confirmed'}`,
    '',
    'Please keep this confirmation for your records. If you need to reschedule, contact the recruitment team.',
  ];

  const response = await fetch('/api/recruitment-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: context.candidate.email,
      subject: `Interview: ${context.candidate.firstName} — ${position}`,
      message: lines.join('\n'),
    }),
  });

  if (!response.ok) {
    throw new Error(await apiError(response, 'Interview scheduled, but the confirmation email failed to send.'));
  }
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

const normalizedType = (interviewType: string) => (
  interviewType === 'Virtual' ? 'Remote' : interviewType === 'Phone Screen' ? 'Phone' : interviewType || 'Remote'
);

export const saveInterviewSchedule = async (
  draft: Interview,
  context: InterviewScheduleContext,
): Promise<InterviewScheduleResult> => {
  const position = context.application.roleTitleSnapshot || context.jobPost?.title || 'General Application';
  const warnings: string[] = [];
  let calendar: CalendarResult | null = null;
  let calendarError: string | undefined;
  let confirmationEmailStatus = 'not_requested';
  let confirmationEmailSentAt: string | undefined;

  if (!draft.id && draft.createCalendarEvent) {
    try {
      calendar = await requestCalendarEvent(draft, context, position);
      if (calendar.warning) {
        calendarError = calendar.warning;
        warnings.push(calendar.warning);
      }
    } catch (error: any) {
      throw new Error(error?.message || 'Unable to create Google Calendar event.');
    }
  }

  // Send the applicant a confirmation even when HR intentionally skips the
  // Google Calendar integration. When Calendar is enabled, the real Meet URL
  // returned by Google is included; no link is ever synthesized in the client.
  if (!draft.id) {
    try {
      await sendConfirmationEmail(draft, context, position, calendar?.meetLink);
      confirmationEmailStatus = 'sent';
      confirmationEmailSentAt = new Date().toISOString();
    } catch (error: any) {
      confirmationEmailStatus = 'failed';
      warnings.push(error?.message || 'Interview scheduled, but the confirmation email failed to send.');
    }
  }

  const payload = {
    application_id: draft.applicationId,
    interviewer_id: draft.panelUserIds?.[0] || draft.interviewerId || null,
    panel_user_ids: draft.panelUserIds || [],
    start_at: draft.scheduledStart.toISOString(),
    end_at: draft.scheduledEnd.toISOString(),
    location: draft.interviewType === 'Virtual' ? (calendar?.meetLink || draft.googleMeetLink || null) : (draft.location || null),
    type: normalizedType(draft.interviewType),
    status: draft.status || 'Scheduled',
    notes: draft.notes || null,
    ...(draft.id ? {} : {
      calendar_event_id: calendar?.eventId || null,
      google_meet_link: calendar?.meetLink || draft.googleMeetLink || null,
      calendar_invite_status: calendar ? (calendar.calendarInviteStatus || 'sent') : 'not_requested',
      applicant_invite_status: calendar ? (calendar.applicantInviteStatus || 'sent') : 'not_requested',
      panel_invite_status: calendar ? (calendar.panelInviteStatus || 'sent') : 'not_requested',
      confirmation_email_status: confirmationEmailStatus,
      applicant_invite_sent_at: calendar?.applicantInviteSentAt || null,
      panel_invite_sent_at: calendar?.panelInviteSentAt || null,
      confirmation_email_sent_at: confirmationEmailSentAt || null,
      calendar_error: calendarError || null,
    }),
  };

  const query = draft.id
    ? supabase.from('job_interviews').update(payload).eq('id', draft.id).select().single()
    : supabase.from('job_interviews').insert(payload).select().single();
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to save interview.');

  if (!draft.id && draft.applicationId) {
    const { error: stageError } = await supabase
      .from('job_applications')
      .update({ stage: 'Interview', updated_at: new Date().toISOString() })
      .eq('id', draft.applicationId);
    if (stageError) warnings.push(`Interview saved, but the application stage could not be updated: ${stageError.message}`);
  }

  const interview = mapInterviewRow(data);
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
