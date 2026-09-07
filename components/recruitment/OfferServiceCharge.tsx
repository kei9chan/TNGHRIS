import React from 'react';
import type { OfferBuilderDetails } from '../../types';
import { offerServiceChargeTerms } from './serviceChargeTerms';

export default function OfferServiceCharge({ details, candidate = false }: { details?: OfferBuilderDetails; candidate?: boolean }) {
  const terms = offerServiceChargeTerms(details);
  if (!terms.length) return null;
  return <aside aria-label="Service charge" className={`my-4 rounded-xl border-2 border-violet-400 bg-violet-50 p-4 text-slate-900 ${candidate ? '' : 'dark:border-violet-500 dark:bg-violet-950/40 dark:text-white'}`}>
    <h3 className="text-base font-bold">Service charge</h3>
    {terms.map(term => <p key={term} className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{term}</p>)}
  </aside>;
}
