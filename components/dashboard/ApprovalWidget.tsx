import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useApprovals } from '../../hooks/useApprovals';
import { useAdditionalApprovals } from '../../hooks/useAdditionalApprovals';
import { Role } from '../../types';

const ageDays = (value: Date | string | undefined) => value ? Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000)) : 0;

export default function ApprovalWidget() {
  const { user } = useAuth();
  const roles = new Set([user?.role, ...(user?.roles || [])].filter(Boolean));
  const approvals=useApprovals({user,isHR:roles.has(Role.HRStaff)});
  const additional=useAdditionalApprovals(user);
  const leaveExceptions=approvals.pendingLeaveApprovals.filter(r=>{const start=new Date(r.startDate),end=new Date(r.endDate),duration=Number(r.durationDays);return r.approvalRoute==='BOD_REQUIRED'||end<start||duration<=0||duration>30;}).length;
  const wfhExceptions=approvals.pendingWfhApprovals.filter(r=>{const start=new Date(r.date),end=new Date(r.endDate||r.date),days=Math.floor((end.getTime()-start.getTime())/86400000)+1;const overlap=approvals.pendingLeaveApprovals.some(l=>l.employeeId===r.employeeId&&new Date(l.startDate)<=end&&new Date(l.endDate)>=start);return r.approvalRoute==='BOD_REQUIRED'||end<start||days>31||overlap||String(r.status)==='WFH_FOR_TIMEKEEPING';}).length;
  const overtimeExceptions=approvals.pendingOtApprovals.filter(r=>r.approvalRoute==='BOD_REQUIRED'||!String(r.reason||'').trim()).length;
  const queues=useMemo(()=>[
    {name:'NTE',slug:'nte',count:additional.pendingNTEApprovals.length,exceptions:0,ages:additional.pendingNTEApprovals.map(r=>ageDays(r.createdAt)),tone:'bg-red-100 text-red-800'},
    {name:'PAN',slug:'pan',count:additional.pendingPANApprovals.length,exceptions:0,ages:additional.pendingPANApprovals.map(r=>ageDays(r.createdAt)),tone:'bg-purple-100 text-purple-800'},
    {name:'Awards',slug:'award',count:additional.pendingAwardApprovals.length,exceptions:0,ages:additional.pendingAwardApprovals.map(r=>ageDays(r.createdAt)),tone:'bg-amber-100 text-amber-800'},
    {name:'Leave',slug:'leave',count:approvals.pendingLeaveApprovals.length,exceptions:leaveExceptions,ages:approvals.pendingLeaveApprovals.map(r=>ageDays(r.startDate)),tone:'bg-yellow-100 text-yellow-800'},
    {name:'WFH',slug:'wfh',count:approvals.pendingWfhApprovals.length,exceptions:wfhExceptions,ages:approvals.pendingWfhApprovals.map(r=>ageDays(r.createdAt)),tone:'bg-blue-100 text-blue-800'},
    {name:'Overtime',slug:'overtime',count:approvals.pendingOtApprovals.length,exceptions:overtimeExceptions,ages:approvals.pendingOtApprovals.map(r=>ageDays(r.submittedAt||r.date)),tone:'bg-orange-100 text-orange-800'},
    {name:'Job Requisitions',slug:'requisition',count:additional.pendingRequisitionApprovals.length,exceptions:0,ages:additional.pendingRequisitionApprovals.map(r=>ageDays(r.createdAt)),tone:'bg-indigo-100 text-indigo-800'},
    {name:'Manpower',slug:'manpower',count:approvals.pendingManpowerApprovals.length,exceptions:0,ages:approvals.pendingManpowerApprovals.map(r=>ageDays(r.createdAt)),tone:'bg-teal-100 text-teal-800'},
  ],[approvals.pendingLeaveApprovals,approvals.pendingWfhApprovals,approvals.pendingOtApprovals,approvals.pendingManpowerApprovals,additional.pendingNTEApprovals,additional.pendingPANApprovals,additional.pendingAwardApprovals,additional.pendingRequisitionApprovals,leaveExceptions,wfhExceptions,overtimeExceptions]);
  const activeQueues=queues.filter(q=>q.count>0);
  const ages=activeQueues.flatMap(q=>q.ages), total=activeQueues.reduce((s,q)=>s+q.count,0), due=ages.filter(a=>a===0).length, overdue=ages.filter(a=>a>=3).length;
  const exceptionCount=activeQueues.reduce((sum,q)=>sum+q.exceptions,0);
  const buckets=[ages.filter(a=>a===0).length,ages.filter(a=>a>=1&&a<=6).length,ages.filter(a=>a>=7&&a<=29).length,ages.filter(a=>a>=30).length];
  const recommended=activeQueues.slice().sort((a,b)=>b.count-a.count)[0];
  const approvalError=approvals.approvalError||additional.additionalApprovalError;
  if(!user||(!total&&!approvalError))return null;
  if(approvalError)return <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800"><h2 className="font-bold">Approval workload could not be loaded</h2><p className="mt-1 text-sm">{approvalError}</p><button className="mt-3 font-semibold underline" onClick={()=>Promise.all([approvals.refreshApprovals(),additional.refreshAdditionalApprovals()])}>Retry</button></section>;
  return <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Pending approvals',total,'text-indigo-700'],['Due today',due,'text-orange-600'],['Overdue',overdue,'text-red-600'],['Exceptions',exceptionCount,'text-amber-600']].map(([label,value,color])=><div key={String(label)} className="rounded-xl border bg-white p-5 shadow-sm dark:bg-slate-800"><div className={`text-3xl font-bold ${color}`}>{value}</div><div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{label}</div></div>)}</div>
    {recommended&&<div className="flex flex-wrap items-center gap-4 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-white p-5"><div className="grid h-12 w-12 place-items-center rounded-full bg-indigo-600 text-2xl text-white">✦</div><div className="flex-1"><h2 className="font-bold text-slate-900">Start with {recommended.count} {recommended.name} request{recommended.count===1?'':'s'}</h2><p className="text-sm text-slate-600">Largest current queue · Open the centralized record list</p></div><Link to={`/approvals?type=${recommended.slug}`} className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white">Start now →</Link></div>}
    <div className="rounded-xl border bg-white p-5 shadow-sm dark:bg-slate-800"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Approval workload</h2><p className="text-sm text-slate-500 dark:text-slate-300">Only queues with pending tasks are shown</p></div><Link to="/approvals" className="font-semibold text-indigo-600 dark:text-indigo-300">Open Approval Center →</Link></div><div className="mt-6 grid grid-cols-4 items-end gap-2 border-b pb-2 sm:gap-4">{buckets.map((n,i)=>{const max=Math.max(...buckets,1);return <div key={i} className="text-center"><span className="text-sm font-bold">{n}</span><div style={{height:`${Math.max(8,n/max*100)}px`}} className={`mx-auto mt-2 w-8 rounded-t sm:w-10 ${['bg-red-400','bg-orange-400','bg-yellow-400','bg-blue-400'][i]}`}/><div className="mt-2 text-[11px] text-slate-500 sm:text-xs dark:text-slate-300">{['Today','1–6 days','7–29 days','30+ days'][i]}</div></div>})}</div><div className="mt-6"><h3 className="font-bold">Approval queues</h3></div><div className="mt-2 divide-y">{activeQueues.map(q=><div key={q.name} className="grid gap-3 py-4 sm:flex sm:flex-wrap sm:items-center"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-lg px-3 py-2 font-bold ${q.tone}`}>{q.name}</span><b>{q.count} pending</b><span className="text-sm text-amber-700 dark:text-amber-300">{q.exceptions} exceptions</span></div><span className="text-sm text-slate-500 sm:ml-auto dark:text-slate-300">Oldest {Math.max(...q.ages,0)} days</span><div className="flex flex-wrap gap-2">{q.exceptions>0&&<Link to={`/approvals?type=${q.slug}&review=exceptions`} className="inline-flex min-h-11 items-center font-semibold text-indigo-600 dark:text-indigo-300">Review exceptions</Link>}<Link to={`/approvals?type=${q.slug}`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-center font-semibold text-white sm:flex-none">Review queue</Link></div></div>)}</div></div>
  </section>;
}
