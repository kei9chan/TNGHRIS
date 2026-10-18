import type { ManpowerRequest } from '../types';

export type OnCallSummary = ReturnType<typeof getOnCallApprovalSummary>;
const text = (value?: string) => String(value || '').replace(/\s+/g, ' ').trim();
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const dateText = (value: string) => {
  const date = new Date(value + 'T12:00:00+08:00');
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }).format(date) : 'Date not recorded';
};
export const onCallPeso = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(value);

export function getOnCallApprovalSummary(request: ManpowerRequest) {
  const source = request.coverageDays?.length ? request.coverageDays : [{ date: request.startDate || '', coverageRequired: true, items: request.items, totalStaff: 0, totalCost: request.grandTotal, reason: request.generalNote }];
  const days = source.filter(day => day.coverageRequired !== false).map(day => {
    const count = day.items?.length ? day.items.reduce((sum, item) => sum + number(item.onCallNeeded ?? item.requestedCount), 0) : number(day.totalStaff);
    const reasons = [day.reason, ...(day.items || []).map(item => item.justification || (item.reason === 'Other' ? item.otherReason : item.reason))].map(text).filter(Boolean);
    return { date: day.date, dateLabel: dateText(day.date), staff: count, cost: number(day.totalCost), reason: [...new Set(reasons)].join('; ') };
  }).sort((a, b) => a.date.localeCompare(b.date));
  const counts = days.map(day => day.staff);
  const low = counts.length ? Math.min(...counts) : 0, high = counts.length ? Math.max(...counts) : 0;
  const staffDays = counts.reduce((sum, count) => sum + count, 0);
  const staffLabel = days.length <= 1 ? `${high} on-call staff` : `${low === high ? high : `${low}–${high}`} staff / day`;
  const reason = [...new Set(days.map(day => day.reason).filter(Boolean))].join('; ') || text(request.generalNote) || 'Reason not recorded';
  const first = days[0]?.date || request.startDate || '', last = days.at(-1)?.date || request.endDate || first;
  const dateLabel = first === last ? dateText(first) : `${dateText(first)} – ${dateText(last)}`;
  const totalCost = number(request.grandTotal);
  return { days, dateLabel, staffLabel, staffDays, reason, totalCost, costLabel: totalCost > 0 ? onCallPeso(totalCost) : 'Cost not recorded', complete: days.length > 0 && days.every(day => day.dateLabel !== 'Date not recorded') && counts.every(count => count > 0) && totalCost > 0 && reason !== 'Reason not recorded' };
}
