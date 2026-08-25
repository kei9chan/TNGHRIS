export type TimeApprovalKind = 'leave' | 'wfh' | 'overtime';

type ApprovalContext = Record<string, unknown> | null | undefined;

const humanize = (value: unknown) => String(value ?? '')
  .replace(/^WFH_/, '')
  .replace(/_/g, ' ')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .trim()
  .toLowerCase()
  .replace(/\b\w/g, letter => letter.toUpperCase());

export const approvalContextNumber = (context: ApprovalContext, key: string): number | undefined => {
  const value = context?.[key];
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const approvalContextBoolean = (context: ApprovalContext, key: string): boolean | undefined => {
  const value = context?.[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return undefined;
};

export const formatApprovalNumber = (value: unknown): string => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '0';
  return parsed.toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

export const formatNumbersInApprovalText = (value: unknown): string => String(value ?? '')
  .replace(/-?\d+\.\d+/g, match => formatApprovalNumber(match));

const MANAGER_STATUSES = new Set([
  'Pending',
  'Submitted',
  'WFH_PENDING_DEPT_HEAD_APPROVAL',
  'LEAVE_PENDING_DEPT_HEAD_APPROVAL',
  'OT_PENDING_DEPT_HEAD_APPROVAL',
  'OVERTIME_PENDING_DEPT_HEAD_APPROVAL',
]);

const GM_STATUSES = new Set([
  'PendingGM',
  'WFH_PENDING_GM_APPROVAL',
  'LEAVE_PENDING_GM_APPROVAL',
  'OT_PENDING_GM_APPROVAL',
  'OVERTIME_PENDING_GM_APPROVAL',
]);

const BOD_STATUSES = new Set([
  'PendingBOD',
  'WFH_PENDING_BOD_APPROVAL',
  'LEAVE_PENDING_BOD_APPROVAL',
  'OT_PENDING_BOD_APPROVAL',
  'OVERTIME_PENDING_BOD_APPROVAL',
]);

export const isDirectManagerApprovalStatus = (status: unknown) => {
  const key = String(status ?? '').trim();
  return MANAGER_STATUSES.has(key) || /_PENDING_(?:DEPT(?:ARTMENT)?_HEAD|DIRECT_MANAGER)_APPROVAL$/i.test(key);
};

export const isBodApprovalStatus = (status: unknown) => {
  const key = String(status ?? '').trim();
  return BOD_STATUSES.has(key) || /_PENDING_BOD(?:_FINAL)?_APPROVAL$/i.test(key);
};

export const getApprovalStatusLabel = (status: unknown): string => {
  const key = String(status ?? '').trim();
  if (isDirectManagerApprovalStatus(key)) return 'Pending Direct Manager approval';
  if (GM_STATUSES.has(key)) return 'Pending GM approval';
  if (isBodApprovalStatus(key)) return 'BOD approval';
  if (/_PENDING_HR(?:_MANAGER)?_APPROVAL$/i.test(key)) return 'Pending HR approval';
  if (/_PENDING_BUSINESS_UNIT_MANAGER_APPROVAL$/i.test(key)) return 'Pending Business Unit Manager approval';
  if (key === 'WFH_FOR_TIMEKEEPING') return 'Timekeeping review';
  if (key === 'PendingApproval' || key === 'Pending Approval') return 'Pending approval';
  return humanize(key) || 'Pending approval';
};

export const getApprovalStepLabel = (status: unknown, fallback?: string): string => {
  const key = String(status ?? '').trim();
  if (isDirectManagerApprovalStatus(key)) return 'Direct Manager review';
  if (GM_STATUSES.has(key)) return 'GM review';
  if (isBodApprovalStatus(key)) return 'BOD review';
  if (/_PENDING_HR(?:_MANAGER)?_APPROVAL$/i.test(key)) return 'HR review';
  if (/_PENDING_BUSINESS_UNIT_MANAGER_APPROVAL$/i.test(key)) return 'Business Unit Manager review';
  if (key === 'WFH_FOR_TIMEKEEPING') return 'Timekeeping review';

  const fallbackKey = String(fallback ?? '').trim();
  if (/dept(?:artment)? head|direct manager/i.test(fallbackKey)) return 'Direct Manager review';
  if (/\bbod\b|board of director/i.test(fallbackKey)) return 'BOD review';
  if (/\bgm\b|general manager/i.test(fallbackKey)) return 'GM review';
  return fallbackKey ? formatNumbersInApprovalText(fallbackKey) : getApprovalStatusLabel(key);
};

export const getApprovalActionLabel = (status: unknown, fallback?: string): string => {
  const key = String(status ?? '').trim();
  if (isDirectManagerApprovalStatus(key)) return 'Pending Direct Manager Review';
  if (GM_STATUSES.has(key)) return 'Pending GM Approval';
  if (isBodApprovalStatus(key)) return 'Pending BOD Final Approval';
  if (/_PENDING_HR(?:_MANAGER)?_APPROVAL$/i.test(key)) return 'Pending HR Approval';
  if (/_PENDING_BUSINESS_UNIT_MANAGER_APPROVAL$/i.test(key)) return 'Pending Business Unit Manager Approval';
  if (key === 'WFH_FOR_TIMEKEEPING') return 'Pending Timekeeping Review';

  const fallbackKey = String(fallback ?? '').trim();
  return fallbackKey ? formatNumbersInApprovalText(fallbackKey) : getApprovalStatusLabel(key);
};

const parseDateOnly = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export type OvertimeWeekDetails = {
  range?: string;
  dateRange?: string;
  workweekNote?: string;
  weeklyOt?: string;
  total?: string;
  detail?: string;
};

export const getOvertimeWeekDetails = (context: ApprovalContext): OvertimeWeekDetails => {
  const weekStart = parseDateOnly(context?.weekStart);
  const weekEnd = weekStart ? new Date(weekStart) : undefined;
  if (weekEnd) weekEnd.setDate(weekEnd.getDate() + 6);

  let range: string | undefined;
  let dateRange: string | undefined;
  if (weekStart && weekEnd) {
    const sameMonth = weekStart.getMonth() === weekEnd.getMonth() && weekStart.getFullYear() === weekEnd.getFullYear();
    const startLabel = weekStart.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    const endLabel = weekEnd.toLocaleDateString('en-PH', sameMonth
      ? { day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' });
    const startDay = weekStart.toLocaleDateString('en-PH', { weekday: 'short' });
    const endDay = weekEnd.toLocaleDateString('en-PH', { weekday: 'short' });
    dateRange = `${startLabel}–${endLabel}`;
    range = `${dateRange} (${startDay}–${endDay})`;
  }

  const weeklyOt = approvalContextNumber(context, 'weekOtHours');
  const total = approvalContextNumber(context, 'totalWeekHours');
  const threshold = approvalContextNumber(context, 'threshold');
  const exceeded = total !== undefined && threshold !== undefined ? Math.max(0, total - threshold) : undefined;
  const totalLabel = total !== undefined && threshold !== undefined
    ? `${formatApprovalNumber(total)} / ${formatApprovalNumber(threshold)} hours${exceeded && exceeded > 0 ? ` — exceeded by ${formatApprovalNumber(exceeded)} hours.` : ' — within limit.'}`
    : total !== undefined ? `${formatApprovalNumber(total)} hours` : undefined;

  let detail: string | undefined;
  if (range && total !== undefined && threshold !== undefined) {
    const plainRange = range.replace(/ \([^)]*\)$/, '');
    detail = exceeded && exceeded > 0
      ? `This request brings the employee’s total hours for ${plainRange} to ${formatApprovalNumber(total)} hours, exceeding the ${formatApprovalNumber(threshold)}-hour weekly limit by ${formatApprovalNumber(exceeded)} hours.`
      : `This request brings the employee’s total hours for ${plainRange} to ${formatApprovalNumber(total)} hours, within the ${formatApprovalNumber(threshold)}-hour weekly limit.`;
  }

  return {
    range,
    dateRange,
    workweekNote: weekStart && weekEnd
      ? `Based on the configured ${weekStart.toLocaleDateString('en-PH', { weekday: 'long' })}–${weekEnd.toLocaleDateString('en-PH', { weekday: 'long' })} workweek`
      : undefined,
    weeklyOt: weeklyOt !== undefined ? `${formatApprovalNumber(weeklyOt)} hours` : undefined,
    total: totalLabel,
    detail,
  };
};

export const getTimeApprovalReason = (
  kind: TimeApprovalKind,
  context: ApprovalContext,
  fallback?: string,
  requiresBod?: boolean,
): string | undefined => {
  const threshold = approvalContextNumber(context, 'threshold');
  const contextRequiresBod = approvalContextBoolean(context, 'requiresBod');
  const overThreshold = contextRequiresBod ?? requiresBod ?? false;

  if (kind === 'wfh') {
    const days = approvalContextNumber(context, 'monthWfhDays');
    if (days !== undefined && threshold !== undefined) {
      return `${formatApprovalNumber(days)} WFH days ${overThreshold ? 'exceed' : 'within'} the ${formatApprovalNumber(threshold)}-day monthly threshold.`;
    }
  }

  if (kind === 'leave') {
    const leaveDays = approvalContextNumber(context, 'yearLeaveDays');
    const monthsRemaining = approvalContextNumber(context, 'monthsRemaining');
    if (leaveDays !== undefined && threshold !== undefined) {
      const period = monthsRemaining !== undefined ? ` for ${formatApprovalNumber(monthsRemaining)} months remaining` : '';
      return `${formatApprovalNumber(leaveDays)} leave days ${overThreshold ? 'exceed' : 'within'} the ${formatApprovalNumber(threshold)}-day allowance${period}.`;
    }
  }

  if (kind === 'overtime') {
    const total = approvalContextNumber(context, 'totalWeekHours');
    if (total !== undefined && threshold !== undefined) {
      return `${formatApprovalNumber(total)} total weekly hours ${overThreshold ? 'exceed' : 'within'} the ${formatApprovalNumber(threshold)}-hour threshold.`;
    }
  }

  const reason = context?.reason || fallback;
  return reason ? formatNumbersInApprovalText(reason) : undefined;
};

export const getTimeApprovalNextStep = (status: unknown, requiresBod: boolean) =>
  requiresBod && isDirectManagerApprovalStatus(status) ? 'Next: BOD approval' : undefined;
