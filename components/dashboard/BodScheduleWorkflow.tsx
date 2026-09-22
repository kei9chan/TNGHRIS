import React, {useEffect, useState} from 'react';
import {supabase} from '../../services/supabaseClient';
import {ScheduleTask} from '../../modules/scheduleCompliance';

type Entry = {date: string; templateId: string | null; restDay?: boolean; name?: string; start?: string; end?: string; flexible?: boolean; paidMinutes?: number};
type Submission = {id: string; version: number; week: string; status: string; reason: string; review_reason?: string; entries: Entry[]; schedule: Entry[]; employeeName: string};
type Workflow = {isBod: boolean; isGm?: boolean; managerRole?: string; needsResubmission?: boolean; eligible: boolean; managerName: string; week: string; deadline: string; task?: {exempt: boolean; complete: boolean; missingDates: string[]}; submission?: Submission; templates: {id: string; name: string; start: string; end: string; flexible?: boolean; paidMinutes?: number}[]; pending: Submission[]};
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
 const [error,setError] = useState(''), [notice,setNotice] = useState(''), [busy,setBusy] = useState(false), [open,setOpen] = useState(false);
 const [entries,setEntries] = useState<Entry[]>([]), [reason,setReason] = useState(''), [reviewReasons,setReviewReasons] = useState<Record<string,string>>({});
 const [reviewBusy,setReviewBusy] = useState<string|null>(null), [reviewErrors,setReviewErrors] = useState<Record<string,string>>({}), [reviewNotices,setReviewNotices] = useState<Record<string,string>>({});
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
 async function action(name: string,args: Record<string,unknown>,message: string) {
  setBusy(true);setError('');setNotice('');
  try {await rpc(name,args);setNotice(message);setOpen(false);setRevision(v=>v+1);}
  catch(e) {setError((e as Error).message);} finally {setBusy(false);}
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
 const approver=data?.managerRole==='GM'?'GM':'BOD';
 function edit() {
  if(!data)return;
  setEntries(Array.from({length:7},(_,i) => {
   const date=new Date(data.week+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+i);
   const day=date.toISOString().slice(0,10);
   return data.submission?.entries.find(e=>e.date===day)||{date:day,templateId:null};
  }));
  setReason(data.submission?.reason||'');setOpen(true);
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
    {entries.map((entry,i)=><label key={entry.date} className="grid gap-2 sm:grid-cols-[10rem_1fr]"><span>{dateLabel(entry.date)}</span><select className={input} value={entry.restDay?'rest':entry.templateId||''} onChange={e=>setEntries(rows=>rows.map((row,index)=>index===i?{...row,templateId:e.target.value==='rest'?null:e.target.value||null,restDay:e.target.value==='rest'}:row))}>
     <option value="">Keep existing schedule / approved leave / exemption</option>
     <option value="rest">Rest Day</option>
     {data.templates.map(t=><option key={t.id} value={t.id}>{t.flexible?`${t.name} · Flexi · ${(t.paidMinutes??480)/60} paid hours`:`${t.name} · ${t.start}–${t.end}`}</option>)}
    </select></label>)}
    <p className="text-sm">Choose a shift or rest-day preset for every unscheduled date. Existing HR statuses must be kept. Changes take effect only after approval.</p>
    {!data.templates.length&&<p role="alert">No business-unit presets are available. Ask HR to configure them before submitting.</p>}
    <label className="block">Schedule notes <span className="font-normal text-slate-500 dark:text-slate-300">(optional)</span><textarea className={input} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <div className="flex gap-3"><button type="button" disabled={busy} className={button} onClick={()=>action('submit_my_bod_schedule',{p_week:data.week,p_entries:entries.map(({date,templateId,restDay})=>({date,templateId,restDay:!!restDay})),p_reason:reason},`Schedule submitted to your ${approver} for approval.`)}>{busy?'Submitting…':`Submit for ${approver} approval`}</button><button type="button" disabled={busy} className="underline" onClick={()=>setOpen(false)}>Close</button></div>
   </div>}
  </section>}
  {data?.isGm&&!data.isBod&&<section className={box}><h2 className="text-xl font-bold">Review your direct reports’ schedules</h2><p className="mt-2">Employees who report directly to you prepare and submit their own schedules. Approve or return their submissions here; schedules take effect only after approval.</p>{!data.pending.length&&<p className="mt-2">No schedules are awaiting your approval.</p>}</section>}
  {!!data?.pending.length&&<section id="schedule-approvals" className={box}>
   <h2 className="text-xl font-bold">Employee schedules awaiting your approval · {data.pending.length}</h2>
   <p className="my-2">Your direct reports prepared these schedules. Review their submissions below.</p>
   {data.pending.map(s=><details className="border-t border-slate-400 py-3" key={s.id}>
    <summary className="cursor-pointer font-semibold">{s.employeeName} · Week of {dateLabel(s.week)} · Review schedule</summary>
    <p className="my-3">{s.reason}</p>
    <ul className="space-y-2">{s.schedule.map(e=><li key={e.date}>{dateLabel(e.date)} — {e.name}{e.flexible?` · Flexi · ${(e.paidMinutes??480)/60} paid hours`:e.start&&` · ${e.start}–${e.end}`}</li>)}</ul>
    <label className="mt-3 block">Decision / revision reason <span className="font-normal text-slate-500 dark:text-slate-300">(optional — a standard audit note is used when blank)</span><textarea aria-label={`Decision / revision reason for ${s.employeeName}`} maxLength={1000} className={input} value={reviewReasons[s.id]||''} onChange={e=>setReviewReasons(r=>({...r,[s.id]:e.target.value}))}/></label>
    {reviewErrors[s.id]&&<p className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-red-800" role="alert">{reviewErrors[s.id]}</p>}
    {reviewNotices[s.id]&&<p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-800" role="status">{reviewNotices[s.id]}</p>}
    <div className="mt-3 flex flex-wrap gap-3">{[true,false].map(approve=><button type="button" key={String(approve)} disabled={reviewBusy!==null} aria-busy={reviewBusy===s.id} className={button} onClick={()=>void review(s.id,s.version,approve)}>{reviewBusy===s.id?'Saving…':approve?'Approve schedule':'Reject / request revision'}</button>)}</div>
   </details>)}
  </section>}
 </>;
}
