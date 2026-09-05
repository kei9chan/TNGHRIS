import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Permission } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import {
  fetchPayrollScheduleChangeRequests,
  fetchPayrollScheduleWorkflowContext,
  fetchPayrollShiftSwapRequests,
  PayrollScheduleChangeRequest,
  PayrollScheduleOption,
  PayrollScheduleWorkflowContext,
  PayrollShiftSwapRequest,
  reviewPayrollScheduleChangeRequest,
  reviewPayrollShiftSwapRequest,
  respondPayrollShiftSwapRequest,
  submitPayrollScheduleChangeRequest,
  submitPayrollShiftSwapRequest,
} from '../../services/payrollScheduleWorkflowService';

type Tab = 'change_of_shift' | 'shift_swap';
type ModalKind = 'submit_cos' | 'submit_swap' | 'review_cos' | 'review_swap' | null;

const DEFAULT_START_DATE = '2026-08-11';
const DEFAULT_END_DATE = '2026-08-25';

const dateLabel = (value: string) => new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
}).format(new Date(`${value}T00:00:00+08:00`));

const statusLabel = (value: string) => value.replaceAll('_', ' ');

const statusClasses = (value: string) => {
  if (value === 'pending_manager' || value === 'pending_counterparty') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  }
  if (value === 'applied' || value === 'approved') {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
  }
  if (value === 'rejected' || value === 'cancelled') {
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  }
  return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
};

const fieldClass = 'mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white';

const ScheduleRequests: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canView = can('Timekeeping', Permission.View);

  const [filters, setFilters] = useState({ startDate: DEFAULT_START_DATE, endDate: DEFAULT_END_DATE });
  const [context, setContext] = useState<PayrollScheduleWorkflowContext | null>(null);
  const [changeRequests, setChangeRequests] = useState<PayrollScheduleChangeRequest[]>([]);
  const [swapRequests, setSwapRequests] = useState<PayrollShiftSwapRequest[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('change_of_shift');
  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const [selectedReview, setSelectedReview] = useState<PayrollScheduleChangeRequest | PayrollShiftSwapRequest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ show: boolean; title: string; message: string }>({ show: false, title: '', message: '' });

  const [cosForm, setCosForm] = useState({
    scheduleId: '',
    presetId: '',
    reason: '',
    sourceDocumentRef: '',
  });
  const [swapForm, setSwapForm] = useState({
    requesterScheduleId: '',
    counterpartScheduleId: '',
    reason: '',
    sourceDocumentRef: '',
  });
  const [reviewNote, setReviewNote] = useState('');

  const scheduleMap = useMemo(
    () => new Map((context?.schedules || []).map(schedule => [schedule.id, schedule])),
    [context?.schedules]
  );
  const presetMap = useMemo(
    () => new Map((context?.presets || []).map(preset => [preset.id, preset])),
    [context?.presets]
  );
  const actorId = context?.actorId || user?.id || '';

  const load = useCallback(async () => {
    if (!canView) return;
    setIsLoading(true);
    setError(null);
    try {
      const [workflowContext, cosRows, swapRows] = await Promise.all([
        fetchPayrollScheduleWorkflowContext(filters.startDate, filters.endDate),
        fetchPayrollScheduleChangeRequests(filters.startDate, filters.endDate),
        fetchPayrollShiftSwapRequests(filters.startDate, filters.endDate),
      ]);
      setContext(workflowContext);
      setChangeRequests(cosRows);
      setSwapRequests(swapRows);
    } catch (err: any) {
      setError(err?.message || 'Unable to load schedule requests.');
    } finally {
      setIsLoading(false);
    }
  }, [canView, filters.endDate, filters.startDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const showToast = (title: string, message: string) => {
    setToast({ show: true, title, message });
  };

  const closeModal = (force = false) => {
    if (isSaving && !force) return;
    setModalKind(null);
    setSelectedReview(null);
    setReviewNote('');
  };

  const eligibleCosPresets = useMemo(() => {
    const selected = scheduleMap.get(cosForm.scheduleId);
    return (context?.presets || []).filter(preset => preset.id !== selected?.shiftPresetId);
  }, [context?.presets, cosForm.scheduleId, scheduleMap]);

  const requesterSchedules = useMemo(
    () => (context?.schedules || []).filter(schedule => schedule.employeeId === actorId),
    [actorId, context?.schedules]
  );

  const counterpartSchedules = useMemo(() => {
    const requester = scheduleMap.get(swapForm.requesterScheduleId);
    if (!requester) return [];
    return (context?.schedules || []).filter(schedule =>
      schedule.workDate === requester.workDate
      && schedule.employeeId !== requester.employeeId
      && schedule.shiftPresetId !== requester.shiftPresetId
    );
  }, [context?.schedules, scheduleMap, swapForm.requesterScheduleId]);

  const openCosForm = (schedule?: PayrollScheduleOption) => {
    const target = schedule || context?.schedules?.[0];
    if (!target) return;
    const firstPreset = (context?.presets || []).find(preset => preset.id !== target.shiftPresetId);
    setCosForm({
      scheduleId: target.id,
      presetId: firstPreset?.id || '',
      reason: '',
      sourceDocumentRef: '',
    });
    setModalKind('submit_cos');
  };

  const openSwapForm = () => {
    const requester = requesterSchedules[0];
    const counterpart = requester
      ? (context?.schedules || []).find(schedule => schedule.workDate === requester.workDate && schedule.employeeId !== requester.employeeId && schedule.shiftPresetId !== requester.shiftPresetId)
      : undefined;
    setSwapForm({
      requesterScheduleId: requester?.id || '',
      counterpartScheduleId: counterpart?.id || '',
      reason: '',
      sourceDocumentRef: '',
    });
    setModalKind('submit_swap');
  };

  const submitCos = async (event: React.FormEvent) => {
    event.preventDefault();
    const schedule = scheduleMap.get(cosForm.scheduleId);
    if (!schedule || !cosForm.presetId || !cosForm.reason.trim()) {
      setError('Select a current schedule, requested shift, and enter a reason.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await submitPayrollScheduleChangeRequest({
        employeeId: schedule.employeeId,
        currentScheduleId: schedule.id,
        requestedShiftPresetId: cosForm.presetId,
        reason: cosForm.reason,
        sourceDocumentRef: cosForm.sourceDocumentRef,
      });
      closeModal(true);
      await load();
      showToast('Request submitted', 'The change-of-shift request is waiting for the configured reviewer.');
    } catch (err: any) {
      setError(err?.message || 'Unable to submit the change-of-shift request.');
    } finally {
      setIsSaving(false);
    }
  };

  const submitSwap = async (event: React.FormEvent) => {
    event.preventDefault();
    const requester = scheduleMap.get(swapForm.requesterScheduleId);
    const counterpart = scheduleMap.get(swapForm.counterpartScheduleId);
    if (!requester || !counterpart || !swapForm.reason.trim()) {
      setError('Select both schedules and enter a reason for the swap.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await submitPayrollShiftSwapRequest({
        requesterEmployeeId: requester.employeeId,
        requesterScheduleId: requester.id,
        counterpartEmployeeId: counterpart.employeeId,
        counterpartScheduleId: counterpart.id,
        reason: swapForm.reason,
        sourceDocumentRef: swapForm.sourceDocumentRef,
      });
      closeModal(true);
      await load();
      showToast('Swap submitted', 'The other employee must accept before manager or payroll review.');
    } catch (err: any) {
      setError(err?.message || 'Unable to submit the shift-swap request.');
    } finally {
      setIsSaving(false);
    }
  };

  const reviewRequest = async (action: 'approve' | 'reject' | 'cancel') => {
    if (!selectedReview) return;
    setIsSaving(true);
    setError(null);
    try {
      if ('swapDate' in selectedReview) {
        await reviewPayrollShiftSwapRequest({ requestId: selectedReview.id, action, note: reviewNote });
      } else {
        await reviewPayrollScheduleChangeRequest({ requestId: selectedReview.id, action, note: reviewNote });
      }
      closeModal(true);
      await load();
      showToast(action === 'approve' ? 'Request approved' : `Request ${action}d`, action === 'approve'
        ? 'A new schedule version was created. Existing attendance interpretations are not overwritten.'
        : 'The workflow action was recorded in the audit history.');
    } catch (err: any) {
      setError(err?.message || 'Unable to review the schedule request.');
    } finally {
      setIsSaving(false);
    }
  };

  const respondToSwap = async (request: PayrollShiftSwapRequest, action: 'accept' | 'decline') => {
    setIsSaving(true);
    setError(null);
    try {
      await respondPayrollShiftSwapRequest({ requestId: request.id, action });
      await load();
      showToast(action === 'accept' ? 'Swap accepted' : 'Swap declined', action === 'accept'
        ? 'The swap is now waiting for manager or payroll review.'
        : 'The declined swap was closed and retained in workflow history.');
    } catch (err: any) {
      setError(err?.message || 'Unable to respond to the shift swap.');
    } finally {
      setIsSaving(false);
    }
  };

  const canReview = (request: PayrollScheduleChangeRequest | PayrollShiftSwapRequest) => {
    if (!context) return false;
    if (context.canManageAll) return true;
    if (request.directManagerId && request.directManagerId === context.actorId) return true;
    return false;
  };

  const openReview = (request: PayrollScheduleChangeRequest | PayrollShiftSwapRequest) => {
    setSelectedReview(request);
    setReviewNote('');
    setModalKind('swapDate' in request ? 'review_swap' : 'review_cos');
  };

  const renderSchedule = (scheduleId: string | null | undefined) => {
    const schedule = scheduleId ? scheduleMap.get(scheduleId) : undefined;
    if (!schedule) return 'Schedule unavailable';
    return `${schedule.employeeName} · ${dateLabel(schedule.workDate)} · ${schedule.presetName}`;
  };

  if (!canView) {
    return <div className="p-6 text-sm text-gray-600 dark:text-gray-300">You do not have permission to view schedule requests.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-slate-950 sm:p-6">
      <Toast show={toast.show} onClose={() => setToast(previous => ({ ...previous, show: false }))} title={toast.title} message={toast.message} />

      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Payroll · Phase 1K</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">Schedule Requests</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
              Submit date-specific changes and peer shift swaps through an approval trail. Approved changes create new schedule versions and never rewrite raw attendance history.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void load()} isLoading={isLoading}>Refresh</Button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" role="alert">
            {error}
          </div>
        )}

        <Card>
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <Input label="Start date" id="schedule-request-start-date" type="date" value={filters.startDate} onChange={event => setFilters(previous => ({ ...previous, startDate: event.target.value }))} />
            <Input label="End date" id="schedule-request-end-date" type="date" value={filters.endDate} onChange={event => setFilters(previous => ({ ...previous, endDate: event.target.value }))} />
            <Button onClick={() => void load()} isLoading={isLoading}>Load requests</Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300">
            <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-slate-700">Raw schedules remain immutable</span>
            <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-slate-700">Leave conflicts are blocked</span>
            <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-slate-700">Approval can flag attendance for reinterpretation</span>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card><p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Visible schedules</p><p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{context?.schedules.length || 0}</p></Card>
          <Card><p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Pending change requests</p><p className="mt-2 text-2xl font-bold text-amber-600">{changeRequests.filter(request => request.status === 'pending_manager').length}</p></Card>
          <Card><p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Pending swaps</p><p className="mt-2 text-2xl font-bold text-amber-600">{swapRequests.filter(request => request.status === 'pending_counterparty' || request.status === 'pending_manager').length}</p></Card>
        </div>

        <Card>
          <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2" role="tablist" aria-label="Schedule request type">
              <button type="button" role="tab" aria-selected={activeTab === 'change_of_shift'} onClick={() => setActiveTab('change_of_shift')} className={`rounded-md px-3 py-2 text-sm font-semibold ${activeTab === 'change_of_shift' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700'}`}>
                Change of shift
              </button>
              <button type="button" role="tab" aria-selected={activeTab === 'shift_swap'} onClick={() => setActiveTab('shift_swap')} className={`rounded-md px-3 py-2 text-sm font-semibold ${activeTab === 'shift_swap' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700'}`}>
                Peer shift swaps
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => openCosForm()}>Request change of shift</Button>
              <Button size="sm" variant="secondary" onClick={openSwapForm} disabled={requesterSchedules.length === 0}>Request peer swap</Button>
            </div>
          </div>

          {activeTab === 'change_of_shift' ? (
            <div className="mt-4">
              {changeRequests.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-slate-600 dark:text-gray-400">No change-of-shift requests found for the selected dates.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700">
                    <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400"><th className="px-3 py-3">Employee/date</th><th className="px-3 py-3">Current schedule</th><th className="px-3 py-3">Requested shift</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Action</th></tr></thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700/70">
                      {changeRequests.map(request => {
                        const current = scheduleMap.get(request.currentScheduleId);
                        const requested = presetMap.get(request.requestedShiftPresetId);
                        const reviewable = request.status === 'pending_manager' && canReview(request);
                        const cancellable = request.status === 'pending_manager' && request.requestedByUserId === actorId;
                        return (
                          <tr key={request.id} className="align-top">
                            <td className="px-3 py-4"><div className="font-semibold text-gray-900 dark:text-white">{current?.employeeName || request.employeeId}</div><div className="text-xs text-gray-500 dark:text-gray-400">{dateLabel(request.workDate)}</div></td>
                            <td className="px-3 py-4 text-gray-600 dark:text-gray-300">{current?.presetName || 'Unavailable'}</td>
                            <td className="px-3 py-4 text-gray-600 dark:text-gray-300">{requested?.name || 'Requested preset'}</td>
                            <td className="px-3 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses(request.status)}`}>{statusLabel(request.status)}</span>{request.requiresReinterpretation && <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">Attendance review flagged</div>}</td>
                            <td className="px-3 py-4 text-right"><div className="flex justify-end gap-2">{reviewable && <Button size="sm" onClick={() => openReview(request)}>Review</Button>}{cancellable && <Button size="sm" variant="secondary" onClick={() => { setSelectedReview(request); setReviewNote(''); setModalKind('review_cos'); }}>Cancel</Button>}</div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4">
              {swapRequests.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-slate-600 dark:text-gray-400">No peer shift-swap requests found for the selected dates.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700">
                    <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400"><th className="px-3 py-3">Employees/date</th><th className="px-3 py-3">Shifts being exchanged</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Action</th></tr></thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700/70">
                      {swapRequests.map(request => {
                        const requester = scheduleMap.get(request.requesterScheduleId);
                        const counterpart = scheduleMap.get(request.counterpartScheduleId);
                        const reviewable = request.status === 'pending_manager' && canReview(request);
                        const canRespond = request.status === 'pending_counterparty' && request.counterpartEmployeeId === actorId;
                        const cancellable = (request.status === 'pending_counterparty' || request.status === 'pending_manager') && request.requestedByUserId === actorId;
                        return (
                          <tr key={request.id} className="align-top">
                            <td className="px-3 py-4"><div className="font-semibold text-gray-900 dark:text-white">{requester?.employeeName || request.requesterEmployeeId} ↔ {counterpart?.employeeName || request.counterpartEmployeeId}</div><div className="text-xs text-gray-500 dark:text-gray-400">{dateLabel(request.swapDate)}</div></td>
                            <td className="px-3 py-4 text-gray-600 dark:text-gray-300">{requester?.presetName || 'Unavailable'} <span className="text-gray-400">↔</span> {counterpart?.presetName || 'Unavailable'}</td>
                            <td className="px-3 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses(request.status)}`}>{statusLabel(request.status)}</span><div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Counterparty: {statusLabel(request.counterpartyStatus)}</div>{request.requiresReinterpretation && <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">Attendance review flagged</div>}</td>
                            <td className="px-3 py-4 text-right"><div className="flex flex-wrap justify-end gap-2">{canRespond && <><Button size="sm" onClick={() => void respondToSwap(request, 'accept')} isLoading={isSaving}>Accept</Button><Button size="sm" variant="secondary" onClick={() => void respondToSwap(request, 'decline')} disabled={isSaving}>Decline</Button></>}{reviewable && <Button size="sm" onClick={() => openReview(request)}>Review</Button>}{cancellable && <Button size="sm" variant="secondary" onClick={() => { setSelectedReview(request); setReviewNote(''); setModalKind('review_swap'); }}>Cancel</Button>}</div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>

        {context && context.schedules.length === 0 && (
          <Card><div className="text-center text-sm text-gray-600 dark:text-gray-300">No canonical schedules are available for the selected date range. Schedule requests can only reference approved or active canonical schedules.</div></Card>
        )}
      </div>

      <Modal isOpen={modalKind === 'submit_cos'} onClose={closeModal} title="Request change of shift" footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={closeModal} disabled={isSaving}>Cancel</Button><Button type="submit" form="change-of-shift-form" isLoading={isSaving}>Submit request</Button></div>}>
        <form id="change-of-shift-form" onSubmit={submitCos} className="space-y-4">
          <div><label htmlFor="cos-current-schedule" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Current schedule</label><select id="cos-current-schedule" className={fieldClass} value={cosForm.scheduleId} onChange={event => { const scheduleId = event.target.value; const firstPreset = (context?.presets || []).find(preset => preset.id !== scheduleMap.get(scheduleId)?.shiftPresetId); setCosForm(previous => ({ ...previous, scheduleId, presetId: firstPreset?.id || '' })); }}><option value="">Select a schedule</option>{(context?.schedules || []).map(schedule => <option key={schedule.id} value={schedule.id}>{schedule.employeeName} · {dateLabel(schedule.workDate)} · {schedule.presetName}</option>)}</select></div>
          <div><label htmlFor="cos-requested-preset" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Requested shift preset</label><select id="cos-requested-preset" className={fieldClass} value={cosForm.presetId} onChange={event => setCosForm(previous => ({ ...previous, presetId: event.target.value }))}><option value="">Select a shift preset</option>{eligibleCosPresets.map(preset => <option key={preset.id} value={preset.id}>{preset.name} · {preset.shiftKind}</option>)}</select></div>
          <div><label htmlFor="cos-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reason</label><textarea id="cos-reason" rows={3} className={fieldClass} value={cosForm.reason} onChange={event => setCosForm(previous => ({ ...previous, reason: event.target.value }))} placeholder="Explain why the schedule needs to change." /></div>
          <Input label="Source document reference (optional)" id="cos-source-document" value={cosForm.sourceDocumentRef} onChange={event => setCosForm(previous => ({ ...previous, sourceDocumentRef: event.target.value }))} placeholder="Document, ticket, or approval reference" />
        </form>
      </Modal>

      <Modal isOpen={modalKind === 'submit_swap'} onClose={closeModal} title="Request peer shift swap" footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={closeModal} disabled={isSaving}>Cancel</Button><Button type="submit" form="shift-swap-form" isLoading={isSaving}>Submit swap</Button></div>}>
        {requesterSchedules.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-300">No schedule is available for your account in this date range. The requesting employee must submit the swap.</p> : <form id="shift-swap-form" onSubmit={submitSwap} className="space-y-4">
          <div><label htmlFor="swap-requester-schedule" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Your schedule</label><select id="swap-requester-schedule" className={fieldClass} value={swapForm.requesterScheduleId} onChange={event => { const requesterScheduleId = event.target.value; const requester = scheduleMap.get(requesterScheduleId); const counterpart = (context?.schedules || []).find(schedule => requester && schedule.workDate === requester.workDate && schedule.employeeId !== requester.employeeId && schedule.shiftPresetId !== requester.shiftPresetId); setSwapForm(previous => ({ ...previous, requesterScheduleId, counterpartScheduleId: counterpart?.id || '' })); }}><option value="">Select your schedule</option>{requesterSchedules.map(schedule => <option key={schedule.id} value={schedule.id}>{dateLabel(schedule.workDate)} · {schedule.presetName}</option>)}</select></div>
          <div><label htmlFor="swap-counterpart-schedule" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Counterparty schedule</label><select id="swap-counterpart-schedule" className={fieldClass} value={swapForm.counterpartScheduleId} onChange={event => setSwapForm(previous => ({ ...previous, counterpartScheduleId: event.target.value }))}><option value="">Select the other employee</option>{counterpartSchedules.map(schedule => <option key={schedule.id} value={schedule.id}>{schedule.employeeName} · {schedule.presetName}</option>)}</select><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The other employee must accept before the schedule changes are applied.</p></div>
          <div><label htmlFor="swap-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reason</label><textarea id="swap-reason" rows={3} className={fieldClass} value={swapForm.reason} onChange={event => setSwapForm(previous => ({ ...previous, reason: event.target.value }))} placeholder="Explain why both employees are requesting the trade." /></div>
          <Input label="Source document reference (optional)" id="swap-source-document" value={swapForm.sourceDocumentRef} onChange={event => setSwapForm(previous => ({ ...previous, sourceDocumentRef: event.target.value }))} placeholder="Document, ticket, or approval reference" />
        </form>}
      </Modal>

      <Modal isOpen={modalKind === 'review_cos' || modalKind === 'review_swap'} onClose={closeModal} title={modalKind === 'review_swap' ? 'Review peer shift swap' : 'Review change of shift'} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={closeModal} disabled={isSaving}>Close</Button>{selectedReview && ((('swapDate' in selectedReview && selectedReview.status === 'pending_manager') || (!('swapDate' in selectedReview) && selectedReview.status === 'pending_manager'))) && <><Button variant="danger" onClick={() => void reviewRequest('reject')} isLoading={isSaving}>Reject</Button><Button onClick={() => void reviewRequest('approve')} isLoading={isSaving}>Approve and apply</Button></>}{selectedReview && selectedReview.requestedByUserId === actorId && (selectedReview.status === 'pending_manager' || selectedReview.status === 'pending_counterparty') && <Button variant="secondary" onClick={() => void reviewRequest('cancel')} isLoading={isSaving}>Cancel request</Button>}</div>}>
        {selectedReview && ('swapDate' in selectedReview ? <div className="space-y-3 text-sm"><p><span className="font-semibold">Employees:</span> {renderSchedule(selectedReview.requesterScheduleId)} ↔ {renderSchedule(selectedReview.counterpartScheduleId)}</p><p><span className="font-semibold">Counterparty:</span> {statusLabel(selectedReview.counterpartyStatus)}</p><p><span className="font-semibold">Reason:</span> {selectedReview.reason}</p><p><span className="font-semibold">Approval mode:</span> {selectedReview.approvalMode === 'payroll_exception' ? 'Payroll exception reviewer' : 'Direct manager'}</p></div> : <div className="space-y-3 text-sm"><p><span className="font-semibold">Schedule:</span> {renderSchedule(selectedReview.currentScheduleId)}</p><p><span className="font-semibold">Requested shift:</span> {presetMap.get(selectedReview.requestedShiftPresetId)?.name || selectedReview.requestedShiftPresetId}</p><p><span className="font-semibold">Reason:</span> {selectedReview.reason}</p><p><span className="font-semibold">Approval mode:</span> {selectedReview.approvalMode === 'payroll_exception' ? 'Payroll exception reviewer' : 'Direct manager'}</p></div>)}
          <div><label htmlFor="schedule-review-note" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Review note</label><textarea id="schedule-review-note" rows={3} className={fieldClass} value={reviewNote} onChange={event => setReviewNote(event.target.value)} placeholder="Add the approval or rejection basis." /></div>
          <p className="rounded-md bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">Approval supersedes the prior schedule and creates a new version. If attendance was already interpreted for this date, the request is flagged for a new interpretation; the old result remains available for audit.</p>
      </Modal>
    </div>
  );
};

export default ScheduleRequests;
