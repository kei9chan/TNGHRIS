import type { OfferBuilderDetails } from '../../types';
import { formatPHP } from './offerCurrency';

const mentionsServiceCharge = (value: string) => /\bservice[\s-]*charges?\b/i.test(value);
/** Display saved terms only; never add service charge to guaranteed salary. */
export function offerServiceChargeTerms(details?: OfferBuilderDetails): string[] {
  if (!details) return [];
  const terms: string[] = [];
  if (details.commissionOrIncentive && mentionsServiceCharge(details.commissionOrIncentive)) terms.push(details.commissionOrIncentive.trim());
  for (const benefit of details.benefits || []) {
    if (benefit.included && mentionsServiceCharge(benefit.name || '')) {
      terms.push([benefit.name, benefit.value, benefit.description, benefit.eligibility && `Eligibility: ${benefit.eligibility}`, benefit.notes].filter(Boolean).join(' · '));
    }
  }
  for (const allowance of details.allowances || []) {
    if (mentionsServiceCharge(allowance.name || '')) terms.push(`${allowance.name}: ${formatPHP(allowance.amount)} · ${allowance.guaranteed ? 'Guaranteed' : 'Estimated'}`);
  }
  return [...new Set(terms.filter(Boolean))];
}
