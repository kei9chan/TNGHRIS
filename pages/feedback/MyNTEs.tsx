import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePersonalNTEs } from '../../hooks/usePersonalNTEs';
import { nteReceiptStatusLabel } from '../../utils/nteReceiptStatus';
import { formatNTEDisplayId } from '../../utils/formatCaseId';

const control = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
export default function MyNTEs() {
  const [pendingOnly, setPendingOnly] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const { items, total, loading, error, refresh } = usePersonalNTEs({ pendingOnly, page, pageSize });
  return <section className="mx-auto max-w-5xl space-y-5 py-4" aria-labelledby="my-ntes-heading">
    <Link to="/dashboard" className="inline-flex min-h-11 items-center text-violet-700 underline dark:text-violet-300">← Back to dashboard</Link>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 id="my-ntes-heading" className="text-2xl font-bold text-slate-900 dark:text-white">My NTEs and case statuses</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Open a notice to review it, acknowledge receipt, submit your explanation, or see case updates.</p></div>
      <button type="button" className={control} disabled={loading} onClick={refresh}>Refresh NTEs</button>
    </div>
    <label className="flex flex-wrap items-center gap-3 text-sm text-slate-700 dark:text-slate-200">Show
      <select className={control} value={pendingOnly ? 'open' : 'all'} onChange={event => { setPendingOnly(event.target.value === 'open'); setPage(0); }}>
        <option value="all">All my notices and case history</option><option value="open">Open cases only</option>
      </select>
    </label>
    {error && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">Could not load your NTEs. {error} <button type="button" className="min-h-11 underline" onClick={refresh}>Retry NTEs</button></div>}
    {loading && <p role="status" className="text-slate-600 dark:text-slate-300">Loading your NTEs…</p>}
    {!loading && !error && !items.length && <p className="rounded-lg border border-slate-200 bg-white p-5 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">{pendingOnly ? 'No open NTE cases.' : 'No published NTEs found for your account.'}</p>}
    {!!items.length && <ul className="space-y-3">{items.map(nte => <li key={nte.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link className="min-h-11 break-words font-semibold text-violet-700 underline dark:text-violet-300" to={`/feedback/nte/${nte.id}`}>{formatNTEDisplayId(nte.nteNumber) || 'Notice to Explain'}</Link>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-medium text-violet-900 dark:bg-violet-950 dark:text-violet-100">{nteReceiptStatusLabel(nte)}</span>
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500 dark:text-slate-400">Date created</dt><dd className="font-medium text-slate-900 dark:text-white">{nte.issuedDate.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' })}</dd></div>
        <div><dt className="text-slate-500 dark:text-slate-400">Explanation deadline</dt><dd className="font-medium text-slate-900 dark:text-white">{nte.receiptRecordedAt && Number.isFinite(nte.deadline.getTime()) ? nte.deadline.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) + ' PHT' : 'Starts from documented receipt'}</dd></div>
      </dl>
      <Link to={`/feedback/nte/${nte.id}`} className="mt-3 inline-flex min-h-11 items-center font-semibold text-violet-700 underline dark:text-violet-300">View notice and case details →</Link>
    </li>)}</ul>}
    {total > 0 && <nav aria-label="NTE history pages" className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200">
      <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total} notices</span>
      <div className="flex gap-2"><button type="button" className={control + ' disabled:opacity-50'} disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>Previous</button>
        <button type="button" className={control + ' disabled:opacity-50'} disabled={loading || (page + 1) * pageSize >= total} onClick={() => setPage(value => value + 1)}>Next</button></div>
    </nav>}
  </section>;
}
