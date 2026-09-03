import { Offer, OfferEmploymentType } from '../../types';

export const DEFAULT_ADDITIONAL_OFFER_TERMS = 'Please note that the Company reserves the right to revoke this offer or terminate employment should any material misrepresentation, adverse finding, or non-compliance with pre-employment requirements be discovered, whether before or after the start date.';

export const OFFER_EMPLOYMENT_TYPES: OfferEmploymentType[] = [
  'Regular',
  'Probationary',
  'Seasonal / Fixed-Term',
  'Consultant / Contractor',
  'Custom',
];

export const normalizeOfferEmploymentType = (value?: string): {
  type: OfferEmploymentType;
  customName?: string;
} => {
  if (OFFER_EMPLOYMENT_TYPES.includes(value as OfferEmploymentType)) return { type: value as OfferEmploymentType };
  if (value === 'Contract') return { type: 'Consultant / Contractor' };
  if (value === 'Part-Time') return { type: 'Custom', customName: 'Part-Time' };
  return { type: 'Regular' };
};

export const employmentTypeLabel = (offer: Pick<Offer, 'employmentType' | 'employmentTypeCustomName'>): string =>
  offer.employmentType === 'Custom'
    ? offer.employmentTypeCustomName?.trim() || 'Custom'
    : offer.employmentType || '—';

export const employmentEndDateApplies = (
  type?: OfferEmploymentType,
  customEndDateApplies = false,
): boolean => type === 'Probationary'
  || type === 'Seasonal / Fixed-Term'
  || type === 'Consultant / Contractor'
  || (type === 'Custom' && customEndDateApplies);

export const employmentEndDateRequired = (
  type?: OfferEmploymentType,
  customEndDateApplies = false,
): boolean => type === 'Seasonal / Fixed-Term'
  || type === 'Consultant / Contractor'
  || (type === 'Custom' && customEndDateApplies);

export const suggestedProbationEndDate = (startDate?: Date | string, months = 6): Date | undefined => {
  if (!startDate) return undefined;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return undefined;
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  return end;
};
