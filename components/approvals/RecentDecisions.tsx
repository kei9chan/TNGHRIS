import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { getApprovalReviewUrl, type ApprovalRequestKind } from '../../services/approvalDeepLinks';
import { formatDecisionTime, formatEntityName, parseDecisionDetails } from '../../utils/recentDecisionFormatting';

interface Decision {
  id: string;
  created_at: string;
  action: string;
  entity: string;
  entity_id: string;
  details: string;
}

const ENTITY_KINDS: Record<string, ApprovalRequestKind> = {
  AssetRequest: 'asset', BenefitRequest: 'benefit', JobRequisition: 'requisition', LeaveRequest: 'leave',
  ManpowerRequest: 'manpower', NTE: 'nte', OTRequest: 'overtime', PAN: 'pan', WFHRequest: 'wfh',
};

export default function RecentDecisions({ userId, refreshKey }: { userId: string; refreshKey: string }) {
  const [state, setState] = useState<{ userId: string; rows: Decision[]; error: string; loading: boolean }>({ userId, rows: [], error: '', loading: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const load = async () => {
      const request = ++sequence;
      try {
        const { data, error } = await supabase.from('audit_logs')
          .select('id,created_at,action,entity,entity_id,details')
          .eq('user_id', userId).in('action', ['APPROVE', 'REJECT'])
          .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20);
        if (error) throw error;
        if (active && request === sequence) setState({ userId, rows: data || [], error: '', loading: false });
      } catch {
        if (active && request === sequence) setState({ userId, rows: [], error: 'Recent decisions could not be loaded.', loading: false });
      }
    };
    void load();
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 30000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [userId, refreshKey, retry]);
  const current = state.userId === userId ? state : { rows: [], error: '', loading: true };
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800" aria-label="Recent approval decisions">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-lg font-bold text-slate-900 dark:text-white">Recent decisions</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-300">Your latest 20 approvals and rejections.</p></div><span className="text-xs text-slate-400">Times shown in Asia/Manila</span></div>
    {current.loading ? <p role="status" className="mt-4">Loading recent decisions…</p> : current.error ? <div role="alert" className="mt-4"><p>{current.error}</p><button className="mt-2 underline" onClick={() => setRetry(value => value + 1)}>Retry</button></div> : current.rows.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900/40 dark:text-slate-300">No recorded approval decisions yet.</p> : <ol className="mt-4 grid gap-3">
      {current.rows.map(row => {
        const approved = row.action === 'APPROVE';
        const details = parseDecisionDetails(row.details || '');
        const kind = ENTITY_KINDS[row.entity];
        const reference = row.entity_id ? row.entity_id.slice(0, 8).toUpperCase() : '';
        return <li key={row.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{formatEntityName(row.entity)}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${approved ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'}`}>{approved ? 'Approved' : 'Rejected'}</span></div><p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{details.summary}</p></div><time dateTime={row.created_at} className="shrink-0 text-sm text-slate-500 dark:text-slate-300">{formatDecisionTime(row.created_at)}</time></div>
          {(details.stage || details.transition) && <div className="mt-3 flex flex-wrap gap-2 text-xs">{details.stage && <span className="rounded-md bg-white px-2 py-1 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600">Stage: {details.stage}</span>}{details.transition && <span className="rounded-md bg-white px-2 py-1 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600">{details.transition}</span>}</div>}
          {details.comment && <p className="mt-3 rounded-md bg-white px-3 py-2 text-sm italic text-slate-600 dark:bg-slate-800 dark:text-slate-300">“{details.comment}”</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><span className="text-slate-500 dark:text-slate-400" title={row.entity_id}>Reference: {reference || 'Unavailable'}</span>{kind && row.entity_id && <Link className="font-semibold text-indigo-600 hover:underline dark:text-indigo-300" to={getApprovalReviewUrl(kind, row.entity_id)}>View details →</Link>}</div>
        </li>;
      })}
    </ol>}
  </section>;
}
