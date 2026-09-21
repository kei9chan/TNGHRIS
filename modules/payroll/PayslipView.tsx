import React from 'react';
import {EmployeePayslip, PayLine} from './selfService';
import EmployeePayslipDocument from './EmployeePayslipDocument';
import {employeeDeductions, employeeEarnings} from './payslipPresentation';

// Retained for existing callers, but now returns only aggregated employee-safe
// lines. Daily punches and technical calculation fields live in the internal
// payroll report instead of the employee payslip.
export function payslipGroups(s: EmployeePayslip): {title: string; lines: PayLine[]}[] {
  const earnings = employeeEarnings(s).map(row => ({label: row.label, amount: String(row.amount)}));
  const deductions = employeeDeductions(s).map(row => ({label: row.label, amount: String(row.amount), kind: 'deduction'}));
  return [{title: 'Earnings', lines: earnings}, {title: 'Deductions', lines: deductions}];
}

export default function PayslipView({slip}: {slip: EmployeePayslip}) {
  return <EmployeePayslipDocument slip={slip} compact />;
}
