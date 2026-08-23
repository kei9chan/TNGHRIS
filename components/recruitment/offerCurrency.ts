import { Offer, OfferBuilderDetails } from '../../types';

export const isMoneySpecified = (value: unknown, explicit?: boolean): boolean => {
  if (explicit === true) return true;
  if (explicit === false) return false;
  return value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
};

export const formatPHP = (value: unknown, explicit?: boolean, empty = '—'): string => {
  if (!isMoneySpecified(value, explicit)) return empty;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return empty;
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(amount);
};

export const offerMonthlyPay = (offer: Partial<Offer>, details?: OfferBuilderDetails): { value?: number; specified: boolean } => {
  const detailsSpecified = details?.compensationEntered === true;
  const legacyPositive = Number(details?.grossMonthlySalary ?? offer.basePay ?? 0) > 0;
  const specified = detailsSpecified || offer.basePaySpecified === true || legacyPositive;
  return { value: details?.grossMonthlySalary ?? offer.basePay, specified };
};

