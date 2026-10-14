import { normalizeCalendarDate, parseLocalCalendarDate } from './calendarDate';

/** Leave periods are calendar dates, not instants. Never serialize them via UTC. */
export const leaveDateFields = (request: { startDate?: Date | string; endDate?: Date | string }) => ({
  start_date: normalizeCalendarDate(request.startDate),
  end_date: normalizeCalendarDate(request.endDate),
});

export const leaveDurationDays = (start: string, end: string): number => {
  if (!start || !end || end < start) return 0;
  // UTC is used only for arithmetic on civil date parts, avoiding DST hours.
  const dayNumber = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
  };
  return dayNumber(end) - dayNumber(start) + 1;
};

export const isInLeavePeriod = (day: Date | string, start: Date | string, end: Date | string): boolean => {
  const date = normalizeCalendarDate(day), from = normalizeCalendarDate(start), to = normalizeCalendarDate(end);
  return !!date && !!from && !!to && date >= from && date <= to;
};

export const formatLeaveDate = (value: unknown, options: Intl.DateTimeFormatOptions = {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
}): string => {
  if (!(value instanceof Date) && typeof value !== 'string') return 'Date not recorded';
  const date = normalizeCalendarDate(value);
  return date ? parseLocalCalendarDate(date).toLocaleDateString('en-PH', options) : 'Date not recorded';
};
