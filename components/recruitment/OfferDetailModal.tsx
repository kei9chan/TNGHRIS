import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { EnrichedOffer } from './OfferTable';
import { Offer, OfferBuilderDetails, OfferStatus, Permission } from '../../types';
import Button from '../ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import { OfferSheet } from './OfferCreationDrawer';
import { supabase } from '../../services/supabaseClient';
import { downloadOfferPdf } from './offerPdf';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  offer: EnrichedOffer;
  onStatusChange: (offerId: string, newStatus: OfferStatus) => void;
  onConvertToEmployee: (offer: Offer) => void;
  onEdit?: (offer: EnrichedOffer) => void;
  onSend?: (offer: EnrichedOffer) => void;
}

const OfferDetailModal: React.FC<Props> = ({ isOpen, onClose, offer, onStatusChange, onConvertToEmployee, onEdit, onSend }) => {
  const { can } = usePermissions(); const canManage = can('Offers', Permission.Manage);
  const [tab, setTab] = useState<'offer' | 'details' | 'history'>('offer'); const [history, setHistory] = useState<any[]>([]);
  const emailDelivery = (offer.offerDetails as OfferBuilderDetails & { emailDelivery?: { status?: string; error?: string } } | undefined)?.emailDelivery;
  const canSendFromDetails = offer.status === OfferStatus.Draft || emailDelivery?.status === 'failed';
  const details = useMemo<OfferBuilderDetails>(() => ({
    currency: 'PHP', grossMonthlySalary: offer.basePay, grossAnnualizedSalary: offer.basePay * 12,
    jobTitle: offer.jobTitle, rolePurpose: offer.jobDescription || '', reportingManager: offer.reportingTo,
    workLocation: offer.workLocation, workScheduleDays: offer.workScheduleDays, workScheduleHours: offer.workScheduleHours,
    benefits: offer.offerDetails?.benefits || [], growthItems: offer.offerDetails?.growthItems || [],
    responsibilities: offer.offerDetails?.responsibilities || [], successOutcomes: offer.offerDetails?.successOutcomes || [],
    milestones: offer.offerDetails?.milestones || { '30': { description: '' }, '60': { description: '' }, '90': { description: '' } },
    ...offer.offerDetails,
  }), [offer]);
  useEffect(() => { if (!isOpen || tab !== 'history') return; supabase.from('job_offer_history').select('id,action,status,revision,changed_at').eq('offer_id', offer.id).order('changed_at', { ascending: false }).then(({ data }) => setHistory(data || [])); }, [isOpen, tab, offer.id]);
  useEffect(() => { if (!isOpen) return; const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; document.addEventListener('keydown', closeOnEscape); return () => document.removeEventListener('keydown', closeOnEscape); }, [isOpen, onClose]);
  if (!isOpen) return null;
  return createPortal(<div role="dialog" aria-modal="true" aria-label={`Offer ${offer.offerNumber} details`} className="fixed inset-0 z-[120] flex h-[100dvh] flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
    <header className="shrink-0 border-b bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-5 sm:py-4"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3"><div><button onClick={onClose} className="text-sm font-semibold text-violet-700">← Back to Job Offers</button><h1 className="mt-1 text-xl font-black sm:text-2xl">Offer {offer.offerNumber}</h1><p className="text-sm text-slate-500">{offer.candidateName} · {offer.jobTitle} · <b>{offer.status}</b></p></div><div className="flex flex-wrap justify-end gap-2">{canSendFromDetails && onSend && <Button onClick={() => onSend(offer)}>{offer.status === OfferStatus.Draft ? 'Send Offer' : 'Resend Offer'}</Button>}{offer.status === OfferStatus.Draft && onEdit && <Button variant="secondary" onClick={() => onEdit(offer)}>Edit Draft</Button>}<Button variant="secondary" onClick={() => void downloadOfferPdf(offer, details, offer.candidateName, details.businessUnit || 'The Nextperience', offer.status === OfferStatus.Signed)}>Download PDF</Button><Button variant="secondary" onClick={() => window.print()}>Print</Button><button onClick={onClose} aria-label="Close offer details" className="rounded-xl border bg-white px-3 py-2 text-sm font-bold shadow-sm dark:bg-slate-800">× Close</button></div></div></header>
    <nav className="border-b bg-white dark:border-slate-800 dark:bg-slate-900"><div className="mx-auto flex max-w-[1500px] gap-6 px-5">{(['offer','details','history'] as const).map(value => <button key={value} onClick={() => setTab(value)} className={`border-b-2 px-1 py-3 text-sm font-semibold capitalize ${tab === value ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500'}`}>{value === 'offer' ? 'Offer Letter' : value === 'details' ? 'Offer Details' : 'History'}</button>)}</div></nav>
    <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24 sm:p-8 sm:pb-24">{tab === 'offer' && <OfferSheet offer={offer} details={details} candidateName={offer.candidateName} companyName={details.businessUnit || 'The Nextperience'} logoUrl={offer.logoUrl}/>} {tab === 'details' && <div className="mx-auto max-w-4xl space-y-5"><div className="rounded-2xl bg-white p-6 shadow dark:bg-slate-900"><h2 className="text-xl font-bold">Clear package details</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2"><div><dt className="text-xs font-bold uppercase text-slate-400">Monthly salary</dt><dd className="text-lg font-bold">₱{offer.basePay.toLocaleString()}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-400">Annualized salary</dt><dd className="text-lg font-bold">₱{(details.grossAnnualizedSalary || 0).toLocaleString()}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-400">Start date</dt><dd>{new Date(offer.startDate).toLocaleDateString()}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-400">Expiration</dt><dd>{offer.offerExpirationDate ? new Date(offer.offerExpirationDate).toLocaleDateString() : 'Not set'}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-400">Employment type</dt><dd>{offer.employmentType}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-400">Reports to</dt><dd>{details.reportingManager || 'Not set'}</dd></div></dl></div>{offer.secureToken && <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5"><p className="text-xs font-bold uppercase text-violet-600">Secure candidate link</p><p className="mt-2 break-all text-sm">{`${window.location.origin}/offer/${offer.secureToken}`}</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/offer/${offer.secureToken}`)}>Copy Secure Link</Button>{canSendFromDetails && onSend && <Button onClick={() => onSend(offer)}>{offer.status === OfferStatus.Draft ? 'Activate & Send Offer' : 'Retry Email Delivery'}</Button>}</div>{offer.status === OfferStatus.Draft && <p className="mt-2 text-xs text-amber-700">This link becomes available when the offer is activated from Send Offer.</p>}{emailDelivery?.status === 'failed' && <p className="mt-2 text-xs font-semibold text-rose-700">The secure link is live, but the last email attempt failed. {emailDelivery.error || ''}</p>}</div>}</div>} {tab === 'history' && <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow dark:bg-slate-900"><h2 className="text-xl font-bold">Offer history</h2><div className="mt-5 divide-y">{history.length ? history.map(item => <div key={item.id} className="flex items-center justify-between gap-4 py-3"><div><b>{item.action === 'STATUS_CHANGE' ? `Status changed to ${item.status}` : item.action === 'CREATE' ? 'Offer created' : 'Draft updated'}</b><p className="text-xs text-slate-500">Revision {item.revision}</p></div><time className="text-sm text-slate-500">{new Date(item.changed_at).toLocaleString()}</time></div>) : <p className="py-8 text-center text-sm text-slate-500">No history available yet.</p>}</div></div>}</main>
    {canManage && <footer className="border-t bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900"><div className="mx-auto flex max-w-[1500px] justify-end gap-2">{offer.status === OfferStatus.Signed && <Button onClick={() => onConvertToEmployee(offer)}>Convert to Employee</Button>}<Button variant="secondary" onClick={onClose}>Close</Button></div></footer>}
  </div>, document.body);
};

export default OfferDetailModal;
