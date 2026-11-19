import React, {useEffect, useState} from 'react';
import {supabase} from '../../services/supabaseClient';
import {formatLeaveDate} from '../../utils/leaveDates';

type Row = {kind:string;name:string;taken:number;booked:number;pending:number;allowance:number|null;available:number|null};
type Summary = {hireDate:string|null;employmentStatus:string;year:number;asOf:string;rows:Row[];requestKind:string;requestName:string;requestDays:number;requestStatus:string;available:number|null;outsideYear:boolean;prorated:boolean;allocationNote:boolean};
const fmt=(n:number)=>Number(n).toLocaleString('en-PH',{maximumFractionDigits:3});
// Coalesce mobile/desktop requests without caching balances after decisions.
const inflight=new Map<string,Promise<Summary>>();
function load(id:string) {
 if(!inflight.has(id)) inflight.set(id,(async()=>{const {data,error}=await supabase.rpc('get_leave_approval_calendar_summary',{p_request_id:id});if(error)throw error;return data as Summary;})().finally(()=>inflight.delete(id)));
 return inflight.get(id)!;
}
export default function LeaveApprovalSummary({requestId,outcome}:{requestId:string;outcome?:'paid_exception'|'lwop'}) {
 const [data,setData]=useState<Summary|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{const refresh=()=>{inflight.delete(requestId);setRetry(n=>n+1);};window.addEventListener('focus',refresh);window.addEventListener('tng-leave-decision',refresh);return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('tng-leave-decision',refresh);};},[requestId]);
 useEffect(()=>{let active=true;setData(null);setError(false);load(requestId).then(value=>{if(active)setData(value);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[requestId,retry]);
 if(error)return <div role="alert" className="rounded-lg border border-amber-300 p-3 text-sm">Leave summary unavailable. <button type="button" className="font-semibold underline" onClick={()=>setRetry(n=>n+1)}>Retry</button></div>;
 if(!data)return <p role="status" className="p-3 text-sm text-slate-500">Loading calendar-year leave summary…</p>;
 const unpaid=data.requestKind==='lwop'||outcome==='lwop';
 const after=data.available==null?null:data.available-(unpaid?0:data.requestDays);
 return <section className="space-y-3 rounded-xl border border-indigo-200 bg-white p-3 text-sm text-slate-900 dark:border-indigo-800 dark:bg-slate-900 dark:text-slate-100">
  <div><h4 className="font-bold text-indigo-700 dark:text-indigo-300">Calendar-year leave summary · {data.year}</h4><p>Jan 1 – Dec 31, {data.year} · As of {formatLeaveDate(data.asOf)}</p><p className="mt-1">Hire date: <strong>{data.hireDate?formatLeaveDate(data.hireDate):'Not recorded'}</strong></p></div>
  <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b"><th className="py-2 pr-2">Leave type</th><th className="p-2">Taken / allowance</th><th className="py-2 pl-2">Available</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.kind} className="border-b border-slate-100 dark:border-slate-700"><th className="py-2 pr-2 font-medium">{row.name}</th><td className="p-2">{fmt(row.taken)}{row.kind==='lwop'?' days · No cap':row.allowance==null?' days':` / ${fmt(row.allowance)}`}</td><td className="py-2 pl-2">{row.available==null?'—':fmt(row.available)}</td></tr>)}</tbody></table></div>
  <p className="text-slate-500 dark:text-slate-400">Taken = recorded approved leave through today. Current request excluded. Available = live credit ledger, including adjustments and approved bookings.</p>
  {data.prorated&&<p className="rounded-lg bg-amber-50 p-2 text-amber-900 dark:bg-amber-950 dark:text-amber-100">Allowance uses the existing accrual policy: 0.416 day per completed month; first month is 0.208 if hired after the 15th. Reconciled to 5 days at the first anniversary. Accrued allowance may not yet be usable during probation. Employment status: {data.employmentStatus||'Not recorded'}.</p>}
  <details><summary className="cursor-pointer font-semibold">Approved upcoming: {fmt(data.rows.reduce((n,r)=>n+r.booked,0))} days · Other pending: {fmt(data.rows.reduce((n,r)=>n+r.pending,0))} days</summary><ul className="mt-2 space-y-1">{data.rows.map(row=><li key={row.kind}>{row.name}: {fmt(row.booked)} upcoming · {fmt(row.pending)} pending</li>)}</ul><p className="mt-2">Pending requests do not reduce available credits until approved.</p></details>
  {data.allocationNote&&<p className="text-amber-700 dark:text-amber-300">Partial-day requests spanning a year boundary or today are allocated proportionally across their date range. Review their dates before deciding.</p>}
  {data.requestStatus.startsWith('Pending')&&<div className="rounded-lg bg-indigo-50 p-3 dark:bg-indigo-950"><h4 className="font-bold">If you approve this request</h4><p>{data.requestName} · {fmt(data.requestDays)} day(s)</p>{unpaid?<p className="font-semibold">LWOP has no cap. No paid-leave credits deducted.</p>:after!=null?<><p className="font-semibold">Balance: {fmt(data.available!)} → {fmt(after)} days</p>{after<0&&<p className="font-semibold text-rose-700 dark:text-rose-300">Exceeds available credits by {fmt(-after)} day(s). Review the BOD paid exception or LWOP outcome.</p>}</>:<p>Credit balance unavailable.</p>}{data.outsideYear&&<p className="mt-1">Request includes dates outside {data.year}. The summary above is for {data.year}; the balance is current, not a future-year forecast.</p>}</div>}
 </section>;
}
