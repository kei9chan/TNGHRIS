import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { useApprovals } from '../hooks/useApprovals';
import { Role } from '../types';
import Button from '../components/ui/Button';

type Kind = 'leave' | 'wfh' | 'overtime' | 'manpower' | 'requisition';
type EmployeeMeta = { employeeId?: string; businessUnitId?: string; businessUnit: string; departmentId?: string; department: string; active: boolean };
type ApprovalItem = {
  id: string; kind: Kind; employeeId?: string; employee: string; employeeCode?: string;
  businessUnitId?: string; businessUnit: string; departmentId?: string; department: string;
  start: Date; end: Date; duration: string; status: string; exception?: string; reviewUrl: string;
};

const KIND_META: Record<Kind, { title: string; badge: string; rule: string }> = {
  wfh: { title: 'Standard WFH', badge: 'bg-blue-100 text-blue-800', rule: 'Work-from-home requests that match the existing approval path and have no detected conflicts.' },
  leave: { title: 'Leave', badge: 'bg-yellow-100 text-yellow-800', rule: 'Time-off requests requiring approval under the current leave workflow.' },
  overtime: { title: 'Overtime', badge: 'bg-orange-100 text-orange-800', rule: 'Submitted overtime requests that contain the required request details.' },
  requisition: { title: 'Job Requisitions', badge: 'bg-indigo-100 text-indigo-800', rule: 'Recruitment requisitions retain their configured routing steps and are reviewed individually.' },
  manpower: { title: 'Manpower', badge: 'bg-teal-100 text-teal-800', rule: 'Existing manpower requests within the approver’s permitted scope.' },
};

const fmtDate = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const dayAge = (d: Date) => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));

export default function ApprovalCenter() {
  const { user } = useAuth();
  const roles = new Set([user?.role, ...(user?.roles || [])].filter(Boolean));
  const isHR = roles.has(Role.HRStaff);
  const [reporteeIds, setReporteeIds] = useState<string[]>([]);
  const [employeeMeta, setEmployeeMeta] = useState<Record<string, EmployeeMeta>>({});
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Kind | null>('wfh');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<{ kind: Kind; ids: string[] } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ search: '', businessUnit: '', department: '', kind: '', exception: '', age: '', quick: 'all' });

  const approvals = useApprovals({ user, isHR, reporteeIds });

  useEffect(() => {
    if (!user) return;
    supabase.from('hris_users').select('id').eq('reports_to', user.id).then(({ data, error }) => {
      if (error) setLoadError(`Approver scope could not be loaded: ${error.message}`);
      else setReporteeIds((data || []).map((r: any) => r.id));
    });
  }, [user]);

  useEffect(() => {
    const ids = Array.from(new Set([
      ...approvals.pendingLeaveApprovals.map(r => r.employeeId),
      ...approvals.pendingWfhApprovals.map(r => r.employeeId),
      ...approvals.pendingOtApprovals.map(r => r.employeeId),
      ...approvals.pendingManpowerApprovals.map(r => r.requestedBy),
    ].filter(Boolean))) as string[];
    if (!ids.length) return setEmployeeMeta({});
    supabase.from('hris_users')
      .select('id,employee_id,business_unit_id,business_unit,department_id,department,status')
      .in('id', ids)
      .then(({ data, error }) => {
        if (error) return setLoadError(`Employee scope data could not be loaded: ${error.message}`);
        setEmployeeMeta(Object.fromEntries((data || []).map((r: any) => [r.id, {
          employeeId: r.employee_id, businessUnitId: r.business_unit_id, businessUnit: r.business_unit || 'Not assigned',
          departmentId: r.department_id, department: r.department || 'Not assigned', active: String(r.status || 'active').toLowerCase() === 'active',
        }])));
      });
  }, [approvals.pendingLeaveApprovals, approvals.pendingWfhApprovals, approvals.pendingOtApprovals, approvals.pendingManpowerApprovals]);

  useEffect(() => {
    supabase.from('job_requisitions')
      .select('id,req_code,title,business_unit_id,department_id,status,created_at,routing_steps,created_by_user_id')
      .eq('status', 'PendingApproval')
      .then(({ data, error }) => error ? setLoadError(`Job requisitions could not be loaded: ${error.message}`) : setRequisitions(data || []));
  }, []);

  const items = useMemo<ApprovalItem[]>(() => {
    const metaFor = (id?: string) => employeeMeta[id || ''] || { businessUnit: 'Not assigned', department: 'Not assigned', active: true };
    const leave = approvals.pendingLeaveApprovals.map(r => {
      const meta = metaFor(r.employeeId); const start = new Date(r.startDate); const end = new Date(r.endDate);
      let exception = !meta.active ? 'Employee is inactive' : end < start ? 'Request dates are invalid' : Number(r.durationDays) <= 0 || Number(r.durationDays) > 30 ? 'Unusual duration' : undefined;
      return { id:r.id,kind:'leave' as Kind,employeeId:r.employeeId,employee:r.employeeName,employeeCode:meta.employeeId,businessUnitId:meta.businessUnitId,businessUnit:meta.businessUnit,departmentId:meta.departmentId,department:meta.department,start,end,duration:`${r.durationDays} day${Number(r.durationDays) === 1 ? '' : 's'}`,status:String(r.status),exception,reviewUrl:'/payroll/leave' };
    });
    const wfh = approvals.pendingWfhApprovals.map(r => {
      const meta=metaFor(r.employeeId); const start=new Date(r.date); const end=new Date(r.endDate || r.date); const days=Math.floor((end.getTime()-start.getTime())/86400000)+1;
      const overlapping = approvals.pendingLeaveApprovals.some(l => l.employeeId===r.employeeId && new Date(l.startDate)<=end && new Date(l.endDate)>=start);
      let exception=!meta.active?'Employee is inactive':end<start?'Request dates are invalid':days>31?'Unusual duration':overlapping?'Overlapping leave request':String(r.status)==='WFH_FOR_TIMEKEEPING'?'Timekeeping verification requires individual review':undefined;
      return { id:r.id,kind:'wfh' as Kind,employeeId:r.employeeId,employee:r.employeeName,employeeCode:meta.employeeId,businessUnitId:meta.businessUnitId,businessUnit:meta.businessUnit,departmentId:meta.departmentId,department:meta.department,start,end,duration:`${days} day${days===1?'':'s'}`,status:String(r.status),exception,reviewUrl:'/payroll/wfh-requests' };
    });
    const overtime = approvals.pendingOtApprovals.map(r => { const meta=metaFor(r.employeeId); const start=new Date(r.date); const exception=!meta.active?'Employee is inactive':!String(r.reason||'').trim()?'Missing reason':undefined; return {id:r.id,kind:'overtime' as Kind,employeeId:r.employeeId,employee:r.employeeName,employeeCode:meta.employeeId,businessUnitId:meta.businessUnitId,businessUnit:meta.businessUnit,departmentId:meta.departmentId,department:meta.department,start,end:start,duration:`${r.startTime || '—'} – ${r.endTime || '—'}`,status:String(r.status),exception,reviewUrl:'/payroll/overtime-requests'}; });
    const manpower = approvals.pendingManpowerApprovals.map(r => { const meta=metaFor(r.requestedBy); const start=new Date(r.date); const exception=!meta.active?'Employee is inactive':undefined; return {id:r.id,kind:'manpower' as Kind,employeeId:r.requestedBy,employee:r.requesterName,employeeCode:meta.employeeId,businessUnitId:r.businessUnitId || meta.businessUnitId,businessUnit:r.businessUnitName || meta.businessUnit,departmentId:r.departmentId || meta.departmentId,department:meta.department,start,end:start,duration:'One request',status:String(r.status),exception,reviewUrl:'/payroll/manpower-planning'}; });
    const requisitionItems = requisitions.map(r => ({ id:r.id,kind:'requisition' as Kind,employeeId:r.created_by_user_id,employee:r.title,employeeCode:r.req_code,businessUnitId:r.business_unit_id,businessUnit:'Business unit',departmentId:r.department_id,department:'Department',start:new Date(r.created_at),end:new Date(r.created_at),duration:'Routing workflow',status:String(r.status),exception:'Configured routing steps require individual review',reviewUrl:'/recruitment/requisitions' }));
    return [...wfh,...leave,...overtime,...requisitionItems,...manpower];
  }, [approvals, employeeMeta, requisitions]);

  const filtered = useMemo(() => items.filter(item => {
    const q=filters.search.trim().toLowerCase(); const age=dayAge(item.start);
    if(q && !`${item.employee} ${item.employeeCode||''}`.toLowerCase().includes(q)) return false;
    if(filters.businessUnit && item.businessUnitId!==filters.businessUnit) return false;
    if(filters.department && item.departmentId!==filters.department) return false;
    if(filters.kind && item.kind!==filters.kind) return false;
    if(filters.exception==='exceptions' && !item.exception) return false;
    if(filters.exception==='eligible' && item.exception) return false;
    if(filters.age==='today' && age!==0) return false;
    if(filters.age==='overdue' && age<3) return false;
    if(filters.quick==='eligible' && item.exception) return false;
    if(filters.quick==='exceptions' && !item.exception) return false;
    if(filters.quick==='today' && age!==0) return false;
    if(filters.quick==='overdue' && age<3) return false;
    return true;
  }).sort((a,b) => filters.quick==='oldest' ? a.start.getTime()-b.start.getTime() : b.start.getTime()-a.start.getTime()), [items,filters]);

  const groups = (['wfh','leave','overtime','requisition','manpower'] as Kind[]).map(kind => ({ kind, items: filtered.filter(i => i.kind===kind) })).filter(g => g.items.length);
  const exceptionCount=filtered.filter(i=>i.exception).length;
  const businessUnits=Array.from(new Map(items.filter(i=>i.businessUnitId).map(i=>[i.businessUnitId!,i.businessUnit])).entries());
  const departments=Array.from(new Map(items.filter(i=>i.departmentId).map(i=>[i.departmentId!,i.department])).entries());

  const openConfirm=(kind:Kind, ids:string[]) => { setConfirmed(false); setResult(null); setConfirming({kind,ids}); };
  const runBulk=async() => {
    if(!confirming || !confirmed) return; setBusy(true); setResult(null);
    const { data,error }=await supabase.rpc('bulk_approve_requests',{p_request_type:confirming.kind,p_request_ids:confirming.ids,p_idempotency_key:crypto.randomUUID(),p_confirm_policy:true});
    setBusy(false);
    if(error) return setResult({error:error.message});
    setResult(data); setSelected(new Set()); await approvals.refreshApprovals();
  };

  if (!user) return null;
  const error=approvals.approvalError || loadError;
  return <div className="space-y-5 pb-12">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-bold text-slate-900 dark:text-white">Approval Center</h1><p className="mt-1 text-slate-500">Review grouped requests, approve eligible work safely, and keep exceptions visible.</p></div><Link to="/dashboard" className="font-semibold text-indigo-600">← Dashboard</Link></div>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"><b>Approval data could not be loaded.</b> {error}</div>}
    <div className="grid gap-3 sm:grid-cols-3">
      {[['Pending approvals',filtered.length,'bg-blue-50 text-blue-700'],['Exceptions requiring review',exceptionCount,'bg-amber-50 text-amber-700'],['Approval groups',groups.length,'bg-emerald-50 text-emerald-700']].map(([label,value,color])=><div key={String(label)} className="rounded-xl border bg-white p-5 shadow-sm dark:bg-slate-800"><div className={`inline-flex rounded-lg px-3 py-1 text-2xl font-bold ${color}`}>{value}</div><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{label}</p></div>)}
    </div>
    <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-800">
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        <input aria-label="Employee search" value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})} placeholder="Search employee or ID" className="rounded-lg border px-3 py-2 md:col-span-2" />
        <select aria-label="Business unit" value={filters.businessUnit} onChange={e=>setFilters({...filters,businessUnit:e.target.value})} className="rounded-lg border px-3 py-2"><option value="">All business units</option>{businessUnits.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        <select aria-label="Department" value={filters.department} onChange={e=>setFilters({...filters,department:e.target.value})} className="rounded-lg border px-3 py-2"><option value="">All departments</option>{departments.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        <select aria-label="Request type" value={filters.kind} onChange={e=>setFilters({...filters,kind:e.target.value})} className="rounded-lg border px-3 py-2"><option value="">All request types</option>{Object.entries(KIND_META).map(([id,m])=><option key={id} value={id}>{m.title}</option>)}</select>
        <select aria-label="Exception status" value={filters.exception} onChange={e=>setFilters({...filters,exception:e.target.value})} className="rounded-lg border px-3 py-2"><option value="">Any review status</option><option value="eligible">Standard eligible</option><option value="exceptions">Exceptions</option></select>
        <select aria-label="Age of request" value={filters.age} onChange={e=>setFilters({...filters,age:e.target.value})} className="rounded-lg border px-3 py-2"><option value="">Any age</option><option value="today">Due today</option><option value="overdue">Overdue (3+ days)</option></select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{[['all','All pending'],['eligible','Standard eligible'],['exceptions','Exceptions'],['today','Due today'],['overdue','Overdue'],['oldest','Oldest first']].map(([id,label])=><button key={id} onClick={()=>setFilters({...filters,quick:id})} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${filters.quick===id?'bg-indigo-600 text-white':'bg-slate-100 text-slate-700'}`}>{label}</button>)}</div>
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
      <div className="space-y-3">{groups.map(group=>{const eligible=group.items.filter(i=>!i.exception);const exceptions=group.items.filter(i=>i.exception);const checked=eligible.filter(i=>selected.has(i.id));const oldest=group.items.reduce((a,b)=>a.start<b.start?a:b);return <section key={group.kind} className="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-slate-800">
        <div className="flex flex-wrap items-center gap-3 p-4"><button aria-label={`Toggle ${KIND_META[group.kind].title}`} onClick={()=>setExpanded(expanded===group.kind?null:group.kind)} className="text-xl">{expanded===group.kind?'⌄':'›'}</button><span className={`rounded-full px-3 py-1 text-sm font-bold ${KIND_META[group.kind].badge}`}>{KIND_META[group.kind].title}</span><div className="min-w-[220px] flex-1"><h2 className="font-bold text-slate-900 dark:text-white">{KIND_META[group.kind].title} — {group.items.length} request{group.items.length===1?'':'s'}</h2><p className="text-sm text-slate-500">{KIND_META[group.kind].rule}</p><p className="mt-1 text-xs text-slate-500">{fmtDate(oldest.start)} – {fmtDate(group.items.reduce((a,b)=>a.end>b.end?a:b).end)} · {new Set(group.items.map(i=>i.employeeId)).size} employees · oldest {dayAge(oldest.start)} days</p></div><button onClick={()=>{setExpanded(group.kind);setFilters({...filters,exception:'exceptions'})}} className="font-semibold text-indigo-600">Open exceptions ({exceptions.length})</button><Button variant="success" disabled={!eligible.length || group.kind==='requisition'} onClick={()=>openConfirm(group.kind,eligible.map(i=>i.id))}>Approve group — {eligible.length} eligible</Button></div>
        {expanded===group.kind && <div className="overflow-x-auto border-t"><div className="flex items-center justify-between bg-slate-50 px-4 py-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={eligible.length>0&&checked.length===eligible.length} onChange={e=>{const next=new Set(selected);eligible.forEach(i=>e.target.checked?next.add(i.id):next.delete(i.id));setSelected(next)}}/> Select all eligible ({eligible.length})</label><Button size="sm" disabled={!checked.length} onClick={()=>openConfirm(group.kind,checked.map(i=>i.id))}>Approve selected — {checked.length}</Button></div><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{['','Employee','Business unit / Department','Dates','Duration','Status','Exception',''].map((h,i)=><th key={i} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{group.items.map(item=><tr key={item.id} className="border-t"><td className="px-4 py-3"><input type="checkbox" disabled={!!item.exception} checked={selected.has(item.id)} onChange={e=>{const n=new Set(selected);e.target.checked?n.add(item.id):n.delete(item.id);setSelected(n)}}/></td><td className="px-4 py-3 font-semibold">{item.employee}<div className="text-xs font-normal text-slate-500">{item.employeeCode||'No employee ID'}</div></td><td className="px-4 py-3">{item.businessUnit}<div className="text-xs text-slate-500">{item.department}</div></td><td className="whitespace-nowrap px-4 py-3">{fmtDate(item.start)}{item.end.getTime()!==item.start.getTime()?` – ${fmtDate(item.end)}`:''}</td><td className="px-4 py-3">{item.duration}</td><td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{item.status}</span></td><td className="px-4 py-3">{item.exception?<span className="font-semibold text-amber-700">Needs review<div className="font-normal">{item.exception}</div></span>:<span className="text-emerald-700">Eligible</span>}</td><td className="px-4 py-3"><Link className="font-semibold text-indigo-600" to={item.reviewUrl}>Review</Link></td></tr>)}</tbody></table></div>}
      </section>})}{!groups.length&&!error&&<div className="rounded-xl border bg-white p-10 text-center text-slate-500">No pending approvals match these filters.</div>}</div>
      <aside className="h-fit rounded-xl border border-blue-100 bg-gradient-to-b from-blue-50 to-white p-5 shadow-sm xl:sticky xl:top-36"><h2 className="text-lg font-bold text-slate-900">Approval Policy</h2>{[['Eligible only','Bulk approval applies only to requests that pass current workflow checks.'],['Exceptions excluded','Conflicts and ambiguous policy cases remain pending for individual review.'],['Audit trail per request','Every successful request keeps an individual audit and workflow history.'],['RBAC and scope enforced','The server rechecks action authority and employee scope before every update.'],['Notifications preserved','Employees are notified through the existing notification table.']].map(([h,p])=><div key={h} className="mt-5"><h3 className="font-semibold text-slate-800">✓ {h}</h3><p className="mt-1 text-sm text-slate-600">{p}</p></div>)}</aside>
    </div>
    {confirming&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-bold">Approve {confirming.ids.length} {KIND_META[confirming.kind].title} request{confirming.ids.length===1?'':'s'}?</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600"><li>{confirming.ids.length} eligible requests will be processed.</li><li>Exceptions remain pending.</li><li>Each request keeps its own history and audit record.</li><li>Employees are notified using existing notification settings.</li></ul><label className="mt-5 flex gap-3 rounded-lg bg-slate-50 p-4 font-semibold"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I confirm these requests meet policy.</label>{result?.error&&<p role="alert" className="mt-4 text-red-700">{result.error}</p>}{result&&!result.error&&<div className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800"><b>{result.succeeded} approved</b> · {result.skipped} skipped · {result.failed} failed</div>}<div className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={()=>{setConfirming(null);setResult(null)}}>Cancel</Button><Button disabled={!confirmed||busy||!!(result&&!result.error)} isLoading={busy} onClick={runBulk}>Approve {confirming.ids.length} requests</Button></div></div></div>}
  </div>;
}
