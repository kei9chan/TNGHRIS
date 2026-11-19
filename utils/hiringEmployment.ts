import type { JobRequisition } from '../types';

export const HIRING_EMPLOYMENT_TYPES = ['Full-Time', 'Part-Time', 'Contract', 'Seasonal', 'Weekender'] as const;
export type HiringEmploymentLabel = JobRequisition['employmentType'] | `Seasonal (${number} ${'month' | 'months'})`;

export function seasonalMonthsError(type?: string, months?: number | null): string {
  return type === 'Seasonal' && (!Number.isSafeInteger(months) || Number(months) < 1)
    ? 'Enter the seasonal duration as a positive whole number of months.'
    : '';
}

export function hiringEmploymentLabel(req: Pick<JobRequisition, 'employmentType' | 'seasonalMonths'>): HiringEmploymentLabel {
  return req.employmentType === 'Seasonal' && req.seasonalMonths
    ? `Seasonal (${req.seasonalMonths} ${req.seasonalMonths === 1 ? 'month' : 'months'})`
    : req.employmentType;
}
