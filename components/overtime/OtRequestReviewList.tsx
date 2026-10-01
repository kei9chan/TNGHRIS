import React,{useEffect,useRef,useState} from 'react';
import {confirmOtBaseline,decideOtWeek,getOtWeeks,getPayrollOtWeeks,sendPayrollOt,minutesLabel,workDateLabel,OtWeek,OtWeekRow} from '../../services/manualOtService';
import {supabase} from '../../services/supabaseClient';

type Props={key?:string;requestIds?:string[];onChanged?:()=>void;initialRequestId?:string;employeeId?:string;from?:string;to?:string;readOnly?:boolean};
const button='min-h-11 rounded-lg border px-4 py-2 font-semibold disabled:opacity-40';
export const statusLabel=(r:OtWeekRow)=>r.status==='Approved'&&r.finalMinutes==null?'Needs manager hours':r.status==='Draft'&&r.handoff?.state==='Returned'?'Returned for details':r.status==='PendingBOD'?'Waiting for BOD':['Submitted','PendingGM'].includes(r.status)?'Waiting for manager':r.status;
function offlineOt(r:OtWeekRow){
 const h=((r.history_log||[]) as Array<{action?:string;details?:{offlineManagerOtHours?:number}}>).find(h=>h.action==='Imported for manager approval');
 return h?.details?.offlineManagerOtHours==null?null:Math.round(Number(h.details.offlineManagerOtHours)*60);
}
export default function OtRequestReviewList({requestIds=[],onChanged,employeeId,from,to,readOnly=false}:Props){
 const [weeks,setWeeks]=useState<OtWeek[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[message,setMessage]=useState('');
 const idsKey=[...requestIds].sort().join(',');
 useEffect(()=>{let live=true;setLoading(true);setError('');
  const load=employeeId&&from&&to?getPayrollOtWeeks(employeeId,from,to):getOtWeeks(idsKey?idsKey.split(','):[]);
  load.then(data=>{if(live)setWeeks(data);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};
 },[idsKey,employeeId,from,to,refresh]);
 const scope=new Set(requestIds);
 const visible=(r:OtWeekRow)=>employeeId?(!from||r.date>=from)&&(!to||r.date<=to):scope.has(r.id);
 return <section aria-label="Overtime requests" className="space-y-4 text-slate-900 dark:text-white">
  <p className="text-sm text-slate-600 dark:text-slate-300">Only requested and finally approved OT is payable. Extra clock-out time does not add OT.</p>
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error} <button className="underline" onClick={()=>setRefresh(n=>n+1)}>Retry</button></p>}
  {message&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{message}</p>}
  {loading&&<p role="status">Loading OT requests…</p>}
  {!loading&&!weeks.length&&!error&&<p>No OT requests were filed for this employee and period. No OT has been inferred from attendance.</p>}
  {!!weeks.length&&<BulkRows key={`${idsKey}:${weeks.map(w=>`${w.employeeId}:${w.summary.weekStart}:${w.version}`).join('|')}`} groups={weeks.map(week=>({week,rows:week.requests.filter(visible)}))} readOnly={readOnly||loading||!!error} onChanged={text=>{setMessage(text);setRefresh(n=>n+1);onChanged?.();}}/>}
 </section>;
}
type ReviewGroup={week:OtWeek;rows:OtWeekRow[]};
export function WeekRows({week,rows,...props}:{key?:string;week:OtWeek;rows:OtWeekRow[];readOnly:boolean;onChanged:(message:string)=>void}){return <BulkRows groups={[{week,rows}]} {...props}/>;}
export function BulkRows({groups,readOnly,onChanged}:{key?:string;groups:ReviewGroup[];readOnly:boolean;onChanged:(message:string)=>void}){
 const rows=groups.flatMap(g=>g.rows);
 const [selected,setSelected]=useState<string[]>([]),[amounts,setAmounts]=useState<Record<string,number>>(()=>Object.fromEntries(rows.map(r=>[r.id,r.reviewedMinutes??offlineOt(r)??r.requestedMinutes??NaN]))),[night,setNight]=useState<Record<string,number>>(()=>Object.fromEntries(rows.map(r=>[r.id,r.manager_night_minutes??NaN])));
 const [note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [completed,setCompleted]=useState<string[]>([]),[progress,setProgress]=useState('');
 const inFlight=useRef(false),operations=useRef(new Map<string,string>());
 const selectedRows=rows.filter(r=>selected.includes(r.id));
 const sendable=rows.filter(r=>r.canSend&&!completed.includes(r.id));
 const reviewable=rows.filter(r=>r.canDecide&&!completed.includes(r.id)&&!r.blocked?.startsWith('Payroll locked'));
 const eligible=reviewable.filter(r=>!r.blocked&&!groups.some(g=>g.rows.includes(r)&&r.status==='PendingBOD'&&(g.week.summary.baselineMissing||g.week.summary.quantitiesMissing)));
 const canSend=selectedRows.length>0&&selectedRows.every(r=>sendable.some(x=>x.id===r.id));
 const canDecide=selectedRows.length>0&&selectedRows.every(r=>reviewable.some(x=>x.id===r.id));
 const invalid=selectedRows.find(r=>r.blocked||!Number.isInteger(amounts[r.id])||amounts[r.id]<0||amounts[r.id]>(r.status==='PendingBOD'?(r.reviewedMinutes??-1):(r.requestedMinutes??-1))||(!r.start_time&&r.status!=='PendingBOD'&&(!Number.isInteger(night[r.id])||night[r.id]<0||night[r.id]>amounts[r.id])));
 const selectedGroups=groups.map(g=>({...g,rows:g.rows.filter(r=>selected.includes(r.id))})).filter(g=>g.rows.length);
 const bodContextMissing=selectedGroups.some(g=>(g.week.summary.baselineMissing||g.week.summary.quantitiesMissing)&&g.rows.some(r=>r.status==='PendingBOD'));
 const act=async(action:'send'|'approve'|'reject'|'return')=>{
  if(inFlight.current||readOnly||!selectedRows.length)return;
  if((action==='reject'||action==='return'||action==='send'&&selectedRows.some(r=>r.status==='Draft'))&&!note.trim()){setError('Enter the reason or requested details in the note field below.');return;}
  if(action==='send'?!canSend:!canDecide)return;
  if(action==='approve'&&(invalid||bodContextMissing))return;
  if(selectedGroups.some(g=>g.rows.length>100)){setError('Select up to 100 requests per employee week.');return;}
  inFlight.current=true;setBusy(true);setError('');
  let saved=0,bod=0,checks=0;
  try{
   for(const [index,group] of selectedGroups.entries()){
    const quantities=Object.fromEntries(group.rows.map(r=>[r.id,!r.start_time&&r.status!=='PendingBOD'?{minutes:amounts[r.id],nightMinutes:night[r.id]}:amounts[r.id]]));
    const ids=group.rows.map(r=>r.id);
    const key=JSON.stringify([action,ids,quantities,group.week.version,note]);
    if(!operations.current.has(key))operations.current.set(key,crypto.randomUUID());
    setProgress(`Processing week ${index+1} of ${selectedGroups.length}…`);
    const result=action==='send'?await sendPayrollOt(group.rows,operations.current.get(key)!,note):await decideOtWeek(ids,quantities,group.week.version,operations.current.get(key)!,action,note);
    saved+=ids.length;
    if(result?.baselineNeeded||result?.quantityReviewNeeded)checks+=ids.length;
    if(Array.isArray(result))bod+=result.filter(x=>x.result?.status==='PendingBOD').length;
    setCompleted(old=>[...old,...ids]);setSelected(old=>old.filter(id=>!ids.includes(id)));
   }
   setProgress('');
   onChanged(action==='send'?`${saved} requests sent to their managers across ${selectedGroups.length} weeks.`:action==='return'?`${saved} requests returned for details. The payroll senders have been notified.`:action==='reject'?`${saved} requests rejected.`:`${saved} requests processed.${bod?` ${bod} awaiting BOD authorization.`:''}${checks?` ${checks} have reviewed hours saved and still need weekly checks.`:''}${!bod&&!checks?' Approval recorded.':''}`);
  }catch(e){
   setProgress('');setError(`${saved} requests completed in this action. Remaining selected requests were not confirmed: ${(e as Error).message} Retry the remaining selection; completed weeks will not be repeated.`);
  }finally{inFlight.current=false;setBusy(false);}
 };

 const openEvidence=async(path:string)=>{try{const {data,error}=await supabase.storage.from('overtime_request_attachments').createSignedUrl(path,300);if(error)throw error;if(data?.signedUrl)window.open(data.signedUrl,'_blank','noopener,noreferrer');}catch(e){setError((e as Error).message);}};
 if(!rows.length)return null;
 return <section className="space-y-4" aria-label="Review across all weeks">
  {!readOnly&&<div className="flex flex-wrap gap-3 border-b p-3 text-sm">{sendable.length>0&&<button disabled={busy} className="font-semibold text-violet-700 underline" onClick={()=>setSelected(sendable.map(r=>r.id))}>Select all {sendable.length} to send · all weeks</button>}{eligible.length>0&&<button disabled={busy} className="font-semibold text-violet-700 underline" onClick={()=>setSelected(eligible.map(r=>r.id))}>Select all {eligible.length} eligible for approval · all weeks</button>}{selected.length>0&&<button disabled={busy} className="underline" onClick={()=>setSelected([])}>Clear selection</button>}</div>}
  {groups.filter(g=>g.rows.length).map(({week,rows})=><section key={`${week.employeeId}:${week.summary.weekStart}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900">
  <header className="border-b bg-slate-50 p-4 dark:bg-slate-800"><div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-bold">{week.employee.name} · {workDateLabel(week.summary.weekStart)} – {workDateLabel(week.summary.weekEnd)}</h3><p className="text-sm text-slate-500">{week.employee.position} · {week.employee.businessUnit}</p></div><strong className="text-violet-700">{rows.every(r=>r.requestedMinutes!=null)?minutesLabel(rows.reduce((n,r)=>n+r.requestedMinutes!,0)):'Hours need correction'} requested · {rows.length} requests</strong></div><p className="mt-2 text-sm">Manager: <b>{rows[0].managerName||'Not assigned — contact HR'}</b>. BOD authorization is required above the configured {minutesLabel(week.summary.thresholdMinutes)} weekly total.</p></header>

  <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr><th className="p-3">Date / OT time</th><th className="p-3">Requested OT</th><th className="p-3">Reason / details</th><th className="p-3">Manager-reviewed OT</th><th className="p-3">Status / payable OT</th></tr></thead><tbody className="divide-y">{rows.map(r=><tr key={r.id} className={selected.includes(r.id)?'bg-violet-50 text-slate-900':''}>
   <td className="p-3 align-top"><label className="flex items-start gap-2"><input type="checkbox" aria-label={`Select ${workDateLabel(r.date)} ${r.start_time||'duration request'}`} checked={selected.includes(r.id)} disabled={readOnly||busy||!(sendable.some(x=>x.id===r.id)||reviewable.some(x=>x.id===r.id))} onChange={e=>setSelected(old=>e.target.checked?[...old,r.id]:old.filter(id=>id!==r.id))}/><span><b className="block whitespace-nowrap">{workDateLabel(r.date)}</b><span className="mt-1 block">{r.start_time?`${r.start_time.slice(0,5)}–${r.end_time?.slice(0,5)}${r.end_date&&r.end_date!==r.date||r.end_time&&r.end_time<r.start_time?' (+1 day)':''}`:'Duration supplied manually'}</span></span></label></td>
   <td className="p-3 align-top"><strong className="whitespace-nowrap rounded bg-violet-100 px-2 py-1 text-base text-violet-950">{minutesLabel(r.requestedMinutes)}</strong></td>
   <td className="min-w-[180px] p-3 align-top"><p className="whitespace-pre-wrap">{r.reason||'Reason not recorded'}</p>{r.handoff?.note&&<p className="mt-2 text-xs"><b>From {r.handoff.senderName}:</b> {r.handoff.note}</p>}{r.handoff?.returnNote&&<p className="mt-2 rounded bg-amber-50 p-2 text-amber-950"><b>Manager needs:</b> {r.handoff.returnNote}</p>}{r.attachment_url&&<button className="mt-2 underline" onClick={()=>openEvidence(r.attachment_url!)}>View evidence</button>}<details className="mt-2 text-xs"><summary className="cursor-pointer text-slate-500">History</summary>{((r.history_log||[]) as Array<Record<string,unknown>>).map((h,i)=><p key={i} className="my-2"><b>{String(h.action||'Updated')}</b> · {String(h.note||'')}<br/>{h.date||h.timestamp?new Date(String(h.date||h.timestamp)).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'Timestamp unavailable'}</p>)}</details></td>
   <td className="p-3 align-top">{!readOnly&&eligible.some(x=>x.id===r.id)&&r.status!=='PendingBOD'?<><label className="block text-xs">Hours<input aria-label={`Approved OT hours ${r.date} ${r.id}`} className="mt-1 block w-24 rounded border bg-white p-2 text-slate-900" type="number" min="0" max={(r.requestedMinutes??0)/60} step="any" disabled={busy} value={Number.isFinite(amounts[r.id])?Number((amounts[r.id]/60).toFixed(4)):''} onChange={e=>setAmounts(old=>({...old,[r.id]:e.target.value===''?NaN:Math.round(Number(e.target.value)*60)}))}/></label><span className="mt-1 block text-xs">{minutesLabel(Number.isFinite(amounts[r.id])?amounts[r.id]:null)} · edit before approving</span>{!r.start_time&&<label className="mt-2 block text-xs">Night minutes (0 if none)<input type="number" min="0" max={amounts[r.id]} step="1" disabled={busy} className="mt-1 block w-24 rounded border p-2 text-slate-900" value={Number.isFinite(night[r.id])?night[r.id]:''} onChange={e=>setNight(old=>({...old,[r.id]:e.target.value===''?NaN:Number(e.target.value)}))}/></label>}</>:<b>{r.reviewedMinutes==null?'Awaiting manager':minutesLabel(r.reviewedMinutes)}</b>}{offlineOt(r)!=null&&<p className="mt-1 text-xs text-slate-500">File says {minutesLabel(offlineOt(r))}; requires HRIS approval.</p>}</td>
   <td className="min-w-[150px] p-3 align-top"><span className={`inline-block rounded-full px-2 py-1 text-xs font-bold ${r.status==='Approved'&&r.finalMinutes!=null?'bg-emerald-100 text-emerald-900':r.status==='Rejected'?'bg-red-100 text-red-900':'bg-amber-100 text-amber-950'}`}>{completed.includes(r.id)?'Saved in this action':statusLabel(r)}</span><p className="mt-2">Payable: <b>{r.status==='Approved'&&r.finalMinutes!=null?minutesLabel(r.finalMinutes):r.status==='Rejected'?'0h':'Not yet authorized'}</b></p>{r.blocked&&<p className="mt-2 text-xs text-red-700">{r.blocked}</p>}{r.canSend&&r.status==='Approved'&&r.finalMinutes==null&&<p className="mt-2 text-xs">Select and send to manager to confirm hours.</p>}</td>
  </tr>)}</tbody></table></div>
  <WeeklyRouting week={week} readOnly={readOnly||busy} onChanged={onChanged}/>
  </section>)}
  {!readOnly&&(sendable.length>0||reviewable.length>0)&&<footer className="sticky bottom-0 z-10 space-y-3 rounded-xl border bg-slate-50 p-4 shadow-lg dark:bg-slate-800">
   <label className="block text-sm font-medium">Note / additional details <span className="font-normal text-slate-500">(optional for approval; required for return or rejection)</span><textarea rows={2} value={note} disabled={busy} onChange={e=>setNote(e.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2 text-slate-900"/></label>
   {progress&&<p role="status">{progress}</p>}{error&&<p role="alert" className="text-red-700">{error}</p>}
   {canDecide&&bodContextMissing&&<p role="alert" className="text-red-700">A selected BOD request still needs weekly checks. Deselect it to approve the other requests, or return it for details.</p>}
   {canDecide&&invalid&&<p role="alert" className="text-red-700">{workDateLabel(invalid.date)}: {invalid.blocked||'Check the approved amount and any night-work minutes.'} You can return or reject this row.</p>}
   <div className="flex flex-wrap items-center gap-2"><span className="mr-auto text-sm">{selected.length} selected across {selectedGroups.length} weeks</span>{sendable.length>0&&<button className={`${button} bg-violet-700 text-white`} disabled={busy||!canSend} onClick={()=>act('send')}>{busy?'Saving…':`Send ${selected.length||''} to manager for approval`}</button>}{reviewable.length>0&&<><button className={button} disabled={busy||!canDecide} onClick={()=>act('return')}>Return for details</button><button className={`${button} border-red-300 text-red-700`} disabled={busy||!canDecide} onClick={()=>act('reject')}>Reject selected</button><button className={`${button} bg-violet-700 text-white`} disabled={busy||!canDecide||!!invalid||bodContextMissing} onClick={()=>act('approve')}>{busy?'Saving…':`Approve ${selected.length||''} selected`}</button></>}</div>
   <p className="text-xs text-slate-500">One action covers all selected weeks. Each week keeps its own approval checks; above-limit OT goes to BOD automatically. Returned requests go back to the payroll sender.</p>
  </footer>}

 </section>;
}

function WeeklyRouting({week,readOnly,onChanged}:{week:OtWeek;readOnly:boolean;onChanged:(message:string)=>void}){
 const [baseline,setBaseline]=useState(''),[evidence,setEvidence]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const needsContext=week.summary.baselineMissing||week.summary.quantitiesMissing;
 return <>{error&&<p role="alert" className="p-3 text-red-700">{error}</p>}
  <details className="border-t p-4 text-sm"><summary className="cursor-pointer font-semibold">Weekly routing details{needsContext?' · action needed':''}</summary><p className="mt-2">{minutesLabel(week.summary.regularMinutes)} scheduled regular + {minutesLabel(week.summary.approvedMinutes)} approved OT + {minutesLabel(week.summary.reviewedMinutes)} reviewed OT = {minutesLabel(week.summary.projectedMinutes)}. BOD threshold: {minutesLabel(week.summary.thresholdMinutes)}. This is an approval-routing total, not actual attendance.</p>{week.summary.quantitiesMissing&&<p className="mt-2 text-amber-800">Send the older requests marked “Needs manager hours” for review so the weekly total can be confirmed. Requests outside this page may also need review.</p>}{week.summary.baselineMissing&&<p className="mt-2 text-amber-800">The published weekly schedule is incomplete. The manager must verify the regular hours before final approval.</p>}{week.summary.baselineMissing&&week.canConfirmBaseline&&!readOnly&&<div className="mt-3 flex flex-wrap gap-2"><label>Regular hours<input className="block w-24 rounded border p-2 text-slate-900" type="number" min="0" max="168" value={baseline} onChange={e=>setBaseline(e.target.value)}/></label><label>Schedule / evidence<input className="block rounded border p-2 text-slate-900" value={evidence} onChange={e=>setEvidence(e.target.value)}/></label><button className={button} disabled={busy||!baseline||!evidence.trim()} onClick={async()=>{setBusy(true);try{await confirmOtBaseline(week.employeeId,week.summary.weekStart,Math.round(Number(baseline)*60),evidence);onChanged('Weekly regular hours verified.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Save verified baseline</button></div>}<a className="mt-2 inline-block underline" href={`/payroll/timekeeping?week=${week.summary.weekStart}`}>View published schedule</a></details></>;
}
