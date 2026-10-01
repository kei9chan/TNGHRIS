import OfferServiceCharge from './OfferServiceCharge';
import React from 'react';
import { Offer } from '../../types';
import { offerMonthlyPackage } from './offerCurrency';
import { employmentTypeLabel } from './offerEmployment';

const money = (value: unknown) => value === undefined || value === null || value === '' || !Number.isFinite(Number(value)) ? 'Not specified' : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(Number(value));
const date = (value?: Date | string) => {
  if (!value) return 'Not specified';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not specified' : parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function OfferApprovalSummary({ offer }: { offer: Offer }) {
  const details = offer.offerDetails;
  const packagePay = offerMonthlyPackage(offer, details);
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
    <div className="my-4 rounded-xl border border-violet-200 bg-white p-4 dark:border-violet-800 dark:bg-slate-900"><p className="text-sm font-bold text-violet-700 dark:text-violet-300">Total fixed monthly package</p><p className="break-words text-3xl font-black text-violet-800 dark:text-violet-200">{money(packagePay.total)}</p><div className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-200"><p>Basic monthly salary: {packagePay.basic.specified ? money(packagePay.basic.value) : 'Not specified'}</p>{packagePay.allowances.map(item => <p key={`allowance-${item.id}`}>{item.name}: {money(item.amount)} / month</p>)}{packagePay.benefits.map(item => <p key={`benefit-${item.id}`}>{item.name}: {money(item.monthlyAmount)} / month</p>)}<p className="border-t border-violet-100 pt-2 font-semibold">Annual fixed package: {money(packagePay.total === undefined ? undefined : packagePay.total * 12)}</p></div></div>
    <OfferServiceCharge details={details} />
    <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{terms.map(([label, value]) => <div key={label}><dt className="text-slate-600 dark:text-slate-300">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-900 dark:text-white">{value || 'Not specified'}</dd></div>)}</dl>
    {!!details?.allowances?.some(item => !item.guaranteed) && <div className="mt-4 border-t border-violet-200 pt-4 dark:border-violet-800"><h3 className="font-bold">Estimated allowances (excluded from fixed total)</h3><ul className="mt-2 space-y-1 text-sm">{details.allowances.filter(item => !item.guaranteed).map(item => <li key={item.id}>{item.name || 'Allowance'}: {money(item.amount)}</li>)}</ul></div>}
    {!!details?.benefits?.some(item => item.included && !item.monthlyAmount) && <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">Other included benefits are listed in the offer document. Add a monthly cash amount in the offer builder for any benefit that belongs in this total.</p>}
    <p className="mt-4 text-xs text-slate-600 dark:text-slate-300">Read-only offer summary. The full offer remains available in Hiring packet documents.</p>
  </section>;
}
