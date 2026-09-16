import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {usePermissions} from '../../hooks/usePermissions';
import {Permission} from '../../types';
import {validCutoff} from './workspace';
import {usePayrollField} from './usePayrollSelection';
import {useCalculationSelection} from './useCalculationSelection';
import {calculationWorkspace} from './calculationReview';
import type {CalculationWorkspaceData} from './calculationReview';
const steps=[['Gross Pay Review','/payroll/gross-pay'],['Take-home Pay Review','/payroll/net-pay'],['Compare & Pilot','/payroll/pilot']];
const CalculationSteps:React.FC<{step:number;scope:string;from:string;to:string;revision?:string;onLoaded?:(data:CalculationWorkspaceData|null)=>void}>=({step,scope,from,to,revision='',onLoaded})=>{
 const {can}=usePermissions();const [selection,setSelection]=useCalculationSelection(scope,from,to);
 const [,setFrom]=usePayrollField('from'),[,setTo]=usePayrollField('to');
 const [data,setData]=useState<CalculationWorkspaceData|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(false);
 useEffect(()=>{let active=true;setData(null);onLoaded?.(null);setError('');setLoading(false);if(!scope||!validCutoff(from,to))return;setLoading(true);
 void calculationWorkspace(scope,from,to,selection.grossId,selection.netId).then(d=>{if(active){setData(d);onLoaded?.(d);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[scope,from,to,selection.grossId,selection.netId,revision,refresh,onLoaded]);
 return <section className="space-y-4 rounded-xl border bg-white p-4 dark:bg-slate-900 dark:border-slate-700" aria-label="Calculation and comparison steps"><nav aria-label="Payroll calculation steps" className="grid gap-2 sm:grid-cols-3">{steps.map(([label,path],i)=>can('Dashboard',Permission.View)?<Link key={path} to={path} aria-current={step===i+1?'step':undefined} className={`rounded-lg px-3 py-3 font-semibold ${step===i+1?'bg-violet-600 text-white':'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`}>{i+1}. {label}</Link>:<span key={path}>{i+1}. {label}</span>)}</nav>
 {!scope||!validCutoff(from,to)?<p><Link to="/payroll/home" className="text-indigo-600">Select the business unit and cutoff</Link> to keep all three steps in the same run.</p>:<><p className="text-sm">Same cutoff: <strong>{from}–{to}</strong>. Saved version choices follow you between these steps and after refresh.</p>
 {loading&&<p role="status">Checking historical inputs…</p>}{error&&<p role="alert" className="text-red-700">{error} <button className="underline" onClick={()=>{setSelection({grossId:'',netId:''});setRefresh(v=>v+1);}}>Reload available versions</button></p>}
 {data&&<><p className="text-sm">Gross {data.grossId?(data.grossCurrent?'saved · current':'saved · needs review'):'not calculated'} → Take-home {data.netId?(data.netCurrent?'saved · current':'saved · needs review'):'not calculated'} → comparison evidence. <Link to="/payroll/home" className="underline">Change BU / cutoff</Link></p>
 <details open={data.blockers.length>0||data.employees.some(e=>e.issues.length>0)}><summary className="cursor-pointer font-semibold">Historical inputs and blockers</summary><p className="my-2 text-sm">Dated salary, approved rules and reviewed balances are required. Current salary is never substituted for missing historical pay. Missing amounts are not assumed to be zero.</p>{data.blockers.map(b=><p key={b} className="my-2 text-amber-800 dark:text-amber-200">{b}</p>)}{data.employees.map(e=><div key={e.employeeId} className="border-t py-2 text-sm"><strong>{e.employeeName}</strong>{e.issues.length?<ul className="list-disc pl-5">{e.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul>:<p>Historical salary, deduction and opening references recorded. Existing calculation checks still apply.</p>}{e.missingSalaryDates.length>0&&<p>Uncovered dates: {e.missingSalaryDates.join(', ')}</p>}<p>Salary: {e.salarySources.join('; ')||'Missing'} · Deductions: {e.deductionSource||'Not reviewed'} · Openings: {e.openingSource||'Not reviewed'}</p></div>)}<div className="mt-3 flex flex-wrap gap-4 text-sm underline"><Link to="/payroll/pay-packages">HR / Finance: dated pay packages</Link><Link to="/payroll/net-pay">Finance: deductions and openings</Link><Link to="/payroll/attendance-readiness">HR: timekeeping</Link></div></details>
 {data.previousCutoff&&<p className="text-sm">Previous consecutive cutoff: {data.previousCutoff.from}–{data.previousCutoff.to}. {data.linkedPreviousNet?'This saved net run contains a prior-run link.':'Finance must select the preceding version or explicitly document opening balances in Take-home Pay Review.'}</p>}
 {data.adjacentCutoffs.length>0&&<div className="flex flex-wrap gap-3 text-sm">{data.adjacentCutoffs.map(c=><Link key={c.from} to="/payroll/gross-pay" className="underline" onClick={()=>{setFrom(c.from);setTo(c.to);}}>{c.from>to?'Next':'Previous'} consecutive cutoff: {c.from}–{c.to} →</Link>)}</div>}
 <button className="text-sm underline" disabled={loading} onClick={()=>setRefresh(v=>v+1)}>Refresh historical readiness</button></>}
 </>}
 </section>;
};
export default CalculationSteps;
