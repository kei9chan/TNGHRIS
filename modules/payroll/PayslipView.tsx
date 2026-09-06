import React from 'react';
import {EmployeePayslip,PayLine,money} from './selfService';
export function payslipGroups(s:EmployeePayslip):{title:string;lines:PayLine[]}[]{
 const earnings=(s.lines||[]).filter(l=>!l.kind||l.kind==='earning');
 const matches=(l:PayLine,re:RegExp)=>re.test(l.label||'');
 const ot=/overtime|\bot\b/i,allow=/allowance/i,adjust=/leave|absence|attendance|late|undertime|adjust/i;
 return [
 {title:'Regular pay & other earnings',lines:earnings.filter(l=>!matches(l,ot)&&!matches(l,allow)&&!matches(l,adjust))},
 {title:'Approved overtime',lines:earnings.filter(l=>matches(l,ot))},
 {title:'Allowances',lines:earnings.filter(l=>!matches(l,ot)&&matches(l,allow))},
 {title:'Leave, attendance & other approved adjustments',lines:earnings.filter(l=>!matches(l,ot)&&!matches(l,allow)&&matches(l,adjust))},
 {title:'Government deductions',lines:[...(s.contributions||[]).filter(l=>l.label?.endsWith('EE')),{label:'Withholding tax',amount:s.tax}]},
 {title:'Company & other deductions',lines:[...(s.lines||[]).filter(l=>l.kind==='deduction'),...(s.loans||[]).map(l=>({...l,label:`Loan · ${l.account}`})),...(s.otherDeductions||[])]}
 ];
}
export default function PayslipView({slip:s}:{slip:EmployeePayslip}){return <article className="space-y-5">
 <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold">{s.employeeName}</h2><p className="text-sm">Employee number: {s.employeeNumber||'Not recorded in this snapshot'}</p><p>{s.businessUnit||'Business unit not recorded in this snapshot'}</p></div><span className="self-start rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">{s.correctionKind==='revised'?'Revised · ':s.correctionKind==='adjustment'?'Adjustment · ':''}{s.payrollStatus}</span></div>
 <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt>Pay period</dt><dd className="font-semibold">{s.from} – {s.to}</dd></div><div><dt>Pay date</dt><dd className="font-semibold">{s.payDate}</dd></div><div><dt>Payroll version</dt><dd>{s.version}</dd></div><div><dt>Payment</dt><dd>{s.paymentStatus||'Released after payment'}{Number(s.unpaid)>0&&` · outstanding ${money(s.unpaid)}`}</dd></div></dl>
 <div className="grid gap-3 sm:grid-cols-3">{[['Gross pay',s.gross],['Total deductions',s.deductions],['Net pay',s.net]].map(([label,value])=><div key={label} className="rounded-lg bg-indigo-50 p-4 dark:bg-indigo-950"><p className="text-sm">{label}</p><strong className="text-xl">{money(value)}</strong></div>)}</div>
 <div>{payslipGroups(s).map(g=><details key={g.title} className="border-b border-gray-200 py-3 dark:border-slate-700"><summary className="cursor-pointer py-2 font-semibold">{g.title} <span className="text-sm font-normal">({g.lines.length} items)</span></summary>{g.lines.length===0?<p className="py-2 text-sm">No separate items recorded.</p>:g.lines.map((l,i)=><div key={i} className="border-t border-gray-100 py-3 dark:border-slate-700"><div className="flex justify-between gap-3"><span>{l.label}</span><strong className="whitespace-nowrap">{money(l.remaining??l.amount)}</strong></div><dl className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-slate-300">{[['Attendance date',l.date],['Approved quantity',l.quantity],['Rate used',l.rate],['Multiplier',l.factor],['Start',l.start],['End',l.end],['Previously settled',l.settled],['Monthly amount',l.monthly],['Prior cutoff',l.prior]].filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=><div key={k}><dt>{k}</dt><dd className="break-words">{v}</dd></div>)}</dl></div>)}</details>)}</div>
 <p className="text-sm text-gray-500 dark:text-slate-400">Read-only released payroll snapshot. Questions do not change these amounts.</p>
 </article>}
