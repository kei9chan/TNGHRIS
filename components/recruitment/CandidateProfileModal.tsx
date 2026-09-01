import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Candidate, Application, ApplicationStage, JobPost, InterviewRatingRecord, Permission } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { usePermissions } from '../../hooks/usePermissions';
import {
  downloadInterviewRatingPdf,
  fetchRatingRecordsForCandidate,
  isInterviewRatingSubmitted,
  removeInterviewRatingAssignment,
} from '../../services/interviewRatingService';
import InterviewRatingEditor from './InterviewRatingEditor';
import CreateInterviewRatingModal from './CreateInterviewRatingModal';

interface CandidateProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Candidate;
  applications: Application[];
  jobPosts: JobPost[];
}

const getStageColor = (stage: ApplicationStage) => {
  switch (stage) {
    case ApplicationStage.Hired: return 'bg-green-100 text-green-800';
    case ApplicationStage.Offer: return 'bg-teal-100 text-teal-800';
    case ApplicationStage.Interview: return 'bg-blue-100 text-blue-800';
    case ApplicationStage.Rejected:
    case ApplicationStage.Withdrawn: return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const displayOverall = (rating: InterviewRatingRecord) => {
  const value = rating.formData?.overall_evaluation;
  return value ? String(value) : '—';
};

const recommendationSummary = (rating: InterviewRatingRecord) => {
  const formData = rating.formData || {};
  const values = ['further_interview', 'active_pool', 'job_offer']
    .filter(key => formData[key] !== undefined && formData[key] !== '')
    .map(key => `${key.replace(/_/g, ' ')}: ${String(formData[key])}`);
  return values.length ? values.join(' · ') : 'No recommendation yet';
};

const CandidateProfileModal: React.FC<CandidateProfileModalProps> = ({ isOpen, onClose, candidate, applications, jobPosts }) => {
  const { can } = usePermissions();
  const canManageInterviews = can('Interviews', Permission.Manage);
  const [ratings, setRatings] = useState<InterviewRatingRecord[]>([]);
  const [isLoadingRatings, setIsLoadingRatings] = useState(false);
  const [ratingsError, setRatingsError] = useState('');
  const [isCreateRatingOpen, setIsCreateRatingOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState<InterviewRatingRecord | null>(null);

  const applicationHistory = useMemo(() => applications
    .filter(app => app.candidateId === candidate.id)
    .map(app => ({ ...app, jobTitle: jobPosts.find(post => post.id === app.jobPostId)?.title || app.roleTitleSnapshot || 'Unknown Position' }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [applications, candidate.id, jobPosts]);

  const loadRatings = useCallback(async () => {
    if (!isOpen) return;
    setIsLoadingRatings(true);
    setRatingsError('');
    try {
      setRatings(await fetchRatingRecordsForCandidate(candidate.id));
    } catch (error: any) {
      console.error('Failed to load interview ratings', error);
      setRatingsError(error?.message || 'Unable to load interview ratings.');
    } finally {
      setIsLoadingRatings(false);
    }
  }, [candidate.id, isOpen]);

  useEffect(() => { loadRatings(); }, [loadRatings]);

  const updateRating = (updated: InterviewRatingRecord) => setRatings(current => current.map(item => item.id === updated.id ? updated : item));
  const removeRating = async (rating: InterviewRatingRecord) => {
    if (!canManageInterviews || isInterviewRatingSubmitted(rating.status) || !window.confirm(`Remove ${rating.reviewerNameSnapshot}'s interview rating assignment?`)) return;
    try {
      await removeInterviewRatingAssignment(rating.id);
      setRatings(current => current.filter(item => item.id !== rating.id));
    } catch (error: any) {
      setRatingsError(error?.message || 'Unable to remove the interview rating assignment.');
    }
  };
  const submittedCount = ratings.filter(rating => isInterviewRatingSubmitted(rating.status)).length;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={`Candidate Profile: ${candidate.firstName} ${candidate.lastName}`} size="5xl" footer={<div className="flex justify-end w-full"><Button variant="secondary" onClick={onClose}>Close</Button></div>}>
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 border-b pb-2 text-lg font-medium text-gray-900 dark:border-slate-700 dark:text-white">Personal Information</h3>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt><dd className="mt-1 text-sm text-gray-900 dark:text-white"><a href={`mailto:${candidate.email}`} className="text-indigo-600 dark:text-indigo-400">{candidate.email}</a></dd></div>
              <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone</dt><dd className="mt-1 text-sm text-gray-900 dark:text-white">{candidate.phone || 'N/A'}</dd></div>
              <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Source</dt><dd className="mt-1 text-sm text-gray-900 dark:text-white">{candidate.source || 'N/A'}</dd></div>
              <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Tags</dt><dd className="mt-1 text-sm text-gray-900 dark:text-white">{candidate.tags?.length ? candidate.tags.map(tag => <span key={tag} className="mr-1 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">{tag}</span>) : 'N/A'}</dd></div>
            </dl>
          </section>

          <section>
            <h3 className="mb-2 border-b pb-2 text-lg font-medium text-gray-900 dark:border-slate-700 dark:text-white">Application History</h3>
            {applicationHistory.length > 0 ? <ul className="max-h-64 space-y-3 overflow-y-auto pr-2">{applicationHistory.map(app => <li key={app.id} className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50"><div className="flex items-start justify-between"><div><p className="font-semibold text-gray-800 dark:text-gray-200">{app.jobTitle}</p><p className="text-xs text-gray-500 dark:text-gray-400">Applied on: {new Date(app.createdAt).toLocaleDateString()}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${getStageColor(app.stage)}`}>{app.stage}</span></div>{app.notes && <p className="mt-2 text-sm italic text-gray-600 dark:text-gray-400">Note: “{app.notes}”</p>}</li>)}</ul> : <p className="text-sm text-gray-500 dark:text-gray-400">No application history found for this candidate.</p>}
          </section>

          <section>
            <div className="flex flex-col justify-between gap-3 border-b pb-2 sm:flex-row sm:items-center dark:border-slate-700"><div><h3 className="text-lg font-medium text-gray-900 dark:text-white">Interview Ratings</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{submittedCount} of {ratings.length} Submitted</p></div>{canManageInterviews && <Button size="sm" onClick={() => setIsCreateRatingOpen(true)}>+ Create Interview Rating</Button>}</div>
            {ratingsError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{ratingsError}</div>}
            {isLoadingRatings ? <p className="mt-4 text-sm text-slate-500">Loading reviewer forms…</p> : ratings.length === 0 ? <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-slate-700">No interview ratings have been assigned.</div> : <div className="mt-4 space-y-3">{ratings.map(rating => <Card key={rating.id} className="border border-slate-200 shadow-none dark:border-slate-700"><div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900 dark:text-white">{rating.reviewerNameSnapshot}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">{rating.status}</span></div><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{rating.reviewerPositionSnapshot || 'Position not recorded'} · {rating.interviewRound} · Template v{rating.templateVersion}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300"><span>Overall: <strong>{displayOverall(rating)}</strong></span><span>{recommendationSummary(rating)}</span><span>Submitted: {rating.submittedAt?.toLocaleDateString() || '—'}</span></div></div><div className="flex shrink-0 flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setSelectedRating(rating)}>View rating</Button><Button size="sm" variant="secondary" onClick={() => downloadInterviewRatingPdf(rating, candidate).catch(error => setRatingsError(error?.message || 'Unable to generate PDF.'))}>Download PDF</Button>{canManageInterviews && !isInterviewRatingSubmitted(rating.status) && <Button size="sm" variant="danger" onClick={() => void removeRating(rating)}>Remove</Button>}</div></div></Card>)}</div>}
          </section>
        </div>
      </Modal>

      <CreateInterviewRatingModal isOpen={isCreateRatingOpen} onClose={() => setIsCreateRatingOpen(false)} candidate={candidate} applications={applications} jobPosts={jobPosts} onAssigned={async assigned => { setRatings(current => { const byId = new Map<string, InterviewRatingRecord>(current.map(item => [item.id, item] as [string, InterviewRatingRecord])); assigned.forEach(item => byId.set(item.id, item)); return Array.from(byId.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); }); await loadRatings(); }} />

      {selectedRating && <Modal isOpen={true} onClose={() => setSelectedRating(null)} title={`Interview Rating · ${selectedRating.reviewerNameSnapshot}`} size="5xl"><InterviewRatingEditor rating={selectedRating} candidate={candidate} onUpdated={updated => { updateRating(updated); setSelectedRating(updated); }} /></Modal>}
    </>
  );
};

export default CandidateProfileModal;
