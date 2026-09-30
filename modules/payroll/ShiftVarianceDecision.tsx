import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import Button from '../../components/ui/Button';
import type {ReviewTimeRow,ShiftVarianceContext} from './attendanceReadiness';
import {decideShiftVariance,fetchShiftVariance,submitOriginalShift,submitShiftVariance} from './attendanceReadiness';

const clock=(timestamp:string)=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit'}).format(new Date(timestamp));
const clockInput=(timestamp:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(timestamp));
const minutes=(value:number)=>`${Math.floor(value/60)}h ${Math.round(value%60)}m`;
export default function ShiftVarianceDecision({scopeId,row,onApplied}:{scopeId:string;row:ReviewTimeRow;onApplied?:()=>void}){
 const [data,setData]=useState<ShiftVarianceContext|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const punches=row.evidence?.punches||[];
 const startPunch=punches.find(p=>/clock.?in/i.test(p.type));
 const endPunch=[...punches].reverse().find(p=>/clock.?out/i.test(p.type));
 const [start,setStart]=useState(startPunch?clockInput(startPunch.timestamp):'');
 const [end,setEnd]=useState(endPunch?clockInput(endPunch.timestamp):'');
 const [reason,setReason]=useState(''),[returnReason,setReturnReason]=useState('');
 const refresh=()=>fetchShiftVariance(scopeId,row.employeeId,row.date).then(setData).catch(e=>setError(e instanceof Error?e.message:'Shift review unavailable.'));
 useEffect(()=>{void refresh();},[scopeId,row.employeeId,row.date]);
 const act=async(callback:()=>Promise<unknown>,success:string)=>{setBusy(true);setError('');setMessage('');try{await callback();setMessage(success);await refresh();onApplied?.();}catch(e){setError(e instanceof Error?e.message:'The decision was not saved.');}finally{setBusy(false);}};
 const shift=data?.shift||row.evidence?.shifts.find(s=>s.start);
 const ot=row.ot||[];
 const requested=ot.reduce((sum,o)=>sum+Number((o as {requestedMinutes?:number}).requestedMinutes||0),0);
 return <section className="mt-4 rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4 text-slate-900" aria-label="Planned shift and actual attendance">
  <h4 className="text-lg font-bold">What happened on this day?</h4>
  <div className="mt-3 grid gap-3 sm:grid-cols-2">
   <div className="rounded-lg bg-white p-3"><p className="text-sm text-slate-600">Published plan</p><strong>{shift?.start||'—'}–{shift?.end||'—'}</strong><p className="text-sm">{minutes(row.scheduledMinutes)} scheduled paid work</p></div>
   <div className="rounded-lg bg-white p-3"><p className="text-sm text-slate-600">Imported attendance</p><strong>{startPunch?clock(startPunch.timestamp):'Missing clock-in'}–{endPunch?clock(endPunch.timestamp):'Missing clock-out'}</strong><p className="text-sm">{minutes(row.actualMinutes)} worked · {minutes(row.breakMinutes)} break</p></div>
  </div>
  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"><strong>A different clock-in or clock-out does not create paid OT.</strong> Requested extra work: {requested?minutes(requested):'none in an OT request'}; approved OT: {minutes(row.approvedOtMinutes)}. A moved shift and extra work are separate manager decisions.</div>
  {data?.reviews.map(review=>{const unchanged=review.start===shift?.start&&review.end===shift?.end;return <div key={review.id} className="mt-3 rounded-lg bg-white p-3 text-sm"><strong>{unchanged?'Original shift stands':'Shift change'}: {review.status}</strong> · {review.start}–{review.end} · manager {review.manager||'not assigned'}{review.stale?' · roster or attendance changed; submit again':''}<p>{review.reason}</p>{review.canDecide&&!review.stale&&<div className="mt-2 flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void act(()=>decideShiftVariance(review.id,true,''),'Manager decision saved. Payroll readiness is refreshing.')}>{unchanged?'Confirm original shift; no unrequested OT':'Confirm changed shift'}</Button><label className="text-sm">Return reason<input className="ml-2 rounded border p-2" value={returnReason} onChange={e=>setReturnReason(e.target.value)} placeholder="Specific reason"/></label><Button variant="secondary" disabled={busy||!returnReason.trim()} onClick={()=>void act(()=>decideShiftVariance(review.id,false,returnReason),'Returned for correction.')}>Return</Button></div>}</div>;})}
  {!data?.locked&&data?.shift&&!data.reviews.some(r=>r.status==='pending'&&!r.stale)&&<div className="mt-4 rounded-lg bg-white p-3"><h5 className="font-semibold">Was the shift moved by the business unit?</h5><p className="text-sm text-slate-600">Enter the corrected planned start and end. The same scheduled duration is required. This asks {data.manager||'the direct manager'} to confirm; it does not approve OT or alter the original roster.</p><div className="mt-2 flex flex-wrap items-end gap-2"><label className="text-sm">Corrected start<input type="time" className="block rounded border p-2" value={start} onChange={e=>setStart(e.target.value)}/></label><label className="text-sm">Corrected end<input type="time" className="block rounded border p-2" value={end} onChange={e=>setEnd(e.target.value)}/></label><label className="min-w-44 flex-1 text-sm">Why was it moved?<input className="block w-full rounded border p-2" value={reason} onChange={e=>setReason(e.target.value)} placeholder="E.g. manager changed opening coverage"/></label><Button disabled={busy||!start||!end||!reason.trim()} onClick={()=>void act(()=>submitShiftVariance(scopeId,row.employeeId,row.date,data.fingerprint,start,end,reason),'Sent the corrected shift to the direct manager.')}>Send shift change to manager</Button></div></div>}
  {!data?.locked&&data?.shift&&!data.reviews.some(r=>r.status==='pending'&&!r.stale)&&<div className="mt-3 rounded-lg bg-white p-3"><h5 className="font-semibold">Or did the published shift stay in effect?</h5><p className="text-sm">Ask the direct manager to keep the original schedule. Time outside it stays in the attendance evidence but does not become paid OT without a separate approved request.</p><div className="mt-2 flex flex-wrap gap-2"><input aria-label="Why original schedule stands" className="min-w-52 flex-1 rounded border p-2" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why the published shift stands"/><Button variant="secondary" disabled={busy||!reason.trim()} onClick={()=>void act(()=>submitOriginalShift(scopeId,row.employeeId,row.date,data.fingerprint,reason),'Sent original-shift confirmation to the direct manager.')}>Ask manager to keep original shift</Button></div></div>}
  {data?.locked&&<p className="mt-3 text-sm">This payroll date is locked. Use an authorized payroll correction.</p>}
  <p className="mt-3 text-sm">If these punches are wrong, <Link className="font-semibold text-indigo-700 underline" to={`/payroll/import-attendance?employee=${row.employeeId}`}>correct verified attendance</Link>. If the employee really worked extra time, <Link className="font-semibold text-indigo-700 underline" to="/payroll/overtime-requests">submit requested OT hours and a reason</Link> for separate manager approval.</p>
  {message&&<p className="mt-2 text-emerald-800" role="status">{message}</p>}{error&&<p className="mt-2 text-red-700" role="alert">{error}</p>}
 </section>;
}
