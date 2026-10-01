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

export const offerMonthlyPackage = (offer: Partial<Offer>, details?: OfferBuilderDetails) => {
  const basic = offerMonthlyPay(offer, details);
  const allowances = (details?.allowances || []).filter(item => item.guaranteed && item.name?.trim() && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0);
  const benefits = (details?.benefits || []).filter(item => item.included && item.name?.trim() && Number.isFinite(Number(item.monthlyAmount)) && Number(item.monthlyAmount) > 0);
  const monthlyBenefits = allowances.reduce((sum, item) => sum + Number(item.amount), 0) + benefits.reduce((sum, item) => sum + Number(item.monthlyAmount), 0);
  return { basic, allowances, benefits, monthlyBenefits, total: basic.specified ? Number(basic.value || 0) + monthlyBenefits : undefined };
};
