import React, {useEffect, useState} from 'react';
import {supabase} from '../../services/supabaseClient';
import {ScheduleTask} from '../../modules/scheduleCompliance';

type Entry = {date: string; templateId: string | null; restDay?: boolean; name?: string; start?: string; end?: string; flexible?: boolean; paidMinutes?: number};
type Submission = {id: string; version: number; week: string; status: string; reason: string; review_reason?: string; entries: Entry[]; schedule: Entry[]; employeeName: string};
type Workflow = {isBod: boolean; isGm?: boolean; managerRole?: string; needsResubmission?: boolean; eligible: boolean; managerName: string; week: string; deadline: string; keepableDates?: string[]; task?: {exempt: boolean; complete: boolean; missingDates: string[]}; submission?: Submission; templates: {id: string; name: string; start: string; end: string; flexible?: boolean; paidMinutes?: number}[]; pending: Submission[]};
const box = 'mb-5 rounded-2xl border border-slate-300 bg-white p-5 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const input = 'min-h-11 w-full rounded-lg border border-slate-400 bg-white p-2 text-slate-900 dark:bg-slate-900 dark:text-white';
const button = 'min-h-11 rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white disabled:opacity-50';
const dateLabel = (date: string) => new Date(date+'T12:00:00+08:00').toLocaleDateString('en-PH', {weekday:'short', month:'short', day:'numeric', timeZone:'Asia/Manila'});
async function rpc(name: string, args: Record<string, unknown> = {}) {
 const {data,error} = await supabase.rpc(name,args);
 if(error) throw new Error(error.message);
 return data;
}

export default function BodScheduleWorkflow() {
 const [data,setData] = useState<Workflow|null>(null), [week,setWeek] = useState(''), [revision,setRevision] = useState(0);
 const [error,setError] = useState(''), [submitError,setSubmitError] = useState(''), [notice,setNotice] = useState(''), [busy,setBusy] = useState(false), [open,setOpen] = useState(false);
 const [entries,setEntries] = useState<Entry[]>([]), [reason,setReason] = useState(''), [reviewReasons,setReviewReasons] = useState<Record<string,string>>({});
 const [reviewBusy,setReviewBusy] = useState<string|null>(null), [reviewErrors,setReviewErrors] = useState<Record<string,string>>({}), [reviewNotices,setReviewNotices] = useState<Record<string,string>>({});
 const [selectedPending,setSelectedPending] = useState<Set<string>>(new Set()), [bulkBusy,setBulkBusy] = useState(false), [bulkNotice,setBulkNotice] = useState(''), [bulkError,setBulkError] = useState('');
 useEffect(() => {
  let active=true;
  const load=() => { void rpc('get_bod_schedule_workflow',{p_week:week||null}).then((value:Workflow) => {
   if(!active) return;
   setData(value);setError('');
  }).catch(e => {if(active)setError(e.message);}); };
  load();window.addEventListener('focus',load);
  const interval=window.setInterval(load,30000);
  return () => {active=false;window.removeEventListener('focus',load);window.clearInterval(interval);};
 },[week,revision]);
 useEffect(() => {
  const pendingIds=new Set((data?.pending||[]).map(item=>item.id));
  setSelectedPending(current=>new Set([...current].filter(id=>pendingIds.has(id))));
 },[data?.pending]);
 async function action(name: string,args: Record<string,unknown>,message: string) {
  setBusy(true);setError('');setSubmitError('');setNotice('');
  try {await rpc(name,args);setNotice(message);setOpen(false);setRevision(v=>v+1);}
  catch(e) {const message=(e as Error).message || 'The schedule was not submitted. Please retry.'; if(name==='submit_my_bod_schedule')setSubmitError(message); else setError(message);} finally {setBusy(false);}
 }
 async function review(id: string, version: number, approve: boolean) {
  const typedReason=(reviewReasons[id]||'').trim();
  const decisionReason=typedReason || (approve ? 'Approved' : 'Please revise the submitted schedule');
  setReviewBusy(id);setReviewErrors(r=>({...r,[id]:''}));setReviewNotices(r=>({...r,[id]:''}));
  try {
   await rpc('review_bod_schedule_submission',{p_id:id,p_version:version,p_approve:approve,p_reason:decisionReason});
   setReviewNotices(r=>({...r,[id]:approve?'Schedule approved and published.':'Schedule returned to the employee for revision.'}));
   setReviewReasons(r=>({...r,[id]:''}));
   setRevision(v=>v+1);
 } catch(e) {
   setReviewErrors(r=>({...r,[id]:(e as Error).message || 'The schedule decision could not be saved. Please retry.'}));
  } finally {setReviewBusy(null);}
 }
 async function approveSelected() {
  if(!data||bulkBusy||reviewBusy)return;
  const selected=data.pending.filter(item=>selectedPending.has(item.id));
  if(!selected.length)return;
  setBulkBusy(true);setBulkNotice('');setBulkError('');
  let approved=0;const failures:string[]=[];
  for(const item of selected){
   try {
    const typedReason=(reviewReasons[item.id]||'').trim();
    await rpc('review_bod_schedule_submission',{p_id:item.id,p_version:item.version,p_approve:true,p_reason:typedReason||'Approved from dashboard'});
    approved++;
   } catch(e) { failures.push(`${item.employeeName}: ${(e as Error).message||'approval failed'}`); }
  }
  setSelectedPending(new Set());
  if(failures.length)setBulkError(`${approved} approved. ${failures.join(' · ')}`);
  else setBulkNotice(`${approved} schedule${approved===1?'':'s'} approved and published.`);
  setRevision(v=>v+1);setBulkBusy(false);
 }
 const approver=data?.managerRole==='GM'?'GM':'BOD';
 const keepableDates=new Set(data?.keepableDates||[]);
 const missingDates=entries.filter(entry=>!entry.restDay&&!entry.templateId&&!keepableDates.has(entry.date)).map(entry=>entry.date);
 async function submitSchedule() {
  if(!data||busy)return;
  if(missingDates.length) {
   setSubmitError(`Choose a shift or Rest Day for: ${missingDates.map(dateLabel).join(', ')}. Blank is available only for an existing schedule, approved leave, or exemption.`);
   return;
  }
  await action('submit_my_bod_schedule',{p_week:data.week,p_entries:entries.map(({date,templateId,restDay})=>({date,templateId,restDay:!!restDay})),p_reason:reason},`Schedule submitted to your ${approver} for approval.`);
 }
 function edit() {
  if(!data)return;
  setEntries(Array.from({length:7},(_,i) => {
   const date=new Date(data.week+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+i);
   const day=date.toISOString().slice(0,10);
   return data.submission?.entries.find(e=>e.date===day)||{date:day,templateId:null};
  }));
  setReason(data.submission?.reason||'');setSubmitError('');setOpen(true);
 }
 return <>
  {error&&<div className={box} role="alert">{error} <button type="button" className="underline" onClick={()=>setRevision(v=>v+1)}>Retry</button></div>}
  {notice&&<p className={box} role="status">{notice}</p>}
  {data&&!data.isBod&&!data.isGm&&<ScheduleTask />}
  {data?.eligible&&!data.isBod&&<section id="my-schedule-submission" className={box}>
   <h2 className="text-xl font-bold">{data.needsResubmission?'Your reporting line changed — resubmit your schedule':data.submission?.status==='Pending'?`Your schedule is awaiting ${approver} approval`:data.submission?.status==='Approved'?'Your schedule was approved':`Submit your schedule for ${approver} approval`}</h2>
   <p className="mt-2">You report directly to {data.managerName}. Prepare your own schedule; your {approver} will approve or reject it.</p>
   <div className="my-3 flex flex-wrap items-center gap-3"><label>Week starting Monday <input aria-label="Schedule week starting Monday" className={input} type="date" value={week||data.week} onChange={e=>{setWeek(e.target.value);setOpen(false);}}/></label><p>Deadline: {new Date(data.deadline).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} Philippine time</p></div>
   {data.task?.exempt&&<p>No schedule is required for your exempt dates.</p>}
   {data.submission?.review_reason&&<p className="my-2">{approver} feedback: {data.submission.review_reason}</p>}
   {data.submission?.status==='Rejected'&&<p className="my-2 font-semibold">Please revise and resubmit your schedule.</p>}
   {!open?<button type="button" className={button} onClick={edit}>{data.submission?'View / revise schedule':'Prepare my schedule'}</button>:<div className="mt-4 space-y-3">
    {entries.map((entry,i)=><label key={entry.date} className="grid gap-2 sm:grid-cols-[10rem_1fr]"><span>{dateLabel(entry.date)}{!entry.restDay&&!entry.templateId&&!keepableDates.has(entry.date)&&<span className="ml-2 text-sm font-semibold text-rose-700 dark:text-rose-300">Choice needed</span>}</span><select className={input} value={entry.restDay?'rest':entry.templateId||''} onChange={e=>{setSubmitError('');setEntries(rows=>rows.map((row,index)=>index===i?{...row,templateId:e.target.value==='rest'?null:e.target.value||null,restDay:e.target.value==='rest'}:row));}}>
     <option value="">{keepableDates.has(entry.date)?"Keep existing schedule / approved leave / exemption":"Select a shift or Rest Day"}</option>
     <option value="rest">Rest Day</option>
     {data.templates.map(t=><option key={t.id} value={t.id}>{t.flexible?`${t.name} · Flexi · ${(t.paidMinutes??480)/60} paid hours`:`${t.name} · ${t.start}–${t.end}`}</option>)}
    </select></label>)}
    <p className="text-sm">Choose a shift or Rest Day for every date marked “Choice needed.” Blank keeps an existing schedule, approved leave, or exemption only where available. Changes take effect after approval.</p>
    {!data.templates.length&&<p role="alert">No business-unit presets are available. Ask HR to configure them before submitting.</p>}
    <label className="block">Schedule notes <span className="font-normal text-slate-500 dark:text-slate-300">(optional)</span><textarea className={input} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
    {!!missingDates.length&&<p className="text-sm font-medium text-rose-700 dark:text-rose-300">Choose a shift or Rest Day for: {missingDates.map(dateLabel).join(', ')}.</p>}
    {submitError&&<p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-rose-800 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-200">{submitError}</p>}
    <div className="flex gap-3"><button type="button" disabled={busy || missingDates.length>0} className={button} onClick={()=>void submitSchedule()}>{busy?'Submitting…':`Submit for ${approver} approval`}</button><button type="button" disabled={busy} className="underline" onClick={()=>setOpen(false)}>Close</button></div>
   </div>}
  </section>}
  {data?.isGm&&!data.isBod&&<section className={box}><h2 className="text-xl font-bold">Review your direct reports’ schedules</h2><p className="mt-2">Employees who report directly to you prepare and submit their own schedules. Approve or return their submissions here; schedules take effect only after approval.</p>{!data.pending.length&&<p className="mt-2">No schedules are awaiting your approval.</p>}</section>}
  {!!data?.pending.length&&<section id="schedule-approvals" className={box}>
   <div className="flex flex-wrap items-start justify-between gap-4">
    <div><h2 className="text-xl font-bold">Employee schedules awaiting your approval · {data.pending.length}</h2><p className="mt-2">The schedule summary and approval action are shown here—no dropdown is required.</p></div>
    <div className="flex flex-wrap items-center gap-2">
     <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold dark:border-slate-600"><input type="checkbox" checked={data.pending.length>0&&selectedPending.size===data.pending.length} onChange={e=>setSelectedPending(e.target.checked?new Set(data.pending.map(item=>item.id)):new Set())} /> Select all</label>
     <button type="button" disabled={!selectedPending.size||bulkBusy||reviewBusy!==null} className={button} onClick={()=>void approveSelected()}>{bulkBusy?'Approving…':`Approve all selected${selectedPending.size?` (${selectedPending.size})`:''}`}</button>
    </div>
   </div>
   {bulkError&&<p className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-red-800" role="alert">{bulkError}</p>}
   {bulkNotice&&<p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-800" role="status">{bulkNotice}</p>}
   <div className="mt-4 space-y-3">
    {data.pending.map(s=><article className="rounded-xl border border-slate-300 p-4 dark:border-slate-600" key={s.id}>
     <div className="flex flex-wrap items-start justify-between gap-3">
      <label className="flex items-start gap-3"><input className="mt-1 h-5 w-5" type="checkbox" checked={selectedPending.has(s.id)} onChange={e=>setSelectedPending(current=>{const next=new Set(current);if(e.target.checked)next.add(s.id);else next.delete(s.id);return next;})} /><span><strong className="text-lg">{s.employeeName}</strong><span className="block text-sm text-slate-500 dark:text-slate-300">Week of {dateLabel(s.week)} · Submitted for review</span></span></label>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={bulkBusy||reviewBusy!==null} aria-busy={reviewBusy===s.id} className={button} onClick={()=>void review(s.id,s.version,true)}>{reviewBusy===s.id?'Saving…':'Approve schedule'}</button><button type="button" disabled={bulkBusy||reviewBusy!==null} className="min-h-11 rounded-lg border border-slate-400 px-4 py-2 font-semibold text-slate-800 dark:text-white" onClick={()=>void review(s.id,s.version,false)}>Reject / request revision</button></div>
     </div>
     <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{s.reason||'No schedule note provided.'}</p>
     <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{s.schedule.map(e=><li className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900" key={e.date}><strong>{dateLabel(e.date)}</strong><span className="block">{e.name}{e.flexible?` · Flexi · ${(e.paidMinutes??480)/60} paid hours`:e.start&&` · ${e.start}–${e.end}`}</span></li>)}</ul>
     <label className="mt-3 block text-sm">Decision / revision note <span className="font-normal text-slate-500 dark:text-slate-300">(optional)</span><textarea aria-label={`Decision / revision note for ${s.employeeName}`} maxLength={1000} className={input} value={reviewReasons[s.id]||''} onChange={e=>setReviewReasons(r=>({...r,[s.id]:e.target.value}))}/></label>
     {reviewErrors[s.id]&&<p className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-red-800" role="alert">{reviewErrors[s.id]}</p>}
     {reviewNotices[s.id]&&<p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-800" role="status">{reviewNotices[s.id]}</p>}
    </article>)}
   </div>
  </section>}
 </>;
}
