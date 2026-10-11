import React from 'react';
import { assignmentStatus, assignmentTitle, formatDue, matchesFilter } from './presentation';
import { todayCategories, todayCategory, todayWork } from './today';
import type { OpsAssignment } from './types';
import { OpsIcon, buttonClass } from './ui';

const time = (value: string) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
export default function TodayList({ assignments, showAssignee, allUnits, onOpen, onAll }: { assignments: OpsAssignment[]; showAssignee: boolean; allUnits: boolean; onOpen: (assignment: OpsAssignment) => void; onAll: () => void }) {
  const rows = todayWork(assignments);
  return <div className="space-y-6">
    <p className="text-sm text-slate-500 dark:text-slate-400">{rows.length} thing{rows.length === 1 ? '' : 's'} to do{rows.some(a => matchesFilter(a, 'Overdue')) ? ' · includes overdue work' : ''}</p>
    {!rows.length && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-700"><OpsIcon name="Tasks" className="mx-auto h-9 w-9 text-violet-400" /><h3 className="mt-3 text-lg font-semibold">Nothing to do today</h3><p className="mt-2 text-sm text-slate-500">Your tasks and checklists due today will appear here.</p><button type="button" className={`${buttonClass} mt-4`} onClick={onAll}>View all tasks</button></div>}
    {todayCategories.map(category => {
      const group = rows.filter(a => todayCategory(a) === category);
      if (!group.length) return null;
      return <section key={category} aria-label={category}>
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{category}</h3><span className="text-xs text-slate-500">{group.length}</span></div>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
          {group.map(a => <button type="button" key={a.id} aria-label={`Open ${assignmentTitle(a)}`} onClick={() => onOpen(a)} className="flex min-h-20 w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600 dark:hover:bg-slate-700">
            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-violet-300 text-violet-600">{a.status === 'In Progress' ? <span className="h-2 w-2 rounded-full bg-violet-600" /> : null}</span>
            <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{assignmentTitle(a)}</span>
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{matchesFilter(a, 'Overdue') ? formatDue(a.due_at) : `Due ${time(a.due_at)}`}{allUnits ? ` · ${a.unit_name}` : ''}{showAssignee ? ` · ${(a.execution ? a.execution.shared : !!a.checklist_run_id) ? 'Shared team' : a.assignee_name}` : ''}</span>
              {a.maintenance && <span className="mt-1 block text-xs text-slate-500">{a.maintenance.name} · {a.maintenance.asset_tag}</span>}
              {(matchesFilter(a, 'Overdue') || a.status === 'In Progress' || a.priority === 'Urgent' || a.priority === 'High') && <span className={`mt-1 block text-xs font-medium ${matchesFilter(a, 'Overdue') ? 'text-red-600 dark:text-red-300' : 'text-violet-700 dark:text-violet-300'}`}>{[matchesFilter(a, 'Overdue') ? 'Overdue' : '', a.status === 'In Progress' ? assignmentStatus(a) : '', ['Urgent', 'High'].includes(a.priority) ? a.priority : ''].filter(Boolean).join(' · ')}</span>}
            </span><span aria-hidden="true" className="text-lg text-slate-400">›</span>
          </button>)}
        </div>
      </section>;
    })}
  </div>;
}
