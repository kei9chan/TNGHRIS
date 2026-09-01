import React, { useMemo, useState } from 'react';
import { Interview, InterviewFeedback, User, Application, Candidate, JobPost } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import InterviewFeedbackForm from './InterviewFeedbackForm';

interface InterviewDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  interview: Interview;
  feedbacks: InterviewFeedback[];
  onSaveFeedback: (feedback: InterviewFeedback) => void;
  applications: Application[];
  candidates: Candidate[];
  users: User[];
  jobPosts?: JobPost[];
  businessUnitNames?: Record<string, string>;
  onRetryCalendar?: (interview: Interview) => Promise<void>;
  onReschedule?: (interview: Interview) => void;
  onCancelInterview?: (interview: Interview) => Promise<void>;
}

const DetailItem: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div>
    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
    <dd className="mt-1 text-sm text-gray-900 dark:text-white">{value || 'N/A'}</dd>
  </div>
);

const statusLabel = (value?: string) => {
  if (!value || value === 'not_requested') return 'Not requested';
  if (value === 'sent') return 'Sent';
  if (value === 'failed') return 'Failed';
  return value;
};

const InterviewDetailModal: React.FC<InterviewDetailModalProps> = ({
  isOpen,
  onClose,
  interview,
  feedbacks,
  onSaveFeedback,
  applications,
  candidates,
  users,
  jobPosts = [],
  businessUnitNames = {},
  onRetryCalendar,
  onReschedule,
  onCancelInterview,
}) => {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const application = applications.find((item) => item.id === interview.applicationId);
  const candidate = candidates.find((item) => item.id === application?.candidateId);
  const jobPost = jobPosts.find((item) => item.id === application?.jobPostId);
  const panel = users.filter((item) => interview.panelUserIds?.includes(item.id));
  const position = application?.roleTitleSnapshot || jobPost?.title || 'General Application';
  const businessUnit = businessUnitNames[jobPost?.businessUnitId || ''] || 'TNG HRIS';
  const meetingLink = interview.attendeeMeetingUrl
    || interview.googleMeetLink
    || (interview.location?.startsWith('https://') ? interview.location : '');
  const validMeetingLink = /^https:\/\//i.test(meetingLink);
  const meetingProvider = interview.meetingProvider || (interview.googleMeetLink ? 'Google Meet' : meetingLink ? 'Custom' : undefined);
  const currentUserIsOnPanel = user ? (interview.panelUserIds || []).includes(user.id) : false;
  const currentUserFeedback = currentUserIsOnPanel ? feedbacks.find((feedback) => feedback.reviewerUserId === user?.id) : null;

  const inviteRows = useMemo(() => [
    { label: 'Applicant calendar invite', status: interview.applicantInviteStatus || interview.calendarInviteStatus },
    { label: 'Panel calendar invites', status: interview.panelInviteStatus || interview.calendarInviteStatus },
    { label: 'Confirmation email', status: interview.confirmationEmailStatus },
  ], [interview.applicantInviteStatus, interview.calendarInviteStatus, interview.confirmationEmailStatus, interview.panelInviteStatus]);

  const handleCopy = async () => {
    if (!validMeetingLink) return;
    await navigator.clipboard.writeText(meetingLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Interview Details: ${candidate ? `${candidate.firstName} ${candidate.lastName}` : 'Interview'}`}
      footer={<div className="flex justify-end w-full"><Button variant="secondary" onClick={onClose}>Close</Button></div>}
      size="3xl"
    >
      <div className="space-y-6">
        {interview.calendarError ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">{interview.calendarError}</div> : interview.calendarEventId && <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">Interview scheduled successfully. Google Calendar event created.</div>}

        <section>
          <h3 className="mb-3 border-b pb-2 text-lg font-medium text-gray-900 dark:border-gray-700 dark:text-white">Applicant</h3>
          <dl className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            <DetailItem label="Full name" value={candidate ? `${candidate.firstName} ${candidate.lastName}` : 'N/A'} />
            <DetailItem label="Email" value={candidate?.email} />
            <DetailItem label="Position applied" value={position} />
            <DetailItem label="Business unit" value={businessUnit} />
          </dl>
        </section>

        <section>
          <h3 className="mb-3 border-b pb-2 text-lg font-medium text-gray-900 dark:border-gray-700 dark:text-white">Schedule</h3>
          <dl className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            <DetailItem label="Date" value={new Date(interview.scheduledStart).toLocaleDateString()} />
            <DetailItem label="Time" value={`${new Date(interview.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(interview.scheduledEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`} />
            <DetailItem label="Type" value={interview.interviewType} />
            {meetingProvider && <DetailItem label="Meeting provider" value={meetingProvider} />}
            {interview.zoomHostEmail && <DetailItem label="Company Zoom host" value={interview.zoomHostEmail} />}
            {interview.zoomAlternativeHostEmails?.length ? <DetailItem label="Zoom alternative hosts" value={interview.zoomAlternativeHostEmails.join(', ')} /> : null}
            <DetailItem label="Panel" value={panel.map((person) => person.name).join(', ')} />
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Location / Link</dt>
              <dd className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {interview.interviewType === 'Virtual' ? validMeetingLink ? <>
                  <a href={meetingLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-md border border-green-300 bg-green-50 px-3 py-2 font-medium text-green-700 hover:bg-green-100 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300">Join {meetingProvider || 'meeting'} ↗</a>
                  <Button variant="secondary" onClick={handleCopy}>{copied ? 'Copied' : 'Copy meeting link'}</Button>
                </> : <span className="text-amber-700 dark:text-amber-300">No valid attendee meeting link saved</span> : interview.location || 'N/A'}
              </dd>
            </div>
            {interview.googleCalendarLink && <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Google Calendar</dt>
              <dd className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <a href={interview.googleCalendarLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2 font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300">View in Google Calendar ↗</a>
                {interview.calendarEventId && <span className="text-xs text-gray-500">Event ID: {interview.calendarEventId}</span>}
              </dd>
            </div>}
          </dl>
        </section>

        {(onRetryCalendar || onReschedule || onCancelInterview) && interview.status !== 'Cancelled' && (
          <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/30">
            {onRetryCalendar && (!interview.calendarEventId || interview.calendarInviteStatus === 'failed') && <Button variant="secondary" onClick={() => onRetryCalendar(interview)}>Retry Calendar Invitation</Button>}
            {onReschedule && <Button variant="secondary" onClick={() => onReschedule(interview)}>Reschedule Interview</Button>}
            {onCancelInterview && <Button variant="danger" onClick={() => onCancelInterview(interview)}>Cancel Interview</Button>}
          </div>
        )}

        <section>
          <h3 className="mb-3 border-b pb-2 text-lg font-medium text-gray-900 dark:border-gray-700 dark:text-white">Invitations</h3>
          <div className="space-y-2">
            {inviteRows.map((row) => <div key={row.label} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900/40"><span>{row.label}</span><span className={`rounded-full px-2 py-1 text-xs font-medium ${row.status === 'sent' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : row.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>{statusLabel(row.status)}</span></div>)}
          </div>
          {interview.calendarAttendeeStatuses && interview.calendarAttendeeStatuses.length > 0 && <div className="mt-3 space-y-1"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">RSVP status</p>{interview.calendarAttendeeStatuses.map((attendee) => <div key={attendee.email} className="flex items-center justify-between gap-3 text-xs text-gray-600 dark:text-gray-300"><span className="truncate">{attendee.displayName || attendee.email}</span><span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 dark:bg-gray-700">{attendee.responseStatus || 'needsAction'}</span></div>)}</div>}
        </section>

        <section>
          <h3 className="mb-3 border-b pb-2 text-lg font-medium text-gray-900 dark:border-gray-700 dark:text-white">Feedback & Scorecards</h3>
          {currentUserIsOnPanel && !currentUserFeedback && <InterviewFeedbackForm interviewId={interview.id} onSubmit={onSaveFeedback} />}
          <div className="mt-4 space-y-4">
            {feedbacks.map((feedback) => {
              const reviewer = users.find((item) => item.id === feedback.reviewerUserId);
              return <div key={feedback.id} className="rounded-lg border bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                <div className="mb-3 flex items-center justify-between"><p className="font-semibold">{reviewer?.name || 'Panel reviewer'}</p><span className="rounded border bg-white px-2 py-1 font-bold dark:border-gray-600 dark:bg-gray-800">★ {feedback.score}/5</span></div>
                {feedback.competencyScores && <div className="mb-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">{Object.entries(feedback.competencyScores).map(([competency, score]) => <div key={competency} className="flex justify-between border-b border-dotted pb-1 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-400"><span>{competency}</span><span className="font-mono font-bold">{score}/5</span></div>)}</div>}
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2"><div className="rounded border bg-white p-2 dark:border-gray-600 dark:bg-gray-800"><span className="mb-1 block text-xs font-bold uppercase text-green-600">Strengths</span>{feedback.strengths}</div><div className="rounded border bg-white p-2 dark:border-gray-600 dark:bg-gray-800"><span className="mb-1 block text-xs font-bold uppercase text-red-600">Concerns</span>{feedback.concerns}</div></div>
              </div>;
            })}
            {feedbacks.length === 0 && <p className="py-4 text-center text-sm italic text-gray-500">No feedback submitted yet.</p>}
          </div>
        </section>
      </div>
    </Modal>
  );
};

export default InterviewDetailModal;
