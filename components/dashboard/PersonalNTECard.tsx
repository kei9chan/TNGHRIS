import React from 'react';
import { Link } from 'react-router-dom';
import { usePersonalNTEs } from '../../hooks/usePersonalNTEs';
import { formatNTEDisplayId } from '../../utils/formatCaseId';
import { nteReceiptStatusLabel } from '../../utils/nteReceiptStatus';

export default function PersonalNTECard() {
  const { items, total, loading, error, refresh } = usePersonalNTEs({ pendingOnly: true, pageSize: 3 });
  return <section aria-labelledby="personal-ntes-heading" className="my-4 rounded-xl border border-violet-200 bg-white p-4 shadow-sm dark:border-violet-800 dark:bg-slate-800 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="personal-ntes-heading" className="text-lg font-bold text-slate-900 dark:text-white">My pending NTEs</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">{total > 0 ? `${total} open case${total === 1 ? '' : 's'} · Latest three shown` : 'Your notices and case updates'}</p></div>
      <div className="flex items-center gap-4"><button type="button" disabled={loading} onClick={refresh} className="min-h-11 font-medium text-violet-700 underline disabled:opacity-50 dark:text-violet-300">Refresh NTEs</button>
        <Link to="/feedback/my-ntes" className="inline-flex min-h-11 items-center font-semibold text-violet-700 underline dark:text-violet-300" aria-label="View all my NTEs and case statuses">View all</Link></div>
    </div>
    {error && <p role="alert" className="mt-3 text-red-700 dark:text-red-300">Could not refresh your NTEs. {error} Use Refresh NTEs to retry.</p>}
    {loading && !items.length && <p role="status" className="mt-3 text-slate-600 dark:text-slate-300">Loading your NTEs…</p>}
    {!loading && !error && !items.length && <p className="mt-3 text-slate-600 dark:text-slate-300">No pending NTEs. View all to see your case history.</p>}
    {!!items.length && <ul className="mt-4 grid gap-3 lg:grid-cols-3">{items.map(nte => <li key={nte.id}>
      <Link to={`/feedback/nte/${nte.id}`} className="block h-full rounded-lg border border-slate-200 p-4 hover:border-violet-400 focus-visible:outline-violet-600 dark:border-slate-600">
        <p className="break-words font-semibold text-slate-900 dark:text-white">{formatNTEDisplayId(nte.nteNumber) || 'Notice to Explain'}</p>
        <p className="mt-2 text-sm font-medium text-violet-800 dark:text-violet-200">{nteReceiptStatusLabel(nte)}</p>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Created {nte.issuedDate.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' })}</p>
        <span className="mt-3 block text-sm font-semibold text-violet-700 underline dark:text-violet-300">View notice and case status →</span>
      </Link>
    </li>)}</ul>}
  </section>;
}
