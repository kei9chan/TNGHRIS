import React, { useRef, useState } from 'react';
import type { Offer } from '../../types';
import Button from '../ui/Button';
import { extendOfferDeadline } from '../../services/jobOfferWorkspaceService';

export default function OfferDeadlineExtension({ offer, onExtended }: { offer: Offer; onExtended: (offer: Offer) => void }) {
  const [editing, setEditing] = useState(false);
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const current = offer.offerExpirationDate ? new Date(offer.offerExpirationDate).toISOString().slice(0, 10) : '';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const tomorrow = current ? new Date(Date.parse(current + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10) : today;
  const minimum = tomorrow > today ? tomorrow : today;
  const save = async () => {
    if (lock.current) return;
    if (!deadline || deadline < minimum) { setError('Choose a date later than the current deadline and no earlier than today.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const updated = await extendOfferDeadline(offer, deadline);
      onExtended(updated); setEditing(false); setSaved(true);
    } catch (reason: any) { setError(reason?.message || 'Unable to extend the deadline. Refresh the offer and retry.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section className="mx-auto mb-5 max-w-6xl rounded-xl border border-violet-200 bg-white p-4 dark:bg-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Response deadline</h2><p className="text-sm text-slate-600">{current || 'Not set'}</p></div><Button variant="secondary" disabled={busy} onClick={() => { setEditing(!editing); setError(''); setSaved(false); }}>Extend deadline</Button></div>
    {editing && <div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm font-semibold">New response deadline<input aria-label="New response deadline" className="mt-1 block rounded-lg border px-3 py-2" type="date" min={minimum} value={deadline} disabled={busy} onChange={event => setDeadline(event.target.value)}/></label><Button isLoading={busy} onClick={() => void save()}>Save deadline</Button><Button variant="secondary" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button><p className="w-full text-xs text-slate-500">Extends the response period and keeps the same candidate link. Pay and job terms retain their existing approval.</p></div>}
    {error && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{error}</p>}
    {saved && <p role="status" className="mt-3 text-sm font-semibold text-emerald-700">Deadline extended. The existing candidate link remains the same.</p>}
  </section>;
}
