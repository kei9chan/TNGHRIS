import { supabase } from './supabaseClient';
import {
  PayslipRecord, GovernmentReport, GovernmentReportTemplate, FinalPayRecord,
  SSSTableRow, PhilHealthConfig, TaxTableRow, HolidayPolicy, Holiday,
} from '../types';

// ---------------------------------------------------------------------------
// Row Types
// ---------------------------------------------------------------------------
type PayslipRow = {
  id: string; employee_id: string; employee_name: string; period_start: string;
  period_end: string; basic_pay: number; overtime_pay: number; holiday_pay: number;
  night_diff: number; allowances: number; de_minimis: number; gross_pay: number;
  sss: number; philhealth: number; pagibig: number; tax: number;
  other_deductions: number; total_deductions: number; net_pay: number;
  status: string; business_unit_id?: string | null;
};

type GovernmentReportRow = {
  id: string; name: string; report_type: string; period: string;
  generated_at: string; data: any; status: string;
  business_unit_id?: string | null;
};

type GovernmentReportTemplateRow = {
  id: string; name: string; report_type: string; description: string;
  columns: any; is_active: boolean;
};

type FinalPayRow = {
  id: string; employee_id: string; employee_name: string;
  last_working_day: string; basic_pay_due: number; pro_rated_13th_month: number;
  leave_conversion: number; other_credits: number; total_credits: number;
  outstanding_loans: number; unreturned_assets_value: number;
  other_deductions: number; total_deductions: number; net_final_pay: number;
  status: string; computed_at: string; notes?: string | null;
  business_unit_id?: string | null;
};

type HolidayRow = {
  id: string; name: string; date: string; type: string;
  is_recurring: boolean; business_unit_id?: string | null;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const mapPayslip = (r: PayslipRow): PayslipRecord => ({
  id: r.id, employeeId: r.employee_id, employeeName: r.employee_name,
  periodStart: new Date(r.period_start), periodEnd: new Date(r.period_end),
  basicPay: r.basic_pay, overtimePay: r.overtime_pay, holidayPay: r.holiday_pay,
  nightDiff: r.night_diff, allowances: r.allowances, deMinimis: r.de_minimis,
  grossPay: r.gross_pay, sss: r.sss, philhealth: r.philhealth, pagibig: r.pagibig,
  tax: r.tax, otherDeductions: r.other_deductions, totalDeductions: r.total_deductions,
  netPay: r.net_pay, status: r.status as any,
  businessUnitId: r.business_unit_id || undefined,
} as any);

const mapGovernmentReport = (r: GovernmentReportRow): GovernmentReport => ({
  id: r.id, name: r.name, reportType: r.report_type as any,
  period: r.period, generatedAt: new Date(r.generated_at),
  data: r.data || {}, status: r.status as any,
  businessUnitId: r.business_unit_id || undefined,
} as any);

const mapGovernmentReportTemplate = (r: GovernmentReportTemplateRow): GovernmentReportTemplate => ({
  id: r.id, name: r.name, reportType: r.report_type as any,
  description: r.description,
  columns: Array.isArray(r.columns) ? r.columns : [],
  isActive: r.is_active,
} as any);

const mapFinalPay = (r: FinalPayRow): FinalPayRecord => ({
  id: r.id, employeeId: r.employee_id, employeeName: r.employee_name,
  lastWorkingDay: new Date(r.last_working_day),
  basicPayDue: r.basic_pay_due, proRated13thMonth: r.pro_rated_13th_month,
  leaveConversion: r.leave_conversion, otherCredits: r.other_credits,
  totalCredits: r.total_credits, outstandingLoans: r.outstanding_loans,
  unreturnedAssetsValue: r.unreturned_assets_value,
  otherDeductions: r.other_deductions, totalDeductions: r.total_deductions,
  netFinalPay: r.net_final_pay, status: r.status as any,
  computedAt: new Date(r.computed_at), notes: r.notes || undefined,
  businessUnitId: r.business_unit_id || undefined,
} as any);

const mapHoliday = (r: HolidayRow): Holiday => ({
  id: r.id, name: r.name, date: new Date(r.date),
  type: r.type as any, isRecurring: r.is_recurring,
  businessUnitId: r.business_unit_id || undefined,
} as any);

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

// Payslips
export const fetchPayslips = async (): Promise<PayslipRecord[]> => {
  const { data, error } = await supabase.from('payslips').select('*').order('period_start', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as PayslipRow[]).map(mapPayslip);
};

export const savePayslip = async (payslip: Partial<PayslipRecord> & Record<string, any>): Promise<PayslipRecord> => {
  const payload = {
    employee_id: payslip.employeeId, employee_name: payslip.employeeName,
    period_start: payslip.periodStart ? new Date(payslip.periodStart).toISOString().split('T')[0] : null,
    period_end: payslip.periodEnd ? new Date(payslip.periodEnd).toISOString().split('T')[0] : null,
    basic_pay: payslip.basicPay, overtime_pay: payslip.overtimePay,
    holiday_pay: payslip.holidayPay, night_diff: payslip.nightDiff,
    allowances: payslip.allowances, de_minimis: payslip.deMinimis,
    gross_pay: payslip.grossPay, sss: payslip.sss, philhealth: payslip.philhealth,
    pagibig: payslip.pagibig, tax: payslip.tax,
    other_deductions: payslip.otherDeductions, total_deductions: payslip.totalDeductions,
    net_pay: payslip.netPay, status: payslip.status,
    business_unit_id: payslip.businessUnitId || null,
  };
  const { data, error } = payslip.id
    ? await supabase.from('payslips').update(payload).eq('id', payslip.id).select().single()
    : await supabase.from('payslips').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return mapPayslip(data as PayslipRow);
};

// Government Reports
export const fetchGovernmentReports = async (): Promise<GovernmentReport[]> => {
  const { data, error } = await supabase.from('government_reports').select('*').order('generated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as GovernmentReportRow[]).map(mapGovernmentReport);
};

export const fetchGovernmentReportTemplates = async (): Promise<GovernmentReportTemplate[]> => {
  const { data, error } = await supabase.from('government_report_templates').select('*').order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as GovernmentReportTemplateRow[]).map(mapGovernmentReportTemplate);
};

// Final Pay
export const fetchFinalPayRecords = async (): Promise<FinalPayRecord[]> => {
  const { data, error } = await supabase.from('final_pay_records').select('*').order('computed_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as FinalPayRow[]).map(mapFinalPay);
};

// Payroll Config Tables
export const fetchSSSTable = async (): Promise<SSSTableRow[]> => {
  const { data, error } = await supabase.from('sss_table').select('*').order('range_start', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({
    rangeStart: r.range_start, rangeEnd: r.range_end,
    regularSS: r.regular_ss, wisp: r.wisp, ec: r.ec,
    totalContribution: r.total_contribution,
    employeeShare: r.employee_share, employerShare: r.employer_share,
  }));
};

export const fetchPhilHealthConfig = async (): Promise<PhilHealthConfig> => {
  const { data, error } = await supabase.from('philhealth_config').select('*').single();
  if (error) return { minSalary: 10000, maxSalary: 80000, rate: 0.04, employerShareRatio: 0.5 };
  return {
    minSalary: data.min_salary, maxSalary: data.max_salary,
    rate: data.rate, employerShareRatio: data.employer_share_ratio,
  };
};

export const fetchTaxTable = async (): Promise<TaxTableRow[]> => {
  const { data, error } = await supabase.from('tax_table').select('*').order('level', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({
    level: r.level, rangeStart: r.range_start, rangeEnd: r.range_end,
    baseTax: r.base_tax, rate: r.rate,
  }));
};

export const fetchHolidayPolicies = async (): Promise<HolidayPolicy[]> => {
  const { data, error } = await supabase.from('holiday_policies').select('*');
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({
    type: r.type, rate: r.rate, description: r.description,
  }));
};

export const fetchHolidays = async (): Promise<Holiday[]> => {
  const { data, error } = await supabase.from('holidays').select('*').order('date', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as HolidayRow[]).map(mapHoliday);
};
