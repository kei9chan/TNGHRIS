import ScenarioRun from './ScenarioRun';
import ApprovalHandover from './ApprovalHandover';
import type {NextApproval} from './approvalWorkspace';
import React,{useCallback,useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth';
import {usePermissions} from '../../hooks/usePermissions';
import {Permission} from '../../types';
import {grossContext,GrossScope} from './grossPay';
import {fetchTimeContext,TimeScope} from './attendanceReadiness';
import {supabase} from '../../services/supabaseClient';
import {usePayrollField} from './usePayrollSelection';
import {Readiness,modeLabel,nextPayrollStep,validCutoff} from './workspace';
import PayrollCycleSelector from './PayrollCycleSelector';
const field='mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
type Scope=TimeScope & {mode?:string;gross?:GrossScope};
export default function PayrollHome(){
 const {user}=useAuth();const {can}=usePermissions();
 const [scopeId,setScopeId]=usePayrollField('scope');const [from,setFrom]=usePayrollField('from');const [to,setTo]=usePayrollField('to');
 const [scopes,setScopes]=useState<Scope[]>([]);const [contextLoading,setContextLoading]=useState(true);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [contextError,setContextError]=useState('');
 const [result,setResult]=useState<{key:string;value:Readiness}|null>(null);const [refresh,setRefresh]=useState(0);
 const scope=scopes.find(s=>s.id===scopeId);const key=`${user?.id}:${scopeId}:${from}:${to}`;const data=result?.key===key?result.value:null;
 useEffect(()=>{let active=true;setContextLoading(true);setContextError('');
 Promise.all([fetchTimeContext(),grossContext()]).then(([time,gross])=>{if(!active)return;const combined=time.scopes.map(t=>({...t,mode:gross.scopes.find(g=>g.id===t.id)?.mode,gross:gross.scopes.find(g=>g.id===t.id)}));setScopes(combined);
 if(!combined.some(s=>s.id===scopeId)){const initial=combined.find(s=>/bakebe.*sm\s*aura/i.test(s.name))||combined[0];setScopeId(initial?.id||'');}
 }).catch(e=>{if(active){setScopes([]);setContextError(e.message||'Payroll access could not be loaded.');}}).finally(()=>{if(active)setContextLoading(false);});return()=>{active=false;};
 },[user?.id,refresh]);
 useEffect(()=>{let active=true;setResult(null);setError('');setLoading(false);
 if(contextLoading||!scope?.canView||!validCutoff(from,to))return;
 setLoading(true);const controller=new AbortController();const timer=setTimeout(()=>{if(active){active=false;controller.abort();setLoading(false);setError('Readiness took too long. Click Refresh readiness to retry.');}},20000);
 Promise.resolve(supabase.rpc('get_payroll_home_readiness',{p_scope:scopeId,p_from:from,p_to:to}).abortSignal(controller.signal)).then(({data,error})=>{if(!active)return;if(error)throw error;if(!data||typeof data.employees!=='number')throw new Error('Incomplete readiness response. Please refresh.');setResult({key,value:data as Readiness});}).catch(e=>{if(active)setError(e.message||'Readiness could not be loaded.');}).finally(()=>{clearTimeout(timer);if(active)setLoading(false);});return()=>{active=false;controller.abort();clearTimeout(timer);};
 },[key,scope?.canView,contextLoading,refresh]);
 const [approvalNext,setApprovalNext]=useState<{key:string;next:NextApproval|null}|null>(null);
 const onApprovalNext=useCallback((next:NextApproval|null)=>setApprovalNext({key,next}),[key]);
 const initialNext=nextPayrollStep(data);
 const next=initialNext.path==='/payroll/gross-pay'&&modeLabel(data?.mode)!=='PROCESSING OFF'&&approvalNext?.key===key&&approvalNext.next?approvalNext.next:initialNext;
 const nextPath=next.path==='/payroll/timekeeping'&&validCutoff(from,to)?`${next.path}?week=${(()=>{const d=new Date(from+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);})()}`:next.path;const mode=data?.mode||scope?.mode;
 const cards=data?[
 {title:'Published schedules',value:`${data.publishedDays} / ${data.totalDays}`,detail:'Employee-days with a published entry',owner:'BU manager / HR'},
 {title:'Saved / uploaded pay',value:data.payVisible?`${data.savedPayEmployees} / ${data.employees}`:'Restricted',detail:'Employees with a dated saved package; not necessarily approved',owner:'HR / Finance'},
 {title:'Reviewed pay',value:data.payVisible?`${data.reviewedPayEmployees} / ${data.employees}`:'Restricted',detail:'Employees with approved base-pay coverage from their first day in this cutoff; calculation validates all components',owner:'Authorized compensation reviewer'},
 {title:'Timekeeping submission',value:data.submittedVersions?'Submitted':data.savedVersions?'Saved, not current submitted':'Not submitted',detail:`${data.blockedDays} blocked employee-days · ${data.savedVersions} saved versions`,owner:'HR finalizer'},
 ]:[];
 return <main className="space-y-6 p-4 sm:p-6 text-slate-900 dark:text-slate-100">
 <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-300">Payroll workspace</p><h1 className="mt-2 text-3xl font-bold">One business unit. One cutoff.</h1><p className="mt-2 text-slate-600 dark:text-slate-300">See what is ready, what needs attention, and who takes the next step.</p></div><span className="rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900">{modeLabel(mode)}</span></header>
 <PayrollCycleSelector/>
 <section className="rounded-2xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><label className="font-medium">Business unit<select className={field} disabled={contextLoading} value={scopeId} onChange={e=>setScopeId(e.target.value)}><option value="">Choose an accessible business unit</option>{scopes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><p className="mt-3 text-sm text-slate-500">The selected payroll cycle is retained when you move through readiness, corrections, calculations, and approvals. The business unit filters access; it does not change the current global cutoff rule.</p><button className="mt-4 min-h-11 rounded-lg border px-4 font-medium" disabled={loading||contextLoading} onClick={()=>setRefresh(v=>v+1)}>Refresh readiness</button></section>
 {scope?.gross?.canView&&<><button className="rounded-lg border px-4 py-3" onClick={()=>{setFrom('2026-08-11');setTo('2026-08-25');}}>Open August 11–25 test cutoff</button><ScenarioRun key={`${user?.id}:${scopeId}:${from}:${to}`} scope={scopeId} from={from} to={to}/></>}
 {contextError&&<p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{contextError}</p>}
 {contextLoading?<p role="status">Checking your payroll access…</p>:!scope?<p>No accessible business unit. Ask the payroll access manager to check your assigned duties.</p>:!scope.canView?<p>Your account can manage this scope but cannot view its timekeeping readiness. Existing payroll duties and Timekeeping permission are required.</p>:!validCutoff(from,to)?<p>Select a valid cutoff of 1–31 days to load its readiness.</p>:loading?<p role="status">Checking saved payroll records…</p>:error?<p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error} Readiness is unknown until this check succeeds.</p>:data&&<>
 <section className="rounded-2xl bg-violet-700 p-6 text-white"><p className="text-sm font-medium text-violet-200">NEXT STEP · {next.owner}</p><h2 className="mt-2 text-2xl font-bold">{next.label}</h2><p className="mt-2">{scope.name} · {from} to {to} · {data.employees} employees in this cutoff</p><Link to={nextPath} className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-white px-5 font-semibold text-violet-800">Open next step →</Link></section>
 <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(c=><section key={c.title} className="rounded-xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><h2 className="font-semibold">{c.title}</h2><p className="my-3 text-2xl font-bold">{c.value}</p><p className="text-sm text-slate-500 dark:text-slate-300">{c.detail}</p><p className="mt-4 text-sm">Owner: {c.owner}</p></section>)}</div>
 <section className="rounded-xl border p-5 dark:border-slate-700"><h2 className="text-lg font-semibold">What needs attention</h2>{!data.employees?<p className="mt-3">No employees were returned for this scope and period. Verify the cutoff and payroll scope before continuing.</p>:<ul className="mt-3 space-y-2">
 {data.publishedDays<data.totalDays&&<li>{data.totalDays-data.publishedDays} employee-days have no published schedule entry. Owner: BU manager / HR.</li>}
 {!data.payVisible?<li>Pay-package readiness is restricted for your account. Owner: authorized HR / Finance.</li>:data.reviewedPayEmployees!<data.employees&&<li>{data.employees-(data.reviewedPayEmployees||0)} employees need dated approved base-pay coverage. Owner: HR / Finance.</li>}
 {data.issues.map(i=><li key={i.issue}>{i.issue} — {i.days} employee-days. Owner: HR / BU manager.</li>)}
 {!data.blockedDays&&<li>No attendance blockers reported by the existing readiness engine.</li>}
 {mode==='off'&&<li>Processing is off. Setup and review remain available; the payroll access manager controls test-processing activation.</li>}
 </ul>}<p className="mt-4 text-sm text-slate-500">Checked {new Date(data.checkedAt).toLocaleString()}. Refresh after changes. Submitted means a saved version still matches its source records.</p></section>
 </>}
 {scope?.gross?.canView&&<ApprovalHandover scope={scopeId} from={from} to={to} revision={refresh} onNext={onApprovalNext}/>}
 <section className="rounded-xl border p-5 dark:border-slate-700"><h2 className="font-semibold">Historical attendance for the pilot</h2><p className="mt-2">Import actual punch logs or reviewed DTR summaries into a separate test dataset for this cutoff. Test imports do not change the live readiness counts above, attendance, leave or payments.</p>{scope?.canView&&validCutoff(from,to)&&<Link className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-violet-600 px-4 font-semibold text-white" to="/payroll/historical-attendance">Import Historical Attendance →</Link>}</section>
 <div className="flex flex-wrap gap-5 text-sm underline"><Link to="/payroll/pilot">Compare & Pilot</Link><Link to="/payroll/access">Payroll access & duties</Link></div>
 </main>;
}
