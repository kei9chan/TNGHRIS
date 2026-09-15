import React,{useEffect,useState} from 'react';
import {supabase} from '../../services/supabaseClient';
import {AwardLetter,letterAction,issueCommendation} from '../../services/commendationService';
import Button from '../ui/Button';
export default function CommendationRecords({onView,onRefresh,canManage}:{onView:(id:string)=>void;onRefresh:()=>void;canManage:boolean}) {
 const [rows,setRows]=useState<AwardLetter[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const [hasMore,setHasMore]=useState(false);
 const load=async(more=false)=>{const offset=more?rows.length:0;const {data,error}=await supabase.from('award_letters').select('award_id,state,last_error,acknowledged_at,employee_name:snapshot->>employeeName,award_title:snapshot->>awardTitle,business_unit:snapshot->>businessUnit').order('created_at',{ascending:false}).order('award_id').range(offset,offset+49);if(error)setError(error.message);else {const page=(data||[]).map(r=>({...r,snapshot:{employeeName:r.employee_name,awardTitle:r.award_title,businessUnit:r.business_unit}})) as unknown as AwardLetter[];setRows(previous=>more?[...previous,...page]:page);setHasMore(page.length===50);}};useEffect(()=>{void load();},[]);
 return <section className="rounded-xl border p-4"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">My Awards & Letter Receipts</h2><button onClick={()=>void load()} className="underline">Refresh</button></div>{error&&<p role="alert" className="text-red-600">{error}</p>}
  {!rows.length&&<p className="py-3 text-sm text-gray-500">No accessible commendation letters yet.</p>}
  <div className="mt-3 space-y-3">{rows.map(l=><div key={l.award_id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"><div><b>{l.snapshot.employeeName} — {l.snapshot.awardTitle}</b><p className="text-sm">{l.snapshot.businessUnit} · {l.state==='Draft'?'Draft letter — approval retained; issuance pending':l.state} · {l.acknowledged_at?`Acknowledged ${new Date(l.acknowledged_at).toLocaleString()}`:'Not acknowledged'}</p>{l.last_error&&<p className="text-sm text-red-600">{l.last_error}</p>}</div><div className="flex gap-2">
   {l.state==='Issued'&&<Button onClick={()=>onView(l.award_id)}>View Letter</Button>}
   {l.state==='Draft'&&<Button disabled={!!busy} onClick={async()=>{setBusy(l.award_id);setError('');try{await issueCommendation(l.award_id);await load();onRefresh();}catch(e){setError((e as Error).message);await load();}finally{setBusy('');}}}>Retry issuance</Button>}
   {canManage&&l.state!=='Withdrawn'&&<Button variant="secondary" disabled={!!busy} onClick={async()=>{const reason=window.prompt('Required reason for cancelling / withdrawing this award:');if(!reason?.trim())return;setBusy(l.award_id);try{await letterAction(l.award_id,'withdraw',{reason});await load();onRefresh();}catch(e){setError((e as Error).message);}finally{setBusy('');}}}>Withdraw</Button>}
  </div></div>)}</div>{hasMore&&<button className="mt-3 underline" onClick={()=>void load(true)}>Load more records</button>}
 </section>;
}
