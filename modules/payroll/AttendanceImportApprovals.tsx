import React,{useEffect,useState} from 'react';
import {supabase} from '../../services/supabaseClient';

type Review={id:string;filename:string;status:string;submitted_by_name:string|null;submitted_at:string;canAct:boolean;
  preview:{ready:number;duplicates:number;rows:{row:number;employee:string;workDate:string;dayStatus:string;warnings:string[]}[]};
  proposed_rules:{holidayCoverageConfirmed:boolean;splitShiftConfirmed:boolean}|null;rule_reference:string|null;
  reviewRequests:{employeeId:string;date:string;choice:string;explanation:string}[];
  hr_approved_by_name:string|null;bod_approved_by_name:string|null;decision_note:string|null};
const button='min-h-11 rounded-xl border px-4 py-2 font-semibold disabled:opacity-50';
const label=(status:string)=>({pending_hr_manager:'Waiting for HR Manager',pending_bod:'Waiting for one BOD',approved:'Approved and applied',rejected:'Rejected',returned:'Returned for correction'}[status]||status);
export default function AttendanceImportApprovals({scope,from,to,onApplied}:{scope:string;from:string;to:string;onApplied:()=>void}){
 const [items,setItems]=useState<Review[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const [notes,setNotes]=useState<Record<string,string>>({});
 useEffect(()=>{let active=true;if(!scope||!from||!to)return;setError('');
  supabase.rpc('get_actual_attendance_import_reviews',{p_scope:scope,p_from:from,p_to:to}).then(({data,error})=>{
   if(!active)return;if(error)setError(error.message);else setItems(data||[]);
  });return()=>{active=false;};},[scope,from,to,revision]);
 async function decide(id:string,action:'approve'|'reject'|'return'){
  setBusy(true);setError('');try{const {data,error}=await supabase.rpc('review_actual_attendance_import',{
   p_review:id,p_action:action,p_note:notes[id]?.trim()||null});if(error)throw error;
   setRevision(v=>v+1);if(data?.status==='approved')onApplied();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="rounded-2xl border bg-white p-5 dark:bg-slate-900" aria-label="Attendance import approvals">
  <h2 className="text-xl font-bold">Attendance imports awaiting approval</h2>
  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">The uploaded evidence becomes the payroll attendance source after approval. HR Manager reviews a staff upload, then one different BOD approves. When the HR Manager uploads, it goes directly to BOD. Approval notes are optional.</p>
  {error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
  {!items.length&&<p className="mt-4 text-sm">No attendance import has been submitted for this cutoff.</p>}
  <div className="mt-4 space-y-3">{items.map(item=><details key={item.id} className="rounded-xl border p-4">
   <summary className="cursor-pointer font-semibold">{item.filename} · {label(item.status)} · {item.preview.ready} rows ready · {item.preview.duplicates} unchanged</summary>
   <p className="mt-3 text-sm">Uploaded by {item.submitted_by_name||'HRIS user'} · {new Date(item.submitted_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p>
   <p className="mt-1 text-sm">HR Manager: {item.hr_approved_by_name|| (item.status==='pending_hr_manager'?'Pending':'Skipped: HR Manager uploaded')} · BOD: {item.bod_approved_by_name||'Pending'}</p>
   {item.proposed_rules&&<p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Cutoff rule proposal: holiday coverage {item.proposed_rules.holidayCoverageConfirmed?'verified':'not verified'}; split-shift break {item.proposed_rules.splitShiftConfirmed?'confirmed':'not confirmed'}. Reference: {item.rule_reference||'—'}. Verify before approving.</p>}
   {!!item.reviewRequests?.length&&<div className="mt-3"><h3 className="font-semibold">Flagged rows</h3><ul className="mt-1 space-y-1 text-sm">{item.reviewRequests.map((request,i)=><li key={`${request.employeeId}:${request.date}:${i}`}>{request.employeeId} · {request.date} · {request.choice}{request.explanation?` — ${request.explanation}`:''}</li>)}</ul></div>}
   {!!item.preview.rows?.filter(row=>row.warnings?.length).length&&<details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Show import warnings</summary><ul className="mt-2 space-y-1 text-sm">{item.preview.rows.filter(row=>row.warnings?.length).map(row=><li key={row.row}>Row {row.row} · {row.employee} · {row.workDate}: {row.warnings.join(' ')}</li>)}</ul></details>}
   {item.decision_note&&<p className="mt-2 text-sm">Decision note: {item.decision_note}</p>}
   {item.canAct&&<div className="mt-4"><label className="block text-sm">Approval note (optional); reason required to reject or return<textarea className="mt-1 min-h-20 w-full rounded-lg border p-2 dark:bg-slate-800" value={notes[item.id]||''} onChange={e=>setNotes(v=>({...v,[item.id]:e.target.value}))}/></label><div className="mt-3 flex flex-wrap gap-2"><button className={`${button} bg-violet-600 text-white`} disabled={busy} onClick={()=>void decide(item.id,'approve')}>Approve {item.status==='pending_bod'?'and apply import':'for BOD review'}</button><button className={button} disabled={busy||(notes[item.id]||'').trim().length<3} onClick={()=>void decide(item.id,'return')}>Return for correction</button><button className={button} disabled={busy||(notes[item.id]||'').trim().length<3} onClick={()=>void decide(item.id,'reject')}>Reject</button></div></div>}
  </details>)}</div>
 </section>;
}
