import React from 'react';
import {
  attendanceSummary,
  employeeDeductions,
  employeeEarnings,
  EmployeePayslipDocumentData,
  employerContributions,
  missingPayWarnings,
  payslipStatus,
  peso,
} from './payslipPresentation';

const date = (value?: string) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-PH', {year: 'numeric', month: 'long', day: 'numeric'}) : 'Pending';

function PayTable({title, rows, totalLabel, total}: {title: string; rows: {label: string; amount: number; units?: string}[]; totalLabel: string; total: unknown}) {
  if (!rows.length) return null;
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <h3 className="bg-gradient-to-r from-blue-50 to-violet-50 px-5 py-4 text-base font-extrabold uppercase tracking-wide text-[#172d63]">{title}</h3>
    <table className="w-full text-sm">
      <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Description</th><th className="px-3 py-3">Units</th><th className="px-5 py-3 text-right">Amount</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr className="border-b border-slate-100 last:border-0" key={`${row.label}:${index}`}><td className="px-5 py-3 font-medium text-slate-800">{row.label}</td><td className="px-3 py-3 text-slate-500">{row.units || '—'}</td><td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums text-slate-900">{peso(row.amount)}</td></tr>)}</tbody>
      <tfoot><tr className="bg-slate-50 font-extrabold text-[#172d63]"><td className="px-5 py-4" colSpan={2}>{totalLabel}</td><td className="whitespace-nowrap px-5 py-4 text-right tabular-nums">{peso(total)}</td></tr></tfoot>
    </table>
  </section>;
}

export default function EmployeePayslipDocument({slip: s, test = false, compact = false}: {slip: EmployeePayslipDocumentData; test?: boolean; compact?: boolean}) {
  const status = payslipStatus(s, test);
  const earnings = employeeEarnings(s), deductions = employeeDeductions(s), employer = employerContributions(s), attendance = attendanceSummary(s), warnings = missingPayWarnings(s);
  return <article aria-label="Employee payslip" className={`mx-auto w-full max-w-[920px] overflow-hidden rounded-2xl bg-white text-slate-900 shadow-sm ${compact ? '' : 'border border-slate-200'}`}>
    <header className="border-b-2 border-[#172d63] px-5 py-5 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-3xl font-black tracking-tight text-[#102757]">TNG <span className="text-violet-700">HRIS</span></div><p className="text-[10px] font-semibold uppercase tracking-[.28em] text-slate-500">People work a brighter tomorrow</p></div><div className="text-right"><h1 className="text-3xl font-black tracking-wide text-[#102757]">PAYSLIP</h1><span className={`mt-2 inline-block rounded-lg px-3 py-2 text-xs font-extrabold ${status.official ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{status.label}</span></div></div>
      {test && <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-center text-sm font-bold text-amber-950">TEST PAYROLL — This document does not release payment or submit government records.</div>}
      <div className="mt-6 grid gap-5 md:grid-cols-2"><div><h2 className="text-2xl font-extrabold text-[#102757]">{s.employeeName}</h2><dl className="mt-3 grid grid-cols-[130px_1fr] gap-y-1 text-sm"><dt className="text-slate-500">Employee No.</dt><dd className="font-semibold">{s.employeeNumber || s.employeeCode || 'Pending'}</dd><dt className="text-slate-500">Business Unit</dt><dd className="font-semibold">{s.businessUnit || 'Pending'}</dd>{s.department&&<><dt className="text-slate-500">Department</dt><dd>{s.department}</dd></>}{s.position&&<><dt className="text-slate-500">Position</dt><dd>{s.position}</dd></>}</dl></div><dl className="grid grid-cols-[125px_1fr] content-start gap-y-1 text-sm"><dt className="text-slate-500">Payroll Period</dt><dd className="font-semibold">{date(s.from)} – {date(s.to)}</dd><dt className="text-slate-500">Payroll Cutoff</dt><dd>{date(s.from)} – {date(s.to)}</dd><dt className="text-slate-500">Pay Date</dt><dd className="font-semibold">{date(s.payDate)}</dd><dt className="text-slate-500">Payroll Status</dt><dd>{s.payrollStatus || s.status || (test ? 'Test payroll' : 'Approved')}</dd></dl></div>
    </header>
    <div className="space-y-5 p-5 sm:p-8">
      {warnings.length>0&&<div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{warnings.join(' ')}</div>}
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Pay summary">
        <div className="rounded-2xl bg-blue-50 p-5"><p className="text-xs font-bold uppercase tracking-wide text-[#17366f]">Gross Pay</p><strong className="mt-2 block text-2xl tabular-nums text-[#102757]">{peso(s.gross)}</strong></div>
        <div className="rounded-2xl bg-rose-50 p-5"><p className="text-xs font-bold uppercase tracking-wide text-rose-800">Total Deductions</p><strong className="mt-2 block text-2xl tabular-nums text-rose-900">{peso(s.deductions)}</strong></div>
        <div className="rounded-2xl bg-gradient-to-br from-[#172d63] to-violet-800 p-5 text-white"><p className="text-xs font-bold uppercase tracking-wide text-violet-100">Net Pay</p><strong className="mt-2 block text-3xl tabular-nums">{peso(s.net)}</strong></div>
      </section>
      <div className="grid items-start gap-5 lg:grid-cols-2"><PayTable title="Earnings" rows={earnings} totalLabel="Total Earnings" total={s.gross}/><PayTable title="Deductions" rows={deductions} totalLabel="Total Deductions" total={s.deductions}/></div>
      {(attendance.length>0||employer.length>0)&&<div className="grid items-start gap-5 lg:grid-cols-2">
        {attendance.length>0&&<section className="rounded-2xl border border-slate-200"><h3 className="bg-blue-50 px-5 py-4 text-base font-extrabold uppercase tracking-wide text-[#172d63]">Attendance Summary</h3><dl className="grid grid-cols-2 gap-3 p-5">{attendance.map(row=><div key={row.label}><dt className="text-xs text-slate-500">{row.label}</dt><dd className="text-lg font-bold text-[#172d63]">{row.value}</dd></div>)}</dl></section>}
        {employer.length>0&&<section className="overflow-hidden rounded-2xl border border-violet-200"><div className="bg-violet-50 px-5 py-4"><h3 className="text-base font-extrabold uppercase tracking-wide text-violet-900">Employer Contributions</h3><p className="mt-1 text-xs text-violet-700">Paid by the company and not deducted from your net pay.</p></div><div className="p-5">{employer.map(row=><div className="flex justify-between gap-3 border-b border-slate-100 py-2 last:border-0" key={row.label}><span>{row.label}</span><strong className="whitespace-nowrap tabular-nums">{peso(row.amount)}</strong></div>)}<div className="mt-3 flex justify-between border-t border-violet-200 pt-3 font-extrabold text-violet-950"><span>Total Employer Contributions</span><span>{peso(employer.reduce((sum,row)=>sum+row.amount,0))}</span></div></div></section>}
      </div>}
      <details className="rounded-xl border border-slate-200 bg-slate-50 p-4"><summary className="cursor-pointer font-bold text-[#172d63]">How your pay was calculated</summary><p className="mt-2 text-sm text-slate-600">View detailed payroll calculation in HRIS. Attendance details, pay package, tax treatment, government contributions, loans, and authorized deductions remain available to authorized HR, Finance, and payroll users.</p>{!test&&<p className="mt-2 text-sm text-slate-500">Questions about an amount can be submitted through “Report an Issue” without changing this approved payslip.</p>}</details>
      <footer className="grid gap-4 border-t-2 border-[#172d63] pt-5 md:grid-cols-[1fr_auto]"><div><p className="font-semibold">I acknowledge receipt of this payslip and understand that the detailed calculation is available in HRIS.</p>{s.acknowledgedAt?<p className="mt-3 text-sm font-bold text-emerald-700">Digitally acknowledged {new Date(s.acknowledgedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p>:<div className="mt-8 grid grid-cols-[1fr_150px] gap-8 text-xs text-slate-500"><span className="border-t border-slate-400 pt-2 text-center">Employee Signature over Printed Name</span><span className="border-t border-slate-400 pt-2 text-center">Date</span></div>}</div><div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500"><strong className="block text-slate-700">Confidential</strong>This payslip contains personal and confidential information.</div></footer>
    </div>
  </article>;
}
