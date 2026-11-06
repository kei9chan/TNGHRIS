import React from 'react';
import { Link } from 'react-router-dom';

type Person = { id: string; name: string; businessUnit: string; businessUnitId: string; department: string; exempt: boolean; complete: boolean; missingDates: string[]; publication: string; days: { date: string; status: string }[] };
export type ScheduleTaskData = { managerId: string; managerName: string; week: string; deadline: string; required: number; completed: number; remaining: number; exempt: number; percentage: number; status: string; employees: Person[]; hr: boolean; overdueTasks?: ScheduleTaskData[] };
const date = (value: string) => new Date(value + 'T12:00:00+08:00').toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });
const deadline = (value: string) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const scheduleLink = (task: ScheduleTaskData) => `/payroll/timekeeping?week=${task.week}&manager=${task.managerId}`;
const button = 'inline-flex min-h-11 items-center justify-center rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white disabled:opacity-50';

export default function ScheduleTaskCard({ task, details = false, onRefresh, onReviewPublish, reviewDisabled = false }: {
  task: ScheduleTaskData; details?: boolean; onRefresh: () => void; onReviewPublish?: () => void; reviewDisabled?: boolean;
}) {
  const olderWeeks = (task.overdueTasks || []).filter(older => older.week !== task.week && older.remaining > 0);
  const unpublished = task.employees.filter(person => !person.exempt && person.complete && person.publication !== 'Published').length;
  const published = task.employees.filter(person => !person.exempt && person.complete && person.publication === 'Published').length;
  const complete = task.remaining === 0;
  const allPublished = task.required > 0 && complete && published === task.required;
  // Historical gaps never determine the selected week's badge, action or colour.
  const urgent = !complete && ['Overdue', 'Due Today', 'Due Tomorrow'].includes(task.status);
  const status = task.required === 0 ? 'No scheduling required' : allPublished ? 'Published' : complete ? 'Awaiting publication' : task.status;
  const colour = urgent ? 'border-red-400 bg-red-50 dark:border-red-500 dark:bg-red-950/30'
    : complete && !unpublished ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30'
    : 'border-amber-300 bg-white dark:border-amber-700 dark:bg-slate-800';
  return <div className="mb-5 space-y-3">
    <section id="schedule-task" aria-label="Selected week schedule progress" className={`rounded-2xl border p-5 text-slate-900 dark:text-white ${colour}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-bold">{details ? 'Employee Schedule Progress' : 'Employee schedules'}</h2><p className="mt-1">Week of {date(task.week)} · Monday–Sunday</p></div>
        <span className="rounded-full border border-current px-3 py-1 text-sm font-semibold">{status}</span>
      </div>
      {allPublished ? <p className="mt-4 font-semibold">All {published} employee schedules are already published and visible to employees. No further publication is needed unless you change them.</p>
        : task.required === 0 ? <p className="mt-4 font-semibold">No employee schedules are required for this week.</p>
        : <>
          <p className="mt-4 text-xl font-semibold">{task.remaining} employee{task.remaining === 1 ? '' : 's'} remaining to complete schedules</p>
          <progress className="mt-3 h-3 w-full accent-violet-600" max={100} value={task.percentage} aria-label="Saved schedule completion" />
          <p className="mt-2">{task.percentage}% saved · {task.exempt} exempt employees excluded</p>
          <p className="mt-2">Deadline for this week: <strong>{deadline(task.deadline)} Philippine time</strong></p>
        </>}
      {unpublished > 0 && <p className="mt-3 font-semibold">{unpublished} employee{unpublished === 1 ? ' has' : 's have'} saved schedules awaiting publication. Saving the week does not publish it to employees.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        {!complete && <Link className={button} to={scheduleLink(task)}>Complete this week’s schedules</Link>}
        {unpublished > 0 && (onReviewPublish
          ? <button type="button" className={button} disabled={reviewDisabled} onClick={onReviewPublish}>Review &amp; publish this week</button>
          : <Link className={button} to={scheduleLink(task)}>Review &amp; publish this week</Link>)}
        {task.hr && <Link className="inline-flex min-h-11 items-center underline" to="/payroll/schedule-compliance">Schedule Compliance</Link>}
        <button type="button" className="min-h-11 underline" onClick={onRefresh}>Refresh progress</button>
        {details && task.hr && <Link className="inline-flex min-h-11 items-center underline" to="/payroll/clocking-exceptions">Clock-in exemptions</Link>}
      </div>
    </section>
    {olderWeeks.length > 0 && <details className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-white">
      <summary className="min-h-11 cursor-pointer font-semibold">Previous weeks · {olderWeeks.length} with missing schedule records</summary>
      <p className="mt-2 text-sm">These historical gaps are separate from the week of {date(task.week)}. They do not block approval or publication for the selected week.</p>
      <ul className="mt-3 space-y-3">{olderWeeks.map(older => <li key={older.week} className="flex flex-wrap items-center justify-between gap-2">
        <span>Week of {date(older.week)} · {older.remaining} employee{older.remaining === 1 ? '' : 's'} with missing records</span>
        <Link className="inline-flex min-h-11 items-center font-semibold underline" to={scheduleLink(older)}>Review this older week</Link>
      </li>)}</ul>
    </details>}
  </div>;
}
