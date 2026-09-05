import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Permission, Role, User } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { fetchUsers } from '../../services/userService';
import {
    fetchPayrollAttendanceCorrectionRequests,
    fetchPayrollAttendanceExceptions,
    fetchPayrollAttendanceInterpretations,
    PayrollAttendanceCorrectionRequest,
    PayrollAttendanceException,
    PayrollAttendanceExceptionAction,
    PayrollAttendanceInterpretation,
    reviewPayrollAttendanceCorrectionRequest,
    resolvePayrollAttendanceException,
    submitPayrollAttendanceCorrectionRequest,
} from '../../services/payrollAttendanceService';
import { formatEmployeeName } from '../../services/formatEmployeeName';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';

type ResolutionAction = 'resolve' | 'reject' | 'waive';
type CorrectionReviewAction = 'approve' | 'reject';

const correctionExceptionTypes = new Set(['missing_clock_in', 'missing_clock_out', 'no_show']);
const payrollReviewRoles = new Set<Role>([Role.Admin, Role.HRManager, Role.HRStaff, Role.FinanceStaff]);

const exceptionTypeLabel = (value: string) => value.replaceAll('_', ' ');
const statusLabel = (value: string) => value.replaceAll('_', ' ');

const dateLabel = (value: string) => new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
}).format(new Date(`${value}T00:00:00+08:00`));

const dateTimeLabel = (value: string | null) => value
    ? new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value))
    : '—';

const toDateTimeLocal = (value: string | null) => {
    if (!value) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(value));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
};

const toPhilippineTimestamp = (value: string) => {
    if (!value) return null;
    return new Date(`${value}:00+08:00`).toISOString();
};

const statusClasses = (status: string) => {
    if (status === 'open' || status === 'reopened') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    if (status === 'acknowledged' || status === 'pending_review') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    if (status === 'resolved' || status === 'approved' || status === 'applied') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    if (status === 'waived') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    if (status === 'rejected' || status === 'cancelled') return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
};

const severityClasses = (severity: string) => {
    if (severity === 'blocking') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    if (severity === 'warning') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
};

const AttendanceExceptions: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const canView = can('Exceptions', Permission.View);
    const canManage = can('Exceptions', Permission.Manage);
    const userRoles = user?.roles?.length ? user.roles : user ? [user.role] : [];
    const canPayrollReview = canManage && userRoles.some(role => payrollReviewRoles.has(role));

    const [exceptions, setExceptions] = useState<PayrollAttendanceException[]>([]);
    const [interpretations, setInterpretations] = useState<PayrollAttendanceInterpretation[]>([]);
    const [correctionRequests, setCorrectionRequests] = useState<PayrollAttendanceCorrectionRequest[]>([]);
    const [employees, setEmployees] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [filters, setFilters] = useState({
        startDate: '2026-08-11',
        endDate: '2026-08-25',
        employeeId: '',
        type: '',
        status: '',
    });

    const [selectedException, setSelectedException] = useState<PayrollAttendanceException | null>(null);
    const [pendingAction, setPendingAction] = useState<ResolutionAction | null>(null);
    const [resolutionCode, setResolutionCode] = useState('corrected_punch');
    const [resolutionNote, setResolutionNote] = useState('');
    const [resolutionDocumentRef, setResolutionDocumentRef] = useState('');

    const [correctionException, setCorrectionException] = useState<PayrollAttendanceException | null>(null);
    const [correctionClockIn, setCorrectionClockIn] = useState('');
    const [correctionClockOut, setCorrectionClockOut] = useState('');
    const [correctionReason, setCorrectionReason] = useState('');
    const [correctionDocumentRef, setCorrectionDocumentRef] = useState('');

    const [correctionReviewRequest, setCorrectionReviewRequest] = useState<PayrollAttendanceCorrectionRequest | null>(null);
    const [correctionReviewAction, setCorrectionReviewAction] = useState<CorrectionReviewAction | null>(null);
    const [correctionReviewNote, setCorrectionReviewNote] = useState('');

    const employeeMap = useMemo(
        () => new Map(employees.map(employee => [employee.id, employee])),
        [employees]
    );
    const interpretationMap = useMemo(
        () => new Map(interpretations.map(interpretation => [interpretation.id, interpretation])),
        [interpretations]
    );
    const correctionRequestMap = useMemo(() => {
        const map = new Map<string, PayrollAttendanceCorrectionRequest>();
        for (const request of correctionRequests) {
            const current = map.get(request.exceptionId);
            if (!current || request.createdAt > current.createdAt) map.set(request.exceptionId, request);
        }
        return map;
    }, [correctionRequests]);

    const load = useCallback(async () => {
        if (!canView) return;
        setIsLoading(true);
        setError(null);
        try {
            const [exceptionRows, interpretationRows, correctionRows, userRows] = await Promise.all([
                fetchPayrollAttendanceExceptions(filters.startDate, filters.endDate),
                fetchPayrollAttendanceInterpretations(filters.startDate, filters.endDate),
                fetchPayrollAttendanceCorrectionRequests(filters.startDate, filters.endDate),
                fetchUsers(),
            ]);
            setExceptions(exceptionRows);
            setInterpretations(interpretationRows);
            setCorrectionRequests(correctionRows);
            setEmployees(userRows);
        } catch (err: any) {
            setError(err.message || 'Failed to load attendance exceptions and correction requests.');
        } finally {
            setIsLoading(false);
        }
    }, [canView, filters.startDate, filters.endDate]);

    useEffect(() => {
        load();
    }, [load]);

    const filteredExceptions = useMemo(() => exceptions.filter(exception => {
        if (filters.employeeId && exception.employeeId !== filters.employeeId) return false;
        if (filters.type && exception.exceptionType !== filters.type) return false;
        if (filters.status && exception.status !== filters.status) return false;
        return true;
    }), [exceptions, filters.employeeId, filters.status, filters.type]);

    const resetResolutionModal = () => {
        setSelectedException(null);
        setPendingAction(null);
        setResolutionCode('corrected_punch');
        setResolutionNote('');
        setResolutionDocumentRef('');
    };

    const resetCorrectionModal = () => {
        setCorrectionException(null);
        setCorrectionClockIn('');
        setCorrectionClockOut('');
        setCorrectionReason('');
        setCorrectionDocumentRef('');
    };

    const resetCorrectionReviewModal = () => {
        setCorrectionReviewRequest(null);
        setCorrectionReviewAction(null);
        setCorrectionReviewNote('');
    };

    const closeModal = () => {
        if (isSaving) return;
        resetResolutionModal();
        resetCorrectionModal();
        resetCorrectionReviewModal();
    };

    const executeAction = async (
        exception: PayrollAttendanceException,
        action: PayrollAttendanceExceptionAction,
        details?: { code?: string; note?: string; documentRef?: string }
    ) => {
        setIsSaving(true);
        setError(null);
        setMessage(null);
        try {
            await resolvePayrollAttendanceException({
                exceptionId: exception.id,
                action,
                resolutionCode: details?.code,
                resolutionNote: details?.note,
                resolutionDocumentRef: details?.documentRef,
            });
            await load();
            const pastTense = action === 'acknowledge' ? 'acknowledged' : action === 'waive' ? 'waived' : `${action}d`;
            setMessage(`Attendance exception ${pastTense} successfully. The action was recorded in workflow history.`);
            resetResolutionModal();
        } catch (err: any) {
            setError(err.message || `Failed to ${action} the attendance exception.`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSimpleAction = (exception: PayrollAttendanceException, action: 'acknowledge' | 'reopen') => {
        void executeAction(exception, action);
    };

    const openResolution = (exception: PayrollAttendanceException, action: ResolutionAction) => {
        setSelectedException(exception);
        setPendingAction(action);
        setResolutionCode(action === 'waive' ? 'waived_after_review' : 'corrected_punch');
        setResolutionNote('');
        setResolutionDocumentRef('');
    };

    const submitResolution = () => {
        if (!selectedException || !pendingAction) return;
        void executeAction(selectedException, pendingAction, {
            code: resolutionCode,
            note: resolutionNote,
            documentRef: resolutionDocumentRef,
        });
    };

    const openCorrection = (exception: PayrollAttendanceException) => {
        const interpretation = exception.attendanceInterpretationId
            ? interpretationMap.get(exception.attendanceInterpretationId)
            : undefined;
        setCorrectionException(exception);
        setCorrectionClockIn(exception.exceptionType === 'missing_clock_out' ? toDateTimeLocal(interpretation?.firstClockInAt || null) : '');
        setCorrectionClockOut(exception.exceptionType === 'missing_clock_in' ? toDateTimeLocal(interpretation?.lastClockOutAt || null) : '');
        setCorrectionReason('');
        setCorrectionDocumentRef('');
    };

    const submitCorrection = async () => {
        if (!correctionException) return;
        if (!correctionReason.trim()) {
            setError('A correction reason is required.');
            return;
        }
        setIsSaving(true);
        setError(null);
        setMessage(null);
        try {
            await submitPayrollAttendanceCorrectionRequest({
                exceptionId: correctionException.id,
                clockInAt: toPhilippineTimestamp(correctionClockIn),
                clockOutAt: toPhilippineTimestamp(correctionClockOut),
                reason: correctionReason.trim(),
                sourceDocumentRef: correctionDocumentRef.trim() || null,
            });
            await load();
            setMessage('Correction request submitted for payroll review. The original punch evidence was preserved.');
            resetCorrectionModal();
        } catch (err: any) {
            setError(err.message || 'Failed to submit the attendance correction request.');
        } finally {
            setIsSaving(false);
        }
    };

    const openCorrectionReview = (request: PayrollAttendanceCorrectionRequest, action: CorrectionReviewAction) => {
        setCorrectionReviewRequest(request);
        setCorrectionReviewAction(action);
        setCorrectionReviewNote('');
    };

    const executeCorrectionReview = async () => {
        if (!correctionReviewRequest || !correctionReviewAction) return;
        if (correctionReviewAction === 'reject' && !correctionReviewNote.trim()) {
            setError('A rejection note is required.');
            return;
        }
        setIsSaving(true);
        setError(null);
        setMessage(null);
        try {
            await reviewPayrollAttendanceCorrectionRequest({
                requestId: correctionReviewRequest.id,
                action: correctionReviewAction,
                reviewNote: correctionReviewNote.trim() || null,
            });
            await load();
            setMessage(correctionReviewAction === 'approve'
                ? 'Correction approved and applied. A new attendance interpretation was created from the appended punch evidence.'
                : 'Correction request rejected. The original attendance evidence remains unchanged.');
            resetCorrectionReviewModal();
        } catch (err: any) {
            setError(err.message || `Failed to ${correctionReviewAction} the correction request.`);
        } finally {
            setIsSaving(false);
        }
    };

    const cancelCorrection = async (request: PayrollAttendanceCorrectionRequest) => {
        setIsSaving(true);
        setError(null);
        setMessage(null);
        try {
            await reviewPayrollAttendanceCorrectionRequest({
                requestId: request.id,
                action: 'cancel',
                reviewNote: 'Cancelled by the correction requester.',
            });
            await load();
            setMessage('Correction request cancelled.');
        } catch (err: any) {
            setError(err.message || 'Failed to cancel the correction request.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!canView) {
        return (
            <div className="p-6">
                <Card>
                    <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                        You do not have permission to view Attendance Exceptions.
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Attendance Exceptions &amp; Corrections (Phase 1J)</h1>
                <p className="mt-1 text-gray-600 dark:text-gray-400">
                    Review server-interpreted attendance exceptions and submit missing-punch corrections. Raw punches and prior interpretations remain read-only.
                </p>
            </div>

            {error && (
                <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">
                    {error}
                </div>
            )}
            {message && (
                <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300">
                    {message}
                </div>
            )}

            <Card>
                <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3 lg:grid-cols-5">
                    <Input label="Start date" type="date" value={filters.startDate} onChange={e => setFilters(previous => ({ ...previous, startDate: e.target.value }))} />
                    <Input label="End date" type="date" value={filters.endDate} onChange={e => setFilters(previous => ({ ...previous, endDate: e.target.value }))} />
                    <div>
                        <label htmlFor="exception-employee" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Employee</label>
                        <select id="exception-employee" value={filters.employeeId} onChange={e => setFilters(previous => ({ ...previous, employeeId: e.target.value }))} className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                            <option value="">All employees</option>
                            {employees.map(employee => <option key={employee.id} value={employee.id}>{formatEmployeeName(employee.name)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="exception-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
                        <select id="exception-type" value={filters.type} onChange={e => setFilters(previous => ({ ...previous, type: e.target.value }))} className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                            <option value="">All types</option>
                            {Array.from(new Set(exceptions.map(exception => exception.exceptionType))).map(type => <option key={type} value={type}>{exceptionTypeLabel(type)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="exception-status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select id="exception-status" value={filters.status} onChange={e => setFilters(previous => ({ ...previous, status: e.target.value }))} className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                            <option value="">All statuses</option>
                            <option value="open">Open</option>
                            <option value="acknowledged">Acknowledged</option>
                            <option value="resolved">Resolved</option>
                            <option value="rejected">Rejected</option>
                            <option value="waived">Waived</option>
                            <option value="reopened">Reopened</option>
                        </select>
                    </div>
                </div>
            </Card>

            <Card>
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                    <div>
                        <h2 className="font-semibold text-gray-900 dark:text-white">Normalized exception queue</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{filteredExceptions.length} record(s) in the selected range. {correctionRequests.filter(request => request.status === 'pending_review').length} correction request(s) pending review.</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => void load()} isLoading={isLoading}>Refresh</Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Employee / date</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Exception</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Evidence</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Status</th>
                                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                            {filteredExceptions.map(exception => {
                                const employee = employeeMap.get(exception.employeeId);
                                const interpretation = exception.attendanceInterpretationId ? interpretationMap.get(exception.attendanceInterpretationId) : undefined;
                                const correctionRequest = correctionRequestMap.get(exception.id);
                                const canResolve = canManage && ['open', 'acknowledged', 'reopened'].includes(exception.status);
                                const canAcknowledge = canManage && ['open', 'reopened'].includes(exception.status);
                                const canReopen = canManage && ['resolved', 'rejected', 'waived'].includes(exception.status);
                                const canWaive = canManage && exception.status === 'resolved';
                                const canRequestCorrection = canManage
                                    && correctionExceptionTypes.has(exception.exceptionType)
                                    && ['open', 'acknowledged', 'reopened'].includes(exception.status)
                                    && correctionRequest?.status !== 'pending_review'
                                    && correctionRequest?.status !== 'applied';
                                const canCancelCorrection = correctionRequest?.status === 'pending_review'
                                    && correctionRequest.requestedByUserId === user?.id;
                                const canReviewCorrection = canPayrollReview
                                    && correctionRequest?.status === 'pending_review'
                                    && correctionRequest.requestedByUserId !== user?.id;
                                return (
                                    <tr key={exception.id}>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm">
                                            <div className="font-medium text-gray-900 dark:text-white">{employee?.name || exception.employeeId}</div>
                                            <div className="text-gray-500 dark:text-gray-400">{dateLabel(exception.workDate)}</div>
                                        </td>
                                        <td className="px-4 py-4 text-sm">
                                            <div className="font-medium capitalize text-gray-900 dark:text-white">{exceptionTypeLabel(exception.exceptionType)}</div>
                                            <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${severityClasses(exception.severity)}`}>{exception.severity}</span>
                                        </td>
                                        <td className="max-w-md px-4 py-4 text-sm text-gray-600 dark:text-gray-300">
                                            <div>{exception.details}</div>
                                            {interpretation && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Interpretation v{interpretation.interpretationVersion}: {dateTimeLabel(interpretation.firstClockInAt)} → {dateTimeLabel(interpretation.lastClockOutAt)}</div>}
                                            {exception.resolutionNote && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Resolution: {exception.resolutionNote}</div>}
                                            {correctionRequest && <div className="mt-1 text-xs font-medium capitalize text-violet-700 dark:text-violet-300">Correction: {statusLabel(correctionRequest.status)}</div>}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm">
                                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusClasses(exception.status)}`}>{statusLabel(exception.status)}</span>
                                            {correctionRequest && <div className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusClasses(correctionRequest.status)}`}>{statusLabel(correctionRequest.status)}</div>}
                                        </td>
                                        <td className="px-4 py-4 text-right text-sm">
                                            <div className="flex flex-wrap justify-end gap-2">
                                                {canAcknowledge && <Button size="sm" variant="secondary" onClick={() => handleSimpleAction(exception, 'acknowledge')} isLoading={isSaving}>Acknowledge</Button>}
                                                {canRequestCorrection && <Button size="sm" variant="secondary" onClick={() => openCorrection(exception)}>Request correction</Button>}
                                                {canReviewCorrection && <Button size="sm" onClick={() => openCorrectionReview(correctionRequest, 'approve')}>Approve correction</Button>}
                                                {canReviewCorrection && <Button size="sm" variant="danger" onClick={() => openCorrectionReview(correctionRequest, 'reject')}>Reject correction</Button>}
                                                {canCancelCorrection && <Button size="sm" variant="secondary" onClick={() => void cancelCorrection(correctionRequest)} isLoading={isSaving}>Cancel request</Button>}
                                                {canResolve && <Button size="sm" onClick={() => openResolution(exception, 'resolve')}>Resolve</Button>}
                                                {canResolve && <Button size="sm" variant="danger" onClick={() => openResolution(exception, 'reject')}>Reject</Button>}
                                                {canWaive && <Button size="sm" variant="secondary" onClick={() => openResolution(exception, 'waive')}>Waive</Button>}
                                                {canReopen && <Button size="sm" variant="secondary" onClick={() => handleSimpleAction(exception, 'reopen')} isLoading={isSaving}>Reopen</Button>}
                                                {!canAcknowledge && !canRequestCorrection && !canReviewCorrection && !canCancelCorrection && !canResolve && !canWaive && !canReopen && <span className="text-xs text-gray-400">No action available</span>}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredExceptions.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                                        {isLoading ? 'Loading normalized exceptions…' : 'No normalized exceptions match the selected filters.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Modal
                isOpen={Boolean(selectedException && pendingAction)}
                onClose={closeModal}
                title={`${pendingAction ? pendingAction[0].toUpperCase() + pendingAction.slice(1) : ''} attendance exception`}
                footer={(
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" onClick={closeModal} disabled={isSaving}>Cancel</Button>
                        <Button onClick={submitResolution} isLoading={isSaving} disabled={!resolutionNote.trim()}>
                            {pendingAction === 'waive' ? 'Submit waiver' : pendingAction === 'reject' ? 'Reject exception' : 'Resolve exception'}
                        </Button>
                    </div>
                )}
            >
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {selectedException && `${exceptionTypeLabel(selectedException.exceptionType)} for ${employeeMap.get(selectedException.employeeId)?.name || selectedException.employeeId} on ${dateLabel(selectedException.workDate)}.`}
                </p>
                <div>
                    <label htmlFor="resolution-code" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Resolution code</label>
                    <select id="resolution-code" value={resolutionCode} onChange={e => setResolutionCode(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                        <option value="corrected_punch">Corrected punch</option>
                        <option value="approved_leave">Approved leave</option>
                        <option value="approved_schedule_change">Approved schedule change</option>
                        <option value="approved_wfh">Approved work from home</option>
                        <option value="unpaid_absence">Unpaid absence</option>
                        <option value="other">Other</option>
                        {pendingAction === 'waive' && <option value="waived_after_review">Waived after review</option>}
                    </select>
                </div>
                <div>
                    <label htmlFor="resolution-note" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Required note</label>
                    <textarea id="resolution-note" value={resolutionNote} onChange={e => setResolutionNote(e.target.value)} rows={4} placeholder="Explain the evidence and decision." className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                </div>
                <Input label="Supporting document reference (optional)" value={resolutionDocumentRef} onChange={e => setResolutionDocumentRef(e.target.value)} placeholder="Document or approval reference" />
            </Modal>

            <Modal
                isOpen={Boolean(correctionException)}
                onClose={closeModal}
                title="Request attendance correction"
                footer={(
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" onClick={closeModal} disabled={isSaving}>Cancel</Button>
                        <Button onClick={() => void submitCorrection()} isLoading={isSaving} disabled={!correctionReason.trim()}>Submit for payroll review</Button>
                    </div>
                )}
            >
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {correctionException && `${exceptionTypeLabel(correctionException.exceptionType)} for ${employeeMap.get(correctionException.employeeId)?.name || correctionException.employeeId} on ${dateLabel(correctionException.workDate)}.`}
                </p>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                    Enter the missing punch in Philippine time. The submitted time is appended as a manual raw event after payroll approval; the original evidence is never edited.
                </div>
                <Input label="Corrected clock-in (Asia/Manila)" type="datetime-local" value={correctionClockIn} onChange={e => setCorrectionClockIn(e.target.value)} />
                <Input label="Corrected clock-out (Asia/Manila)" type="datetime-local" value={correctionClockOut} onChange={e => setCorrectionClockOut(e.target.value)} />
                <div>
                    <label htmlFor="correction-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reason <span className="text-red-600">*</span></label>
                    <textarea id="correction-reason" value={correctionReason} onChange={e => setCorrectionReason(e.target.value)} rows={4} placeholder="Explain why the punch is missing and identify the supporting evidence." className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                </div>
                <Input label="Supporting document reference (optional)" value={correctionDocumentRef} onChange={e => setCorrectionDocumentRef(e.target.value)} placeholder="DTR, manager approval, or incident reference" />
            </Modal>

            <Modal
                isOpen={Boolean(correctionReviewRequest && correctionReviewAction)}
                onClose={closeModal}
                title={`${correctionReviewAction === 'approve' ? 'Approve' : 'Reject'} attendance correction`}
                footer={(
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" onClick={closeModal} disabled={isSaving}>Cancel</Button>
                        <Button variant={correctionReviewAction === 'reject' ? 'danger' : 'primary'} onClick={() => void executeCorrectionReview()} isLoading={isSaving} disabled={correctionReviewAction === 'reject' && !correctionReviewNote.trim()}>
                            {correctionReviewAction === 'approve' ? 'Approve and rebuild attendance' : 'Reject correction'}
                        </Button>
                    </div>
                )}
            >
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {correctionReviewRequest && `Requested correction for ${employeeMap.get(correctionReviewRequest.employeeId)?.name || correctionReviewRequest.employeeId} on ${dateLabel(correctionReviewRequest.workDate)}.`}
                </p>
                {correctionReviewRequest && (
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300">
                        <div><strong>Clock-in:</strong> {dateTimeLabel(correctionReviewRequest.requestedClockInAt)}</div>
                        <div><strong>Clock-out:</strong> {dateTimeLabel(correctionReviewRequest.requestedClockOutAt)}</div>
                        <div className="mt-2"><strong>Reason:</strong> {correctionReviewRequest.reason}</div>
                        {correctionReviewRequest.sourceDocumentRef && <div className="mt-1"><strong>Document:</strong> {correctionReviewRequest.sourceDocumentRef}</div>}
                    </div>
                )}
                <div>
                    <label htmlFor="correction-review-note" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{correctionReviewAction === 'reject' ? 'Rejection note *' : 'Review note (optional)'}</label>
                    <textarea id="correction-review-note" value={correctionReviewNote} onChange={e => setCorrectionReviewNote(e.target.value)} rows={4} placeholder={correctionReviewAction === 'reject' ? 'Explain why the correction was rejected.' : 'Add an approval note if needed.'} className="mt-1 block w-full rounded-md border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                </div>
            </Modal>
        </div>
    );
};

export default AttendanceExceptions;
