import React from 'react';
import {Link} from 'react-router-dom';
import {approvalStages} from './approvals';
import {nextApproval} from './approvalWorkspace';
import type {WorkspaceApproval} from './approvalWorkspace';
export default function ApprovalProgress({run}:{run:WorkspaceApproval}){
 const next=nextApproval(run);
 return <section className="space-y-3 rounded-xl border p-4 dark:border-slate-700">
 <div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{run.from}–{run.to} · {run.kind} · v{run.version}</h3><strong>{run.mode==='shadow'?'TEST APPROVAL — NO RELEASE':'LIVE APPROVAL'}</strong></div>
 <p>Current owner (role): <strong>{next.owner}</strong></p><p>Next required action: <strong>{next.label}</strong></p>
 {(!run.current||run.returned)&&<p role="alert" className="text-amber-700 dark:text-amber-300">{run.returned?'Returned for revision.':'Source records changed; previous decisions cannot authorize this version.'} {run.staleReason}</p>}
 <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{approvalStages.map((stage,i)=>{const a=run.actions.find(a=>a.step===i);return <li key={stage} className="rounded border p-3 text-sm dark:border-slate-700"><strong>{i+1}. {stage}</strong><p>{a?`${a.action==='return'?'Returned':'Approved'} by ${a.actor}`:run.current&&!run.returned&&i===run.step?'Pending':'Waiting'}</p>{a&&<p>{a.reason} · {new Date(a.at).toLocaleString('en-PH')}</p>}</li>;})}</ol>
 {run.mode==='shadow'&&<p className="text-sm">Completing these decisions does not enable live payroll, release payment or publish employee payslips.</p>}
 <Link className="inline-block py-2 font-medium text-indigo-600 dark:text-indigo-300" to={next.path}>Open {run.step>=6&&run.mode==='shadow'?'Compare & Pilot':'review'} →</Link>
 </section>;
}
