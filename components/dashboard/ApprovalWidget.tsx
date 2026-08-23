import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { useApprovals } from '../../hooks/useApprovals';
import { Role } from '../../types';

const ageDays = (value: Date | string | undefined) => value ? Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000)) : 0;

export default function ApprovalWidget() {
  const { user } = useAuth();
  const roles = new Set([user?.role, ...(user?.roles || [])].filter(Boolean));
  const [reporteeIds,setReporteeIds]=useState<string[]>([]);
  const approvals=useApprovals({user,isHR:roles.has(Role.HRStaff),reporteeIds});
  useEffect(()=>{if(!user)return;supabase.from('hris_users').select('id').eq('reports_to',user.id).then(({data,error})=>{if(error)console.error('Approval scope load failed:',error.message);else setReporteeIds((data||[]).map((r:any)=>r.id));});},[user]);
  const queues=useMemo(()=>[
    {name:'Leave',count:approvals.pendingLeaveApprovals.length,ages:approvals.pendingLeaveApprovals.map(r=>ageDays(r.startDate)),tone:'bg-yellow-100 text-yellow-800'},
    {name:'WFH',count:approvals.pendingWfhApprovals.length,ages:approvals.pendingWfhApprovals.map(r=>ageDays(r.createdAt)),tone:'bg-blue-100 text-blue-800'},
    {name:'Overtime',count:approvals.pendingOtApprovals.length,ages:approvals.pendingOtApprovals.map(r=>ageDays(r.submittedAt||r.date)),tone:'bg-orange-100 text-orange-800'},
    {name:'Manpower',count:approvals.pendingManpowerApprovals.length,ages:approvals.pendingManpowerApprovals.map(r=>ageDays(r.createdAt)),tone:'bg-teal-100 text-teal-800'},
  ],[approvals.pendingLeaveApprovals,approvals.pendingWfhApprovals,approvals.pendingOtApprovals,approvals.pendingManpowerApprovals]);
  const ages=queues.flatMap(q=>q.ages), total=queues.reduce((s,q)=>s+q.count,0), due=ages.filter(a=>a===0).length, overdue=ages.filter(a=>a>=3).length;
  const buckets=[ages.filter(a=>a===0).length,ages.filter(a=>a>=1&&a<=6).length,ages.filter(a=>a>=7&&a<=29).length,ages.filter(a=>a>=30).length];
  const recommended=queues.filter(q=>q.count).sort((a,b)=>b.count-a.count)[0];
  if(!user||(!total&&!approvals.approvalError))return null;
  if(approvals.approvalError)return <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800"><h2 className="font-bold">Approval workload could not be loaded</h2><p className="mt-1 text-sm">{approvals.approvalError}</p><button className="mt-3 font-semibold underline" onClick={()=>approvals.refreshApprovals()}>Retry</button></section>;
  return <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Pending approvals',total,'text-indigo-700'],['Due today',due,'text-orange-600'],['Overdue',overdue,'text-red-600'],['Queues',queues.filter(q=>q.count).length,'text-amber-600']].map(([label,value,color])=><div key={String(label)} className="rounded-xl border bg-white p-5 shadow-sm dark:bg-slate-800"><div className={`text-3xl font-bold ${color}`}>{value}</div><div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{label}</div></div>)}</div>
    {recommended&&<div className="flex flex-wrap items-center gap-4 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-white p-5"><div className="grid h-12 w-12 place-items-center rounded-full bg-indigo-600 text-2xl text-white">✦</div><div className="flex-1"><h2 className="font-bold text-slate-900">Start with {recommended.count} {recommended.name} requests</h2><p className="text-sm text-slate-600">Largest current queue · Reduce the backlog while exceptions stay protected</p></div><Link to={`/approvals?type=${recommended.name.toLowerCase()}`} className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white">Start now →</Link></div>}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-xl border bg-white p-5 shadow-sm dark:bg-slate-800"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Approval workload</h2><p className="text-sm text-slate-500">Real-time overview of your current approval scope</p></div><Link to="/approvals" className="font-semibold text-indigo-600">Open Approval Center →</Link></div><div className="mt-6 grid grid-cols-4 items-end gap-4 border-b pb-2">{buckets.map((n,i)=>{const max=Math.max(...buckets,1);return <div key={i} className="text-center"><span className="text-sm font-bold">{n}</span><div style={{height:`${Math.max(8,n/max*100)}px`}} className={`mx-auto mt-2 w-10 rounded-t ${['bg-red-400','bg-orange-400','bg-yellow-400','bg-blue-400'][i]}`}/><div className="mt-2 text-xs text-slate-500">{['Today','1–6 days','7–29 days','30+ days'][i]}</div></div>})}</div><h3 className="mt-6 font-bold">Approval queues</h3><div className="mt-2 divide-y">{queues.map(q=><div key={q.name} className="flex items-center gap-3 py-3"><span className={`rounded-lg px-3 py-2 font-bold ${q.tone}`}>{q.name}</span><b>{q.count} pending</b><span className="ml-auto text-sm text-slate-500">Oldest {Math.max(...q.ages,0)} days</span><Link to={`/approvals?type=${q.name.toLowerCase()}`} className="font-semibold text-indigo-600">Open queue</Link></div>)}</div></div>
      <div className="space-y-4"><div className="rounded-xl border bg-white p-5 shadow-sm dark:bg-slate-800"><h2 className="text-lg font-bold">Auto-routing & delegation</h2><div className="mt-4 space-y-4 text-sm"><div><b>Reviewer coverage</b><p className="text-slate-500">Requests follow existing reporting lines, configured approvers, and RBAC scope.</p></div><div><b>Backup approver</b><p className="text-slate-500">Managed in System Settings.</p></div><label className="flex items-center justify-between"><span><b>Auto-remind approvers</b><p className="text-slate-500">Uses existing notification settings.</p></span><input type="checkbox" aria-label="Auto-remind approvers" disabled title="Configure in System Settings"/></label></div></div><div className="rounded-xl border bg-white p-5 shadow-sm dark:bg-slate-800"><h2 className="text-lg font-bold">Bulk actions log</h2><p className="mt-2 text-sm text-slate-500">Successful group actions record the actor, workflow, counts, and per-request audit entries.</p><Link to="/approvals" className="mt-4 inline-block font-semibold text-indigo-600">View Approval Center →</Link></div></div>
    </div>
  </section>;
}
