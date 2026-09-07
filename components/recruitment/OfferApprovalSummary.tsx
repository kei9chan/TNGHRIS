import OfferServiceCharge from './OfferServiceCharge';
import React from 'react';
import { Offer } from '../../types';
import { offerMonthlyPay } from './offerCurrency';
import { employmentTypeLabel } from './offerEmployment';

const money = (value: unknown) => value === undefined || value === null || value === '' || !Number.isFinite(Number(value)) ? 'Not specified' : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(Number(value));
const date = (value?: Date | string) => {
  if (!value) return 'Not specified';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not specified' : parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function OfferApprovalSummary({ offer }: { offer: Offer }) {
  const details = offer.offerDetails;
  const pay = offerMonthlyPay(offer, details);
  const terms = [
    ['Employment type', employmentTypeLabel(offer)],
    ['Start date', date(offer.startDate)],
    ['End date', date(offer.employmentEndDate)],
    ['Department', details?.department],
    ['Reporting to', details?.reportingManager],
    ['Work location', details?.workLocation],
    ['Work arrangement', details?.workSetup],
    ['Work schedule', [details?.workScheduleDays, details?.workScheduleHours].filter(Boolean).join(' · ')],
  ];
  return <section aria-label="Proposed offer" className="rounded-xl border-2 border-violet-400 bg-violet-50 p-4 sm:p-6 dark:border-violet-500 dark:bg-violet-950/40">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">Proposed offer · {offer.offerNumber}</p><h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{details?.jobTitle || 'Offer terms'}</h2></div><span className="text-sm text-slate-600 dark:text-slate-300">{offer.approvalStatus}</span></div>
    <div className="my-4 grid gap-4 sm:grid-cols-2"><div><p className="text-sm text-slate-600 dark:text-slate-300">Gross monthly pay</p><p className="break-words text-3xl font-black text-violet-800 dark:text-violet-200">{pay.specified ? money(pay.value) : 'Not specified'}</p></div><div><p className="text-sm text-slate-600 dark:text-slate-300">Annualized pay</p><p className="text-xl font-bold text-slate-900 dark:text-white">{money(details?.grossAnnualizedSalary)}</p></div></div>
    <OfferServiceCharge details={details} />
    <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{terms.map(([label, value]) => <div key={label}><dt className="text-slate-600 dark:text-slate-300">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-900 dark:text-white">{value || 'Not specified'}</dd></div>)}</dl>
    {!!details?.allowances?.length && <div className="mt-4 border-t border-violet-200 pt-4 dark:border-violet-800"><h3 className="font-bold">Allowances</h3><ul className="mt-2 space-y-1 text-sm">{details.allowances.map(item => <li key={item.id}>{item.name || 'Allowance'}: {money(item.amount)} · {item.guaranteed ? 'Guaranteed' : 'Estimated'}</li>)}</ul></div>}
    <p className="mt-4 text-xs text-slate-600 dark:text-slate-300">Read-only offer summary. The full offer remains available in Hiring packet documents.</p>
  </section>;
}
