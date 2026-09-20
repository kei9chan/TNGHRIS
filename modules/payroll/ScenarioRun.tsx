import React, {useEffect, useState} from 'react';
import {supabase} from '../../services/supabaseClient';
type Employee={id:string;name:string;code:string;hireDate:string|null;endDate:string|null};
type Day={employeeId:string;date:string;lateMinutes:number;undertimeMinutes:number;actualMinutes:number;breakMinutes:number;approvedOtMinutes:number;issues:string[]};
type Package={employee_id:string;effective_from:string;base_amount:number;rate_type:string;status:string;source_ref:string;treatment:Record<string,unknown>;components:unknown[];isMock?:boolean;mockCreatedAt?:string};
type Run={label:string;status:string;created_at:string;snapshot:{employees:Employee[];packages:Package[];mockPackageAudit?:{employeeId:string;employeeName:string;createdAt:string;amount:number}[];blockers:{employeeId:string;reason:string}[];globalBlockers:string[];scenarios:{employeeId:string;date:string;scenario:string}[];timeResult:{rows:Day[]};source:{events:{employeeId:string;timestamp:string;type:string}[]}}};
export default function ScenarioRun({scope,from,to}:{scope:string;from:string;to:string}){
 const [run,setRun]=useState<Run|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setRun(null);setError('');setLoading(true);
 Promise.resolve(supabase.rpc('get_payroll_scenario_run',{p_scope:scope,p_from:from,p_to:to})).then(({data,error})=>{if(!active)return;if(error)setError(error.message);else setRun(data as Run|null);setLoading(false);}).catch(e=>{if(active){setError(e.message||'Unable to load test run');setLoading(false);}});return()=>{active=false;};},[scope,from,to,revision]);
 if(loading)return <p role="status">Checking isolated test run…</p>;
 if(error)return <p role="alert">Test run could not be loaded: {error}</p>;
 if(!run)return null;
 const s=run.snapshot;
 return <section className="space-y-4 rounded-xl border-2 border-violet-500 bg-white p-5 dark:bg-slate-900">
 <div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-bold">{run.label}</h2><strong>{run.status}</strong></div>
 <p>August 11–25, 2026 · Pay date September 5, 2026 · Asia/Manila</p>
 <p className="font-semibold">TEST ONLY — schedules published inside this snapshot. No live attendance, balances, notifications or payments are changed.</p>
 <p>{s.employees.length} employee records · {s.packages.length} test package snapshots · {s.scenarios.length} daily scenarios. Monetary payroll is blocked; the figures below are attendance diagnostics from the existing engine.</p>
 {!!s.mockPackageAudit?.length&&<div className="rounded-lg bg-amber-50 p-4 text-amber-950"><h3 className="font-bold">Mock packages added — not verified salaries</h3><ul>{s.mockPackageAudit.map(x=><li key={x.employeeId}>{x.employeeName}: ₱{x.amount.toLocaleString()}/month. Added {new Date(x.createdAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} PHT.</li>)}</ul><p>PAN-linked package corrected to net of tax only. No tax exemption. Original uploaded file and prior snapshots retained.</p></div>}
 <ul className="list-disc space-y-1 pl-5">{s.globalBlockers.map(x=><li key={x}>{x}</li>)}</ul>
 <div className="flex gap-3"><button disabled className="rounded bg-slate-200 px-4 py-2 text-slate-600">Calculate Payroll — blocked</button><button className="rounded border px-4 py-2" onClick={()=>setRevision(v=>v+1)}>Reload saved test run</button></div>
 {s.employees.map(e=>{const p=s.packages.find(p=>p.employee_id===e.id);const rows=s.timeResult.rows.filter(r=>r.employeeId===e.id);return <details key={e.id} className="rounded-lg border p-4">
 <summary className="cursor-pointer font-semibold">{e.name} · {e.code||'Employee code missing'} · {p?.isMock?'Mock package saved':'Source package saved'} · Payroll rules pending</summary>
 <p className="mt-3">Employment: {e.hireDate||'Start date unverified'} to {e.endDate||'present'}</p>
 <p>{p?`${p.base_amount.toLocaleString()} PHP / ${p.rate_type} · effective ${p.effective_from} · ${p.status} · ${p.source_ref}`:'No historical pay package'}</p>
 <ul className="my-3 list-disc pl-5">{s.blockers.filter(b=>b.employeeId===e.id&&!b.reason.startsWith('PAN-')&&!(p?.isMock&&b.reason.startsWith('No pay package'))).map(b=><li key={b.reason}>{b.reason}</li>)}</ul>
 {p&&<details><summary>Pay-package snapshot and allowance treatments</summary><pre className="overflow-auto whitespace-pre-wrap text-sm">{JSON.stringify({treatment:p.treatment,components:p.components},null,2)}</pre></details>}
 <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Date / scenario','Actual minutes','Late minutes','Undertime minutes','Break minutes','Approved OT minutes','Review findings'].map(h=><th key={h} className="border-b p-2">{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.date}><td className="border-b p-2">{r.date}<br/>{s.scenarios.find(x=>x.employeeId===e.id&&x.date===r.date)?.scenario}</td>{[r.actualMinutes,r.lateMinutes,r.undertimeMinutes,r.breakMinutes,r.approvedOtMinutes].map((v,i)=><td key={i} className="border-b p-2">{v??'—'}</td>)}<td className="border-b p-2">{r.issues.join('; ')}</td></tr>)}</tbody></table></div>
 <details className="mt-3"><summary>Original synthetic punch evidence</summary><ul>{s.source.events.filter(x=>x.employeeId===e.id).map((x,i)=><li key={i}>{new Date(x.timestamp).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} PHT · {x.type}</li>)}</ul></details>
 </details>})}
 </section>;
}
