import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth';
import {modeLabel,validCutoff} from './workspace';
import {workspaceApprovals,nextApproval} from './approvalWorkspace';
import type {ApprovalPage,NextApproval} from './approvalWorkspace';
import {pilotWorkspace} from './pilot';
import type {PilotWorkspace} from './pilot';
import ApprovalProgress from './ApprovalProgress';
export default function ApprovalHandover({scope,from,to,revision=0,onNext,pilotData}:{scope:string;from:string;to:string;revision?:number;pilotData?:PilotWorkspace;onNext?:(next:NextApproval|null)=>void}){
 const {user}=useAuth();const [result,setResult]=useState<{key:string;approvals:ApprovalPage;pilot:PilotWorkspace}|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const key=`${user?.id}:${scope}:${from}:${to}`,data=result?.key===key?result:null;
 useEffect(()=>{let active=true;setResult(null);setError('');onNext?.(null);
 if(!scope||!validCutoff(from,to))return;
 Promise.all([workspaceApprovals(scope,from,to),pilotData&&refresh===0?Promise.resolve(pilotData):pilotWorkspace(scope)]).then(([approvals,pilot])=>{if(active){setResult({key,approvals,pilot});onNext?.(approvals.items[0]?nextApproval(approvals.items[0]):null);}}).catch(e=>{if(active)setError(e.message||'Approval status unavailable.');});return()=>{active=false;};
 },[key,revision,refresh,onNext,pilotData]);
 if(!scope||!validCutoff(from,to))return null;
 const p=data?.pilot,bu=p?.scopes.find(s=>s.id===scope),proposal=p?.proposals.find(v=>v.id===p.activation?.proposal_id)||p?.proposals[0];
 const acceptances=p?.comparisons.filter(c=>c.ready&&c.acceptances.length===2)||[];
 const owner=p?.activation?(bu?.mode!=='live'?'Scoped payroll access manager':p.activation.continued?'HR / Finance — ongoing monitoring':'HR / Finance — first live cutoff review'):proposal?(proposal.blockedReason?'Finance — resolve handover evidence':proposal.decisions.length<2?'Board of Directors — two distinct decisions':'Scoped payroll access manager — explicit live authorization'):acceptances.length<2?'HR / Finance — two consecutive test cutoffs':'Finance — handover proposal';
 return <section className="space-y-4 rounded-2xl border bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-bold">Approvals & controlled handover</h2><button className="rounded border px-3 py-2" onClick={()=>setRefresh(v=>v+1)}>Refresh approval status</button></div>
 {error?<p role="alert">{error} Approval readiness is unknown until refreshed.</p>:!data?<p role="status">Checking approvals and handover gates…</p>:<>
 <p className="font-semibold">{bu?.name} · {modeLabel(bu?.mode)}</p>
 {data.approvals.items[0]?<ApprovalProgress run={data.approvals.items[0]}/>:<p>No payroll version has been submitted for this BU and cutoff. Finance starts from a saved <Link className="underline" to="/payroll/net-pay">Take-home Pay Review</Link>. Uploads and internal comparisons are not approvals.</p>}
 <Link className="inline-block underline" to="/payroll/approvals">View submitted versions for this cutoff →</Link>
 <div className="space-y-2 border-t pt-4 dark:border-slate-700"><h3 className="font-semibold">Live handover — separate from test approval</h3><p>Current owner (role): <strong>{owner}</strong></p>
 <p>{acceptances.length} current comparisons with both HR and Finance acceptance. The proposal gate checks consecutive cutoffs, the contribution month and all handover evidence.</p>
 {proposal?<><p>Proposed first live window: {proposal.date_from}–{proposal.date_to}. BOD decisions: {proposal.decisions.length}/2.</p>{proposal.decisions.map((d,i)=><p key={i}>BOD decision completed by {d.actor} · {d.reference}</p>)}{proposal.blockedReason&&!p?.activation&&<p role="alert">Blocked: {proposal.blockedReason}</p>}</>:<p>No live handover proposal recorded.</p>}
 <p>{p?.activation?`Activation certificate retained. ${p.activation.continued?'Continuation recorded.':'First live cutoff acceptance is required before continuation.'}`:'Live payroll has not been authorized. Completing test approvals does not change processing mode.'}</p>
 <Link className="inline-block py-2 font-medium text-indigo-600 dark:text-indigo-300" to="/payroll/pilot#handover">Review handover evidence and activation gates →</Link></div>
 <p className="text-sm text-slate-500">Checked {new Date(data.approvals.checkedAt).toLocaleString()}. Eligibility is checked again when each decision is recorded.</p>
 </>}
 </section>;
}
