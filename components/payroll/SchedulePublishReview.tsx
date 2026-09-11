import React, {useEffect, useRef, useState} from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import {reviewScheduleWeek, publishScheduleWeek, ScheduleReview} from '../../services/schedulePublicationService';

export default function SchedulePublishReview({ids,week,label,excluded,coverageWarnings=[],onClose,onPublished,onFix}:{ids:string[];week:string;label:string;excluded:number;coverageWarnings?:string[];onClose:()=>void;onPublished:()=>void;onFix:(id:string,date?:string)=>void}) {
 const [rows,setRows]=useState<ScheduleReview[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[noteError,setNoteError]=useState(''),[checked,setChecked]=useState(false),[success,setSuccess]=useState('');
 const lock=useRef(false), generation=useRef(0);
 const refresh=async()=>{const n=++generation.current;setLoading(true);setError('');setChecked(false);try{const data=await reviewScheduleWeek(ids,week);if(n===generation.current)setRows(data);}catch(e){if(n===generation.current)setError((e as Error).message);}finally{if(n===generation.current)setLoading(false);}};
 useEffect(()=>{void refresh();return()=>{generation.current++;};},[ids.join(','),week]);
 const ready=rows.filter(r=>r.ready&&!r.published&&!r.pending), blocked=rows.filter(r=>!r.ready||r.pending);
 const publish=async()=>{
  if(lock.current)return;
  if(note.trim().length<3){setNoteError('Please add a publication note before publishing.');return;}
  if(!checked||!ready.length||loading)return;
  lock.current=true;setBusy(true);setError('');
  try{const result=await publishScheduleWeek(ready.map(r=>r.employeeId),week,note,ready);
   const pending=result.filter((r:any)=>r.approval_required).length;
   setSuccess(pending?`${result.length-pending} schedules published. ${pending} finalized employee schedules were submitted for the required HR override review; their previous schedules remain visible.`:'Schedules published successfully.');onPublished();
  }catch(e){console.error('Schedule publication failed',{week,error:e});setError(`The schedules could not be confirmed as published. ${(e as Error).message} Refresh this review before retrying.`);setChecked(false);}
  finally{lock.current=false;setBusy(false);}
 };
 return <Modal isOpen title="Review & publish" size="4xl" onClose={()=>{if(!lock.current)onClose();}} footer={<div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} onClick={onClose}>{success?'Done':'Back to schedules'}</Button>{!success&&!loading&&<Button variant={blocked.length?'secondary':'primary'} disabled={busy||!checked||!ready.length||!!error} isLoading={busy} onClick={publish}>{busy?'Publishing schedules…':blocked.length?'Publish ready schedules only':'Publish schedules for this week'}</Button>}</div>}>
 <ol className="flex flex-wrap gap-4 text-sm"><li>✓ Prepare schedules</li><li className="font-bold text-violet-400">2 · Review for issues</li><li>3 · Publish to employees</li></ol>
 <h4 className="text-xl font-bold">{label} · Monday–Sunday</h4>
 {loading&&<p role="status">Checking saved schedules and publishing permissions…</p>}
 {error&&<div role="alert" className="rounded border border-red-400 p-3"><p>{error}</p><button className="mt-2 underline" onClick={refresh} disabled={busy}>Refresh review</button></div>}
 {success?<p role="status" className="rounded bg-green-900/30 p-4 text-green-500">{success}</p>:!loading&&rows.length>0&&<>
 <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[[rows.length,'employees included'],[ready.length,'ready to publish'],[blocked.length,'need attention'],[rows.filter(r=>r.published).length,'already published']].map(([n,t])=><div className="rounded bg-slate-500/10 p-3" key={t}><strong className="block text-2xl">{n}</strong>{t}</div>)}</div>
 <p className="text-sm">{rows.reduce((n,r)=>n+r.saved,0)} saved schedule records · {rows.reduce((n,r)=>n+r.restDays,0)} rest days · {rows.reduce((n,r)=>n+r.absences,0)} approved absence days</p>
 {excluded>0&&<p>{excluded} employees excluded because they are exempt from clocking for this week.</p>}
 {blocked.length>0&&<p className="text-amber-500">The entire selection cannot be published yet. Fix the issues below, or explicitly publish only the {ready.length} ready employees. Excluded employees keep their previous published schedules.</p>}
 {rows.filter(r=>r.frozen&&!r.pending&&r.ready&&!r.published).length>0&&<p className="text-amber-500">HR-finalized schedules require the existing override review. Publishing records a proposed version; employees keep the previous version until that review is complete.</p>}
 {coverageWarnings.length>0&&<div className="rounded border border-amber-500/50 p-3"><strong>Business-hours coverage</strong>{coverageWarnings.map(w=><p key={w}>{w}</p>)}<p className="text-sm">Review coverage before publishing. These warnings do not change existing publishing permissions.</p></div>}
 {blocked.map(r=><div key={r.employeeId} className="rounded border border-amber-500/50 p-3"><strong>{r.name}</strong> · {r.businessUnit}<ul>{r.issues.map((issue,i)=><li key={i}>{issue.date} · {issue.message} <button className="underline" onClick={()=>onFix(r.employeeId,issue.date)}>Fix schedule</button></li>)}</ul>{r.pending&&<p>Excluded: a previous publication is awaiting HR override review.</p>}</div>)}
 <div className="space-y-2 border-t border-slate-500/30 pt-4"><p>✓ Saved schedules checked</p><label className="flex gap-2"><input type="checkbox" checked={checked} disabled={busy} onChange={e=>setChecked(e.target.checked)}/>I have reviewed the issues and employees included.</label><label className="block font-semibold" htmlFor="publication-note">Publication note</label><p className="text-sm">Briefly explain why this schedule is being published or changed.</p><textarea id="publication-note" aria-invalid={!!noteError} aria-describedby="publication-note-error" disabled={busy} value={note} maxLength={1000} onChange={e=>{setNote(e.target.value);setNoteError('');}} className="w-full rounded border p-3 dark:bg-slate-900"/><p id="publication-note-error" role="alert" className="text-red-400">{noteError}</p><p>{note.trim().length>=3?'✓':'○'} Publication note added</p></div>
 <p>This will make the selected schedules visible to employees.</p>
 </>}
 </Modal>;
}
