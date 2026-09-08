import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Decision {
  id: string;
  created_at: string;
  action: string;
  entity: string;
  entity_id: string;
  details: string;
}

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
  return <section className="rounded-xl border bg-white p-5 shadow-sm dark:bg-slate-800" aria-label="Recent approval decisions">
    <h2 className="text-lg font-bold">My recent approval decisions</h2>
    <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">Your latest 20 recorded approvals and rejections, newest first. A stage approval may still require another approver.</p>
    {current.loading ? <p role="status" className="mt-4">Loading recent decisions…</p> : current.error ? <div role="alert" className="mt-4"><p>{current.error}</p><button className="mt-2 underline" onClick={() => setRetry(value => value + 1)}>Retry</button></div> : current.rows.length === 0 ? <p className="mt-4">No recorded approval decisions yet.</p> : <ol className="mt-4 divide-y">
      {current.rows.map(row => <li key={row.id} className="py-3 break-words">
        <div className="flex flex-wrap justify-between gap-2"><strong>{row.entity} · {row.action === 'APPROVE' ? 'Approved' : 'Rejected'}</strong><time dateTime={row.created_at} className="text-sm">{new Date(row.created_at).toLocaleString()}</time></div>
        <p className="mt-1 text-sm">{row.details}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">Reference: {row.entity_id}</p>
      </li>)}
    </ol>}
  </section>;
}
