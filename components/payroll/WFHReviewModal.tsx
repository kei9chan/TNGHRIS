
import React, { useState, useEffect } from 'react';
import { WFHRequest } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import {
    approvalContextNumber,
    formatApprovalNumber,
    getApprovalStatusLabel,
    getApprovalStepLabel,
    getTimeApprovalNextStep,
    getTimeApprovalReason,
} from '../../utils/approvalPresentation';

interface WFHReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    request: WFHRequest | null;
    onApprove: (requestId: string) => void;
    onReject: (requestId: string, reason: string) => void;
}

const WFHReviewModal: React.FC<WFHReviewModalProps> = ({ isOpen, onClose, request, onApprove, onReject }) => {
    const [rejectReason, setRejectReason] = useState('');
    const [isRejecting, setIsRejecting] = useState(false);

    // Reset state when modal opens/closes or request changes
    useEffect(() => {
        if (isOpen) {
            setIsRejecting(false);
            setRejectReason('');
        }
    }, [isOpen, request]);

    if (!request) return null;

    const stageText = getApprovalStepLabel(request.status);
    const statusText = getApprovalStatusLabel(request.status);
    const monthlyWfhDays = approvalContextNumber(request.approvalContext, 'monthWfhDays');
    const threshold = approvalContextNumber(request.approvalContext, 'threshold');
    const requiresBod = request.approvalRoute === 'BOD_REQUIRED';
    const approvalReason = getTimeApprovalReason('wfh', request.approvalContext, request.approvalReason, requiresBod);
    const nextStep = getTimeApprovalNextStep(request.status, requiresBod);
    const monthCovered = request.approvalContext?.month ? String(request.approvalContext.month) : undefined;
    const hasEndDate = !!request.endDate && new Date(request.endDate).getTime() !== new Date(request.date).getTime();
    const dayCount = hasEndDate
        ? Math.round((new Date(request.endDate!).getTime() - new Date(request.date).getTime()) / (1000 * 60 * 60 * 24)) + 1
        : 1;

    const handleApproveClick = () => {
        const fromStr = new Date(request.date).toLocaleDateString();
        const dateStr = hasEndDate
            ? `${fromStr} to ${new Date(request.endDate!).toLocaleDateString()} (${dayCount} day${dayCount !== 1 ? 's' : ''})`
            : fromStr;
        if (window.confirm(`Approve WFH request for ${request.employeeName} on ${dateStr}?`)) {
            onApprove(request.id);
        }
    };

    const handleRejectClick = () => {
        setIsRejecting(true);
    };

    const confirmReject = () => {
        if (!rejectReason.trim()) {
            alert("Please provide a reason for rejection.");
            return;
        }
        onReject(request.id, rejectReason);
        setIsRejecting(false);
        setRejectReason('');
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Review WFH Request (${stageText})`}
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                    {!isRejecting && (
                        <>
                            <Button variant="danger" onClick={handleRejectClick}>Reject</Button>
                            <Button variant="success" onClick={handleApproveClick}>Approve</Button>
                        </>
                    )}
                </div>
            }
        >
            <div className="space-y-6">
                {/* Status stage badge */}
                <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                            {statusText}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            Submitted {request.createdAt ? new Date(request.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </span>
                </div>

                <div className="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-100 dark:border-teal-800">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <span className="block text-xs uppercase text-gray-500 dark:text-gray-400 font-semibold">Employee</span>
                            <span className="block mt-1 text-lg font-bold text-gray-900 dark:text-white">{request.employeeName}</span>
                        </div>
                        <div>
                            <span className="block text-xs uppercase text-gray-500 dark:text-gray-400 font-semibold">
                                {hasEndDate ? 'From' : 'Requested Date'}
                            </span>
                            <span className="block mt-1 text-lg font-bold text-gray-900 dark:text-white">
                                {new Date(request.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </span>
                        </div>
                        {hasEndDate && (
                            <div>
                                <span className="block text-xs uppercase text-gray-500 dark:text-gray-400 font-semibold">Until</span>
                                <span className="block mt-1 text-lg font-bold text-gray-900 dark:text-white">
                                    {new Date(request.endDate!).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                </span>
                            </div>
                        )}
                        {hasEndDate && (
                            <div>
                                <span className="block text-xs uppercase text-gray-500 dark:text-gray-400 font-semibold">Duration</span>
                                <span className="block mt-1 text-lg font-bold text-gray-900 dark:text-white">
                                    {dayCount} day{dayCount !== 1 ? 's' : ''}
                                </span>
                            </div>
                        )}
                        <div className="md:col-span-2">
                            <span className="block text-xs uppercase text-gray-500 dark:text-gray-400 font-semibold mb-1">Reason / Plan</span>
                            <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200">
                                {request.reason}
                            </div>
                        </div>
                        
                        {request.reportLink && (
                             <div className="md:col-span-2">
                                <span className="block text-xs uppercase text-gray-500 dark:text-gray-400 font-semibold">Accomplishment Report</span>
                                <a href={request.reportLink} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline truncate block mt-1 font-medium">
                                    {request.reportLink}
                                </a>
                            </div>
                        )}
                    </div>
                </div>

                {(approvalReason || monthlyWfhDays !== undefined || threshold !== undefined) && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-800">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Current step</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">{stageText}</p></div>
                            {monthCovered && <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Month covered</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">{monthCovered}</p></div>}
                            {approvalReason && <div className="sm:col-span-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Details</p><p className="mt-1 text-slate-800 dark:text-slate-100">{approvalReason}</p></div>}
                            {monthlyWfhDays !== undefined && <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Monthly WFH</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">{formatApprovalNumber(monthlyWfhDays)} day{monthlyWfhDays === 1 ? '' : 's'}</p></div>}
                            {threshold !== undefined && <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Monthly limit</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">{formatApprovalNumber(threshold)} days</p></div>}
                        </div>
                        {nextStep && <span className="mt-4 inline-flex rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-200">{nextStep}</span>}
                    </div>
                )}

                {isRejecting && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg animate-fade-in-down">
                        <Textarea 
                            label="Reason for Rejection" 
                            value={rejectReason} 
                            onChange={e => setRejectReason(e.target.value)} 
                            required 
                            autoFocus
                            placeholder="Why is this request being rejected?"
                        />
                        <div className="mt-3 flex justify-end space-x-2">
                            <Button size="sm" variant="secondary" onClick={() => setIsRejecting(false)}>Cancel</Button>
                            <Button size="sm" variant="danger" onClick={confirmReject}>Confirm Rejection</Button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default WFHReviewModal;
