import React from 'react';
import Button from '../ui/Button';

export interface EvaluationCategoryScore {
  id: string;
  name: string;
  description: string;
  score: number;
  maxScore: number;
  usedWeight: number;
}

interface EvaluationResultSummaryProps {
  employeeName: string;
  score: number;
  maxScore?: number;
  usedWeight: number;
  completedComponents: number;
  totalComponents: number;
  status: string;
  categories: EvaluationCategoryScore[];
  onViewDetails?: () => void;
  onViewFull?: () => void;
  onDownloadPdf?: () => void;
}

export const getEvaluationPerformanceLabel = (score: number, hasScore = true) => {
  if (!hasScore) return 'Pending';
  if (score >= 4.5) return 'Excellent';
  if (score >= 3.5) return 'Good';
  if (score >= 2.5) return 'Fair';
  return 'Needs Improvement';
};

const EvaluationResultSummary: React.FC<EvaluationResultSummaryProps> = ({
  employeeName,
  score,
  maxScore = 5,
  usedWeight,
  completedComponents,
  totalComponents,
  status,
  categories,
  onViewDetails,
  onViewFull,
  onDownloadPdf,
}) => {
  const hasScore = usedWeight > 0;
  const label = getEvaluationPerformanceLabel(score, hasScore);
  const completionPercentage = totalComponents > 0 ? Math.round((completedComponents / totalComponents) * 100) : 0;

  return (
    <section className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm dark:border-violet-900/60 dark:bg-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">{employeeName}</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Evaluation result summary</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${status === 'Acknowledged' || status === 'Completed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'}`}>
          {status}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-violet-200 p-4 dark:border-violet-800">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Overall score</p>
          <p className="mt-2 text-4xl font-black text-violet-700 dark:text-violet-300">
            {hasScore ? score.toFixed(2) : '—'} <span className="text-lg font-semibold text-slate-500">/ {maxScore.toFixed(1)}</span>
          </p>
          <p className="mt-2 font-bold text-violet-700 dark:text-violet-300">{label}</p>
        </div>

        <div className="rounded-xl border border-emerald-200 p-4 dark:border-emerald-800">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Performance</p>
          <p className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300">{label}</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {hasScore ? 'Calculated from submitted evaluator ratings.' : 'Waiting for evaluator submissions.'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Completion</p>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{completionPercentage}%</span>
          </div>
          <p className="mt-2 text-xl font-black text-slate-900 dark:text-white">{completedComponents} of {totalComponents} components submitted</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full rounded-full bg-violet-600" style={{ width: `${completionPercentage}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-900/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white">Category scores</h4>
            <p className="text-xs text-slate-500">Each category uses the same evaluator weights as the overall score.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${usedWeight >= 100 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'}`}>
            {usedWeight}% weighted data
          </span>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {categories.length > 0 ? categories.map(category => {
            const percentage = category.maxScore > 0 ? Math.min(100, Math.max(0, (category.score / category.maxScore) * 100)) : 0;
            return (
              <div key={category.id} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900 dark:text-white">{category.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{category.description || 'Weighted rating category'}</p>
                  </div>
                  <span className="shrink-0 font-bold text-violet-700 dark:text-violet-300">{category.usedWeight > 0 ? category.score.toFixed(2) : '—'} / {category.maxScore.toFixed(1)}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-violet-600" style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          }) : (
            <p className="text-sm text-slate-500">Category scores will appear after rating questions are submitted.</p>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
        Weighted scoring first averages responses within each evaluator component, applies its configured weight, then normalizes only across components with submitted data. A weight below 100% means the score is preliminary and based on partial data.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {onViewDetails && <Button onClick={onViewDetails}>View Detailed Summary</Button>}
        {onViewFull && <Button variant="secondary" onClick={onViewFull}>View Full Evaluation</Button>}
        {onDownloadPdf && <Button variant="secondary" onClick={onDownloadPdf}>Download PDF</Button>}
      </div>
    </section>
  );
};

export default EvaluationResultSummary;
