import React,{useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import Button from '../../components/ui/Button';
import type {NetInputs} from '../payroll/netPay';
import {getNteDeductionQueue,ntePeso,type NTEDeduction} from '../payroll/nteDeductions';

export default function PayrollATDQueue({grossId,inputs,onChange}:{grossId:string;inputs:NetInputs;onChange:(p:NetInputs)=>void}){
 const [rows,setRows]=useState<NTEDeduction[]>([]);const [error,setError]=useState('');
 useEffect(()=>{let active=true;setError('');if(!inputs.payDate){setRows([]);return()=>{active=false;};}void getNteDeductionQueue(grossId,inputs.payDate).then(value=>{if(active)setRows(value);}).catch(cause=>{if(active)setError((cause as Error).message);});return()=>{active=false;};},[grossId,inputs.payDate]);
 const blocked=useMemo(()=>rows.filter(row=>row.workflowStatus!=='Approved for Payroll'||row.scheduleStatus!=='Scheduled'),[rows]);
 function include(row:NTEDeduction){
  setError('');const amount=Math.min(Number(row.scheduledThisPayroll),Number(row.currentBalance));
  if(row.workflowStatus!=='Approved for Payroll'||row.scheduleStatus!=='Scheduled'||amount<=0){setError('Resolve the blocked ATD requirement or exclude it with a reason before payroll.');return;}
  onChange({...inputs,employees:inputs.employees.map(employee=>employee.employeeId===row.employeeId?{...employee,deductions:[...employee.deductions.filter(item=>item.sourceRef!==`ATD:${row.resolutionId}`),{label:`NTE deduction · ${row.nteNumber}`,sourceRef:`ATD:${row.resolutionId}`,amount:String(amount),kind:'voluntary',carryForward:false}]}:employee)});
 }
 if(rows.length===0&&!error)return null;
 return <section className="my-4 rounded-2xl border border-violet-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">NTE deductions</h3><p className="text-sm text-slate-500">Only employee-signed, HR-verified, Finance-approved ATDs can enter this payroll.</p></div>{blocked.length>0&&<span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">{blocked.length} needs attention</span>}</div>
  {error&&<p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
  <div className="mt-3 space-y-3">{rows.map(row=>{const ready=row.workflowStatus==='Approved for Payroll'&&row.scheduleStatus==='Scheduled'&&Number(row.scheduledThisPayroll)>0;return <div key={row.id} className={`rounded-xl border p-3 ${ready?'border-emerald-300 bg-emerald-50':'border-amber-300 bg-amber-50'}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{row.employeeName} · {row.nteNumber}</p><p className="text-sm">{ready?`${ntePeso(row.scheduledThisPayroll)} this payroll · ${ntePeso(row.currentBalance)} current balance`:row.workflowStatus}</p></div><div className="flex flex-wrap gap-2">{ready&&<Button size="sm" onClick={()=>include(row)}>Include approved deduction</Button>}<Link className="inline-flex min-h-10 items-center rounded-lg border border-violet-500 px-3 text-sm font-semibold text-violet-700" to={`/feedback/nte/${row.nteId}`}>Review NTE deduction</Link></div></div>{!ready&&<p className="mt-2 text-sm font-medium text-amber-900">Blocked deductions do not reduce net pay.</p>}</div>;})}</div>
 </section>;
}
