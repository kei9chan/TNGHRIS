import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useApprovals } from '../../hooks/useApprovals';
import { useAdditionalApprovals } from '../../hooks/useAdditionalApprovals';
import { ApprovalRequestKind, getApprovalReviewUrl } from '../../services/approvalDeepLinks';

type Item = { id: string; kind: ApprovalRequestKind; employee: string; details: string; submitted?: Date | string; relevantDate?: Date | string };
const labels: Record<ApprovalRequestKind,string> = {leave:'Leave',wfh:'WFH',overtime:'Overtime',manpower:'On-call',nte:'NTE',pan:'PAN',requisition:'Job Requisition',award:'Award',offer:'Offer',asset:'Asset',benefit:'Benefit'};
const dateText = (v?: Date | string) => v && Number.isFinite(new Date(v).getTime()) ? new Date(v).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric'}) : '';
const dayKey = (v: Date | string) => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
function urgency(item: Item) {
  const age = item.submitted ? Math.max(0,Math.floor((Date.now()-new Date(item.submitted).getTime())/86400000)) : 0;
  const upcoming = item.relevantDate && Number.isFinite(new Date(item.relevantDate).getTime()) && dayKey(item.relevantDate)>=dayKey(new Date()) && new Date(item.relevantDate).getTime()-Date.now()<3*86400000;
  if(upcoming)return {group:'upcoming',label:'Request date '+dateText(item.relevantDate),color:'#f59e0b',text:'text-amber-700 dark:text-amber-300',priority:0};
  if(age>=3)return {group:'waiting',label:'Waiting '+age+' days',color:'#fb7185',text:'text-rose-700 dark:text-rose-300',priority:1};
  return {group:'all',label:'Awaiting review',color:'#a78bfa',text:'text-slate-500 dark:text-slate-300',priority:2};
}

export default function ApprovalWidget() {
  const {user}=useAuth();
  const a=useApprovals({user});
  const b=useAdditionalApprovals(user);
  const [filter,setFilter]=useState('all');
  const items: Item[] = [
    ...a.pendingLeaveApprovals.map(r=>({id:r.id,kind:'leave' as const,employee:r.employeeName,details:'Leave · '+dateText(r.startDate)+'–'+dateText(r.endDate)+' · '+r.durationDays+' days',submitted:r.createdAt,relevantDate:r.startDate})),
    ...a.pendingWfhApprovals.map(r=>({id:r.id,kind:'wfh' as const,employee:r.employeeName,details:'Work from home · '+dateText(r.date)+(r.endDate?'–'+dateText(r.endDate):''),submitted:r.createdAt,relevantDate:r.date})),
    ...a.pendingOtApprovals.map(r=>({id:r.id,kind:'overtime' as const,employee:r.employeeName,details:dateText(r.date)+' · '+r.startTime+'–'+r.endTime,submitted:r.submittedAt,relevantDate:r.date})),
    ...a.pendingManpowerApprovals.map(r=>({id:r.id,kind:'manpower' as const,employee:r.requesterName,details:'On-call coverage · '+(r.businessUnitName||''),submitted:r.createdAt})),
    ...b.pendingNTEApprovals.map(r=>({id:r.id,kind:'nte' as const,employee:r.employeeName,details:r.reference+' · '+r.currentStep,submitted:r.createdAt})),
    ...b.pendingPANApprovals.map(r=>({id:r.id,kind:'pan' as const,employee:r.employeeName,details:r.action+' · Effective '+dateText(r.effectiveDate),submitted:r.createdAt,relevantDate:r.effectiveDate})),
    ...b.pendingBenefitApprovals.map(r=>({id:r.id,kind:'benefit' as const,employee:r.employeeName,details:r.benefitTypeName+' · '+dateText(r.dateNeeded),submitted:r.submissionDate,relevantDate:r.dateNeeded})),
    ...b.pendingRequisitionApprovals.map(r=>({id:r.id,kind:'requisition' as const,employee:r.title,details:r.reference+' · '+r.currentStep,submitted:r.createdAt})),
    ...b.pendingAwardApprovals.map(r=>({id:r.id,kind:'award' as const,employee:r.employeeName,details:r.awardTitle,submitted:r.createdAt})),
    ...b.pendingOfferApprovals.map(r=>({id:r.id,kind:'offer' as const,employee:r.candidateName,details:r.jobTitle,submitted:r.createdAt})),
    ...b.pendingAssetApprovals.map(r=>({id:r.id,kind:'asset' as const,employee:r.employeeName,details:r.assetDescription,submitted:r.createdAt})),
  ];
  const unique=[...new Map(items.map(r=>[r.kind+':'+r.id,r])).values()].sort((a,b)=>urgency(a).priority-urgency(b).priority||(new Date(a.submitted||0).getTime()-new Date(b.submitted||0).getTime()));
  const visible=unique.filter(r=>filter==='all'||urgency(r).group===filter);
  const error=a.approvalError||b.additionalApprovalError;
  if(!user||(!items.length&&!error))return null;
  return <section aria-labelledby="approval-inbox-title" className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="approval-inbox-title" className="text-2xl font-bold text-slate-900 dark:text-white">Needs your approval <span className="ml-2 inline-flex rounded-full bg-violet-600 px-3 py-1 text-base text-white">{unique.length}</span></h2><p className="mt-2 text-slate-500 dark:text-slate-300">Requests waiting for your decision</p></div><Link to="/approvals" className="hidden min-h-11 items-center rounded-lg border border-violet-500 px-4 font-semibold text-violet-700 dark:text-violet-300 sm:inline-flex">Open Approval Center →</Link></div>
    {error&&<div role="alert" className="mt-4 text-amber-700 dark:text-amber-300">Some requests could not be loaded. <button className="min-h-11 underline" onClick={()=>Promise.all([a.refreshApprovals(),b.refreshAdditionalApprovals()])}>Retry</button></div>}
    <div className="my-5 flex flex-wrap gap-2">{[['all','All'],['upcoming','Upcoming dates'],['waiting','Waiting 3+ days']].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)} className={'min-h-11 rounded-full px-4 text-sm font-semibold '+(filter===value?'bg-violet-600 text-white':'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200')}>{label}</button>)}</div>
    <div className="space-y-3">{visible.slice(0,10).map(item=>{const u=urgency(item);return <article key={item.kind+':'+item.id} style={{borderLeftColor:u.color}} className="grid min-w-0 gap-3 rounded-xl border border-l-4 border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-900/40 lg:grid-cols-[6rem_1fr_1.5fr_1fr_7rem] lg:items-center">
      <span className="w-fit rounded-lg bg-violet-100 px-3 py-2 text-sm font-bold text-violet-900 dark:bg-violet-900 dark:text-violet-100">{labels[item.kind]}</span><h3 className="break-words font-bold text-slate-900 dark:text-white">{item.employee}</h3><p className="break-words text-sm text-slate-600 dark:text-slate-300">{item.details}</p><div className="text-sm">{dateText(item.submitted)&&<p className="text-slate-500 dark:text-slate-400">Submitted {dateText(item.submitted)}</p>}<p className={'font-semibold '+u.text}>{u.label}</p></div><Link aria-label={'Review '+labels[item.kind]+' for '+item.employee} to={getApprovalReviewUrl(item.kind,item.id)} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-violet-600 px-5 py-3 font-semibold text-white hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500">Review</Link>
    </article>;})}</div>
    {!visible.length&&<p className="py-5 text-slate-500 dark:text-slate-300">No requests match this filter.</p>}
    <Link to="/approvals" className="mt-5 inline-flex min-h-11 items-center font-semibold text-violet-700 dark:text-violet-300">{visible.length>10?'Showing 10 of '+visible.length+' · ':''}Open Approval Center →</Link>
  </section>;
}
