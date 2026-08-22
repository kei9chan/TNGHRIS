
import React, { useEffect, useMemo, useState } from 'react';
import { Interview, InterviewFeedback, User, Application, Candidate, JobPost, BusinessUnit, InterviewInviteStatus } from '../../types';
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
  jobPosts: JobPost[];
  businessUnits: BusinessUnit[];
  users: User[];
}

const DetailItem: React.FC<{label: string, value?: React.ReactNode}> = ({label, value}) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

const CalendarIcon = () => (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M5 11h14M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" /></svg>
);

const CopyIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 8h11v11H8zM5 16H4a1 1 0 01-1-1V4a1 1 0 011-1h11a1 1 0 011 1v1" /></svg>
);

const ExternalLinkIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5h5v5m0-5L10 14M19 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6" /></svg>
);

const getValidGoogleMeetUrl = (location?: string): string | null => {
    if (!location) return null;
    try {
        const url = new URL(location.trim());
        const hasMeetingCode = /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname);
        return url.protocol === 'https:' && url.hostname === 'meet.google.com' && hasMeetingCode
            ? url.toString()
            : null;
    } catch {
        return null;
    }
};

const getValidGoogleCalendarUrl = (value?: string): string | null => {
    if (!value) return null;
    try {
        const url = new URL(value.trim());
        const allowedHost = url.hostname === 'calendar.google.com' || url.hostname === 'www.google.com';
        return url.protocol === 'https:' && allowedHost ? url.toString() : null;
    } catch {
        return null;
    }
};

const statusPresentation = (status?: InterviewInviteStatus) => {
    if (status === 'created' || status === 'sent' || status === 'email_sent') return {
        label: status === 'email_sent' ? 'Email sent' : 'Sent',
        classes: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
    };
    if (status === 'failed') return { label: 'Failed', classes: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' };
    if (status === 'pending') return { label: 'Pending', classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' };
    return { label: 'Not requested', classes: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' };
};

const InviteStatusRow: React.FC<{ label: string; status?: InterviewInviteStatus; sentAt?: Date }> = ({ label, status, sentAt }) => {
    const presentation = statusPresentation(status);
    return (
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-3 last:border-b-0 dark:border-gray-700">
            <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
                {sentAt && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{new Date(sentAt).toLocaleString()}</p>}
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${presentation.classes}`}>{presentation.label}</span>
        </div>
    );
};

const InterviewDetailModal: React.FC<InterviewDetailModalProps> = ({ isOpen, onClose, interview, feedbacks, onSaveFeedback, applications, candidates, jobPosts, businessUnits, users }) => {
    const { user } = useAuth();
    const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

    const application = applications.find(a => a.id === interview.applicationId) as Application | undefined;
    const candidate = candidates.find(c => c.id === application?.candidateId);
    const jobPost = jobPosts.find(post => post.id === application?.jobPostId);
    const businessUnit = businessUnits.find(unit => unit.id === jobPost?.businessUnitId);
    const panel = users.filter(u => (interview.panelUserIds || []).includes(u.id));
    const meetingUrl = useMemo(() => getValidGoogleMeetUrl(interview.googleMeetLink || interview.location), [interview.googleMeetLink, interview.location]);
    const calendarUrl = useMemo(() => getValidGoogleCalendarUrl(interview.googleCalendarLink), [interview.googleCalendarLink]);
    const candidateName = candidate ? `${candidate.firstName} ${candidate.lastName}` : 'Unknown applicant';

    const currentUserIsOnPanel = user ? (interview.panelUserIds || []).includes(user.id) : false;
    const currentUserFeedback = currentUserIsOnPanel ? feedbacks.find(f => f.reviewerUserId === user?.id) : null;

    useEffect(() => {
        setCopyState('idle');
    }, [interview.id, isOpen]);

    const copyMeetingLink = async () => {
        if (!meetingUrl) return;
        try {
            await navigator.clipboard.writeText(meetingUrl);
            setCopyState('copied');
        } catch {
            setCopyState('failed');
        }
    };
    
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Interview Details: ${candidateName}`}
            footer={<div className="flex justify-end w-full"><Button variant="secondary" onClick={onClose}>Close</Button></div>}
            size="2xl"
        >
            <div className="space-y-6">
                <section className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
                    <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-white p-2 text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300"><CalendarIcon /></div>
                        <div className="min-w-0">
                            <p className="truncate font-semibold text-gray-900 dark:text-white">{candidateName}</p>
                            <p className="truncate text-sm text-gray-600 dark:text-gray-300">{jobPost?.title || 'Position unavailable'}</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{businessUnit?.name || 'Business unit unavailable'}</p>
                        </div>
                    </div>
                </section>

                <section>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b pb-2 mb-2">Schedule</h3>
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                        <DetailItem label="Applicant" value={candidateName} />
                        <DetailItem label="Position Applied" value={jobPost?.title || 'Position unavailable'} />
                        <DetailItem label="Business Unit" value={businessUnit?.name || 'Business unit unavailable'} />
                        <DetailItem label="Status" value={interview.status} />
                        <DetailItem label="Date" value={new Date(interview.scheduledStart).toLocaleDateString()} />
                        <DetailItem label="Time" value={`${new Date(interview.scheduledStart).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - ${new Date(interview.scheduledEnd).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`} />
                        <DetailItem label="Type" value={interview.interviewType} />
                        {interview.interviewType !== 'Virtual' && <DetailItem label="Location" value={interview.location || 'No location provided'} />}
                        <div className="sm:col-span-2">
                            <DetailItem label="Interview Panel" value={panel.length ? panel.map(p => p.name).join(', ') : 'No panel members recorded'} />
                        </div>
                    </dl>

                    {interview.interviewType === 'Virtual' && (
                        <div className="mt-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                            <p className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">Location / Google Meet</p>
                            {meetingUrl ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <a href={meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300 dark:hover:bg-green-950/70">
                                        Join Google Meet <ExternalLinkIcon />
                                    </a>
                                    <button type="button" onClick={copyMeetingLink} className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                                        <CopyIcon /> {copyState === 'copied' ? 'Copied' : 'Copy meeting link'}
                                    </button>
                                    {copyState === 'failed' && <span className="text-xs text-red-600 dark:text-red-400">Could not copy the link.</span>}
                                </div>
                            ) : (
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                                    No valid meeting link generated
                                </div>
                            )}
                        </div>
                    )}
                </section>

                <section>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b pb-2 mb-3">Calendar Invite Status</h3>
                    {(calendarUrl || interview.calendarEventId) && (
                        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                            {calendarUrl && (
                                <a href={calendarUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
                                    View in Google Calendar <ExternalLinkIcon />
                                </a>
                            )}
                            {interview.calendarEventId && (
                                <span className="min-w-0 break-all text-xs text-gray-500 dark:text-gray-400">Event ID: {interview.calendarEventId}</span>
                            )}
                        </div>
                    )}
                    <div className="rounded-lg border border-gray-200 px-4 dark:border-gray-700">
                        <InviteStatusRow label="Google Calendar event" status={interview.calendarInviteStatus} />
                        <InviteStatusRow label="Applicant calendar invite" status={interview.applicantInviteStatus} sentAt={interview.applicantInviteSentAt} />
                        <InviteStatusRow label="Panel calendar invites" status={interview.panelInviteStatus} sentAt={interview.panelInviteSentAt} />
                        <InviteStatusRow label="Confirmation email" status={interview.confirmationEmailStatus} sentAt={interview.confirmationEmailSentAt} />
                    </div>
                    {interview.calendarError && (
                        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                            {interview.calendarError}
                        </div>
                    )}
                </section>

                {interview.notes && (
                    <section>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b pb-2 mb-2">Interview Notes</h3>
                        <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{interview.notes}</p>
                    </section>
                )}
                
                <section>
                     <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b pb-2 mb-2">Feedback & Scorecards</h3>
                    {currentUserIsOnPanel && !currentUserFeedback && (
                         <InterviewFeedbackForm interviewId={interview.id} onSubmit={onSaveFeedback} />
                    )}

                    <div className="space-y-4 mt-4">
                        {feedbacks.map(feedback => {
                             const reviewer = users.find(u => u.id === feedback.reviewerUserId);
                             return (
                                <div key={feedback.id} className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border dark:border-gray-700">
                                    <div className="flex justify-between items-center mb-3">
                                        <p className="font-semibold text-gray-900 dark:text-white">{reviewer?.name}</p>
                                        <div className="flex items-center bg-white dark:bg-gray-800 px-2 py-1 rounded border dark:border-gray-600">
                                            <span className="text-yellow-500 mr-1">★</span>
                                            <span className="font-bold">{feedback.score}/5</span>
                                        </div>
                                    </div>

                                    {feedback.competencyScores && (
                                        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                            {Object.entries(feedback.competencyScores).map(([comp, score]) => (
                                                <div key={comp} className="flex justify-between items-center text-xs text-gray-600 dark:text-gray-400 border-b border-dotted dark:border-gray-700 pb-1">
                                                    <span>{comp}</span>
                                                    <span className="font-mono font-bold">{score}/5</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 gap-2 text-sm">
                                        <div className="bg-white dark:bg-gray-800 p-2 rounded border dark:border-gray-600">
                                            <span className="font-bold block text-xs uppercase text-green-600 mb-1">Strengths</span>
                                            {feedback.strengths}
                                        </div>
                                        <div className="bg-white dark:bg-gray-800 p-2 rounded border dark:border-gray-600">
                                            <span className="font-bold block text-xs uppercase text-red-600 mb-1">Concerns</span>
                                            {feedback.concerns}
                                        </div>
                                    </div>

                                    <div className="mt-3 flex justify-between items-center">
                                        <span className="text-sm font-medium">Recommendation: <span className={`font-bold ${feedback.hireRecommendation === 'Yes' ? 'text-green-600' : feedback.hireRecommendation === 'No' ? 'text-red-600' : 'text-yellow-600'}`}>{feedback.hireRecommendation}</span></span>
                                        <span className="text-xs text-gray-500">Submitted: {new Date(feedback.submittedAt).toLocaleDateString()}</span>
                                    </div>
                                </div>
                             )
                        })}
                        {feedbacks.length === 0 && <p className="text-sm text-gray-500 italic text-center py-4">No feedback submitted yet.</p>}
                    </div>
                </section>
            </div>
        </Modal>
    );
};

export default InterviewDetailModal;
