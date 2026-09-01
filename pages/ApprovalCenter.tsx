import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { useApprovals } from '../hooks/useApprovals';
import { useAdditionalApprovals } from '../hooks/useAdditionalApprovals';
import { OTStatus, Role } from '../types';
import Button from '../components/ui/Button';
import LeaveRequestModal from '../components/payroll/LeaveRequestModal';
import OTRequestModal from '../components/payroll/OTRequestModal';
import WFHReviewModal from '../components/payroll/WFHReviewModal';
import ManpowerReviewModal from '../components/payroll/ManpowerReviewModal';
import OfferApprovalReviewModal from '../components/recruitment/OfferApprovalReviewModal';
import { useSettings } from '../context/SettingsContext';
import { ApprovalRequestKind, getApprovalRequestId, getApprovalReviewUrl } from '../services/approvalDeepLinks';
import {
  approvalContextNumber,
  formatApprovalNumber,
  getApprovalActionLabel,
  getApprovalStatusLabel,
  getApprovalStepLabel,
  getOvertimeWeekDetails,
  getTimeApprovalNextStep,
  getTimeApprovalReason,
  isBodApprovalStatus,
} from '../utils/approvalPresentation';

type Kind = ApprovalRequestKind;
type EmployeeMeta = { employeeId?: string; businessUnitId?: string; businessUnit: string; departmentId?: string; department: string; active: boolean };
type ApprovalItem = {
  id: string; canonicalKey: string; kind: Kind; reference: string; employeeId?: string; employee: string; employeeCode?: string;
  businessUnitId?: string; businessUnit: string; departmentId?: string; department: string;
  start: Date; end: Date; duration: string; status: string; currentStep: string; details?: string;
  requestStart?: Date; requestEnd?: Date; approvalStep?: string;
  reason?: string; exception?: string; nextStep?: string; bulkSelectable: boolean; reviewUrl: string;
  route?: 'MANAGER_ONLY' | 'BOD_REQUIRED';
  approvalContext?: Record<string, unknown>;
};

const DEFAULT_FILTERS = { search: '', businessUnit: '', department: '', kind: '', status: '', age: '', dateFrom: '', dateTo: '', quick: 'all', sort: 'newest' };

const KIND_META: Record<Kind, { title: string; badge: string; rule: string }> = {
  nte: { title: 'NTE Approval', badge: 'bg-red-100 text-red-800', rule: 'Notices to Explain awaiting your assigned approval step.' },
  pan: { title: 'PAN', badge: 'bg-purple-100 text-purple-800', rule: 'Personnel Action Notices awaiting your assigned routing step.' },
  wfh: { title: 'WFH', badge: 'bg-blue-100 text-blue-800', rule: 'Work-from-home requests awaiting action in your assigned approval step.' },
  leave: { title: 'Leave', badge: 'bg-yellow-100 text-yellow-800', rule: 'Time-off requests requiring action under the current leave workflow.' },
  overtime: { title: 'Overtime', badge: 'bg-orange-100 text-orange-800', rule: 'Submitted overtime requests requiring action in your approval scope.' },
  requisition: { title: 'Job Requisitions', badge: 'bg-indigo-100 text-indigo-800', rule: 'Requisitions awaiting your configured routing step.' },
  manpower: { title: 'Manpower', badge: 'bg-teal-100 text-teal-800', rule: 'Manpower requests within your permitted approval scope.' },
  award: { title: 'Awards', badge: 'bg-amber-100 text-amber-800', rule: 'Award nominations awaiting your required approval before certificate issuance.' },
  offer: { title: 'Offer Approval', badge: 'bg-violet-100 text-violet-800', rule: 'Hiring packets awaiting your configured offer approval.' },
};

const GROUP_ORDER: Kind[] = ['nte', 'pan', 'award', 'offer', 'wfh', 'leave', 'overtime', 'requisition', 'manpower'];
const BULK_KINDS = new Set<Kind>(['leave', 'wfh', 'overtime']);
const TIME_KINDS = new Set<Kind>(['leave', 'wfh', 'overtime']);
const TIME_DESKTOP_HEADINGS = ['Select', 'Request / Employee', 'Business unit / Department', 'Request details', 'Submitted / Pending', 'Approval step', 'Eligibility', 'Action'];
const OVERTIME_DESKTOP_HEADINGS = ['Select', 'Request / Employee', 'Business unit / Department', 'Request details', 'Week of', 'Submitted / Pending', 'Approval step', 'Eligibility', 'Action'];
const GENERIC_DESKTOP_HEADINGS = ['Select', 'Request / Employee', 'Business unit / Department', 'Submitted / Aging', 'Current step', 'Status', 'Exception / Reason', 'Action'];
const fmtDate = (date: Date) => date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtDateRange = (start?: Date, end?: Date) => {
  if (!start) return '—';
  if (!end || end.getTime() === start.getTime()) return fmtDate(start);
  return `${fmtDate(start)}–${fmtDate(end)}`;
};
const dayAge = (date: Date) => Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
const needsIndividualReview = (item: ApprovalItem) => Boolean(item.exception || item.route === 'BOD_REQUIRED');
const reasonTone = (item: ApprovalItem) => needsIndividualReview(item)
  ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
  : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100';
const eligibilityLabel = (item: ApprovalItem) => needsIndividualReview(item) ? 'Exception' : 'Eligible';
const eligibilityReason = (item: ApprovalItem) => item.exception || item.reason || (item.route === 'BOD_REQUIRED' ? 'Additional approval is required.' : 'Request is within the configured approval policy.');

const ApprovalMobileCard: React.FC<{
  item: ApprovalItem;
  requested: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
}> = ({ item, requested, selected, onSelect }) => {
  const week = getOvertimeWeekDetails(item.approvalContext);
  const monthlyWfhDays = approvalContextNumber(item.approvalContext, 'monthWfhDays');
  const yearLeaveDays = approvalContextNumber(item.approvalContext, 'yearLeaveDays');
  const requestLeaveDays = approvalContextNumber(item.approvalContext, 'requestDays');
  const threshold = approvalContextNumber(item.approvalContext, 'threshold');
  const month = item.approvalContext?.month ? String(item.approvalContext.month) : undefined;
  const statusLabel = getApprovalStatusLabel(item.status);
  const isTimeRequest = TIME_KINDS.has(item.kind);
  const detail = isTimeRequest ? item.details : item.reason || item.details;

  return <article className={`rounded-xl border p-4 shadow-sm ${requested ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300 dark:bg-indigo-950' : 'border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800'}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${KIND_META[item.kind].badge}`}>{KIND_META[item.kind].title}</span><p className="mt-2 text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">{item.reference}</p><h3 className="break-words text-base font-bold text-slate-900 dark:text-white">{item.employee}</h3></div>
      {item.bulkSelectable && <label className="flex min-h-11 flex-shrink-0 items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-200"><input type="checkbox" aria-label={`Select ${item.reference} for bulk approval`} checked={selected} onChange={event => onSelect(event.target.checked)} /> Select</label>}
    </div>
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.businessUnit} · {item.department}</p>
    {item.employeeCode && <p className="text-xs text-slate-500 dark:text-slate-400">Employee ID: {item.employeeCode}</p>}
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Submitted</dt><dd className="mt-0.5 font-medium">{fmtDate(item.start)}</dd></div>
      <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pending</dt><dd className={`mt-0.5 font-medium ${dayAge(item.start) >= 3 ? 'text-red-600 dark:text-red-300' : ''}`}>{dayAge(item.start)} day{dayAge(item.start) === 1 ? '' : 's'}</dd></div>
      <div className="col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Request details</dt><dd className="mt-0.5 font-medium">{item.kind === 'overtime' ? <>{fmtDate(item.requestStart || item.start)}<span className="mt-1 block">{item.duration}</span></> : isTimeRequest ? <>{fmtDateRange(item.requestStart, item.requestEnd)}<span className="mt-1 block text-slate-600 dark:text-slate-300">{item.duration}</span></> : item.duration}</dd></div>
      <div className="col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Approval step</dt><dd className="mt-1"><span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">{item.approvalStep || item.currentStep}</span></dd></div>
      {!isTimeRequest && <div className="col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</dt><dd className="mt-1"><span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100">{statusLabel}</span></dd></div>}
      {isTimeRequest && <div className={`col-span-2 rounded-lg border p-3 ${reasonTone(item)}`}><dt className="text-xs font-bold uppercase tracking-wide">{eligibilityLabel(item)}</dt><dd className="mt-1 font-medium">{eligibilityReason(item)}</dd></div>}
      {item.kind === 'overtime' && week.range && <div className="col-span-2 border-t border-slate-200 pt-3 dark:border-slate-600"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Week of</dt><dd className="mt-0.5 font-semibold">{week.range}</dd>{week.workweekNote && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{week.workweekNote}</p>}</div>}
      {item.kind === 'wfh' && month && <div className="col-span-2 border-t border-slate-200 pt-3 dark:border-slate-600"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Month covered</dt><dd className="mt-0.5 font-semibold">{month}</dd></div>}
      {detail && <div className="col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Details</dt><dd className="mt-0.5 break-words">{detail}</dd></div>}
      {item.kind === 'overtime' && week.weeklyOt && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Weekly OT</dt><dd className="mt-0.5 font-semibold">{week.weeklyOt}</dd></div>}
      {item.kind === 'overtime' && week.total && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Weekly total — {week.range || 'covered week'}</dt><dd className="mt-0.5 font-semibold">{week.total}</dd></div>}
      {item.kind === 'wfh' && monthlyWfhDays !== undefined && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Monthly WFH</dt><dd className="mt-0.5 font-semibold">{formatApprovalNumber(monthlyWfhDays)} day{monthlyWfhDays === 1 ? '' : 's'}</dd></div>}
      {item.kind === 'wfh' && threshold !== undefined && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Monthly limit</dt><dd className="mt-0.5 font-semibold">{formatApprovalNumber(threshold)} days</dd></div>}
      {item.kind === 'leave' && requestLeaveDays !== undefined && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Leave requested</dt><dd className="mt-0.5 font-semibold">{formatApprovalNumber(requestLeaveDays)} day{requestLeaveDays === 1 ? '' : 's'}</dd></div>}
      {item.kind === 'leave' && yearLeaveDays !== undefined && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Year leave total</dt><dd className="mt-0.5 font-semibold">{formatApprovalNumber(yearLeaveDays)} day{yearLeaveDays === 1 ? '' : 's'}{threshold !== undefined ? ` / ${formatApprovalNumber(threshold)}-day allowance` : ''}</dd></div>}
    </dl>
    {(item.nextStep || item.route === 'BOD_REQUIRED') && <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-200">{item.nextStep || 'Additional BOD approval required'}</span></div>}
    {!isTimeRequest && item.exception && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100">⚠ {item.exception}</p>}
    <Link className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-center font-bold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800" to={item.reviewUrl} aria-label={`Review ${KIND_META[item.kind].title} request ${item.reference} for ${item.employee}`}>Review request</Link>
  </article>;
};

export default function ApprovalCenter() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { approverConfigs } = useSettings();
  const roles = new Set([user?.role, ...(user?.roles || [])].filter(Boolean));
  const [reporteeIds, setReporteeIds] = useState<string[]>([]);
  const [employeeMeta, setEmployeeMeta] = useState<Record<string, EmployeeMeta>>({});
  const [businessUnitLabels, setBusinessUnitLabels] = useState<Record<string, string>>({});
  const [departmentLabels, setDepartmentLabels] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Kind | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<{ kind: Kind; ids: string[] } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const approvals = useApprovals({ user, isHR: roles.has(Role.HRStaff), reporteeIds });
  const additional = useAdditionalApprovals(user);
  const requestedItem = getApprovalRequestId(searchParams);
  const requestedType = searchParams.get('type');
  const requestedLeave = requestedType === 'leave' ? approvals.pendingLeaveApprovals.find(request => request.id === requestedItem) || null : null;
  const requestedWfh = requestedType === 'wfh' ? approvals.pendingWfhApprovals.find(request => request.id === requestedItem) || null : null;
  const requestedOvertime = requestedType === 'overtime' ? approvals.pendingOtApprovals.find(request => request.id === requestedItem) || null : null;
  const requestedManpower = requestedType === 'manpower' ? approvals.pendingManpowerApprovals.find(request => request.id === requestedItem) || null : null;

  const closeRequestedReview = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('item');
    next.delete('review');
    navigate({ pathname: '/approvals', search: next.toString() ? `?${next.toString()}` : '' }, { replace: true });
  };

  useEffect(() => {
    const requestedType = searchParams.get('type');
    const kind = GROUP_ORDER.includes(requestedType as Kind) ? requestedType as Kind : '';
    const requestedReview = searchParams.get('review');
    const quick = requestedReview === 'exceptions' ? 'exceptions' : undefined;
    if (kind || quick) {
      if (kind) setExpanded(kind);
      setFilters(current => ({ ...current, ...(kind ? { kind } : {}), ...(quick ? { quick } : {}) }));
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    supabase.rpc('get_my_direct_report_ids').then(({ data, error }) => {
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
      const meta = metaFor(row.employeeId), requestStart = new Date(row.startDate), requestEnd = new Date(row.endDate);
      const submittedAt = row.createdAt ? new Date(row.createdAt) : requestStart;
      const exception = !meta.active ? 'Employee is inactive' : requestEnd < requestStart ? 'Request dates are invalid' : Number(row.durationDays) <= 0 || Number(row.durationDays) > 30 ? 'Unusual duration' : undefined;
      const requiresBod = row.approvalRoute === 'BOD_REQUIRED';
      return { id: row.id, canonicalKey: `leave:${row.id}:${row.status}`, kind: 'leave', reference: `LEAVE-${String(row.id).slice(0, 8).toUpperCase()}`, employeeId: row.employeeId, employee: row.employeeName, employeeCode: meta.employeeId, businessUnitId: meta.businessUnitId, businessUnit: meta.businessUnit, departmentId: meta.departmentId, department: meta.department, start: submittedAt, end: requestEnd, requestStart, requestEnd, duration: `${formatApprovalNumber(row.durationDays)} day${Number(row.durationDays) === 1 ? '' : 's'}`, status: String(row.status), currentStep: getApprovalStepLabel(row.status), approvalStep: getApprovalActionLabel(row.status), details: row.reason, reason: getTimeApprovalReason('leave', row.approvalContext, row.approvalReason, requiresBod), exception, nextStep: getTimeApprovalNextStep(row.status, requiresBod), bulkSelectable: true, route: row.approvalRoute, approvalContext: row.approvalContext, reviewUrl: getApprovalReviewUrl('leave', row.id) };
    });
    const wfh: ApprovalItem[] = approvals.pendingWfhApprovals.map(row => {
      const meta = metaFor(row.employeeId), requestStart = new Date(row.date), requestEnd = new Date(row.endDate || row.date);
      const submittedAt = row.createdAt ? new Date(row.createdAt) : requestStart;
      const days = Math.floor((requestEnd.getTime() - requestStart.getTime()) / 86400000) + 1;
      const overlap = approvals.pendingLeaveApprovals.some(leaveRow => leaveRow.employeeId === row.employeeId && new Date(leaveRow.startDate) <= requestEnd && new Date(leaveRow.endDate) >= requestStart);
      const exception = !meta.active ? 'Employee is inactive' : requestEnd < requestStart ? 'Request dates are invalid' : days > 31 ? 'Unusual duration' : overlap ? 'Overlapping leave request' : String(row.status) === 'WFH_FOR_TIMEKEEPING' ? 'Timekeeping verification requires individual review' : undefined;
      const requiresBod = row.approvalRoute === 'BOD_REQUIRED';
      return { id: row.id, canonicalKey: `wfh:${row.id}:${row.status}`, kind: 'wfh', reference: `WFH-${String(row.id).slice(0, 8).toUpperCase()}`, employeeId: row.employeeId, employee: row.employeeName, employeeCode: meta.employeeId, businessUnitId: meta.businessUnitId, businessUnit: meta.businessUnit, departmentId: meta.departmentId, department: meta.department, start: submittedAt, end: requestEnd, requestStart, requestEnd, duration: `${days} day${days === 1 ? '' : 's'}`, status: String(row.status), currentStep: getApprovalStepLabel(row.status), approvalStep: getApprovalActionLabel(row.status), details: row.reason, reason: getTimeApprovalReason('wfh', row.approvalContext, row.approvalReason, requiresBod), exception, nextStep: getTimeApprovalNextStep(row.status, requiresBod), bulkSelectable: true, route: row.approvalRoute, approvalContext: row.approvalContext, reviewUrl: getApprovalReviewUrl('wfh', row.id) };
    });
    const overtime: ApprovalItem[] = approvals.pendingOtApprovals.map(row => {
      const meta = metaFor(row.employeeId), start = new Date(row.submittedAt || row.date), requestStart = new Date(row.date);
      const exception = !meta.active ? 'Employee is inactive' : !String(row.reason || '').trim() ? 'Missing reason' : undefined;
      const requiresBod = row.approvalRoute === 'BOD_REQUIRED';
      return { id: row.id, canonicalKey: `overtime:${row.id}:${row.status}`, kind: 'overtime', reference: `OT-${String(row.id).slice(0, 8).toUpperCase()}`, employeeId: row.employeeId, employee: row.employeeName, employeeCode: meta.employeeId, businessUnitId: meta.businessUnitId, businessUnit: meta.businessUnit, departmentId: meta.departmentId, department: meta.department, start, end: requestStart, requestStart, requestEnd: requestStart, duration: `${row.startTime || '—'}–${row.endTime || '—'}`, status: String(row.status), currentStep: getApprovalStepLabel(row.status), approvalStep: getApprovalActionLabel(row.status), details: row.reason, reason: getTimeApprovalReason('overtime', row.approvalContext, row.approvalReason, requiresBod), exception, nextStep: getTimeApprovalNextStep(row.status, requiresBod), bulkSelectable: true, route: row.approvalRoute, approvalContext: row.approvalContext, reviewUrl: getApprovalReviewUrl('overtime', row.id) };
    });
    const manpower: ApprovalItem[] = approvals.pendingManpowerApprovals.map(row => {
      const meta = metaFor(row.requestedBy), start = new Date(row.createdAt || row.date), exception = !meta.active ? 'Employee is inactive' : undefined;
      const stage = row.approvalStage === 'BOD_GM' ? 'Pending BOD / GM Approval' : 'Pending Business Unit Manager';
      return { id: row.id, canonicalKey: `manpower:${row.id}:${row.status}:${row.approvalStage || 'BUSINESS_UNIT_MANAGER'}`, kind: 'manpower', reference: `MP-${String(row.id).slice(0, 8).toUpperCase()}`, employeeId: row.requestedBy, employee: row.requesterName, employeeCode: meta.employeeId, businessUnitId: row.businessUnitId || meta.businessUnitId, businessUnit: row.businessUnitName || meta.businessUnit, departmentId: row.departmentId || meta.departmentId, department: meta.department, start, end: start, duration: 'On-call coverage request', status: String(row.status), currentStep: stage, approvalStep: stage, reason: row.approvalIssue || 'Assigned approval required.', exception: exception || row.approvalIssue, bulkSelectable: false, route: row.approvalStage === 'BOD_GM' ? 'BOD_REQUIRED' : 'MANAGER_ONLY', reviewUrl: getApprovalReviewUrl('manpower', row.id) };
    });
    const ntes: ApprovalItem[] = additional.pendingNTEApprovals.map(row => {
      const meta = metaFor(row.employeeId);
      return { id: row.id, canonicalKey: row.canonicalKey, kind: 'nte', reference: row.reference, employeeId: row.employeeId, employee: row.employeeName, employeeCode: meta.employeeId, businessUnitId: row.businessUnitId || meta.businessUnitId, businessUnit: row.businessUnit || meta.businessUnit, departmentId: meta.departmentId, department: meta.department, start: row.createdAt, end: row.deadline || row.createdAt, duration: `${dayAge(row.createdAt)} day${dayAge(row.createdAt) === 1 ? '' : 's'} pending`, status: row.status, currentStep: row.currentStep, details: `${row.caseReference} · ${row.category} · Handler: ${row.assignedHandler}`, bulkSelectable: false, reviewUrl: getApprovalReviewUrl('nte', row.id) };
    });
    const pans: ApprovalItem[] = additional.pendingPANApprovals.map(row => {
      const meta = metaFor(row.employeeId);
      return { id: row.id, canonicalKey: row.canonicalKey, kind: 'pan', reference: row.reference, employeeId: row.employeeId, employee: row.employeeName, employeeCode: meta.employeeId, businessUnitId: meta.businessUnitId, businessUnit: meta.businessUnit, departmentId: meta.departmentId, department: meta.department, start: row.createdAt, end: row.effectiveDate, duration: `Effective ${fmtDate(row.effectiveDate)}`, status: row.status, currentStep: row.currentStep, details: row.action, bulkSelectable: false, reviewUrl: getApprovalReviewUrl('pan', row.id) };
    });
    const requisitions: ApprovalItem[] = additional.pendingRequisitionApprovals.map(row => ({ id: row.id, canonicalKey: row.canonicalKey, kind: 'requisition', reference: row.reference, employee: row.title, businessUnitId: row.businessUnitId, businessUnit: businessUnitLabels[row.businessUnitId || ''] || 'Not assigned', departmentId: row.departmentId, department: departmentLabels[row.departmentId || ''] || 'Not assigned', start: row.createdAt, end: row.createdAt, duration: 'Routing workflow', status: row.status, currentStep: row.currentStep, bulkSelectable: false, reviewUrl: getApprovalReviewUrl('requisition', row.id) }));
    const awardItems: ApprovalItem[] = additional.pendingAwardApprovals.map(row => {
      const meta = metaFor(row.employeeId);
      return { id: row.id, canonicalKey: row.canonicalKey, kind: 'award', reference: row.reference, employeeId: row.employeeId, employee: row.employeeName, employeeCode: meta.employeeId, businessUnitId: row.businessUnitId || meta.businessUnitId, businessUnit: businessUnitLabels[row.businessUnitId || ''] || meta.businessUnit, departmentId: row.departmentId || meta.departmentId, department: departmentLabels[row.departmentId || ''] || meta.department, start: row.createdAt, end: row.createdAt, duration: `${dayAge(row.createdAt)} day${dayAge(row.createdAt) === 1 ? '' : 's'} pending`, status: row.status, currentStep: row.currentStep, details: row.awardTitle, bulkSelectable: false, reviewUrl: getApprovalReviewUrl('award', row.id) };
    });
    const offerItems: ApprovalItem[] = additional.pendingOfferApprovals.map(row => ({
      id: row.id,
      canonicalKey: row.canonicalKey,
      kind: 'offer',
      reference: row.reference,
      employeeId: row.candidateId,
      employee: row.candidateName,
      businessUnit: row.businessUnit,
      department: 'Recruitment',
      start: row.createdAt,
      end: row.createdAt,
      duration: `Offer approval · ${row.jobTitle}`,
      status: row.status,
      currentStep: row.currentStep,
      approvalStep: row.currentStep,
      details: row.jobTitle,
      bulkSelectable: false,
      reviewUrl: getApprovalReviewUrl('offer', row.id),
    }));
    const canonical = new Map<string, ApprovalItem>();
    [...ntes, ...pans, ...awardItems, ...offerItems, ...wfh, ...leave, ...overtime, ...requisitions, ...manpower].forEach(item => { if (!canonical.has(item.canonicalKey)) canonical.set(item.canonicalKey, item); });
    return Array.from(canonical.values());
  }, [approvals, additional, employeeMeta, businessUnitLabels, departmentLabels]);

  const filtered = useMemo(() => items.filter(item => {
    const query = filters.search.trim().toLowerCase(), age = dayAge(item.start);
    if (query && !`${item.employee} ${item.employeeCode || ''} ${item.reference} ${item.details || ''} ${item.reason || ''}`.toLowerCase().includes(query)) return false;
    if (filters.businessUnit && item.businessUnitId !== filters.businessUnit) return false;
    if (filters.department && item.departmentId !== filters.department) return false;
    if (filters.kind && item.kind !== filters.kind) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.dateFrom && item.start < new Date(`${filters.dateFrom}T00:00:00`)) return false;
    if (filters.dateTo && item.start > new Date(`${filters.dateTo}T23:59:59`)) return false;
    if ((filters.age === 'today' || filters.quick === 'today') && age !== 0) return false;
    if ((filters.age === 'overdue' || filters.quick === 'overdue') && age < 3) return false;
    if (filters.quick === 'exceptions' && !needsIndividualReview(item)) return false;
    return true;
  }).sort((a, b) => filters.sort === 'newest' ? b.start.getTime() - a.start.getTime() : a.start.getTime() - b.start.getTime()), [items, filters]);

  const activeGroupKinds = useMemo(() => GROUP_ORDER.filter(kind => filtered.some(item => item.kind === kind)), [filtered]);
  const groups = useMemo(() => activeGroupKinds.map(kind => ({ kind, items: filtered.filter(item => item.kind === kind) })), [activeGroupKinds, filtered]);
  useEffect(() => {
    const requestedKind = filters.kind as Kind;
    const preferred = requestedKind && activeGroupKinds.includes(requestedKind) ? requestedKind : activeGroupKinds[0] || null;
    setExpanded(current => current && activeGroupKinds.includes(current) ? current : preferred);
  }, [activeGroupKinds, filters.kind]);
  const exceptionCount = filtered.filter(needsIndividualReview).length;
  const dueTodayCount = filtered.filter(item => dayAge(item.start) === 0).length;
  const overdueCount = filtered.filter(item => dayAge(item.start) >= 3).length;
  const managerOnlyCount = filtered.filter(item => item.route === 'MANAGER_ONLY').length;
  const bodRequiredCount = filtered.filter(item => item.route === 'BOD_REQUIRED').length;
  const businessUnits = Array.from(new Map(items.filter(item => item.businessUnitId).map(item => [item.businessUnitId!, item.businessUnit])).entries());
  const departments = Array.from(new Map(items.filter(item => item.departmentId).map(item => [item.departmentId!, item.department])).entries());
  const statuses: string[] = Array.from(new Set<string>(items.map(item => item.status))).sort();
  const appliedFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (key === 'sort') return value !== DEFAULT_FILTERS.sort;
    if (key === 'quick') return value !== 'all';
    return Boolean(value);
  }).length;

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
    {requestedItem && requestedType !== 'offer' && !approvals.approvalsLoading && !items.some(item => item.id === requestedItem) && !error && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><b>This request is no longer awaiting your action.</b> It may already be processed, reassigned, or outside your authorized scope.</div>}
    {!approverConfigs.conditionalTimeApprovals.valid && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900"><b>Conditional approval routing needs an Admin.</b> {approverConfigs.conditionalTimeApprovals.invalid_reason || 'At least one active BOD approver must be selected.'}</div>}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{[['Pending approvals', filtered.length, 'bg-blue-50 text-blue-700'], ['Manager only', managerOnlyCount, 'bg-emerald-50 text-emerald-700'], ['BOD required', bodRequiredCount, 'bg-violet-50 text-violet-700'], ['Due today', dueTodayCount, 'bg-orange-50 text-orange-700'], ['Overdue', overdueCount, 'bg-red-50 text-red-700'], ['High risk / exceptions', exceptionCount, 'bg-amber-50 text-amber-700']].map(([label, value, color]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800 sm:p-5"><div className={`inline-flex rounded-lg px-3 py-1 text-2xl font-bold ${color}`}>{value}</div><p className="mt-2 text-sm text-slate-600 dark:text-slate-200">{label}</p></div>)}</div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
      <div className="flex items-center justify-between gap-3 lg:hidden"><div><h2 className="font-bold">Filter requests</h2><p className="text-sm text-slate-500 dark:text-slate-300">{appliedFilterCount ? `${appliedFilterCount} filter${appliedFilterCount === 1 ? '' : 's'} applied` : 'Showing all pending requests'}</p></div><button type="button" onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen} aria-controls="approval-filters" className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 dark:border-slate-500 dark:text-white">{filtersOpen ? 'Hide filters' : 'Open filters'}</button></div>
      <div id="approval-filters" className={`${filtersOpen ? 'mt-4 block' : 'hidden'} lg:block`}>
        <div className="mb-3 grid gap-3 sm:grid-cols-3"><label className="text-sm font-semibold text-slate-700 dark:text-slate-100">Date from<input type="date" aria-label="Date from" value={filters.dateFrom} onChange={event => setFilters({ ...filters, dateFrom: event.target.value })} className={`mt-1 block w-full font-normal ${controlClasses}`} /></label><label className="text-sm font-semibold text-slate-700 dark:text-slate-100">Date to<input type="date" aria-label="Date to" value={filters.dateTo} onChange={event => setFilters({ ...filters, dateTo: event.target.value })} className={`mt-1 block w-full font-normal ${controlClasses}`} /></label><label className="text-sm font-semibold text-slate-700 dark:text-slate-100">Approver scope<select aria-label="Approver scope" disabled className={`mt-1 block w-full font-normal disabled:cursor-not-allowed disabled:opacity-100 dark:disabled:bg-slate-600 dark:disabled:text-slate-100 ${controlClasses}`}><option>My authorized scope</option></select></label></div>
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8"><input aria-label="Approval search" value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} placeholder="Employee, NTE, PAN, case or request ID" className={`md:col-span-2 ${controlClasses}`} /><select aria-label="Business unit" value={filters.businessUnit} onChange={event => setFilters({ ...filters, businessUnit: event.target.value })} className={controlClasses}><option value="">All business units</option>{businessUnits.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><select aria-label="Department" value={filters.department} onChange={event => setFilters({ ...filters, department: event.target.value })} className={controlClasses}><option value="">All departments</option>{departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><select aria-label="Request type" value={filters.kind} onChange={event => setFilters({ ...filters, kind: event.target.value })} className={controlClasses}><option value="">All request types</option>{GROUP_ORDER.map(id => <option key={id} value={id}>{KIND_META[id].title}</option>)}</select><select aria-label="Approval status" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })} className={controlClasses}><option value="">All statuses</option>{statuses.map(status => <option key={status} value={status}>{getApprovalStatusLabel(status)}</option>)}</select><select aria-label="Age of request" value={filters.age} onChange={event => setFilters({ ...filters, age: event.target.value })} className={controlClasses}><option value="">Any age</option><option value="today">Due today</option><option value="overdue">Overdue (3+ days)</option></select><select aria-label="Sort approvals" value={filters.sort} onChange={event => setFilters({ ...filters, sort: event.target.value })} className={controlClasses}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="age">Days pending</option></select></div>
        <div className="mt-3 flex flex-wrap gap-2">{[['all', 'All pending'], ['exceptions', 'Exceptions'], ['today', 'Due today'], ['overdue', 'Overdue']].map(([id, label]) => <button key={id} onClick={() => setFilters({ ...filters, quick: id })} className={`min-h-10 rounded-full px-3 py-1.5 text-sm font-semibold ${filters.quick === id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-600 dark:text-white'}`}>{label}</button>)}</div>
        <div className="mt-4 flex flex-wrap justify-end gap-2 lg:hidden"><button type="button" onClick={() => setFilters({ ...DEFAULT_FILTERS })} className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold dark:border-slate-500">Clear filters</button><button type="button" onClick={() => setFiltersOpen(false)} className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white">Apply filters</button></div>
      </div>
    </div>
    <div>
      <div className="space-y-3">{groups.map(group => {
        const selectableRequests = group.items.filter(item => item.bulkSelectable);
        const exceptions = group.items.filter(needsIndividualReview);
        const checked = selectableRequests.filter(item => selected.has(item.canonicalKey));
        const oldest = group.items.reduce((left, right) => left.start < right.start ? left : right);
        const individualOnly = !BULK_KINDS.has(group.kind);
        const displayTitle = KIND_META[group.kind].title;
        const isTimeGroup = TIME_KINDS.has(group.kind);
        const desktopHeadings = group.kind === 'overtime' ? OVERTIME_DESKTOP_HEADINGS : isTimeGroup ? TIME_DESKTOP_HEADINGS : GENERIC_DESKTOP_HEADINGS;
        return <section key={group.kind} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
          <div className="flex flex-wrap items-center gap-3 p-4">
            <button aria-label={`Toggle ${displayTitle}`} onClick={() => setExpanded(expanded === group.kind ? null : group.kind)} className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-xl text-slate-700 hover:bg-slate-100 dark:text-white dark:hover:bg-slate-700">{expanded === group.kind ? '⌄' : '›'}</button>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${KIND_META[group.kind].badge}`}>{KIND_META[group.kind].title}</span>
            <div className="min-w-0 flex-[1_1_15rem]"><h2 className="font-bold text-slate-900 dark:text-white">{displayTitle} — {group.items.length} pending</h2><p className="text-sm text-slate-500 dark:text-slate-300">{KIND_META[group.kind].rule}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-300">Oldest {dayAge(oldest.start)} days · {new Set(group.items.map(item => item.employeeId).filter(Boolean)).size} employees</p></div>
            {!!exceptions.length && <button onClick={() => { setExpanded(group.kind); setFilters({ ...filters, quick: 'exceptions' }); }} className="min-h-11 font-semibold text-indigo-600 dark:text-indigo-300">Review exceptions ({exceptions.length})</button>}
            {individualOnly ? <button onClick={() => setExpanded(group.kind)} className="min-h-11 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white">Review queue</button> : <Button variant="success" disabled={!selectableRequests.length} onClick={() => openConfirm(group.kind, selectableRequests.map(item => item.id))}>Approve all pending — {selectableRequests.length}</Button>}
          </div>
          {expanded === group.kind && <div className="border-t border-slate-200 dark:border-slate-600">
            {!individualOnly && <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-sm dark:bg-slate-700 dark:text-slate-100"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={selectableRequests.length > 0 && checked.length === selectableRequests.length} onChange={event => { const next = new Set(selected); selectableRequests.forEach(item => event.target.checked ? next.add(item.canonicalKey) : next.delete(item.canonicalKey)); setSelected(next); }} /> Select all pending requests ({selectableRequests.length})</label><Button size="sm" disabled={!checked.length} onClick={() => openConfirm(group.kind, checked.map(item => item.id))}>Approve selected — {checked.length}</Button></div>}
            <div className="space-y-3 bg-slate-50 p-3 dark:bg-slate-900/40 lg:hidden">{group.items.map(item => <ApprovalMobileCard key={item.canonicalKey} item={item} requested={requestedItem === item.id} selected={selected.has(item.canonicalKey)} onSelect={checkedItem => { const next = new Set(selected); checkedItem ? next.add(item.canonicalKey) : next.delete(item.canonicalKey); setSelected(next); }} />)}</div>
            <div className="hidden overflow-x-auto lg:block"><table className={`${group.kind === 'overtime' ? 'min-w-[1320px]' : isTimeGroup ? 'min-w-[1120px]' : 'min-w-full'} text-sm`}>
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-700 dark:text-slate-200"><tr>{desktopHeadings.map((heading, index) => <th key={heading} className={`${index === 0 ? 'w-16' : ''} ${heading === 'Action' ? 'sticky right-0 z-20 bg-slate-50 shadow-[-10px_0_12px_-12px_rgba(15,23,42,0.45)] dark:bg-slate-700' : ''} px-4 py-3`}>{heading}</th>)}</tr></thead>
              <tbody>{group.items.map(item => {
                const reason = eligibilityReason(item);
                const week = getOvertimeWeekDetails(item.approvalContext);
                return <tr id={`approval-${item.id}`} key={item.canonicalKey} className={`border-t border-slate-200 align-top dark:border-slate-600 ${requestedItem === item.id ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-300 dark:bg-indigo-950' : ''}`}>
                  <td className="px-4 py-4">{item.bulkSelectable && <input type="checkbox" aria-label={`Select ${item.reference} for bulk approval`} checked={selected.has(item.canonicalKey)} onChange={event => { const next = new Set(selected); event.target.checked ? next.add(item.canonicalKey) : next.delete(item.canonicalKey); setSelected(next); }} />}</td>
                  <td className="px-4 py-4 font-semibold"><div className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">{item.reference}</div>{item.employee}<div className="text-xs font-normal text-slate-500 dark:text-slate-300">{item.employeeCode || 'No employee ID'}</div></td>
                  <td className="px-4 py-4">{item.businessUnit}<div className="text-xs text-slate-500 dark:text-slate-300">{item.department}</div></td>
                  {isTimeGroup ? <>
                    <td className="min-w-48 px-4 py-4">
                      <div className="font-medium text-slate-900 dark:text-white">{group.kind === 'overtime' ? fmtDate(item.requestStart || item.start) : fmtDateRange(item.requestStart, item.requestEnd)}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">{group.kind === 'overtime' ? 'Overtime' : group.kind === 'leave' ? 'Duration' : 'WFH duration'} <span className="font-semibold text-slate-700 dark:text-slate-100">{item.duration}</span></div>
                    </td>
                    {group.kind === 'overtime' && <td className="min-w-40 px-4 py-4"><div className="font-semibold text-slate-900 dark:text-white">{week.dateRange || '—'}</div>{week.workweekNote && <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">{week.workweekNote}</div>}</td>}
                    <td className="whitespace-nowrap px-4 py-4"><div className="font-medium">{fmtDate(item.start)}</div><div className={`mt-1 text-xs ${dayAge(item.start) >= 3 ? 'font-semibold text-red-600 dark:text-red-300' : 'text-slate-500 dark:text-slate-300'}`}>{dayAge(item.start)} day{dayAge(item.start) === 1 ? '' : 's'} pending</div></td>
                    <td className="min-w-48 px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isBodApprovalStatus(item.status) ? 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>{item.approvalStep || getApprovalActionLabel(item.status)}</span></td>
                    <td className="min-w-64 max-w-sm px-4 py-4"><div className={`rounded-lg border px-3 py-2 ${reasonTone(item)}`}><div className="flex items-start gap-2"><span aria-hidden="true">{needsIndividualReview(item) ? '⚠' : '✓'}</span><p><span className="font-bold">{eligibilityLabel(item)} — </span>{reason}</p></div>{group.kind === 'overtime' && week.weeklyOt && <div className="mt-2 border-t border-current/20 pt-2 text-xs"><span className="font-semibold">Weekly OT:</span> {week.weeklyOt}</div>}{item.nextStep && <div className="mt-1 text-xs font-semibold text-violet-700 dark:text-violet-200">{item.nextStep}</div>}</div></td>
                  </> : <>
                    <td className="whitespace-nowrap px-4 py-4">{fmtDate(item.start)}<div className={`text-xs ${dayAge(item.start) >= 3 ? 'font-semibold text-red-600 dark:text-red-300' : 'text-slate-500 dark:text-slate-300'}`}>{dayAge(item.start)} day{dayAge(item.start) === 1 ? '' : 's'} pending · {item.duration}</div></td>
                    <td className="px-4 py-4 font-medium">{item.currentStep}</td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isBodApprovalStatus(item.status) ? 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>{getApprovalStatusLabel(item.status)}</span></td>
                    <td className="max-w-xs px-4 py-4"><div className={`rounded-lg border px-3 py-2 text-sm ${reasonTone(item)}`}><span aria-hidden="true" className="mr-2">{needsIndividualReview(item) ? '⚠' : '✓'}</span>{reason}</div></td>
                  </>}
                  <td className="sticky right-0 z-10 bg-white px-4 py-4 shadow-[-10px_0_12px_-12px_rgba(15,23,42,0.45)] dark:bg-slate-800"><Link className="inline-flex min-h-11 whitespace-nowrap items-center font-semibold text-indigo-600 dark:text-indigo-300" to={item.reviewUrl}>Review request →</Link></td>
                </tr>;
              })}</tbody>
            </table></div>
          </div>}
        </section>;
      })}{!groups.length && !error && <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-600 dark:bg-slate-800"><p className="text-lg font-bold text-slate-900 dark:text-white">{items.length ? 'No pending approvals match your filters.' : 'No pending approvals'}</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-300">{items.length ? 'Try clearing a filter to see the active queues.' : 'You are all caught up.'}</p></div>}</div>
    </div>
    {confirming && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-600 dark:bg-slate-800 dark:text-white"><h2 className="text-xl font-bold">Approve {confirming.ids.length} {KIND_META[confirming.kind].title} request{confirming.ids.length === 1 ? '' : 's'}?</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-200"><li>{confirming.ids.length} requests currently shown in your assigned scope will be processed.</li><li>Requests that changed, are no longer assigned to you, or require another approver are safely skipped.</li><li>Each request keeps its own history and audit record.</li><li>Employees are notified using existing settings.</li></ul><label className="mt-5 flex gap-3 rounded-lg bg-slate-50 p-4 font-semibold dark:bg-slate-700 dark:text-white"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> I confirm these requests meet policy.</label>{result?.error && <p role="alert" className="mt-4 text-red-700 dark:text-red-300">{result.error}</p>}{result && !result.error && <div className={`mt-4 rounded-lg p-4 text-sm ${result.failed ? 'bg-red-50 text-red-800' : result.skipped ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`}><div><b>{result.succeeded} approved</b> · {result.skipped} skipped · {result.failed} failed</div>{result.skippedItems?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{Array.from(new Set(result.skippedItems.map((item: any) => item.reason))).map((reason: any) => <li key={String(reason)}>{String(reason)}</li>)}</ul>}{result.failures?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{Array.from(new Set(result.failures.map((item: any) => item.error))).map((failure: any) => <li key={String(failure)}>{String(failure)}</li>)}</ul>}</div>}<div className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={() => { setConfirming(null); setResult(null); }}>{result && !result.error ? 'Close' : 'Cancel'}</Button><Button disabled={!confirmed || busy || !!(result && !result.error)} isLoading={busy} onClick={runBulk}>Approve {confirming.ids.length} requests</Button></div></div></div>}
    <LeaveRequestModal
      isOpen={Boolean(requestedLeave)}
      onClose={closeRequestedReview}
      request={requestedLeave}
      leaveTypes={approvals.leaveTypes}
      onSave={() => {}}
      onApprove={async (request, approved, notes) => {
        await approvals.handleLeaveApproval(request, approved, notes);
        closeRequestedReview();
      }}
    />
    <WFHReviewModal
      isOpen={Boolean(requestedWfh)}
      onClose={closeRequestedReview}
      request={requestedWfh}
      onApprove={async requestId => {
        await approvals.handleApproveWFH(requestId);
        closeRequestedReview();
      }}
      onReject={async (requestId, reason) => {
        await approvals.handleRejectWFH(requestId, reason);
        closeRequestedReview();
      }}
    />
    <OTRequestModal
      isOpen={Boolean(requestedOvertime)}
      onClose={closeRequestedReview}
      requestToEdit={requestedOvertime}
      attendanceRecords={[]}
      shiftAssignments={[]}
      shiftTemplates={[]}
      canApproveOverride={Boolean(requestedOvertime)}
      onSave={() => {}}
      onApproveOrReject={async (request, status, details) => {
        await approvals.handleApproveRejectOT(request, status as OTStatus.Approved | OTStatus.Rejected, details);
        closeRequestedReview();
      }}
    />
    <ManpowerReviewModal
      isOpen={Boolean(requestedManpower)}
      onClose={closeRequestedReview}
      request={requestedManpower}
      onApprove={async (requestId, comments) => {
        await approvals.handleApproveManpower(requestId, comments);
        closeRequestedReview();
      }}
      onReject={async (requestId, reason) => {
        await approvals.handleRejectManpower(requestId, reason);
        closeRequestedReview();
      }}
      canApprove={Boolean(requestedManpower)}
    />
    <OfferApprovalReviewModal
      isOpen={requestedType === 'offer' && Boolean(requestedItem)}
      requestId={requestedType === 'offer' ? requestedItem : null}
      onClose={closeRequestedReview}
      onProcessed={() => { void additional.refreshAdditionalApprovals(); }}
    />
  </div>;
}
