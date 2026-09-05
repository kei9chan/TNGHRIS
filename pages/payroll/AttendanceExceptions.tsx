import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Permission, User } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import { fetchUsers } from '../../services/userService';
import {
    fetchPayrollAttendanceExceptions,
    PayrollAttendanceException,
    PayrollAttendanceExceptionAction,
    resolvePayrollAttendanceException,
} from '../../services/payrollAttendanceService';
import { formatEmployeeName } from '../../services/formatEmployeeName';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';

type ResolutionAction = 'resolve' | 'reject' | 'waive';

const exceptionTypeLabel = (value: string) => value.replaceAll('_', ' ');

const dateLabel = (value: string) => new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
}).format(new Date(`${value}T00:00:00+08:00`));

const statusClasses = (status: string) => {
    if (status === 'open' || status === 'reopened') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    if (status === 'acknowledged') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    if (status === 'resolved') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    if (status === 'waived') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
};

const severityClasses = (severity: string) => {
    if (severity === 'blocking') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    if (severity === 'warning') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
};

const AttendanceExceptions: React.FC = () => {
    const { can } = usePermissions();
    const canView = can('Exceptions', Permission.View);
    const canManage = can('Exceptions', Permission.Manage);

    const [exceptions, setExceptions] = useState<PayrollAttendanceException[]>([]);
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

    const employeeMap = useMemo(
        () => new Map(employees.map(employee => [employee.id, employee])),
        [employees]
    );

    const load = useCallback(async () => {
        if (!canView) return;
        setIsLoading(true);
        setError(null);
        try {
            const [exceptionRows, userRows] = await Promise.all([
                fetchPayrollAttendanceExceptions(filters.startDate, filters.endDate),
                fetchUsers(),
            ]);
            setExceptions(exceptionRows);
            setEmployees(userRows);
        } catch (err: any) {
            setError(err.message || 'Failed to load normalized attendance exceptions.');
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

    const resetModal = () => {
        setSelectedException(null);
        setPendingAction(null);
        setResolutionCode('corrected_punch');
        setResolutionNote('');
        setResolutionDocumentRef('');
    };

    const closeModal = () => {
        if (isSaving) return;
        resetModal();
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
            setMessage(`Attendance exception ${action}d successfully. The action was recorded in the workflow history.`);
            resetModal();
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
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Attendance Exceptions (Phase 1I)</h1>
                <p className="mt-1 text-gray-600 dark:text-gray-400">
                    Review server-interpreted attendance exceptions. Evidence and raw punches are read-only; workflow actions are recorded separately.
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
                        <p className="text-sm text-gray-500 dark:text-gray-400">{filteredExceptions.length} record(s) in the selected range.</p>
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
                                const canResolve = canManage && ['open', 'acknowledged', 'reopened'].includes(exception.status);
                                const canAcknowledge = canManage && ['open', 'reopened'].includes(exception.status);
                                const canReopen = canManage && ['resolved', 'rejected', 'waived'].includes(exception.status);
                                const canWaive = canManage && exception.status === 'resolved';
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
                                            {exception.resolutionNote && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Resolution: {exception.resolutionNote}</div>}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm">
                                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusClasses(exception.status)}`}>{exception.status}</span>
                                        </td>
                                        <td className="px-4 py-4 text-right text-sm">
                                            <div className="flex flex-wrap justify-end gap-2">
                                                {canAcknowledge && <Button size="sm" variant="secondary" onClick={() => handleSimpleAction(exception, 'acknowledge')} isLoading={isSaving}>Acknowledge</Button>}
                                                {canResolve && <Button size="sm" onClick={() => openResolution(exception, 'resolve')}>Resolve</Button>}
                                                {canResolve && <Button size="sm" variant="danger" onClick={() => openResolution(exception, 'reject')}>Reject</Button>}
                                                {canWaive && <Button size="sm" variant="secondary" onClick={() => openResolution(exception, 'waive')}>Waive</Button>}
                                                {canReopen && <Button size="sm" variant="secondary" onClick={() => handleSimpleAction(exception, 'reopen')} isLoading={isSaving}>Reopen</Button>}
                                                {!canAcknowledge && !canResolve && !canWaive && !canReopen && <span className="text-xs text-gray-400">No action available</span>}
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
        </div>
    );
};

export default AttendanceExceptions;
