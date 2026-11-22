import React, {useEffect,useState} from 'react';
import {operationsRpc} from './service';
import {formatDue,manilaDay} from './presentation';
import {buttonClass,primaryClass,inputClass} from './ui';

type Audit={action:string;at:string;reason:string|null;actor:string|null};
type Row={events:Audit[]|null;work_id:string;unit:string;title:string;owner:string|null;contributors:string|null;due_at:string;submitted_at:string|null;
  state:string;reason:string;manage:boolean;admin:boolean;test:boolean;discarded_at:string|null;incident_id:string|null;assignment:string|null};
const pending=['Overdue','Missed — needs review','Completion requested'];
export default function ChecklistAccountability({unit,history,onOpen}:{unit:string;history:boolean;onOpen:(id:string)=>void}){
 const [rows,setRows]=useState<Row[]>([]),[selected,setSelected]=useState<string[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [period,setPeriod]=useState('All dates'),[refresh,setRefresh]=useState(0);
 useEffect(()=>{let active=true,serial=0;setRows([]);setSelected([]);
 async function load(){const ticket=++serial;try{const result=await operationsRpc<Row[]>('ops_checklist_cases',{p_unit:unit||null});
 if(active&&ticket===serial){setRows(result);setError('');}}catch(e){if(active)setError((e as Error).message);}}
 void load();const timer=window.setInterval(()=>{if(!document.hidden)void load();},15000);
 return()=>{active=false;window.clearInterval(timer);};},[unit,refresh]);
 async function act(ids:string[],action:string){
 let reason='';
 if(action==='Close'||action==='Excuse'){const answer=window.prompt('Please give a short reason for this decision.');if(answer===null)return;reason=answer.trim();if(reason.length<3){setError('Enter at least three characters for the reason.');return;}}
 if(action==='Discard'&&!window.confirm('Archive '+ids.length+' selected checklist record(s) as tests and exclude them from accountability reports?'))return;
 setBusy(true);try{await operationsRpc('ops_checklist_decide',{p_ids:ids,p_action:action,p_reason:reason});setRefresh(n=>n+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const today=manilaDay(new Date());
 const dated=rows.filter(r=>period==='All dates'||(period==='Today'?manilaDay(new Date(r.due_at))===today:manilaDay(new Date(r.due_at)).slice(0,7)===today.slice(0,7)));
 const visible=dated.filter(r=>history||(!r.test&&pending.includes(r.state)));
 return <section className="space-y-4"><label>Due date <select className={inputClass} value={period} onChange={e=>setPeriod(e.target.value)}>{['All dates','Today','This month'].map(x=><option key={x}>{x}</option>)}</select></label>
 {Object.entries(dated.filter(r=>!r.test).reduce<Record<string,Row[]>>((m,r)=>{(m[r.unit]??=[]).push(r);return m;},{})).map(([name,group])=><div className="rounded-xl border p-4" key={name}><strong>{name}</strong><p className="mt-1 text-sm">{['On time','Completed late','Missed','Awaiting review'].map(s=>(s==='Completed late'?'Late':s)+' '+group.filter(r=>s==='Awaiting review'?pending.includes(r.state):r.state===s).length).join(' · ')}</p></div>)}
 {selected.length>0&&<button disabled={busy} className={buttonClass} onClick={()=>void act(selected,'Discard')}>Discard as test ({selected.length})</button>}
 {error&&<p role="alert">{error}</p>}
 {!visible.length&&<p>{history?'No checklist records for these dates.':'No checklists need attention for these dates.'}</p>}
 {visible.map(r=><article key={r.work_id} className="rounded-2xl border p-4 space-y-2">
 <div className="flex flex-wrap items-center gap-3">{r.admin&&!r.discarded_at&&<input aria-label={'Select '+r.title} type="checkbox" checked={selected.includes(r.work_id)} onChange={e=>setSelected(s=>e.target.checked?[...s,r.work_id]:s.filter(x=>x!==r.work_id))}/>}<strong>{r.title}</strong><span className="rounded-full bg-violet-100 px-3 py-1 text-sm text-violet-900">{r.test?'Test · ':''}{r.state}</span></div>
 <p className="text-sm">{r.unit} · Due {formatDue(r.due_at)}{r.submitted_at?' · Submitted '+formatDue(r.submitted_at):''}</p>
 <p className="text-sm">Owner · {r.owner||'Unrecorded'}{r.contributors?' · Contributors · '+r.contributors:''}</p>{r.reason&&<p>{r.reason}</p>}{history&&r.events?.length?<details><summary className="cursor-pointer">Review history</summary><ul>{r.events.map((e,i)=><li key={i} className="mt-1 text-sm">{formatDue(e.at)} · {e.action}{e.actor?' · '+e.actor:''}{e.reason?' · '+e.reason:''}</li>)}</ul></details>:null}
 <div className="flex flex-wrap gap-2">{r.assignment&&!r.discarded_at&&!['Missed','Excused'].includes(r.state)&&<button className={buttonClass} onClick={()=>onOpen(r.assignment!)}>Open checklist</button>}
 {r.manage&&pending.includes(r.state)&&<>{r.state!=='Completion requested'&&<button className={buttonClass} disabled={busy} onClick={()=>void act([r.work_id],'Request')}>Request completion</button>}{r.state!=='Overdue'&&<button className={buttonClass} disabled={busy} onClick={()=>void act([r.work_id],'Close')}>Close as missed</button>}<button className={buttonClass} disabled={busy} onClick={()=>void act([r.work_id],'Excuse')}>Excuse / Not required</button></>}
 {r.manage&&r.state==='Missed'&&!r.test&&(r.incident_id?<span>Submitted to HR</span>:<button className={primaryClass} disabled={busy} onClick={()=>void act([r.work_id],'Refer')}>Submit incident report to HR</button>)}</div></article>)}</section>;
}
