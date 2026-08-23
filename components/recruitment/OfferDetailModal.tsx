import React, { useEffect, useMemo, useState } from 'react';
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
}

const OfferDetailModal: React.FC<Props> = ({ isOpen, onClose, offer, onStatusChange, onConvertToEmployee, onEdit }) => {
  const { can } = usePermissions(); const canManage = can('Offers', Permission.Manage);
  const [tab, setTab] = useState<'offer' | 'details' | 'history'>('offer'); const [history, setHistory] = useState<any[]>([]);
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
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
    <header className="border-b bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3"><div><button onClick={onClose} className="text-sm font-semibold text-violet-700">← Back to Job Offers</button><h1 className="mt-1 text-2xl font-black">Offer {offer.offerNumber}</h1><p className="text-sm text-slate-500">{offer.candidateName} · {offer.jobTitle} · <b>{offer.status}</b></p></div><div className="flex gap-2">{offer.status === OfferStatus.Draft && onEdit && <Button onClick={() => onEdit(offer)}>Edit Draft</Button>}<Button variant="secondary" onClick={() => void downloadOfferPdf(offer, details, offer.candidateName, details.businessUnit || 'The Nextperience', offer.status === OfferStatus.Signed)}>Download PDF</Button><Button variant="secondary" onClick={() => window.print()}>Print</Button><button onClick={onClose} aria-label="Close offer details" className="rounded-xl border px-3 py-2 text-sm font-semibold">× Close</button></div></div></header>
    <nav className="border-b bg-white dark:border-slate-800 dark:bg-slate-900"><div className="mx-auto flex max-w-[1500px] gap-6 px-5">{(['offer','details','history'] as const).map(value => <button key={value} onClick={() => setTab(value)} className={`border-b-2 px-1 py-3 text-sm font-semibold capitalize ${tab === value ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500'}`}>{value === 'offer' ? 'Offer Letter' : value === 'details' ? 'Offer Details' : 'History'}</button>)}</div></nav>
    <main className="flex-1 overflow-y-auto p-4 sm:p-8">{tab === 'offer' && <OfferSheet offer={offer} details={details} candidateName={offer.candidateName} companyName={details.businessUnit || 'The Nextperience'} logoUrl={offer.logoUrl}/>} {tab === 'details' && <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow dark:bg-slate-900"><h2 className="text-xl font-bold">Clear package details</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2"><div><dt className="text-xs font-bold uppercase text-slate-400">Monthly salary</dt><dd className="text-lg font-bold">₱{offer.basePay.toLocaleString()}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-400">Annualized salary</dt><dd className="text-lg font-bold">₱{(details.grossAnnualizedSalary || 0).toLocaleString()}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-400">Start date</dt><dd>{new Date(offer.startDate).toLocaleDateString()}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-400">Expiration</dt><dd>{offer.offerExpirationDate ? new Date(offer.offerExpirationDate).toLocaleDateString() : 'Not set'}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-400">Employment type</dt><dd>{offer.employmentType}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-400">Reports to</dt><dd>{details.reportingManager || 'Not set'}</dd></div></dl></div>} {tab === 'history' && <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow dark:bg-slate-900"><h2 className="text-xl font-bold">Offer history</h2><div className="mt-5 divide-y">{history.length ? history.map(item => <div key={item.id} className="flex items-center justify-between gap-4 py-3"><div><b>{item.action === 'STATUS_CHANGE' ? `Status changed to ${item.status}` : item.action === 'CREATE' ? 'Offer created' : 'Draft updated'}</b><p className="text-xs text-slate-500">Revision {item.revision}</p></div><time className="text-sm text-slate-500">{new Date(item.changed_at).toLocaleString()}</time></div>) : <p className="py-8 text-center text-sm text-slate-500">No history available yet.</p>}</div></div>}</main>
    {canManage && <footer className="border-t bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900"><div className="mx-auto flex max-w-[1500px] justify-end gap-2">{offer.status === OfferStatus.Signed && <Button onClick={() => onConvertToEmployee(offer)}>Convert to Employee</Button>}<Button variant="secondary" onClick={onClose}>Close</Button></div></footer>}
  </div>;
};

export default OfferDetailModal;
