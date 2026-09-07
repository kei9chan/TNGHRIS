import { approvalEmailCsv } from '../../services/approvalEmailCsv';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { supabase } from '../../services/supabaseClient';

async function request(body?: object, run?: string) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch('/api/approval-email-settings' + (run ? '?run=' + encodeURIComponent(run) : ''), { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${data.session?.access_token || ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Notification settings unavailable'), { status: response.status });
  return result;
}
const date = (s?: string) => s ? new Date(s).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'No successful run yet';
export default function ApprovalEmailSettings() {
  const [data, setData] = useState<any>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [denied, setDenied] = useState(false);
  const [selectedRun, setSelectedRun] = useState(''), [report, setReport] = useState<any>(null), [reportBusy, setReportBusy] = useState(false);
  const testId = useRef<string | null>(null);
  const load = useCallback(async (notice = false) => {
    if (notice) setMessage('Refreshing status…');
    try { setData(await request()); if (notice) setMessage('Status refreshed'); } catch (e: any) { if (e.status === 403) setDenied(true); else setMessage(e.message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const update = async (test: boolean) => {
    setBusy(true); setMessage('');
    try {
      if (test && !testId.current) testId.current = crypto.randomUUID();
      const result = await request(test ? { action: 'test', requestId: testId.current } : { action: 'enabled', enabled: !data.enabled });
      setMessage(result.message || 'Reminder setting saved');
      if (test) testId.current = null;
      await load();
    } catch (e: any) { setMessage(e.message); } finally { setBusy(false); }
  };
  const openRun = async (id: string) => {
    setSelectedRun(id); setReport(null);
    if (!id) return;
    setReportBusy(true);
    try { setReport(await request(undefined, id)); } catch (e: any) { setMessage(e.message); } finally { setReportBusy(false); }
  };
  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([approvalEmailCsv(report.deliveries)], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `approval-emails-${report.run.scheduled_date}-${report.run.id}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const deliveries = report?.deliveries ?? data?.deliveries ?? [];
  if (denied) return null;
  return <Card title="Approval Email Notifications">
    {data && <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="font-medium">Enable weekday approval reminders</span><button type="button" role="switch" aria-checked={data.enabled} disabled={busy} onClick={() => void update(false)} className={`min-h-11 rounded-lg px-5 py-2 font-semibold ${data.enabled ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-100'}`}>{data.enabled ? 'On' : 'Off'}</button></div>
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{[
        ['Schedule', 'Monday–Friday, 8:00 AM'], ['Timezone', 'Asia/Manila'], ['Provider', 'Resend'],
        ['Provider status', data.providerConfigured ? 'Configured' : 'Not Configured'], ['Sender email status', data.senderConfigured ? 'Configured' : 'Not Configured'],
        ['Server connection', data.appConfigured && data.cronConfigured && data.databaseConfigured ? 'Configured' : 'Not Configured'],
        ['Last successful reminder run', date(data.lastSuccessfulRun)], ['Emails sent during the last run', data.lastRun?.sent ?? '—'], ['Failed emails during the last run', data.lastRun?.failed ?? '—'],
      ].map(([label, value]) => <div key={label}><dt className="text-gray-500 dark:text-gray-400">{label}</dt><dd className="mt-1 font-medium text-gray-900 dark:text-white">{value}</dd></div>)}</dl>
      <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void update(true)}>Send Test Email</Button><Button variant="secondary" disabled={busy} onClick={() => void load(true)}>Refresh status</Button></div>
      <p className="text-sm text-gray-500 dark:text-gray-400">The test goes only to your logged-in Admin account. Reminders contain approval counts and a link to HRIS.</p>
      <details><summary className="cursor-pointer font-medium text-indigo-600 dark:text-indigo-300">Delivery failures and run details</summary>
        {data.lastRun && <p className="my-3 text-sm">Latest run: {data.lastRun.status} · {date(data.lastRun.started_at)}{data.lastRun.error_summary ? ` · ${data.lastRun.error_summary}` : ''}</p>}
        <div className="my-3 flex flex-wrap items-center gap-3"><label>Reminder run <select className="min-h-11 rounded border p-2 dark:bg-gray-800" disabled={reportBusy} value={selectedRun} onChange={e => void openRun(e.target.value)}><option value="">Recent activity (latest 100 entries)</option>{(data.runs || []).map((r: any) => <option key={r.id} value={r.id}>{date(r.started_at)} · {r.status}</option>)}</select></label><Button variant="secondary" disabled={!report || reportBusy} onClick={download}>Download run CSV</Button></div>
        <p className="text-sm text-gray-500 dark:text-gray-400">Names and profile emails show current records. Recorded recipient and outcome retain the original delivery history. Missing recorded email does not necessarily mean an invalid address. Select a run for its full report.</p>
        {reportBusy && <p role="status">Loading run…</p>}
        <div className="mt-3 max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Date / type', 'User / current profile', 'Recorded recipient', 'Count', 'Status', 'Details / action'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{deliveries.map((d: any, i: number) => <tr key={i} className="border-t border-gray-200 dark:border-gray-700"><td className="p-2">{d.scheduled_date}<span className="block">{d.notification_type}</span></td><td className="p-2"><b>{d.employee_name || d.recipient_user_id}</b><div>{d.profile_email || 'No profile email'}</div><div>{d.account_status} · {d.linked ? 'Login linked' : 'Login unlinked'}</div>{d.email_problem && <div className="text-amber-700 dark:text-amber-300">{d.email_problem}</div>}</td><td className="p-2">{d.recipient_email || 'Not recorded'}</td><td className="p-2">{d.pending_count}</td><td className="p-2">{d.status}</td><td className="p-2">{d.error_summary || (d.sent_at ? `Accepted ${date(d.sent_at)}` : 'Processing')}<div className="mt-1 text-xs">{d.suggested_fix}</div></td></tr>)}</tbody></table>{!deliveries.length && <p>No deliveries recorded.</p>}</div>
      </details>
    </div>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {!data && !message && <p>Loading notification settings…</p>}
  </Card>;
}
