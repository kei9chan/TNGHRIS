import { ApplicationStage, Interview, User } from '../types';
import { supabase } from './supabaseClient';

export interface InterviewCandidateOption {
  appId: string;
  candidateName: string;
  firstName: string;
  email: string;
  position: string;
  businessUnitId?: string;
  businessUnitName: string;
  departmentId?: string;
  departmentName?: string;
  stage: ApplicationStage;
}

export interface InterviewScheduleOptions {
  createCalendarEvent: boolean;
  includeScheduler: boolean;
}

export interface InterviewScheduleOutcome {
  row: any;
  warning?: string;
}

const getFunctionErrorMessage = async (error: any): Promise<string> => {
  try {
    const payload = await error?.context?.json?.();
    return payload?.error || payload?.message || error?.message || 'Unable to schedule interview.';
  } catch {
    return error?.message || 'Unable to schedule interview.';
  }
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const escapeIcs = (value: string) => value
  .replace(/\\/g, '\\\\')
  .replace(/\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

const toIcsDate = (value: Date) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const toBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const createIcs = ({ interview, applicant, panel, meetLink }: {
  interview: Interview;
  applicant: InterviewCandidateOption;
  panel: User[];
  meetLink?: string;
}) => {
  const title = `Interview: ${applicant.firstName} — ${applicant.position}`;
  const description = [
    `Applicant: ${applicant.candidateName}`,
    `Position: ${applicant.position}`,
    `Business Unit: ${applicant.businessUnitName}`,
    `Interview Type: ${interview.interviewType}`,
    `Panel: ${panel.map(member => member.name).join(', ') || 'Not assigned'}`,
    meetLink ? `Google Meet: ${meetLink}` : '',
  ].filter(Boolean).join('\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TNG HRIS//Recruitment Interview//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${interview.id}@tnghris`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(interview.scheduledStart)}`,
    `DTEND:${toIcsDate(interview.scheduledEnd)}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    interview.location && !meetLink ? `LOCATION:${escapeIcs(interview.location)}` : '',
    meetLink ? `URL:${escapeIcs(meetLink)}` : '',
    `ATTENDEE;CN=${escapeIcs(applicant.candidateName)};RSVP=TRUE:mailto:${applicant.email}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
};

const sendConfirmationEmail = async ({ interview, applicant, panel, attachIcs }: {
  interview: Interview;
  applicant: InterviewCandidateOption;
  panel: User[];
  attachIcs: boolean;
}) => {
  const meetLink = interview.googleMeetLink;
  const subject = `Interview: ${applicant.firstName} — ${applicant.position}`;
  const date = new Date(interview.scheduledStart).toLocaleDateString('en-PH', { dateStyle: 'long' });
  const start = new Date(interview.scheduledStart).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const end = new Date(interview.scheduledEnd).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const text = [
    `Hello ${applicant.firstName},`,
    '',
    `Your interview for ${applicant.position} has been scheduled.`,
    `Date: ${date}`,
    `Time: ${start} - ${end}`,
    `Interview type: ${interview.interviewType}`,
    meetLink ? `Google Meet: ${meetLink}` : interview.location ? `Location: ${interview.location}` : '',
    '',
    'We look forward to speaking with you.',
  ].filter(line => line !== '').join('\n');
  const html = `
    <p>Hello ${escapeHtml(applicant.firstName)},</p>
    <p>Your interview for <strong>${escapeHtml(applicant.position)}</strong> has been scheduled.</p>
    <p><strong>Date:</strong> ${escapeHtml(date)}<br/>
    <strong>Time:</strong> ${escapeHtml(start)} - ${escapeHtml(end)}<br/>
    <strong>Interview type:</strong> ${escapeHtml(interview.interviewType)}</p>
    ${meetLink ? `<p><a href="${escapeHtml(meetLink)}">Join Google Meet</a></p>` : interview.location ? `<p><strong>Location:</strong> ${escapeHtml(interview.location)}</p>` : ''}
    <p>We look forward to speaking with you.</p>
  `;
  const attachments = attachIcs ? [{
    filename: 'interview-invitation.ics',
    contentBase64: toBase64(createIcs({ interview, applicant, panel, meetLink })),
    contentType: 'text/calendar; method=REQUEST; charset=UTF-8',
  }] : undefined;

  const response = await fetch('/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: applicant.email, subject, message: text, html, attachments }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || 'Confirmation email failed to send.');
  }
};

export const scheduleInterviewWorkflow = async ({
  interview,
  options,
  applicant,
  panel,
}: {
  interview: Interview;
  options: InterviewScheduleOptions;
  applicant: InterviewCandidateOption;
  panel: User[];
}): Promise<InterviewScheduleOutcome> => {
  const { data, error } = await supabase.functions.invoke('schedule-interview', {
    body: {
      interviewId: interview.id || null,
      applicationId: interview.applicationId,
      panelUserIds: interview.panelUserIds,
      startAt: new Date(interview.scheduledStart).toISOString(),
      endAt: new Date(interview.scheduledEnd).toISOString(),
      interviewType: interview.interviewType,
      location: interview.location || null,
      notes: interview.notes || null,
      createCalendarEvent: options.createCalendarEvent,
      includeScheduler: options.includeScheduler,
    },
  });
  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (!data?.interview) throw new Error(data?.error || 'The interview could not be saved.');

  const row = data.interview;
  const scheduled: Interview = {
    ...interview,
    id: row.id,
    location: row.google_meet_link || row.location || '',
    googleMeetLink: row.google_meet_link || undefined,
    calendarEventId: row.calendar_event_id || undefined,
  };
  let emailWarning = '';

  try {
    await sendConfirmationEmail({
      interview: scheduled,
      applicant,
      panel,
      attachIcs: row.calendar_invite_status !== 'created',
    });
    const now = new Date().toISOString();
    const emailUpdate: Record<string, any> = {
      confirmation_email_status: 'sent',
      confirmation_email_sent_at: now,
    };
    if (row.calendar_invite_status !== 'created') {
      emailUpdate.applicant_invite_status = 'email_sent';
      emailUpdate.applicant_invite_sent_at = now;
    }
    const { data: updated, error: updateError } = await supabase
      .from('job_interviews')
      .update(emailUpdate)
      .eq('id', row.id)
      .select()
      .single();
    if (updateError) throw updateError;
    Object.assign(row, updated);
  } catch (emailError: any) {
    emailWarning = 'Interview scheduled, but the confirmation email failed to send.';
    await supabase.from('job_interviews').update({
      confirmation_email_status: 'failed',
      calendar_error: [row.calendar_error, emailError?.message].filter(Boolean).join(' | '),
    }).eq('id', row.id);
    row.confirmation_email_status = 'failed';
  }

  const warning = [data.warning, emailWarning].filter(Boolean).join(' ');
  return { row, warning: warning || undefined };
};
