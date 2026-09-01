import React, { useMemo, useState } from 'react';
import { Application, Candidate, InterviewRatingRecord } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import {
  createInterviewRatingSummary,
  getInterviewAnswerText,
  InterviewCriterionSummary,
  InterviewRatingSummary,
} from '../../services/interviewRatingSummary';
import { downloadCombinedInterviewRatingsPdf } from '../../services/interviewRatingService';

interface InterviewSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Candidate;
  ratings: InterviewRatingRecord[];
  application?: Application;
  position?: string;
  businessUnit?: string;
  onViewRating?: (rating: InterviewRatingRecord) => void;
  onViewOriginalForms?: () => void;
}

const recommendationValue = (value: string) => value || 'Not answered';
const reviewerStatusClasses: Record<InterviewRatingRecord['status'], string> = {
  'Not Started': 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200',
  Draft: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
  Submitted: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  'Returned for Revision': 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200',
  Locked: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200',
};

const CriterionRow: React.FC<{ criterion: InterviewCriterionSummary }> = ({ criterion }) => {
  const [showResponses, setShowResponses] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1"><p className="font-semibold text-slate-800 dark:text-slate-100">{criterion.label}</p><p className="text-xs text-slate-500 dark:text-slate-400">{criterion.answeredCount} of {criterion.reviewerCount} reviewers answered</p></div>
        <div className="w-28 shrink-0 sm:w-44"><div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-violet-600" style={{ width: `${criterion.percentage || 0}%` }} /></div></div>
        <div className="w-20 shrink-0 text-right"><p className="font-bold text-slate-900 dark:text-white">{criterion.average === undefined ? '—' : `${criterion.average.toFixed(1)} / 5`}</p><p className="text-xs font-semibold text-violet-700 dark:text-violet-300">{criterion.ratingLabel || 'Not answered'}</p></div>
      </div>
      {criterion.responses.length > 0 && <button type="button" onClick={() => setShowResponses(value => !value)} className="mt-2 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-300">{showResponses ? 'Hide individual responses' : 'View individual responses'}</button>}
      {showResponses && <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-sm dark:border-slate-700">{criterion.responses.map(response => <div key={`${criterion.id}-${response.ratingId}`} className="flex flex-wrap justify-between gap-2"><span className="text-slate-600 dark:text-slate-300">{response.reviewerName}</span><span className="font-semibold text-slate-900 dark:text-white">{response.label} ({response.value})</span></div>)}</div>}
    </div>
  );
};

const InterviewSummaryModal: React.FC<InterviewSummaryModalProps> = ({
  isOpen,
  onClose,
  candidate,
  ratings,
  application,
  position,
  businessUnit,
  onViewRating,
  onViewOriginalForms,
}) => {
  const summary: InterviewRatingSummary = useMemo(() => createInterviewRatingSummary(ratings), [ratings]);
  const [expandedWritten, setExpandedWritten] = useState<string | null>(null);
  const candidateName = `${candidate.firstName} ${candidate.lastName}`.trim();
  const derivedPosition = position || application?.roleTitleSnapshot || 'Position not recorded';
  const interviewRound = ratings[0]?.interviewRound || 'Interview round not recorded';
  const [error, setError] = useState('');

  const downloadPdf = async () => {
    setError('');
    try { await downloadCombinedInterviewRatingsPdf(ratings, candidate); } catch (reason: any) { setError(reason?.message || 'Unable to generate the combined PDF.'); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Interview Summary · ${candidateName}`} size="5xl">
      <div className="space-y-5">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500 dark:text-slate-400"><span>{candidateName}</span><span>{derivedPosition}</span><span>{businessUnit || 'Business unit not recorded'}</span><span>{interviewRound}</span></div>

        {summary.submittedReviewers === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700"><p className="text-lg font-bold text-slate-900 dark:text-white">No interview rating submitted yet</p><p className="mt-1 text-sm text-slate-500">There is no score or recommendation to summarize.</p></div> : <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/30"><p className="text-3xl font-black text-violet-700 dark:text-violet-300">{summary.overallScore === undefined ? '—' : summary.overallScore.toFixed(1)} <span className="text-sm">/ 5.0</span></p><p className="mt-1 text-sm font-semibold">{summary.overallLabel || 'Score not available'}</p><p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Overall interview score</p></div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Recommendation</p><p className="mt-2 font-bold text-emerald-700 dark:text-emerald-300">{summary.quickRecommendation || 'No recommendation yet'}</p><p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{summary.recommendationState}</p></div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30"><p className="text-3xl font-black text-blue-700 dark:text-blue-300">{summary.submittedReviewers} of {summary.totalReviewers}</p><p className="mt-1 text-sm font-semibold">reviewers submitted</p><p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{summary.preliminary ? 'Preliminary score' : summary.status}</p></div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Score basis</p><p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Average across all submitted rating criteria</p><p className="mt-2 text-xs text-slate-500">Rating scale: Very Good = 5 through Very Poor = 1.</p></div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h2 className="text-lg font-bold text-slate-900 dark:text-white">Rating Breakdown</h2><div className="mt-3 space-y-2">{summary.criteria.map(criterion => <CriterionRow key={criterion.id} criterion={criterion} />)}</div></section>
            <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900 dark:text-white">Reviewer Consensus</h2><span className="text-xs font-semibold text-slate-500">{summary.recommendationState}</span></div><div className="mt-3 space-y-3">{summary.reviewers.map(reviewer => <article key={reviewer.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-900 dark:text-white">{reviewer.name}</p><p className="text-sm text-slate-500 dark:text-slate-400">{reviewer.position || 'Position not recorded'}</p>{reviewer.submittedAt && <p className="mt-1 text-xs text-slate-500">Submitted: {reviewer.submittedAt.toLocaleString()}</p>}</div><span className={`rounded-full px-2 py-1 text-xs font-bold ${reviewerStatusClasses[reviewer.status]}`}>{reviewer.status}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><p className="text-slate-500">Overall Evaluation</p><p className="font-bold">{reviewer.overallEvaluation || 'Not answered'}</p></div><div><p className="text-slate-500">Criterion average</p><p className="font-bold">{reviewer.score === undefined ? '—' : `${reviewer.score.toFixed(1)} / 5`}</p></div><div><p className="text-slate-500">Further Interview</p><p className="font-bold">{recommendationValue(reviewer.recommendations.further_interview)}</p></div><div><p className="text-slate-500">Active Pool</p><p className="font-bold">{recommendationValue(reviewer.recommendations.active_pool)}</p></div><div><p className="text-slate-500">Job Offer</p><p className="font-bold">{recommendationValue(reviewer.recommendations.job_offer)}</p></div></div>{onViewRating && <button type="button" onClick={() => onViewRating(ratings.find(rating => rating.id === reviewer.id)!)} className="mt-3 text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-300">View rating</button>}</article>)}</div></section>
          </div>

          <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h2 className="text-lg font-bold text-slate-900 dark:text-white">Written Evaluation Highlights</h2><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">{summary.writtenHighlights.map(highlight => <details key={highlight.id} open={expandedWritten === highlight.id} onToggle={event => setExpandedWritten((event.currentTarget as HTMLDetailsElement).open ? highlight.id : null)} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><summary className="cursor-pointer list-none font-semibold text-slate-800 dark:text-slate-100">{highlight.label}<span className="float-right text-slate-400">⌄</span></summary><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{highlight.summary}</p>{highlight.responses.length > 0 && <div className="mt-3 space-y-2 border-t border-slate-100 pt-2 text-xs dark:border-slate-700">{highlight.responses.map(response => <div key={`${highlight.id}-${response.ratingId}`}><p className="font-semibold text-slate-700 dark:text-slate-200">{response.reviewerName}</p><p className="mt-0.5 whitespace-pre-wrap text-slate-500 dark:text-slate-400">{response.text}</p></div>)}</div>}</details>)}</div></section>
        </>}

        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700"><div className="flex flex-wrap gap-2"><button type="button" onClick={onViewOriginalForms || (() => onViewRating?.(ratings[0]))} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">View original rating forms</button><button type="button" onClick={() => onViewRating?.(ratings[0])} disabled={!onViewRating || ratings.length === 0} className="rounded-lg border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50 dark:border-violet-800 dark:bg-slate-900 dark:text-violet-300">View individual reviewer ratings</button><Button variant="secondary" onClick={() => void downloadPdf()} disabled={ratings.length === 0}>Download combined PDF</Button></div><Button variant="secondary" onClick={onClose}>Close</Button></div>
      </div>
    </Modal>
  );
};

export default InterviewSummaryModal;
