import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import {supabase} from '../../services/supabaseClient';
import {useAuth} from '../../hooks/useAuth';
import {phaseChecklist} from './phaseChecklist';

type Progress={phase:number;status:'waiting'|'in_progress'|'done';evidence:string;recorded_at:string};
type Scope={id:string;name:string;canManage:boolean;progress:Progress[]};
const statuses={waiting:'Waiting on team',in_progress:'In progress',done:'Done — team confirmed'};
const input='rounded border border-gray-300 p-2 dark:bg-slate-800 dark:border-slate-600';
export default function PhaseChecklist(){
 const {user}=useAuth();const [scopes,setScopes]=useState<Scope[]>([]);const [scopeId,setScopeId]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const [phase,setPhase]=useState('1');const [status,setStatus]=useState('waiting');const [evidence,setEvidence]=useState('');
 const scope=scopes.find(s=>s.id===scopeId);
 useEffect(()=>{let active=true;setScopes([]);setScopeId('');setError('');void supabase.rpc('get_payroll_phase_progress').then(({data,error})=>{if(!active)return;if(error)setError(error.message);else setScopes(data.scopes);});return()=>{active=false;};},[user?.id]);
 async function save(){setBusy(true);setError('');try{const {error}=await supabase.rpc('record_payroll_phase_progress',{p_scope_id:scopeId,p_phase:Number(phase),p_status:status,p_evidence:evidence});if(error)throw error;const {data,error:readError}=await supabase.rpc('get_payroll_phase_progress');if(readError)throw readError;setScopes(data.scopes);setEvidence('');}catch(e){setError(e instanceof Error?e.message:String((e as {message?:string})?.message||'Status could not be saved.'));}finally{setBusy(false);}}
 return <Card title="Your team's setup checklist">
  <p className="mb-3 text-sm">Software delivery and team readiness are tracked separately. A team confirmation does not grant access or clear payroll blockers. Update this checklist after each phase and reopen a task if its evidence changes.</p>
  {scopes.length>0&&<label className="mb-4 block text-sm">Team status for <select className={`${input} ml-2`} value={scopeId} disabled={busy} onChange={e=>setScopeId(e.target.value)}><option value="">Choose a business unit</option>{scopes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
  <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Phase','Software','Team status','Owner / task'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{phaseChecklist.map((p,i)=>{const saved=scope?.progress.find(s=>s.phase===i+1);return <tr key={p.phase} className="border-t dark:border-slate-700"><td className="p-2 align-top whitespace-nowrap">{p.link?<Link className="text-indigo-600 dark:text-indigo-300" to={p.link}>{p.phase}</Link>:p.phase}</td><td className="p-2 align-top">{i<4?'Implemented':'Not started'}</td><td className="p-2 align-top min-w-48"><strong>{saved?statuses[saved.status]:i<4?'Waiting on team':'Not started'}</strong>{saved&&<><p>{saved.evidence}</p><p className="text-xs">Updated {new Date(saved.recorded_at).toLocaleDateString('en-PH')}</p></>}{!saved&&i===0&&<p>Payroll assignee list pending.</p>}</td><td className="p-2 min-w-80"><p className="font-medium">{p.owner}</p>{p.todo}</td></tr>;})}</tbody></table></div>
  {scope?.canManage&&<form className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();void save();}}><p className="text-sm">Record the actual team's progress for {scope.name}. Use an approval or completion reference; keep salary and personal details out of this checklist.</p><div className="flex flex-wrap gap-3"><label>Phase <select className={input} value={phase} disabled={busy} onChange={e=>setPhase(e.target.value)}>{phaseChecklist.map((p,i)=><option key={p.phase} value={i+1}>{p.phase}</option>)}</select></label><label>Status <select className={input} value={status} disabled={busy} onChange={e=>setStatus(e.target.value)}>{Object.entries(statuses).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label></div><label className="block">Completion reference / remaining blocker<input className={`${input} mt-1 block w-full`} value={evidence} onChange={e=>setEvidence(e.target.value)} minLength={3} maxLength={1000} required disabled={busy}/></label><Button type="submit" disabled={busy||evidence.trim().length<3}>Save team status</Button></form>}
  {error&&<p role="alert" className="mt-3 text-red-700">{error}</p>}
 </Card>;
}
