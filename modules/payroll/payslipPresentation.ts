export type PayslipLine = {
  label?: string;
  amount?: string | number;
  remaining?: string | number;
  kind?: string;
  category?: string;
  date?: string;
  quantity?: string | number;
  rate?: string | number;
  factor?: string | number;
  account?: string;
  installment?: string | number;
  totalInstallments?: string | number;
  projectedBalance?: string | number;
  sourceRef?: string;
};

export type EmployeePayslipDocumentData = {
  id?: string;
  runId?: string;
  employeeName: string;
  employeeNumber?: string;
  employeeCode?: string;
  businessUnit?: string;
  department?: string;
  position?: string;
  from: string;
  to: string;
  payDate: string;
  gross: string | number;
  deductions: string | number;
  net: string | number;
  tax?: string | number;
  employer?: string | number;
  lines?: PayslipLine[] | null;
  contributions?: PayslipLine[] | null;
  loans?: PayslipLine[] | null;
  otherDeductions?: PayslipLine[] | null;
  payrollStatus?: string;
  status?: string;
  version?: string;
  generatedAt?: string;
  releasedAt?: string;
  correctionKind?: string;
  acknowledgedAt?: string;
  attendanceSummary?: Record<string, string | number | null | undefined>;
};

export type DisplayRow = {label: string; amount: number; units?: string};

const contributionLabels: Record<string, string> = {
  sssEE: 'SSS employee share',
  sssER: 'SSS employer share',
  mpfEE: 'SSS MPF employee share',
  mpfER: 'SSS MPF employer share',
  ecER: 'Employees compensation — employer share',
  philhealthEE: 'PhilHealth employee share',
  philhealthER: 'PhilHealth employer share',
  pagibigEE: 'Pag-IBIG employee share',
  pagibigER: 'Pag-IBIG employer share',
};

export const peso = (value: unknown) =>
  new Intl.NumberFormat('en-PH', {style: 'currency', currency: 'PHP'}).format(Number(value || 0));

export const isActualAmount = (value: unknown) =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Math.abs(Number(value)) >= 0.005;

export const friendlyContribution = (label = '') => contributionLabels[label] || label;

const displayQuantity = (value: string | number) =>
  new Intl.NumberFormat('en-PH', {maximumFractionDigits: 2}).format(Number(value));

const units = (line: PayslipLine) => {
  if (line.quantity === null || line.quantity === undefined || line.quantity === '') return undefined;
  const label = line.label || '';
  const quantity = displayQuantity(line.quantity);
  if (/late/i.test(label)) return `${quantity} min`;
  if (/day|leave|absence|holiday/i.test(label)) return `${quantity} day${Number(line.quantity) === 1 ? '' : 's'}`;
  return `${quantity} hr${Number(line.quantity) === 1 ? '' : 's'}`;
};

const aggregate = (rows: DisplayRow[]) => {
  const result = new Map<string, DisplayRow>();
  rows.forEach(row => {
    const key = row.label.trim().toLowerCase();
    const prior = result.get(key);
    if (!prior) result.set(key, {...row});
    else {
      prior.amount += row.amount;
      if (row.units && prior.units !== row.units) prior.units = undefined;
    }
  });
  return [...result.values()].filter(row => isActualAmount(row.amount));
};

export function employeeEarnings(s: EmployeePayslipDocumentData): DisplayRow[] {
  return aggregate((s.lines || [])
    .filter(line => line.kind !== 'deduction' && line.kind !== 'employer' && isActualAmount(line.remaining ?? line.amount))
    .map(line => ({label: line.label || 'Approved earnings', amount: Number(line.remaining ?? line.amount), units: units(line)})));
}

function installmentLabel(line: PayslipLine, fallback: string) {
  const base = line.label || (line.account ? `${line.account} loan` : fallback);
  return line.installment && line.totalInstallments
    ? `${base} — Installment ${line.installment} of ${line.totalInstallments}`
    : base;
}

export function employeeDeductions(s: EmployeePayslipDocumentData): DisplayRow[] {
  const rows: DisplayRow[] = [];
  (s.contributions || []).filter(line => /EE$/.test(line.label || '') && isActualAmount(line.amount))
    .forEach(line => rows.push({label: friendlyContribution(line.label), amount: Number(line.amount)}));
  if (isActualAmount(s.tax)) rows.push({label: 'Withholding tax', amount: Number(s.tax)});
  (s.lines || []).filter(line => line.kind === 'deduction' && isActualAmount(line.remaining ?? line.amount))
    .forEach(line => rows.push({label: installmentLabel(line, 'Approved deduction'), amount: Number(line.remaining ?? line.amount), units: units(line)}));
  (s.loans || []).filter(line => isActualAmount(line.remaining ?? line.amount))
    .forEach(line => rows.push({label: installmentLabel(line, 'Employee loan'), amount: Number(line.remaining ?? line.amount)}));
  (s.otherDeductions || []).filter(line => isActualAmount(line.remaining ?? line.amount))
    .forEach(line => rows.push({label: installmentLabel(line, 'Other approved deduction'), amount: Number(line.remaining ?? line.amount)}));
  return aggregate(rows);
}

export function employerContributions(s: EmployeePayslipDocumentData): DisplayRow[] {
  return aggregate((s.contributions || [])
    .filter(line => /ER$/.test(line.label || '') && isActualAmount(line.amount))
    .map(line => ({label: friendlyContribution(line.label), amount: Number(line.amount)})));
}

const attendanceLabels: Record<string, string> = {
  paidDays: 'Paid days', lateMinutes: 'Late minutes', undertimeHours: 'Undertime hours',
  absenceDays: 'Absence days', overtimeHours: 'Overtime hours', holidaysWorked: 'Holidays worked',
  restDaysWorked: 'Rest days worked',
};

export function attendanceSummary(s: EmployeePayslipDocumentData) {
  const explicit = Object.entries(s.attendanceSummary || {})
    .filter(([key, value]) => attendanceLabels[key] && value !== null && value !== undefined && Number(value) !== 0)
    .map(([key, value]) => ({label: attendanceLabels[key], value: String(value)}));
  if (explicit.length) return explicit;
  const lines = s.lines || [];
  const overtime = lines.filter(l => /overtime|\bot\b/i.test(l.label || '')).reduce((sum, l) => sum + Number(l.quantity || 0), 0);
  const late = lines.filter(l => /late/i.test(l.label || '')).reduce((sum, l) => sum + Number(l.quantity || 0), 0);
  const undertime = lines.filter(l => /undertime/i.test(l.label || '')).reduce((sum, l) => sum + Number(l.quantity || 0), 0);
  const paidDates = new Set(lines.filter(l => l.date && l.kind !== 'deduction' && isActualAmount(l.amount)).map(l => l.date));
  return [
    paidDates.size ? {label: 'Paid days', value: String(paidDates.size)} : null,
    late ? {label: 'Late minutes', value: String(late)} : null,
    undertime ? {label: 'Undertime hours', value: String(undertime)} : null,
    overtime ? {label: 'Overtime hours', value: String(overtime)} : null,
  ].filter(Boolean) as {label: string; value: string}[];
}

export function payslipStatus(s: EmployeePayslipDocumentData, test = false) {
  if (test) return {label: 'TEST / DRAFT — NOT FOR PAYMENT', official: false};
  if (s.correctionKind === 'revised') return {label: 'Corrected payslip', official: true};
  if (s.payrollStatus === 'Superseded') return {label: 'Superseded', official: false};
  return {label: 'Official Payroll Payslip', official: true};
}

export function missingPayWarnings(s: EmployeePayslipDocumentData) {
  const warnings: string[] = [];
  if (s.gross === null || s.gross === undefined || s.gross === '') warnings.push('Gross pay is missing.');
  if (s.deductions === null || s.deductions === undefined || s.deductions === '') warnings.push('Total deductions are missing.');
  if (s.net === null || s.net === undefined || s.net === '') warnings.push('Net pay is missing.');
  return warnings;
}
