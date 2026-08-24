import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { useApprovals } from '../hooks/useApprovals';
import { useAdditionalApprovals } from '../hooks/useAdditionalApprovals';
import { Role } from '../types';
import Button from '../components/ui/Button';
import { useSettings } from '../context/SettingsContext';

type Kind = 'leave' | 'wfh' | 'overtime' | 'manpower' | 'requisition' | 'pan' | 'nte' | 'award';
type EmployeeMeta = { employeeId?: string; businessUnitId?: string; businessUnit: string; departmentId?: string; department: string; active: boolean };
type ApprovalItem = {
  id: string; canonicalKey: string; kind: Kind; reference: string; employeeId?: string; employee: string; employeeCode?: string;
  businessUnitId?: string; businessUnit: string; departmentId?: string; department: string;
  start: Date; end: Date; duration: string; status: string; currentStep: string; details?: string;
  exception?: string; bulkEligible: boolean; reviewUrl: string;
  route?: 'MANAGER_ONLY' | 'BOD_REQUIRED';
};

const KIND_META: Record<Kind, { title: string; badge: string; rule: string }> = {
  nte: { title: 'NTE Approval', badge: 'bg-red-100 text-red-800', rule: 'Notices to Explain awaiting your assigned approval step.' },
  pan: { title: 'PAN', badge: 'bg-purple-100 text-purple-800', rule: 'Personnel Action Notices awaiting your assigned routing step.' },
  wfh: { title: 'Standard WFH', badge: 'bg-blue-100 text-blue-800', rule: 'Work-from-home requests matching the existing approval path.' },
  leave: { title: 'Leave', badge: 'bg-yellow-100 text-yellow-800', rule: 'Time-off requests requiring action under the current leave workflow.' },
  overtime: { title: 'Overtime', badge: 'bg-orange-100 text-orange-800', rule: 'Submitted overtime requests requiring action in your approval scope.' },
  requisition: { title: 'Job Requisitions', badge: 'bg-indigo-100 text-indigo-800', rule: 'Requisitions awaiting your configured routing step.' },
  manpower: { title: 'Manpower', badge: 'bg-teal-100 text-teal-800', rule: 'Manpower requests within your permitted approval scope.' },
  award: { title: 'Awards', badge: 'bg-amber-100 text-amber-800', rule: 'Award nominations awaiting your required approval before certificate issuance.' },
};

const GROUP_ORDER: Kind[] = ['nte', 'pan', 'award', 'wfh', 'leave', 'overtime', 'requisition', 'manpower'];
const BULK_KINDS = new Set<Kind>(['leave', 'wfh', 'overtime', 'manpower']);
const fmtDate = (date: Date) => date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const dayAge = (date: Date) => Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));

export default function ApprovalCenter() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { approverConfigs } = useSettings();
  const roles = new Set([user?.role, ...(user?.roles || [])].filter(Boolean));
  const [reporteeIds, setReporteeIds] = useState<string[]>([]);
  const [employeeMeta, setEmployeeMeta] = useState<Record<string, EmployeeMeta>>({});
  const [businessUnitLabels, setBusinessUnitLabels] = useState<Record<string, string>>({});
  const [departmentLabels, setDepartmentLabels] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Kind | null>('nte');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<{ kind: Kind; ids: string[] } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ search: '', businessUnit: '', department: '', kind: '', status: '', age: '', dateFrom: '', dateTo: '', quick: 'all', sort: 'newest' });

  const approvals = useApprovals({ user, isHR: roles.has(Role.HRStaff), reporteeIds });
  const additional = useAdditionalApprovals(user);
  const requestedItem = searchParams.get('item');

  useEffect(() => {
    const requestedType = searchParams.get('type');
    const kind = GROUP_ORDER.includes(requestedType as Kind) ? requestedType as Kind : '';
    if (kind) {
      setExpanded(kind);
      setFilters(current => ({ ...current, kind }));
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    supabase.from('hris_users').select('id').eq('reports_to', user.id).then(({ data, error }) => {
      if (error) setLoadError(`Approver scope could not be loaded: ${error.message}`);
      else setReporteeIds((data || []).map((row: any) => row.id));
    });
  }, [user]);

  useEffect(() => {
    Promise.all([supabase.from('business_units').select('id,name'), supabase.from('departments').select('id,name')]).then(([businessUnits, departments]) => {
      if (businessUnits.error || departments.error) return setLoadError(`Approval labels could not be loaded: ${businessUnits.error?.message || departments.error?.message}`);
      setBusinessUnitLabels(Object.fromEntries((businessUnits.data || []).map((row: any) => [row.id, row.name])));
      setDepartmentLabels(Object.fromEntries((departments.data || []).map((row: any) => [row.id, row.name])));
    });
  }, []);

  useEffect(() => {
    const ids = Array.from(new Set([
      ...approvals.pendingLeaveApprovals.map(row => row.employeeId), ...approvals.pendingWfhApprovals.map(row => row.employeeId),
      ...approvals.pendingOtApprovals.map(row => row.employeeId), ...approvals.pendingManpowerApprovals.map(row => row.requestedBy),
      ...additional.pendingNTEApprovals.map(row => row.employeeId), ...additional.pendingPANApprovals.map(row => row.employeeId),
      ...additional.pendingAwardApprovals.map(row => row.employeeId),
    ].filter(Boolean))) as string[];
    if (!ids.length) return setEmployeeMeta({});
    supabase.from('hris_users').select('id,employee_id,business_unit_id,business_unit,department_id,department,status').in('id', ids).then(({ data, error }) => {
      if (error) return setLoadError(`Employee scope data could not be loaded: ${error.message}`);
      setEmployeeMeta(Object.fromEntries((data || []).map((row: any) => [row.id, {
        employeeId: row.employee_id, businessUnitId: row.business_unit_id,
        businessUnit: row.business_unit || businessUnitLabels[row.business_unit_id] || 'Not assigned',
        departmentId: row.department_id, department: row.department || departmentLabels[row.department_id] || 'Not assigned',
        active: String(row.status || 'active').toLowerCase() === 'active',
      }])));
    });
  }, [approvals.pendingLeaveApprovals, approvals.pendingWfhApprovals, approvals.pendingOtApprovals, approvals.pendingManpowerApprovals, additional.pendingNTEApprovals, additional.pendingPANApprovals, additional.pendingAwardApprovals, businessUnitLabels, departmentLabels]);

  const items = useMemo<ApprovalItem[]>(() => {
    const metaFor = (id?: string) => employeeMeta[id || ''] || { businessUnit: 'Not assigned', department: 'Not assigned', active: true };
    const leave: ApprovalItem[] = approvals.pendingLeaveApprovals.map(row => {
      const meta = metaFor(row.employeeId), start = new Date(row.startDate), end = new Date(row.endDate);
      const exception = !meta.active ? 'Employee is inactive' : end < start ? 'Request dates are invalid' : Number(row.durationDays) <= 0 || Number(row.durationDays) > 30 ? 'Unusual duration' : undefined;
      return { id: row.id, canonicalKey: `leave:${row.id}:${row.status}`, kind: 'leave', reference: `LEAVE-${String(row.id).slice(0, 8).toUpperCase()}`, employeeId: row.employeeId, employee: row.employeeName, employeeCode: meta.employeeId, businessUnitId: meta.businessUnitId, businessUnit: meta.businessUnit, departmentId: meta.departmentId, department: meta.department, start, end, duration: `${row.durationDays} day${Number(row.durationDays) === 1 ? '' : 's'}`, status: String(row.status), currentStep: row.status === 'PendingBOD' ? 'Pending BOD Final Approval' : 'Pending Direct Manager Review', details: row.approvalReason, exception, bulkEligible: true, route: row.approvalRoute, reviewUrl: `/payroll/leave?item=${row.id}` };
    });
    const wfh: ApprovalItem[] = approvals.pendingWfhApprovals.map(row => {
      const meta = metaFor(row.employeeId), start = new Date(row.date), end = new Date(row.endDate || row.date);
      const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
      const overlap = approvals.pendingLeaveApprovals.some(leaveRow => leaveRow.employeeId === row.employeeId && new Date(leaveRow.startDate) <= end && new Date(leaveRow.endDate) >= start);
      const exception = !meta.active ? 'Employee is inactive' : end < start ? 'Request dates are invalid' : days > 31 ? 'Unusual duration' : overlap ? 'Overlapping leave request' : String(row.status) === 'WFH_FOR_TIMEKEEPING' ? 'Timekeeping verification requires individual review' : undefined;
      return { id: row.id, canonicalKey: `wfh:${row.id}:${row.status}`, kind: 'wfh', reference: `WFH-${String(row.id).slice(0, 8).toUpperCase()}`, employeeId: row.employeeId, employee: row.employeeName, employeeCode: meta.employeeId, businessUnitId: meta.businessUnitId, businessUnit: meta.businessUnit, departmentId: meta.departmentId, department: meta.department, start, end, duration: `${days} day${days === 1 ? '' : 's'}`, status: String(row.status), currentStep: row.status === 'WFH_PENDING_BOD_APPROVAL' ? 'Pending BOD Final Approval' : 'Pending Direct Manager Review', details: row.approvalReason, exception, bulkEligible: true, route: row.approvalRoute, reviewUrl: `/payroll/wfh-requests?item=${row.id}` };
    });
    const overtime: ApprovalItem[] = approvals.pendingOtApprovals.map(row => {
      const meta = metaFor(row.employeeId), start = new Date(row.submittedAt || row.date);
      const exception = !meta.active ? 'Employee is inactive' : !String(row.reason || '').trim() ? 'Missing reason' : undefined;
      return { id: row.id, canonicalKey: `overtime:${row.id}:${row.status}`, kind: 'overtime', reference: `OT-${String(row.id).slice(0, 8).toUpperCase()}`, employeeId: row.employeeId, employee: row.employeeName, employeeCode: meta.employeeId, businessUnitId: meta.businessUnitId, businessUnit: meta.businessUnit, departmentId: meta.departmentId, department: meta.department, start, end: start, duration: `${row.startTime || '—'} – ${row.endTime || '—'}`, status: String(row.status), currentStep: row.status === 'PendingBOD' ? 'Pending BOD Final Approval' : 'Pending Direct Manager Review', details: row.approvalReason, exception, bulkEligible: true, route: row.approvalRoute, reviewUrl: `/payroll/overtime-requests?item=${row.id}` };
    });
    const manpower: ApprovalItem[] = approvals.pendingManpowerApprovals.map(row => {
      const meta = metaFor(row.requestedBy), start = new Date(row.createdAt || row.date), exception = !meta.active ? 'Employee is inactive' : undefined;
      return { id: row.id, canonicalKey: `manpower:${row.id}:${row.status}`, kind: 'manpower', reference: `MP-${String(row.id).slice(0, 8).toUpperCase()}`, employeeId: row.requestedBy, employee: row.requesterName, employeeCode: meta.employeeId, businessUnitId: row.businessUnitId || meta.businessUnitId, businessUnit: row.businessUnitName || meta.businessUnit, departmentId: row.departmentId || meta.departmentId, department: meta.department, start, end: start, duration: 'One request', status: String(row.status), currentStep: String(row.status), exception, bulkEligible: true, reviewUrl: `/payroll/manpower-planning?item=${row.id}` };
    });
    const ntes: ApprovalItem[] = additional.pendingNTEApprovals.map(row => {
      const meta = metaFor(row.employeeId);
      return { id: row.id, canonicalKey: row.canonicalKey, kind: 'nte', reference: row.reference, employeeId: row.employeeId, employee: row.employeeName, employeeCode: meta.employeeId, businessUnitId: row.businessUnitId || meta.businessUnitId, businessUnit: row.businessUnit || meta.businessUnit, departmentId: meta.departmentId, department: meta.department, start: row.createdAt, end: row.deadline || row.createdAt, duration: `${dayAge(row.createdAt)} day${dayAge(row.createdAt) === 1 ? '' : 's'} pending`, status: row.status, currentStep: row.currentStep, details: `${row.caseReference} · ${row.category} · Handler: ${row.assignedHandler}`, bulkEligible: false, reviewUrl: `/feedback/nte/${row.id}` };
    });
    const pans: ApprovalItem[] = additional.pendingPANApprovals.map(row => {
      const meta = metaFor(row.employeeId);
      return { id: row.id, canonicalKey: row.canonicalKey, kind: 'pan', reference: row.reference, employeeId: row.employeeId, employee: row.employeeName, employeeCode: meta.employeeId, businessUnitId: meta.businessUnitId, businessUnit: meta.businessUnit, departmentId: meta.departmentId, department: meta.department, start: row.createdAt, end: row.effectiveDate, duration: `Effective ${fmtDate(row.effectiveDate)}`, status: row.status, currentStep: row.currentStep, details: row.action, bulkEligible: false, reviewUrl: `/employees/pan?item=${row.id}` };
    });
    const requisitions: ApprovalItem[] = additional.pendingRequisitionApprovals.map(row => ({ id: row.id, canonicalKey: row.canonicalKey, kind: 'requisition', reference: row.reference, employee: row.title, businessUnitId: row.businessUnitId, businessUnit: businessUnitLabels[row.businessUnitId || ''] || 'Not assigned', departmentId: row.departmentId, department: departmentLabels[row.departmentId || ''] || 'Not assigned', start: row.createdAt, end: row.createdAt, duration: 'Routing workflow', status: row.status, currentStep: row.currentStep, bulkEligible: false, reviewUrl: `/recruitment/requisitions?item=${row.id}` }));
    const awardItems: ApprovalItem[] = additional.pendingAwardApprovals.map(row => {
      const meta = metaFor(row.employeeId);
      return { id: row.id, canonicalKey: row.canonicalKey, kind: 'award', reference: row.reference, employeeId: row.employeeId, employee: row.employeeName, employeeCode: meta.employeeId, businessUnitId: row.businessUnitId || meta.businessUnitId, businessUnit: businessUnitLabels[row.businessUnitId || ''] || meta.businessUnit, departmentId: row.departmentId || meta.departmentId, department: departmentLabels[row.departmentId || ''] || meta.department, start: row.createdAt, end: row.createdAt, duration: `${dayAge(row.createdAt)} day${dayAge(row.createdAt) === 1 ? '' : 's'} pending`, status: row.status, currentStep: row.currentStep, details: row.awardTitle, bulkEligible: false, reviewUrl: `/evaluation/awards?item=${row.id}` };
    });
    const canonical = new Map<string, ApprovalItem>();
    [...ntes, ...pans, ...awardItems, ...wfh, ...leave, ...overtime, ...requisitions, ...manpower].forEach(item => { if (!canonical.has(item.canonicalKey)) canonical.set(item.canonicalKey, item); });
    return Array.from(canonical.values());
  }, [approvals, additional, employeeMeta, businessUnitLabels, departmentLabels]);

  const filtered = useMemo(() => items.filter(item => {
    const query = filters.search.trim().toLowerCase(), age = dayAge(item.start);
    if (query && !`${item.employee} ${item.employeeCode || ''} ${item.reference} ${item.details || ''}`.toLowerCase().includes(query)) return false;
    if (filters.businessUnit && item.businessUnitId !== filters.businessUnit) return false;
    if (filters.department && item.departmentId !== filters.department) return false;
    if (filters.kind && item.kind !== filters.kind) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.dateFrom && item.start < new Date(`${filters.dateFrom}T00:00:00`)) return false;
    if (filters.dateTo && item.start > new Date(`${filters.dateTo}T23:59:59`)) return false;
    if ((filters.age === 'today' || filters.quick === 'today') && age !== 0) return false;
    if ((filters.age === 'overdue' || filters.quick === 'overdue') && age < 3) return false;
    if (filters.quick === 'eligible' && (item.exception || !item.bulkEligible)) return false;
    if (filters.quick === 'exceptions' && !item.exception) return false;
    return true;
  }).sort((a, b) => filters.sort === 'newest' ? b.start.getTime() - a.start.getTime() : a.start.getTime() - b.start.getTime()), [items, filters]);

  const groups = GROUP_ORDER.map(kind => ({ kind, items: filtered.filter(item => item.kind === kind) })).filter(group => group.items.length);
  const exceptionCount = filtered.filter(item => item.exception).length;
  const dueTodayCount = filtered.filter(item => dayAge(item.start) === 0).length;
  const overdueCount = filtered.filter(item => dayAge(item.start) >= 3).length;
  const managerOnlyCount = filtered.filter(item => item.route === 'MANAGER_ONLY').length;
  const bodRequiredCount = filtered.filter(item => item.route === 'BOD_REQUIRED').length;
  const businessUnits = Array.from(new Map(items.filter(item => item.businessUnitId).map(item => [item.businessUnitId!, item.businessUnit])).entries());
  const departments = Array.from(new Map(items.filter(item => item.departmentId).map(item => [item.departmentId!, item.department])).entries());
  const statuses = Array.from(new Set(items.map(item => item.status))).sort();

  const openConfirm = (kind: Kind, ids: string[]) => { setConfirmed(false); setResult(null); setConfirming({ kind, ids }); };
  const runBulk = async () => {
    if (!confirming || !confirmed || !BULK_KINDS.has(confirming.kind)) return;
    setBusy(true); setResult(null);
    const { data, error } = await supabase.rpc('bulk_approve_requests', { p_request_type: confirming.kind, p_request_ids: confirming.ids, p_idempotency_key: crypto.randomUUID(), p_confirm_policy: true });
    setBusy(false);
    if (error) return setResult({ error: error.message });
    setResult(data); setSelected(new Set());
    await Promise.all([approvals.refreshApprovals(), additional.refreshAdditionalApprovals()]);
  };

  if (!user) return null;
  const error = approvals.approvalError || additional.additionalApprovalError || loadError;
  const controlClasses = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-500 dark:bg-slate-700 dark:text-white dark:placeholder:text-slate-300 dark:focus:border-indigo-400 dark:focus:ring-indigo-900';
  return <div className="space-y-5 pb-12 text-slate-900 dark:text-slate-100">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-bold text-slate-900 dark:text-white">Approval Center</h1><p className="mt-1 text-slate-500 dark:text-slate-300">The single queue for every approval requiring your action.</p></div><Link to="/dashboard" className="font-semibold text-indigo-600 dark:text-indigo-300">← Dashboard</Link></div>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"><b>Some approval data could not be loaded.</b> {error}</div>}
    {!approverConfigs.conditionalTimeApprovals.valid && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900"><b>Conditional approval routing needs an Admin.</b> {approverConfigs.conditionalTimeApprovals.invalid_reason || 'At least one active BOD approver must be selected.'}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{[['Pending approvals', filtered.length, 'bg-blue-50 text-blue-700'], ['Manager only', managerOnlyCount, 'bg-emerald-50 text-emerald-700'], ['BOD required', bodRequiredCount, 'bg-violet-50 text-violet-700'], ['Due today', dueTodayCount, 'bg-orange-50 text-orange-700'], ['Overdue', overdueCount, 'bg-red-50 text-red-700'], ['High risk / exceptions', exceptionCount, 'bg-amber-50 text-amber-700']].map(([label, value, color]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800"><div className={`inline-flex rounded-lg px-3 py-1 text-2xl font-bold ${color}`}>{value}</div><p className="mt-2 text-sm text-slate-600 dark:text-slate-200">{label}</p></div>)}</div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
      <div className="mb-3 grid gap-3 sm:grid-cols-3"><label className="text-sm font-semibold text-slate-700 dark:text-slate-100">Date from<input type="date" aria-label="Date from" value={filters.dateFrom} onChange={event => setFilters({ ...filters, dateFrom: event.target.value })} className={`mt-1 block w-full font-normal ${controlClasses}`} /></label><label className="text-sm font-semibold text-slate-700 dark:text-slate-100">Date to<input type="date" aria-label="Date to" value={filters.dateTo} onChange={event => setFilters({ ...filters, dateTo: event.target.value })} className={`mt-1 block w-full font-normal ${controlClasses}`} /></label><label className="text-sm font-semibold text-slate-700 dark:text-slate-100">Approver scope<select aria-label="Approver scope" disabled className={`mt-1 block w-full font-normal disabled:cursor-not-allowed disabled:opacity-100 dark:disabled:bg-slate-600 dark:disabled:text-slate-100 ${controlClasses}`}><option>My authorized scope</option></select></label></div>
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8"><input aria-label="Approval search" value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} placeholder="Employee, NTE, PAN, case or request ID" className={`md:col-span-2 ${controlClasses}`} /><select aria-label="Business unit" value={filters.businessUnit} onChange={event => setFilters({ ...filters, businessUnit: event.target.value })} className={controlClasses}><option value="">All business units</option>{businessUnits.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><select aria-label="Department" value={filters.department} onChange={event => setFilters({ ...filters, department: event.target.value })} className={controlClasses}><option value="">All departments</option>{departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><select aria-label="Request type" value={filters.kind} onChange={event => setFilters({ ...filters, kind: event.target.value })} className={controlClasses}><option value="">All request types</option>{GROUP_ORDER.map(id => <option key={id} value={id}>{KIND_META[id].title}</option>)}</select><select aria-label="Approval status" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })} className={controlClasses}><option value="">All statuses</option>{statuses.map(status => <option key={status} value={status}>{status}</option>)}</select><select aria-label="Age of request" value={filters.age} onChange={event => setFilters({ ...filters, age: event.target.value })} className={controlClasses}><option value="">Any age</option><option value="today">Due today</option><option value="overdue">Overdue (3+ days)</option></select><select aria-label="Sort approvals" value={filters.sort} onChange={event => setFilters({ ...filters, sort: event.target.value })} className={controlClasses}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="age">Days pending</option></select></div>
      <div className="mt-3 flex flex-wrap gap-2">{[['all', 'All pending'], ['eligible', 'Standard eligible'], ['exceptions', 'Exceptions'], ['today', 'Due today'], ['overdue', 'Overdue']].map(([id, label]) => <button key={id} onClick={() => setFilters({ ...filters, quick: id })} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${filters.quick === id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-600 dark:text-white'}`}>{label}</button>)}</div>
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
      <div className="space-y-3">{groups.map(group => {
        const eligible = group.items.filter(item => item.bulkEligible && !item.exception), exceptions = group.items.filter(item => item.exception), checked = eligible.filter(item => selected.has(item.canonicalKey));
        const oldest = group.items.reduce((left, right) => left.start < right.start ? left : right), individualOnly = !BULK_KINDS.has(group.kind);
        return <section key={group.kind} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
          <div className="flex flex-wrap items-center gap-3 p-4"><button aria-label={`Toggle ${KIND_META[group.kind].title}`} onClick={() => setExpanded(expanded === group.kind ? null : group.kind)} className="text-xl text-slate-700 dark:text-white">{expanded === group.kind ? '⌄' : '›'}</button><span className={`rounded-full px-3 py-1 text-sm font-bold ${KIND_META[group.kind].badge}`}>{KIND_META[group.kind].title}</span><div className="min-w-[220px] flex-1"><h2 className="font-bold text-slate-900 dark:text-white">{KIND_META[group.kind].title} — {group.items.length} pending</h2><p className="text-sm text-slate-500 dark:text-slate-300">{KIND_META[group.kind].rule}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-300">Oldest {dayAge(oldest.start)} days · {new Set(group.items.map(item => item.employeeId).filter(Boolean)).size} employees</p></div>{!!exceptions.length && <button onClick={() => { setExpanded(group.kind); setFilters({ ...filters, quick: 'exceptions' }); }} className="font-semibold text-indigo-600 dark:text-indigo-300">Open exceptions ({exceptions.length})</button>}{individualOnly ? <button onClick={() => setExpanded(group.kind)} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white">Review queue</button> : <Button variant="success" disabled={!eligible.length} onClick={() => openConfirm(group.kind, eligible.map(item => item.id))}>Approve group — {eligible.length}</Button>}</div>
          {expanded === group.kind && <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-600">{!individualOnly && <div className="flex items-center justify-between bg-slate-50 px-4 py-3 text-sm dark:bg-slate-700 dark:text-slate-100"><label className="flex items-center gap-2"><input type="checkbox" checked={eligible.length > 0 && checked.length === eligible.length} onChange={event => { const next = new Set(selected); eligible.forEach(item => event.target.checked ? next.add(item.canonicalKey) : next.delete(item.canonicalKey)); setSelected(next); }} /> Select all eligible ({eligible.length})</label><Button size="sm" disabled={!checked.length} onClick={() => openConfirm(group.kind, checked.map(item => item.id))}>Approve selected — {checked.length}</Button></div>}<table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-700 dark:text-slate-200"><tr>{['', 'Request / Employee', 'Business unit / Department', 'Submitted / Aging', 'Current step', 'Status', 'Exception', ''].map((heading, index) => <th key={index} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody>{group.items.map(item => <tr id={`approval-${item.id}`} key={item.canonicalKey} className={`border-t border-slate-200 dark:border-slate-600 ${requestedItem === item.id ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-300 dark:bg-indigo-950' : ''}`}><td className="px-4 py-3">{item.bulkEligible && <input type="checkbox" disabled={!!item.exception} checked={selected.has(item.canonicalKey)} onChange={event => { const next = new Set(selected); event.target.checked ? next.add(item.canonicalKey) : next.delete(item.canonicalKey); setSelected(next); }} />}</td><td className="px-4 py-3 font-semibold"><div className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">{item.reference}</div>{item.employee}<div className="text-xs font-normal text-slate-500 dark:text-slate-300">{item.employeeCode || item.details || 'No employee ID'}</div>{item.employeeCode && item.details && <div className="text-xs font-normal text-slate-500 dark:text-slate-300">{item.details}</div>}</td><td className="px-4 py-3">{item.businessUnit}<div className="text-xs text-slate-500 dark:text-slate-300">{item.department}</div></td><td className="whitespace-nowrap px-4 py-3">{fmtDate(item.start)}<div className={`text-xs ${dayAge(item.start) >= 3 ? 'font-semibold text-red-600 dark:text-red-300' : 'text-slate-500 dark:text-slate-300'}`}>{dayAge(item.start)} day{dayAge(item.start) === 1 ? '' : 's'} pending · {item.duration}</div></td><td className="px-4 py-3">{item.currentStep}</td><td className="px-4 py-3"><span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{item.status}</span></td><td className="px-4 py-3">{item.exception ? <span className="font-semibold text-amber-700 dark:text-amber-300">Needs review<div className="font-normal">{item.exception}</div></span> : <span className="text-emerald-700 dark:text-emerald-300">{item.bulkEligible ? 'Eligible' : 'Individual review'}</span>}</td><td className="px-4 py-3"><Link className="font-semibold text-indigo-600 dark:text-indigo-300" to={item.reviewUrl}>Review →</Link></td></tr>)}</tbody></table></div>}
        </section>;
      })}{!groups.length && !error && <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">No pending approvals match these filters.</div>}</div>
      <aside className="h-fit rounded-xl border border-blue-100 bg-gradient-to-b from-blue-50 to-white p-5 shadow-sm dark:border-slate-600 dark:from-slate-800 dark:to-slate-800 xl:sticky xl:top-36"><h2 className="text-lg font-bold text-slate-900 dark:text-white">One approval record</h2>{[['Canonical source', 'The Approval Center reads the existing request record; it does not create a second approval object.'], ['NTE and PAN included', 'Disciplinary and personnel-action approvals are routed here using their existing steps.'], ['Exceptions protected', 'Conflicts and ambiguous policy cases remain pending for individual review.'], ['RBAC enforced', 'Database RLS and existing workflow permissions still determine what each approver can see.'], ['Notifications are shortcuts', 'Alerts open the same underlying Approval Center record or exact detail page.']].map(([heading, copy]) => <div key={heading} className="mt-5"><h3 className="font-semibold text-slate-800 dark:text-slate-100">✓ {heading}</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{copy}</p></div>)}</aside>
    </div>
    {confirming && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-600 dark:bg-slate-800 dark:text-white"><h2 className="text-xl font-bold">Approve {confirming.ids.length} {KIND_META[confirming.kind].title} request{confirming.ids.length === 1 ? '' : 's'}?</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-200"><li>{confirming.ids.length} requests currently shown in your assigned scope will be processed.</li><li>Requests that changed, are no longer assigned to you, or require another approver are safely skipped.</li><li>Each request keeps its own history and audit record.</li><li>Employees are notified using existing settings.</li></ul><label className="mt-5 flex gap-3 rounded-lg bg-slate-50 p-4 font-semibold dark:bg-slate-700 dark:text-white"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> I confirm these requests meet policy.</label>{result?.error && <p role="alert" className="mt-4 text-red-700 dark:text-red-300">{result.error}</p>}{result && !result.error && <div className={`mt-4 rounded-lg p-4 text-sm ${result.failed ? 'bg-red-50 text-red-800' : result.skipped ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`}><div><b>{result.succeeded} approved</b> · {result.skipped} skipped · {result.failed} failed</div>{result.skippedItems?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{Array.from(new Set(result.skippedItems.map((item: any) => item.reason))).map((reason: any) => <li key={String(reason)}>{String(reason)}</li>)}</ul>}{result.failures?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{Array.from(new Set(result.failures.map((item: any) => item.error))).map((failure: any) => <li key={String(failure)}>{String(failure)}</li>)}</ul>}</div>}<div className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={() => { setConfirming(null); setResult(null); }}>{result && !result.error ? 'Close' : 'Cancel'}</Button><Button disabled={!confirmed || busy || !!(result && !result.error)} isLoading={busy} onClick={runBulk}>Approve {confirming.ids.length} requests</Button></div></div></div>}
  </div>;
}
