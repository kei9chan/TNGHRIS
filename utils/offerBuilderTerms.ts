import type { Offer, OfferBuilderDetails } from '../types';

// Compare editable content to the loaded/saved baseline, rather than remembering
// that an input fired once. Review acknowledgment and delivery state are not terms.
const canonicalize = (value: any): any => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonicalize(value[key])]),
  );
  return value;
};

export const offerBuilderTermsSnapshot = (applicationId: string, offer: Partial<Offer>, details: OfferBuilderDetails): string => {
  const terms = Object.fromEntries(Object.entries(details).filter(([key]) => !['termsReviewed', 'emailDelivery', 'welcomeEmail'].includes(key)));
  return JSON.stringify(canonicalize({
    applicationId,
    basePay: offer.basePay,
    basePaySpecified: offer.basePaySpecified,
    startDate: offer.startDate,
    probationMonths: offer.probationMonths,
    employmentType: offer.employmentType,
    employmentTypeCustomName: offer.employmentTypeCustomName,
    employmentEndDate: offer.employmentEndDate,
    logoUrl: offer.logoUrl,
    logoPath: offer.logoPath,
    offerExpirationDate: offer.offerExpirationDate,
    offerTemplateId: offer.offerTemplateId,
    offerTemplateSnapshot: offer.offerTemplateSnapshot,
    details: terms,
  }));
};
