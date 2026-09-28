import React,{useEffect,useRef,useState} from 'react';
import {supabase} from '../../services/supabaseClient';

type Change={row:number;employeeId:string;employee:string;workDate:string;beforeStatus:string;beforeSource:string;
 beforeEvents:{type:string;timestamp:string}[];afterStatus:string;afterEvents:{type:string;timestamp:string}[];
 reference:string;reviewRequest:string;reviewExplanation:string};
type Review={id:string;filename:string;status:string;submitted_by_name:string|null;submitted_at:string;canAct:boolean;
  preview:{ready:number;duplicates:number;changes?:Change[];rows:{row:number;employee:string;workDate:string;dayStatus:string;duplicate:boolean;error:string|null;warnings:string[]}[]};
  proposed_rules:{holidayCoverageConfirmed:boolean;splitShiftConfirmed:boolean}|null;rule_reference:string|null;
  reviewRequests:{employeeId:string;date:string;choice:string;explanation:string}[];
  hr_approved_by_name:string|null;bod_approved_by_name:string|null;decision_note:string|null};
const button='min-h-11 rounded-xl border px-4 py-2 font-semibold disabled:opacity-50';
const label=(status:string)=>({pending_hr_manager:'Waiting for HR Manager',pending_bod:'Waiting for one BOD',approved:'Approved and applied',rejected:'Rejected',returned:'Returned for correction'}[status]||status);
const punchSummary=(events:Change['afterEvents'])=>!events?.length?'No punches':events.map(e=>`${e.type.replaceAll('_',' ')} ${new Date(e.timestamp).toLocaleString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`).join(' · ');
async function downloadOriginal(id:string){
 const {data,error}=await supabase.rpc('get_actual_attendance_import_source',{p_review:id});if(error)throw error;
 const binary=atob(data.base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 const url=URL.createObjectURL(new Blob([bytes],{type:data.filename.toLowerCase().endsWith('.xlsx')?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv'}));
 const anchor=document.createElement('a');anchor.href=url;anchor.download=data.filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function AttendanceImportApprovals({scope,from,to,onApplied}:{scope:string;from:string;to:string;onApplied:()=>void}){
 const [items,setItems]=useState<Review[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const [notes,setNotes]=useState<Record<string,string>>({}),[selected,setSelected]=useState<Record<string,boolean>>({});
 const deciding=useRef(false);
 useEffect(()=>{let active=true;if(!scope||!from||!to)return;setError('');
  supabase.rpc('get_actual_attendance_import_reviews',{p_scope:scope,p_from:from,p_to:to}).then(({data,error})=>{
   if(!active)return;if(error)setError(error.message);else setItems(data||[]);
  });return()=>{active=false;};},[scope,from,to,revision]);
 async function decide(id:string,action:'approve'|'reject'|'return'){
  if(deciding.current)return;deciding.current=true;setBusy(true);setError('');try{const {data,error}=await supabase.rpc('review_actual_attendance_import',{
   p_review:id,p_action:action,p_note:notes[id]?.trim()||null});if(error)throw error;
   setRevision(v=>v+1);if(data?.status==='approved')onApplied();
  }catch(e){setError((e as Error).message);}finally{deciding.current=false;setBusy(false);}
 }
 const pending=items.filter(item=>item.status==='pending_hr_manager'||item.status==='pending_bod');
 const history=items.filter(item=>!pending.includes(item));
 return <section className="rounded-2xl border bg-white p-5 dark:bg-slate-900" aria-label="Attendance fixes approvals">
  <h2 className="text-xl font-bold">Attendance fixes for approval</h2>
  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">One review for all changed employee dates. HR Manager reviews a staff upload, then one different BOD applies it. Approval comments are optional. Paid OT and leave keep their own decisions.</p>
  {error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
  {!pending.length&&<p className="mt-4 text-sm">No attendance fixes await approval for this cutoff.</p>}
  <div className="mt-4 space-y-5">{pending.map(item=>{
   const excluded=new Set(item.preview.rows.filter(row=>row.duplicate||row.error).map(row=>row.row));
   const changes=(item.preview.changes||[]).filter(change=>!excluded.has(change.row));
   const statusChanges=changes.filter(change=>change.beforeStatus!==change.afterStatus).length;
   const punchChanges=changes.filter(change=>JSON.stringify(change.beforeEvents||[])!==JSON.stringify(change.afterEvents||[])).length;
   const separate=changes.filter(change=>change.reviewRequest&&change.reviewRequest!=='None').length;
   const employeeChanges=[...new Map(changes.map(change=>[change.employeeId,change.employee] as const)).entries()].map(([id,name])=>({id,name,days:changes.filter(change=>change.employeeId===id)}));
   const allSelected=selected[item.id]!==false;
   return <article key={item.id} className="overflow-hidden rounded-2xl border dark:border-slate-700">
    <div className="flex flex-wrap items-start justify-between gap-3 bg-violet-50 p-4 dark:bg-slate-800"><div><h3 className="text-lg font-bold">{item.filename}</h3><p className="mt-1 text-sm">{from}–{to} · {item.preview.ready} eligible changes across {new Set(changes.map(c=>c.employeeId)).size||'reviewed'} employees · {item.preview.duplicates} unchanged</p><p className="mt-1 text-xs">Uploaded by {item.submitted_by_name||'HRIS user'} · {new Date(item.submitted_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p></div><span className="rounded-full bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">{label(item.status)}</span></div>
    <div className="p-4"><p className="text-sm"><b>Approval route:</b> HR Manager {item.hr_approved_by_name?`approved (${item.hr_approved_by_name})`:item.status==='pending_hr_manager'?'pending':'skipped: HR Manager uploaded'} → BOD {item.bod_approved_by_name?`approved (${item.bod_approved_by_name})`:'pending'}</p><button className="mt-2 text-sm font-semibold text-violet-700 underline" onClick={()=>void downloadOriginal(item.id).catch(e=>setError((e as Error).message))}>Download original uploaded file</button>
     <div className="mt-4 grid gap-2 sm:grid-cols-3"><p className="rounded-lg bg-violet-50 p-3 text-sm dark:bg-slate-800"><b>{statusChanges}</b> day-status changes</p><p className="rounded-lg bg-violet-50 p-3 text-sm dark:bg-slate-800"><b>{punchChanges}</b> punch changes</p><p className="rounded-lg bg-violet-50 p-3 text-sm dark:bg-slate-800"><b>{separate}</b> items flagged for separate review</p></div>
     <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">This approves actual attendance only. It does not authorize paid overtime, paid leave, suspension pay, or deductions.</p>
     {item.proposed_rules&&<p className="mt-3 rounded-lg border border-amber-200 p-3 text-sm">Cutoff-wide rule proposal: holiday coverage {item.proposed_rules.holidayCoverageConfirmed?'verified':'not verified'}; split-shift break {item.proposed_rules.splitShiftConfirmed?'confirmed':'not confirmed'}. Reference: {item.rule_reference||'—'}.</p>}
     <div className="mt-4 space-y-2">{employeeChanges.map(group=><details key={group.id} className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold">{group.name} · {group.days.length} {group.days.length===1?'date':'dates'} · view before and after</summary><div className="mt-3 divide-y">{group.days.map(change=><div key={`${change.workDate}:${change.row}`} className="py-3"><h4 className="font-medium"><span className="mr-2 text-violet-700">✓</span>{change.workDate} · {change.beforeStatus} → {change.afterStatus}</h4><div className="mt-2 grid gap-3 text-sm sm:grid-cols-2"><div><b>Before · {change.beforeSource}</b><p>{change.beforeStatus}</p><p className="text-slate-600">{punchSummary(change.beforeEvents)}</p></div><div><b>Proposed attendance</b><p>{change.afterStatus}</p><p className="text-slate-600">{punchSummary(change.afterEvents)}</p></div></div><p className="mt-2 text-sm"><b>Evidence:</b> {change.reference||'Uploaded attendance file'}{change.reviewExplanation?` · ${change.reviewExplanation}`:''}</p><p className="mt-1 text-sm"><b>Payroll effect:</b> Attendance will be recalculated. {change.reviewRequest&&change.reviewRequest!=='None'?`${change.reviewRequest} needs a separate authorized decision.`:'No extra pay is approved by this fix.'}</p></div>)}</div></details>)}</div>
     {!changes.length&&<p className="mt-3 text-sm">This earlier submission has no detailed change snapshot. Review the submitted import preview before approving.</p>}
     {item.canAct&&<div className="mt-5 border-t pt-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allSelected} onChange={e=>setSelected(v=>({...v,[item.id]:e.target.checked}))}/>Select all {item.preview.ready} eligible fixes in this batch</label><details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Add a note (optional)</summary><textarea aria-label="Approval note or return reason" className="mt-2 min-h-20 w-full rounded-lg border p-2 dark:bg-slate-800" value={notes[item.id]||''} onChange={e=>setNotes(v=>({...v,[item.id]:e.target.value}))}/></details><div className="mt-4 flex flex-wrap gap-2"><button className={`${button} bg-violet-600 text-white`} disabled={busy||!allSelected||!item.preview.ready} onClick={()=>void decide(item.id,'approve')}>{item.status==='pending_bod'?`Approve and apply ${item.preview.ready} fixes`:`Approve ${item.preview.ready} fixes → send to BOD`}</button><button className={button} disabled={busy||(notes[item.id]||'').trim().length<3} onClick={()=>void decide(item.id,'return')}>Return for correction</button><button className={button} disabled={busy||(notes[item.id]||'').trim().length<3} onClick={()=>void decide(item.id,'reject')}>Reject</button></div><p className="mt-2 text-xs text-slate-500">The whole eligible batch is approved in one click. To exclude a row, return the file for correction; no hidden partial import.</p></div>}
    </div></article>;
  })}</div>
  {!!history.length&&<details className="mt-5 text-sm"><summary className="cursor-pointer font-semibold">Previous attendance decisions ({history.length})</summary><ul className="mt-3 space-y-2">{history.map(item=><li key={item.id} className="rounded-lg border p-3">{item.filename} · {label(item.status)} · {item.preview.ready} rows{item.decision_note?` · ${item.decision_note}`:''}</li>)}</ul></details>}
 </section>;
}
