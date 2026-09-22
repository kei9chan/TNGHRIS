export type LeaveKind = 'vacation' | 'sick' | 'offset' | 'lwop';
export type ExceptionOutcome = 'paid_exception' | 'lwop';
export type ImportStatus = 'valid' | 'review' | 'invalid' | 'not_applicable';

export const leaveKindFromName = (name = ''): LeaveKind => {
  const value = name.trim().toLowerCase();
  if (value.includes('vacation')) return 'vacation';
  if (value.includes('sick')) return 'sick';
  if (value.includes('offset')) return 'offset';
  return 'lwop';
};

export const leavePresentation = (name: string, available: number) => {
  const kind = leaveKindFromName(name);
  const paid = kind !== 'lwop';
  return {
    kind,
    paid,
    label: kind === 'lwop' ? 'Leave Without Pay' : name,
    description: kind === 'vacation' ? 'Planned paid time off'
      : kind === 'sick' ? 'Paid time off for illness'
      : kind === 'offset' ? 'Paid time earned from approved offset work'
      : 'Unpaid leave that does not use credits',
    available: paid ? Math.max(0, Number(available) || 0) : null,
  };
};

export function classifyLeaveRequest(selectedName: string, requestedDays: number, availableCredits: number, confirmed = false) {
  const selectedKind = leaveKindFromName(selectedName);
  const requested = Math.max(0, Number(requestedDays) || 0);
  const available = selectedKind === 'lwop' ? 0 : Math.max(0, Number(availableCredits) || 0);
  const paidDays = selectedKind === 'lwop' ? 0 : Math.min(requested, available);
  const unpaidDays = selectedKind === 'lwop' ? requested : Math.max(0, requested - paidDays);
  const creditShortfall = unpaidDays;
  const requiresConfirmation = selectedKind !== 'lwop' && creditShortfall > 0 && !confirmed;
  return {
    selectedKind,
    requestedDays: requested,
    availableCredits: available,
    paidDays,
    unpaidDays,
    creditShortfall,
    balanceAfter: selectedKind === 'lwop' ? available : available - requested,
    finalClassification: unpaidDays > 0 ? 'lwop' as const : 'paid' as const,
    requiresConfirmation,
  };
}

export type RawBalanceRow = {
  employeeId?: string; employeeName?: string; businessUnit?: string; leaveType?: string;
  openingBalance?: unknown; accruedCredits?: unknown; usedCredits?: unknown; remainingBalance?: unknown;
  asOfDate?: string; source?: string; supportingDocument?: string; notes?: string;
};

export type ValidatedBalanceRow = RawBalanceRow & {
  rowNumber: number; status: ImportStatus; messages: string[];
  openingBalance: number; accruedCredits: number; usedCredits: number; remainingBalance: number;
};

const numberOrNaN = (value: unknown) => value === '' || value == null ? 0 : Number(value);
const knownKinds = new Set(['vacation leave', 'sick leave', 'offset leave', 'leave without pay', 'without pay', 'lwop']);

export function validateBalanceRows(rows: RawBalanceRow[], existingKeys = new Set<string>()): ValidatedBalanceRow[] {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const messages: string[] = [];
    const leaveType = String(row.leaveType || '').trim();
    const employeeId = String(row.employeeId || '').trim();
    const kind = leaveType.toLowerCase();
    const openingBalance = numberOrNaN(row.openingBalance);
    const accruedCredits = numberOrNaN(row.accruedCredits);
    const usedCredits = numberOrNaN(row.usedCredits);
    const remainingBalance = numberOrNaN(row.remainingBalance);
    let status: ImportStatus = 'valid';
    if (!employeeId) messages.push('Missing employee ID');
    if (!knownKinds.has(kind)) messages.push('Unknown leave type');
    if (!row.asOfDate || !/^\d{4}-\d{2}-\d{2}$/.test(row.asOfDate)) messages.push('Missing or invalid as-of date');
    if ([openingBalance, accruedCredits, usedCredits, remainingBalance].some(value => !Number.isFinite(value))) messages.push('Balance fields must be numbers');
    if ([openingBalance, accruedCredits, usedCredits, remainingBalance].some(value => value < 0)) messages.push('Invalid negative balance');
    if (usedCredits > openingBalance + accruedCredits) messages.push('Used credits exceed opening plus accrued credits');
    if (Number.isFinite(remainingBalance) && Math.abs(remainingBalance - (openingBalance + accruedCredits - usedCredits)) > 0.001) messages.push('Remaining balance does not match opening + accrued − used');
    const key = `${employeeId.toLowerCase()}:${kind}`;
    if (seen.has(key)) messages.push('Duplicate employee and leave type');
    seen.add(key);
    if (existingKeys.has(key)) messages.push('Existing balance conflict — approval will create an adjustment record');
    if (kind === 'leave without pay' || kind === 'without pay' || kind === 'lwop') {
      status = 'not_applicable';
      messages.splice(0, messages.length, 'Leave Without Pay does not carry a credit balance');
    } else if (messages.some(message => /Missing|Unknown|must be numbers|negative|exceed|does not match/.test(message))) status = 'invalid';
    else if (messages.length) status = 'review';
    return {...row, rowNumber: index + 1, employeeId, leaveType, openingBalance, accruedCredits, usedCredits, remainingBalance, status, messages};
  });
}

export function balanceApprovalRoute(creatorRoles: string[], employeeRole: string) {
  const normalized = employeeRole.toLowerCase().replace(/\s+/g, ' ').trim();
  const protectedRoles = ['business unit manager','manager','manager / team leader','general manager','generalmanager','operations manager','operations director','auditor'];
  if (protectedRoles.includes(normalized)) return 'pending_bod' as const;
  if (creatorRoles.some(role => role.toLowerCase() === 'hr manager')) return 'pending_bod' as const;
  return 'pending_hr_manager' as const;
}
