const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Formats a Date using the browser's local calendar, without converting it to
 * UTC first. Date-only form values must not move a day when saved.
 */
export const toLocalCalendarDate = (value: Date = new Date()): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const normalizeCalendarDate = (value?: Date | string | null): string | null => {
  if (!value) return null;
  if (typeof value === 'string' && CALENDAR_DATE_PATTERN.test(value)) return value;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : toLocalCalendarDate(parsed);
};

export const parseLocalCalendarDate = (value: string): Date => {
  if (!CALENDAR_DATE_PATTERN.test(value)) return new Date(value);
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};
