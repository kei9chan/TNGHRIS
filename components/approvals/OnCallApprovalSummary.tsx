import React from 'react';
import { type OnCallSummary, onCallPeso } from '../../utils/onCallApprovalSummary';

export default function OnCallApprovalSummary({ summary }: { summary: OnCallSummary }) {
  return <div className="space-y-3 text-sm">
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Date needed</dt><dd className="mt-1 font-semibold">{summary.dateLabel}</dd></div>
      <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">On-call staff</dt><dd className="mt-1 font-semibold">{summary.staffLabel}</dd>{summary.days.length > 1 && <dd className="mt-1 text-xs text-slate-500 dark:text-slate-300">{summary.staffDays} staff-days across {summary.days.length} days</dd>}</div>
      <div className="col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Reason</dt><dd className="mt-1 break-words">{summary.reason}</dd></div>
      <div className="col-span-2 rounded-lg bg-teal-50 p-3 dark:bg-teal-950/40"><dt className="text-xs font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-200">Total request cost</dt><dd className="mt-1 text-xl font-bold text-teal-900 dark:text-teal-100">{summary.costLabel}</dd></div>
    </dl>
    {summary.days.length > 1 && <details className="rounded-lg border border-slate-200 p-2 dark:border-slate-600"><summary className="min-h-11 cursor-pointer py-2 font-semibold text-indigo-600 dark:text-indigo-300">Daily staff and cost breakdown</summary><ul className="mt-2 space-y-2">{summary.days.map(day => <li key={day.date} className="border-t border-slate-100 pt-2 dark:border-slate-700"><p className="font-medium">{day.dateLabel} · {day.staff} staff · {onCallPeso(day.cost)}</p>{day.reason && <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-300">{day.reason}</p>}</li>)}</ul></details>}
  </div>;
}
