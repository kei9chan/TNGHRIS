import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ManpowerApprovalStage, ManpowerRequest, ManpowerRequestStatus } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import {
  coverageRangeLabel,
  coverageTotals,
  deriveCoverageDay,
  formatCoverageDate,
  getOnCallWarnings,
} from '../../modules/payroll/onCallRequestModel';

interface ManpowerReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: ManpowerRequest | null;
  onApprove: (requestId: string, comments?: string) => void | Promise<void>;
  onReject: (requestId: string, reason: string) => void | Promise<void>;
  onClarify: (requestId: string, question: string) => void | Promise<void>;
  onEditRequest?: (request: ManpowerRequest) => void;
  canApprove?: boolean;
  isRequester?: boolean;
}

const stageLabel = (request: ManpowerRequest) => {
  if (request.status === ManpowerRequestStatus.Approved || request.approvalStage === ManpowerApprovalStage.Completed) return 'Approved';
  if (request.status === ManpowerRequestStatus.Rejected || request.approvalStage === ManpowerApprovalStage.Rejected) return 'Rejected';
  if (request.clarificationStatus === 'requested') return 'Clarification requested';
  if (request.approvalStage === ManpowerApprovalStage.BodGm) return 'Pending Board of Director Approval';
  if (request.approvalRouteSnapshot?.[request.approvalRouteStep || 0]?.organizationalLevel === 'GENERAL_MANAGER') return 'Pending General Manager Approval';
  return 'Pending Business Unit Manager';
};

const statusClasses = (label: string) => label === 'Approved'
  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
  : label === 'Rejected'
    ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
    : label === 'Clarification requested'
      ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200'
      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

const ManpowerReviewModal: React.FC<ManpowerReviewModalProps> = ({
  isOpen, onClose, request, onApprove, onReject, onClarify, onEditRequest,
  canApprove = false, isRequester = false,
}) => {
  const actionLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMode, setActionMode] = useState<'none' | 'reject' | 'clarify'>('none');
  const [actionText, setActionText] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setActionMode('none'); setActionText(''); setActionError('');
  }, [isOpen, request?.id]);

  const runAction = async (action: () => void | Promise<void>) => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setActionError('');
    try { await action(); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Unable to save this action. Please retry.'); }
    finally { actionLock.current = false; setBusy(false); }
  };

  if (!request) return null;
  const days = (request.coverageDays || []).map(deriveCoverageDay);
  const totals = coverageTotals(days);
  const currentStage = stageLabel(request);
  const canAct = canApprove && request.status === ManpowerRequestStatus.Pending
    && request.clarificationStatus !== 'requested'
    && [ManpowerApprovalStage.BusinessUnitManager, ManpowerApprovalStage.BodGm].includes(request.approvalStage as ManpowerApprovalStage);
  const hasReviewableCoverage = days.length > 0
    && days.some(day => day.coverageRequired)
    && days.filter(day => day.coverageRequired).every(day => Boolean(day.date) && day.items.length > 0);
  const warnings = getOnCallWarnings(days, request.generalNote);
  const reasons = [...new Set(days.flatMap(day => day.items.map(item => item.reason || item.justification).filter(Boolean)))];
  const mainReason = reasons.join(' · ') || request.generalNote || 'No operational reason was provided.';
  const primaryShift = [...new Set(days.flatMap(day => day.items.map(item => item.shiftTime).filter(Boolean)))].join(' · ') || 'Not specified';
  const directRouting = request.approvalTrail?.some(entry => /manager stage not required|Routing corrected/.test(entry.action));
  const route = request.approvalRouteSnapshot || [];
  const routeStep = request.approvalRouteStep || 0;
  const pendingRouteApprover = route[routeStep]?.approverName || request.approvalTrail?.find(entry => entry.newStage === request.approvalStage)?.assignedApproverName;
  const finalRouteApprover = route[route.length - 1]?.approverName || route[route.length - 1]?.approverUserId;

  const submitAction = () => {
    if (actionMode === 'reject') {
      if (!actionText.trim()) return setActionError('A rejection reason is required.');
      void runAction(() => onReject(request.id, actionText.trim()));
    } else if (actionMode === 'clarify') {
      if (!actionText.trim()) return setActionError('Enter the specific question the requester must answer.');
      void runAction(() => onClarify(request.id, actionText.trim()));
    }
  };

  const footer = (
    <div className="flex flex-col gap-3">
      {actionError && <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-800 dark:bg-red-950 dark:text-red-100">{actionError}</p>}
      {actionMode !== 'none' && canAct && <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <Textarea label={actionMode === 'reject' ? 'Required rejection reason' : 'What must the requester clarify?'} value={actionText} onChange={event => setActionText(event.target.value)} autoFocus required placeholder={actionMode === 'clarify' ? 'Ask a specific operational, staffing, date, shift, or cost question.' : 'Explain why this request is rejected.'} />
        <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => { setActionMode('none'); setActionText(''); }}>Cancel</Button><Button size="sm" variant={actionMode === 'reject' ? 'danger' : 'primary'} disabled={busy} onClick={submitAction}>{busy ? 'Saving…' : actionMode === 'reject' ? 'Confirm rejection' : 'Send clarification'}</Button></div>
      </div>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        {canAct && <><Button variant="danger" disabled={busy} onClick={() => { setActionMode('reject'); setActionText(''); }}>Reject</Button><Button variant="secondary" disabled={busy} onClick={() => { setActionMode('clarify'); setActionText(''); }}>Request clarification</Button><Button variant="success" isLoading={busy} disabled={!hasReviewableCoverage} title={!hasReviewableCoverage ? 'Coverage dates and staffing details are required before approval.' : undefined} onClick={() => { if (!hasReviewableCoverage) { setActionError('Approval is disabled because the coverage dates or staffing details are incomplete. Request clarification instead.'); return; } void runAction(() => onApprove(request.id)); }}>Approve</Button></>}
        {isRequester && request.clarificationStatus === 'requested' && onEditRequest && <Button onClick={() => onEditRequest(request)}>Respond and update request</Button>}
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`On-Call Request · ${request.businessUnitName}`} size="4xl" viewportFit footer={footer}>
      <div className="space-y-4 pb-1 text-slate-950 dark:text-white">
        <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-indigo-50 dark:border-indigo-900 dark:from-indigo-950/50 dark:via-slate-900 dark:to-indigo-950/30">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div><p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">On-call coverage needed</p><h2 className="mt-1 text-2xl font-black uppercase tracking-tight sm:text-3xl">{coverageRangeLabel(days)}</h2><div className="mt-3 flex flex-wrap gap-2">{days.map(day => <span key={day.date} className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold sm:text-sm ${day.coverageRequired ? 'border-indigo-300 bg-white text-indigo-800 dark:bg-slate-800 dark:text-indigo-200' : 'border-slate-300 bg-slate-100 text-slate-500 line-through dark:bg-slate-800'}`}>{formatCoverageDate(day.date, true)}{!day.coverageRequired && ' · No coverage'}</span>)}</div></div>
            <div className="shrink-0 sm:text-right"><p className="text-2xl font-black text-orange-600 dark:text-orange-300">{totals.staffDays} <span className="text-base">staff-days</span></p><p className="text-sm font-semibold text-slate-500">{totals.coverageDays} coverage {totals.coverageDays === 1 ? 'day' : 'days'}</p><span className={`mt-2 inline-flex rounded-full px-3 py-1.5 text-sm font-bold ${statusClasses(currentStage)}`}>{currentStage}</span></div>
          </div>
        </section>

        {!hasReviewableCoverage && <section role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100"><p className="font-black">Request details are incomplete</p><p className="mt-1 text-sm font-semibold">Coverage dates or staffing details could not be loaded. Approval is disabled; request clarification or reject this request.</p></section>}

        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6 dark:border-slate-700 dark:bg-slate-900">
          <div className="lg:col-span-2"><p className="text-xs font-bold uppercase text-slate-500">On-Call Request</p><p className="mt-1 text-xl font-black">{request.businessUnitName}</p></div>
          <div><p className="text-xs font-bold uppercase text-slate-500">Requested by</p><p className="mt-1 font-bold">{request.requesterName}</p></div>
          <div className="lg:col-span-2"><p className="text-xs font-bold uppercase text-slate-500">Event / Operational Context</p><p className="mt-1 font-bold">{request.generalNote || 'Not provided'}</p></div>
          <div><p className="text-xs font-bold uppercase text-slate-500">Forecasted pax</p><p className="mt-1 font-bold">{days.reduce((sum, day) => sum + day.forecastedPax, 0)}</p></div>
        </section>

        <section className={`rounded-2xl border-2 p-4 ${warnings.some(warning => warning.id.startsWith('reason-')) ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20' : 'border-indigo-100 bg-white dark:border-indigo-900 dark:bg-slate-900'}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-black text-slate-600 dark:text-slate-300">Why is on-call needed?</p><p className="mt-1 text-xl font-black sm:text-2xl">{mainReason}</p></div>{warnings.some(warning => warning.id.startsWith('reason-')) && <span className="rounded-full bg-amber-200 px-3 py-1.5 text-sm font-black text-amber-900">Needs clarification</span>}</div>
          {warnings.some(warning => warning.id.startsWith('reason-')) && <p className="mt-3 font-semibold text-amber-800 dark:text-amber-200">Needs clarification — the reason should explain the operational need.</p>}
        </section>

        {request.clarificationStatus === 'requested' && <section className="rounded-2xl border border-violet-300 bg-violet-50 p-4 dark:border-violet-800 dark:bg-violet-950/30"><p className="text-xs font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">Approver question</p><p className="mt-2 text-lg font-bold">{request.clarificationQuestion}</p>{isRequester && onEditRequest && <Button className="mt-4" onClick={() => onEditRequest(request)}>Respond and update request</Button>}</section>}

        {warnings.length > 0 && <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20"><h3 className="text-lg font-black text-amber-950 dark:text-amber-100">Needs attention</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{warnings.map(warning => <div key={warning.id} className="rounded-xl bg-white/80 px-3 py-2 text-sm font-semibold text-amber-900 dark:bg-slate-900/60 dark:text-amber-100">⚠ {warning.label}</div>)}</div></section>}

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"><p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">Total estimated cost</p><p className="mt-1 text-3xl font-black text-emerald-700 dark:text-emerald-300">{peso(totals.cost)}</p><p className="text-sm text-emerald-800 dark:text-emerald-200">{totals.staffDays} staff-days across {totals.coverageDays} days</p></div>
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-900 dark:bg-orange-950/20"><p className="text-sm font-bold text-orange-800 dark:text-orange-200">Manpower gap</p><p className="mt-1 text-3xl font-black text-orange-600 dark:text-orange-300">{totals.staffDays}</p><p className="text-sm text-orange-800 dark:text-orange-200">On-call needed = Required FTE − Reporting FTE</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><p className="text-sm font-bold text-slate-500">Shift coverage</p><p className="mt-1 text-lg font-black">{primaryShift}</p><p className="text-sm text-slate-500">Review each date for exceptions.</p></div>
        </section>

        <section><div className="mb-3"><h3 className="text-xl font-black">Daily coverage details</h3><p className="text-sm text-slate-500">Every date is shown. Expand a day to inspect departments, reasons, rates, and calculations.</p></div><div className="space-y-3">{days.map(day => <details key={day.date} open={days.length <= 2} className="group rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><summary className="flex cursor-pointer list-none flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-lg font-black">{formatCoverageDate(day.date)}</p><p className="text-sm text-slate-500">{day.coverageRequired ? `${day.totalStaff} staff · ${day.items.length} department${day.items.length === 1 ? '' : 's'}` : 'No coverage needed'}</p></div><div className="flex items-center gap-4"><strong className="text-xl text-emerald-700 dark:text-emerald-300">{peso(day.totalCost)}</strong><span className="text-slate-400 group-open:rotate-180">⌄</span></div></summary>{day.coverageRequired && <div className="border-t border-slate-200 p-4 dark:border-slate-700"><div className="grid gap-3 lg:grid-cols-2">{day.items.map((item, index) => <article key={`${day.date}-${item.departmentId}-${index}`} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{item.departmentName || item.role || 'Department not specified'}</p><p className="mt-1 text-sm text-slate-500">{item.shiftTime || 'Shift not specified'}</p></div><strong className="text-emerald-700 dark:text-emerald-300">{peso(Number(item.totalItemCost || 0))}</strong></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div><p className="text-xs font-bold uppercase text-slate-500">Required</p><p className="text-xl font-black">{item.requiredFte || 0}</p></div><div><p className="text-xs font-bold uppercase text-slate-500">Reporting</p><p className="text-xl font-black">{item.reportingFte || 0}</p></div><div className="rounded-lg bg-orange-50 p-2 dark:bg-orange-950/30"><p className="text-xs font-bold uppercase text-orange-600">On-call</p><p className="text-xl font-black text-orange-600">{item.onCallNeeded || 0}</p></div></div><div className="mt-4 border-t border-slate-100 pt-3 text-sm dark:border-slate-800"><p><strong>Rate:</strong> {peso(Number(item.ratePerDay || 0))}/day</p><p className="mt-1"><strong>Reason:</strong> {item.reason || item.justification || day.reason || 'Not provided'}</p>{item.departmentNote && <p className="mt-1 text-slate-500">{item.departmentNote}</p>}</div></article>)}</div></div>}</details>)}</div></section>

        {route.length > 0 && <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/30"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black">Approval route</h3><p className="text-sm text-slate-600 dark:text-slate-300">Current step: {request.status === ManpowerRequestStatus.Approved ? 'Complete' : `${Math.min(routeStep + 1, route.length)} of ${route.length}`}</p></div><p className="text-sm"><strong>Final approver:</strong> {finalRouteApprover || 'Board of Director'}</p></div><ol className="mt-3 space-y-2">{route.map((step, index) => { const completed = request.status === ManpowerRequestStatus.Approved || index < routeStep; const pending = request.status === ManpowerRequestStatus.Pending && index === routeStep; const label = step.organizationalLevel === 'BUSINESS_UNIT_HEAD' ? 'Business Unit Manager' : step.organizationalLevel === 'GENERAL_MANAGER' ? 'General Manager' : 'Board of Director'; return <li key={`${step.approverUserId}-${index}`} className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm dark:bg-slate-900/50"><span className="font-bold">{index + 1}.</span><span>{label}{step.approverName ? ` — ${step.approverName}` : ''}</span><span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${completed ? 'bg-emerald-100 text-emerald-800' : pending ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{completed ? 'Completed' : pending ? 'Pending approver' : 'Waiting'}</span></li>; })}</ol><p className="mt-3 text-sm"><strong>Pending approver:</strong> {request.status === ManpowerRequestStatus.Pending ? pendingRouteApprover || 'Assigned approver' : 'None'}</p><p className="mt-1 text-xs text-slate-500">Routing rule: {request.routingBasis === 'BUM_THEN_BOD' ? 'Business Unit Manager → Board of Director' : request.routingBasis === 'BUM_THEN_GM_THEN_BOD' ? 'Business Unit Manager → configured General Manager review → Board of Director' : request.routingBasis === 'DIRECT_BOD_REPORT' ? 'Direct BOD report → Board of Director' : request.routingBasis === 'BUM_REQUESTER' ? 'Requester is Business Unit Manager → Board of Director' : request.routingBasis || 'Approved route snapshot'}</p></section>}
        <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50"><summary className="cursor-pointer font-black">Approval history · {request.approvalTrail?.length || 0} records</summary><div className="mt-4 space-y-3">{request.approvalTrail?.map((entry, index) => <div key={`${entry.timestamp}-${index}`} className="border-l-2 border-indigo-300 pl-4"><p className="font-bold">{entry.action} · {entry.stage === ManpowerApprovalStage.BodGm ? 'Board of Director Approval' : entry.stage}</p><p className="text-sm text-slate-500">{entry.approverName} · {entry.approverRole} · {new Date(entry.timestamp).toLocaleString()}</p>{entry.comments && <p className="mt-1 text-sm">{entry.comments}</p>}</div>)}{!request.approvalTrail?.length && <p className="text-sm text-slate-500">No approval records yet.</p>}</div></details>
        {directRouting && <p className="rounded-xl bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">This requester reports directly to the BOD, so the Business Unit Manager step is not required.</p>}
      </div>
    </Modal>
  );
};

export default ManpowerReviewModal;
