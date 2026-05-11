
import React, { useState, useEffect } from 'react';
import { WFHRequest, WFHRequestStatus } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

interface WFHRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Partial<WFHRequest>, isDraft: boolean) => void;
    request: WFHRequest | null;
}

const WFHRequestModal: React.FC<WFHRequestModalProps> = ({ isOpen, onClose, onSave, request }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');
    const [reportLink, setReportLink] = useState('');
    
    const isNew = !request;
    const isPendingSubmission = request?.status === WFHRequestStatus.PendingSubmission;
    const isPendingApproval = request?.status === WFHRequestStatus.PendingDeptHead || request?.status === WFHRequestStatus.PendingBOD;
    const isForTimekeeping = request?.status === WFHRequestStatus.ForTimekeeping;
    const isRejected = request?.status === WFHRequestStatus.Rejected;
    // Report is locked once a link has already been saved
    const hasSubmittedReport = isForTimekeeping && !!request?.reportLink;

    // Fields are editable if it's a new request or pending submission.
    // Report link is only editable if approved-for-timekeeping AND no report submitted yet.
    const canEditDetails = isNew || isPendingSubmission;
    const canEditReport = isForTimekeeping && !hasSubmittedReport;

    useEffect(() => {
        if (isOpen) {
            if (request) {
                const sd = new Date(request.date).toISOString().split('T')[0];
                setStartDate(sd);
                setEndDate(request.endDate ? new Date(request.endDate).toISOString().split('T')[0] : sd);
                setReason(request.reason);
                setReportLink(request.reportLink || '');
            } else {
                // Default to tomorrow
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const tStr = tomorrow.toISOString().split('T')[0];
                setStartDate(tStr);
                setEndDate(tStr);
                setReason('');
                setReportLink('');
            }
        }
    }, [isOpen, request]);

    // Auto-correct end date if it's before start date
    useEffect(() => {
        if (startDate && endDate && endDate < startDate) {
            setEndDate(startDate);
        }
    }, [startDate]);

    const handleSave = (isDraft: boolean) => {
        if (!startDate || !endDate || !reason) {
            alert("Date range and Reason are required.");
            return;
        }
        if (endDate < startDate) {
            alert("'Until' date cannot be before the 'From' date.");
            return;
        }
        onSave({
            id: request?.id,
            date: new Date(startDate),
            endDate: new Date(endDate),
            reason,
            reportLink
        }, isDraft);
    };

    const getTitle = () => {
        if (isNew) return 'Request Work From Home';
        if (isForTimekeeping && hasSubmittedReport) return 'WFH Report Submitted';
        if (isForTimekeeping) return 'Submit WFH Accomplishment Report';
        if (isRejected) return 'Rejected Request';
        return 'Edit WFH Request';
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={getTitle()}
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    {(!isRejected && !isPendingApproval && !isForTimekeeping) && (
                         <Button variant="secondary" onClick={() => handleSave(true)}>
                             Save Draft
                         </Button>
                    )}
                    {(!isRejected && !isForTimekeeping && (!request || isPendingSubmission)) && (
                         <Button onClick={() => handleSave(false)}>
                             Submit Request
                         </Button>
                    )}
                    {/* Only show Save when ForTimekeeping AND report not yet submitted */}
                    {(!isRejected && isForTimekeeping && !hasSubmittedReport) && (
                         <Button onClick={() => handleSave(false)}>
                             Submit Report
                         </Button>
                    )}
                </div>
            }
        >
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                {isRejected && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md">
                         <p className="text-red-800 dark:text-red-200 font-medium">Request Rejected</p>
                         {request.rejectionReason && <p className="text-sm text-red-600 dark:text-red-300 mt-1">Reason: {request.rejectionReason}</p>}
                    </div>
                )}

                {isForTimekeeping && !hasSubmittedReport && (
                    <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md">
                         <p className="text-green-800 dark:text-green-200 font-medium">Request Approved ✅</p>
                         <p className="text-sm text-green-600 dark:text-green-300 mt-1">Please submit your accomplishment report link below once your shift is done.</p>
                    </div>
                )}

                {isForTimekeeping && hasSubmittedReport && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md">
                         <p className="text-blue-800 dark:text-blue-200 font-medium">Report Already Submitted 🔒</p>
                         <p className="text-sm text-blue-600 dark:text-blue-300 mt-1">Your accomplishment report has been submitted and can no longer be edited.</p>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <Input 
                        label="From" 
                        type="date" 
                        value={startDate} 
                        onChange={e => setStartDate(e.target.value)} 
                        required 
                        disabled={!canEditDetails}
                    />
                    <Input 
                        label="Until" 
                        type="date" 
                        value={endDate} 
                        onChange={e => setEndDate(e.target.value)} 
                        required 
                        disabled={!canEditDetails}
                        min={startDate}
                    />
                </div>
                
                <Textarea 
                    label="Reason / Plan" 
                    value={reason} 
                    onChange={e => setReason(e.target.value)} 
                    rows={4} 
                    required 
                    disabled={!canEditDetails}
                    placeholder="e.g., Bad weather, tasks can be done remotely..."
                />

                {(isForTimekeeping || isNew) && (
                    <Input 
                        label="Accomplishment Report Link (Optional)" 
                        type="url"
                        value={reportLink} 
                        onChange={e => setReportLink(e.target.value)} 
                        disabled={!canEditReport && !isNew}
                        placeholder="https://docs.google.com/..."
                    />
                )}
            </div>
        </Modal>
    );
};

export default WFHRequestModal;
