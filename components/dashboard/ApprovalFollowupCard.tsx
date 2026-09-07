import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
export default function ApprovalFollowupCard() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null), [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [boundUser, setBoundUser] = useState('');
  const load = useCallback(async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const request = new AbortController(); controller.current = request;
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session || request.signal.aborted) return;
      const response = await fetch('/api/approval-followup', { headers: { Authorization: `Bearer ${session.session.access_token}` }, cache: 'no-store', signal: request.signal });
      if (request.signal.aborted) return;
      setBoundUser(user?.id || '');
      if (response.status === 403 || response.status === 401) { setAllowed(false); setData(null); return; }
      const result = await response.json();
      if (!response.ok) { if (result.allowed === true) setAllowed(true); throw new Error(); }
      setData(result); setAllowed(true);
    } catch { if (!request.signal.aborted) setError('Unable to load Regine’s approval summary.'); }
    finally { if (!request.signal.aborted) { lock.current = false; setBusy(false); } }
  }, [user?.id]);
  useEffect(() => {
    setAllowed(false); setData(null); lock.current = false; void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('approval-decision-saved', refresh);
    return () => { controller.current?.abort(); clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('approval-decision-saved', refresh); };
  }, [user?.id, load]);
  if (!allowed || boundUser !== user?.id) return null;
  const date = (value: string | null) => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Date unavailable';
  return <section className="my-5 rounded-xl border border-slate-200 bg-white p-5 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Regine’s Pending Approvals</h2><p className="text-sm text-slate-500 dark:text-slate-300">Read-only follow-up view</p></div><button type="button" onClick={() => void load()} disabled={busy} className="min-h-12 rounded-lg bg-indigo-600 px-4 font-semibold text-white disabled:opacity-60">{busy ? 'Refreshing…' : 'Refresh'}</button></div>
    {error ? <p role="alert" className="mt-3 text-red-600 dark:text-red-300">{error}</p> : data ? <><p role="status" className="my-3 font-semibold">{data.total ? `Regine has ${data.total} pending approval${data.total === 1 ? '' : 's'}` : 'Regine has no pending approvals.'}</p><ul className="space-y-2">{data.groups.map((g: any) => <li key={g.type}>{g.label} — {g.count} pending — oldest {date(g.oldest)}</li>)}</ul>{data.total > 0 && <p className="mt-3 text-sm">Oldest pending: {date(data.oldest)}</p>}</> : <p role="status">Loading approval summary…</p>}
    {data && <p className="mt-3 text-sm text-slate-500 dark:text-slate-300">Last refreshed: {date(data.refreshedAt)}</p>}
  </section>;
}
