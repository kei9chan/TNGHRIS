import React from 'react';
import { InterviewRatingSummary } from '../../services/interviewRatingSummary';

interface InterviewSummaryPanelProps {
  summary: InterviewRatingSummary;
  onViewDetailed?: () => void;
  onViewFullRatings?: () => void;
  onDownloadPdf?: () => void;
  onCreateRating?: () => void;
}

const statusClasses: Record<InterviewRatingSummary['status'], string> = {
  Complete: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  'In Progress': 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
  Pending: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200',
};

const InterviewSummaryPanel: React.FC<InterviewSummaryPanelProps> = ({
  summary,
  onViewDetailed,
  onViewFullRatings,
  onDownloadPdf,
  onCreateRating,
}) => {
  if (summary.submittedReviewers === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Interview Summary</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">No interview rating submitted yet</p>
          </div>
          {onCreateRating && <button type="button" onClick={onCreateRating} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">+ Create Interview Rating</button>}
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">A score and recommendation will appear after at least one reviewer submits a rating.</p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/60 p-4 shadow-sm dark:border-violet-900/60 dark:from-slate-800 dark:to-violet-950/30 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Interview Summary</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A decision-friendly view of submitted reviewer ratings.</p>
        </div>
        {onCreateRating && <button type="button" onClick={onCreateRating} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">+ Create Interview Rating</button>}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(210px,0.8fr)_minmax(220px,0.8fr)_minmax(320px,1.4fr)]">
        <div className="rounded-xl border border-violet-200 bg-white p-4 dark:border-violet-900 dark:bg-slate-900/60">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Overall interview score</p>
          <p className="mt-2 text-4xl font-black text-violet-700 dark:text-violet-300">{summary.overallScore === undefined ? '—' : summary.overallScore.toFixed(1)} <span className="text-base font-semibold text-slate-500">/ 5.0</span></p>
          <p className="mt-1 font-semibold text-violet-700 dark:text-violet-300">{summary.overallLabel || 'Score not available'}</p>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Based on submitted reviewer ratings</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-white p-4 dark:border-emerald-900 dark:bg-slate-900/60">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recommendation</p>
          <p className="mt-2 text-lg font-bold text-emerald-700 dark:text-emerald-300">{summary.quickRecommendation || 'No recommendation yet'}</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Reviewer-selected recommendations remain visible in the detailed summary.</p>
          <span className="mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-100">{summary.recommendationState}</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Reviewer completion</p>
              <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{summary.submittedReviewers} of {summary.totalReviewers} reviewers submitted</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClasses[summary.status]}`}>{summary.status}</span>
          </div>
          {summary.preliminary && <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">Preliminary score — more reviewer ratings are pending.</p>}
          <div className="mt-4 grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {summary.criteria.map(criterion => (
              <div key={criterion.id}>
                <div className="flex items-center justify-between gap-2 text-xs"><span className="truncate font-semibold text-slate-700 dark:text-slate-200">{criterion.label}</span><span className="shrink-0 text-slate-500 dark:text-slate-400">{criterion.average === undefined ? '—' : criterion.average.toFixed(1)}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-violet-600" style={{ width: `${criterion.percentage || 0}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {onViewDetailed && <button type="button" onClick={onViewDetailed} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">View detailed summary</button>}
        {onViewFullRatings && <button type="button" onClick={onViewFullRatings} className="rounded-lg border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:bg-slate-900 dark:text-violet-300">View full ratings</button>}
        {onDownloadPdf && <button type="button" onClick={onDownloadPdf} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Download PDF</button>}
      </div>
    </section>
  );
};

export default InterviewSummaryPanel;
