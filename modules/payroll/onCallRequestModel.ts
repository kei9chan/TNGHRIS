import type { ManpowerCoverageDay, ManpowerRequestItem } from '../../types';

export const DEFAULT_ON_CALL_RATE = 610;

export const parseCalendarDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const toCalendarDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const enumerateCoverageDates = (startDate: string, endDate: string) => {
  if (!startDate || !endDate || endDate < startDate) return [];
  const dates: string[] = [];
  const cursor = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  while (cursor <= end) {
    dates.push(toCalendarDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

export const formatCoverageDate = (value: string, short = false) => parseCalendarDate(value).toLocaleDateString('en-US', {
  weekday: short ? 'short' : 'long',
  month: short ? 'short' : 'long',
  day: 'numeric',
  year: 'numeric',
});

export const deriveManpowerItem = (item: ManpowerRequestItem): ManpowerRequestItem => {
  const requiredFte = Math.max(0, Number(item.requiredFte ?? item.currentFte ?? 0) || 0);
  const reportingFte = Math.max(0, Number(item.reportingFte ?? item.currentFte ?? 0) || 0);
  const ratePerDay = Math.max(0, Number(item.ratePerDay ?? item.costPerHead ?? DEFAULT_ON_CALL_RATE) || 0);
  const onCallNeeded = Math.max(requiredFte - reportingFte, 0);
  return {
    ...item,
    requiredFte,
    reportingFte,
    onCallNeeded,
    currentFte: reportingFte,
    requestedCount: onCallNeeded,
    ratePerDay,
    costPerHead: ratePerDay,
    totalItemCost: onCallNeeded * ratePerDay,
    justification: item.reason || item.justification || '',
  };
};

export const deriveCoverageDay = (day: ManpowerCoverageDay): ManpowerCoverageDay => {
  const items = day.coverageRequired ? day.items.map(deriveManpowerItem) : [];
  return {
    ...day,
    items,
    totalStaff: items.reduce((sum, item) => sum + Number(item.onCallNeeded || 0), 0),
    totalCost: items.reduce((sum, item) => sum + Number(item.totalItemCost || 0), 0),
  };
};

export const coverageTotals = (days: ManpowerCoverageDay[]) => days.reduce((totals, rawDay) => {
  const day = deriveCoverageDay(rawDay);
  if (day.coverageRequired) totals.coverageDays += 1;
  totals.staffDays += day.totalStaff;
  totals.cost += day.totalCost;
  return totals;
}, { coverageDays: 0, staffDays: 0, cost: 0 });

const vagueReasons = new Set(['other', 'support', 'maintenance', 'additional coverage required', 'needed', 'n/a']);

export const isReasonVague = (reason?: string, detail?: string) => {
  const combined = `${reason || ''} ${detail || ''}`.trim().replace(/\s+/g, ' ');
  if (!combined) return true;
  if ((reason || '').trim().toLowerCase() === 'other' && !(detail || '').trim()) return true;
  if (combined.length < 18) return true;
  return vagueReasons.has(combined.toLowerCase());
};

export type OnCallWarning = {
  id: string;
  label: string;
  date?: string;
  action: 'clarify' | 'inspect';
};

export const getOnCallWarnings = (days: ManpowerCoverageDay[], generalNote?: string): OnCallWarning[] => {
  const warnings: OnCallWarning[] = [];
  if (!generalNote?.trim()) warnings.push({ id: 'context', label: 'No event or operational context provided.', action: 'clarify' });
  days.forEach(rawDay => {
    const day = deriveCoverageDay(rawDay);
    if (!day.coverageRequired) return;
    const label = formatCoverageDate(day.date, true);
    if (day.forecastedPax === 0 && day.totalStaff > 0) warnings.push({ id: `zero-pax-${day.date}`, date: day.date, label: `${label}: forecasted pax is zero while on-call staff are requested.`, action: 'inspect' });
    if (day.totalStaff >= 8) warnings.push({ id: `high-staff-${day.date}`, date: day.date, label: `${label}: requested headcount is unusually high.`, action: 'inspect' });
    if (day.totalCost >= 15000) warnings.push({ id: `high-cost-${day.date}`, date: day.date, label: `${label}: daily cost is above the usual review threshold.`, action: 'inspect' });
    day.items.forEach((item, index) => {
      if (Number(item.onCallNeeded || 0) <= 0) return;
      if (!item.shiftTime?.trim()) warnings.push({ id: `shift-${day.date}-${index}`, date: day.date, label: `${label}: shift coverage is unclear for ${item.departmentName || 'a department'}.`, action: 'clarify' });
      if (isReasonVague(item.reason, item.otherReason || item.departmentNote)) warnings.push({ id: `reason-${day.date}-${index}`, date: day.date, label: `${label}: the reason for ${item.departmentName || 'coverage'} needs more operational detail.`, action: 'clarify' });
    });
  });
  return warnings;
};

export const coverageRangeLabel = (days: ManpowerCoverageDay[]) => {
  if (!days.length) return 'No coverage dates';
  const first = parseCalendarDate(days[0].date);
  const last = parseCalendarDate(days[days.length - 1].date);
  if (days.length === 1) return formatCoverageDate(days[0].date);
  const firstLabel = first.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const lastLabel = last.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return `${firstLabel} – ${lastLabel}`;
};
