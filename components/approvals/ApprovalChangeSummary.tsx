import React from 'react';
import { getApprovalChangeSummary, type ChangePreview, type SummaryLine } from '../../utils/approvalChangeSummary';

const Line: React.FC<{ line: SummaryLine }> = ({ line }) => <div className="text-sm"><dt className="font-semibold text-slate-600 dark:text-slate-300">{line.label}</dt><dd className="mt-0.5 break-words text-slate-900 dark:text-white">{line.value || <><span className="text-slate-500 dark:text-slate-400">{line.before}</span><span aria-label="changes to" className="mx-1.5 font-bold text-indigo-600 dark:text-indigo-300">→</span><strong>{line.after}</strong></>}</dd></div>;
export default function ApprovalChangeSummary({ preview }: { preview?: ChangePreview }) {
  if (!preview) return <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">Summary unavailable. Refresh or open Review request.</p>;
  const summary = getApprovalChangeSummary(preview);
  return <section className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 dark:border-indigo-900 dark:bg-indigo-950/30">
    <h4 className="font-bold text-indigo-900 dark:text-indigo-200">{summary.title}</h4>
    <dl className="mt-2 space-y-2">{summary.lines.slice(0, 4).map((line, i) => <Line key={i} line={line} />)}</dl>
    {summary.lines.length > 4 && <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold text-indigo-700 dark:text-indigo-300">{summary.lines.length - 4} more details</summary><dl className="mt-2 space-y-2">{summary.lines.slice(4).map((line, i) => <Line key={i} line={line} />)}</dl></details>}
    {summary.reason && <p className="mt-2 whitespace-pre-line break-words text-sm text-slate-700 dark:text-slate-200"><b>Reason:</b> {summary.reason}</p>}
    {summary.note && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{summary.note}</p>}
  </section>;
}
