
import React, { useState, useEffect } from 'react';
import { WFHRequest, WFHRequestStatus } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

interface WFHRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Partial<WFHRequest>) => void;
    request: WFHRequest | null;
}

const WFHRequestModal: React.FC<WFHRequestModalProps> = ({ isOpen, onClose, onSave, request }) => {
    const [date, setDate] = useState('');
    const [reason, setReason] = useState('');
    const [reportLink, setReportLink] = useState('');
    
    const isNew = !request;
    const isPending = request?.status === WFHRequestStatus.Pending;
    const isApproved = request?.status === WFHRequestStatus.Approved;
    const isRejected = request?.status === WFHRequestStatus.Rejected;

    // Fields are editable if it's a new request or pending.
    // Report link is editable if approved.
    const canEditDetails = isNew || isPending;
    const canEditReport = isApproved;

    useEffect(() => {
        if (isOpen) {
            if (request) {
                setDate(new Date(request.date).toISOString().split('T')[0]);
                setReason(request.reason);
                setReportLink(request.reportLink || '');
            } else {
                // Default to tomorrow
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                setDate(tomorrow.toISOString().split('T')[0]);
                setReason('');
                setReportLink('');
            }
        }
    }, [isOpen, request]);

    const handleSave = () => {
        if (!date || !reason) {
            alert("Date and Reason are required.");
            return;
        }
        onSave({
            id: request?.id,
            date: new Date(date),
            reason,
            reportLink
        });
    };

    const getTitle = () => {
        if (isNew) return 'Request Work From Home';
        if (isApproved) return 'Update WFH Report';
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
                    {!isRejected && (
                         <Button onClick={handleSave}>
                             {isNew ? 'Submit Request' : 'Save Changes'}
                         </Button>
                    )}
                </div>
            }
        >
            <div className="space-y-4">
                {isRejected && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md">
                         <p className="text-red-800 dark:text-red-200 font-medium">Request Rejected</p>
                         {request.rejectionReason && <p className="text-sm text-red-600 dark:text-red-300 mt-1">Reason: {request.rejectionReason}</p>}
                    </div>
                )}

                {isApproved && (
                    <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md">
                         <p className="text-green-800 dark:text-green-200 font-medium">Request Approved</p>
                         <p className="text-sm text-green-600 dark:text-green-300 mt-1">Please submit your accomplishment report link below once your shift is done.</p>
                    </div>
                )}

                <Input 
                    label="Date" 
                    type="date" 
                    value={date} 
                    onChange={e => setDate(e.target.value)} 
                    required 
                    disabled={!canEditDetails}
                />
                
                <Textarea 
                    label="Reason / Plan" 
                    value={reason} 
                    onChange={e => setReason(e.target.value)} 
                    rows={4} 
                    required 
                    disabled={!canEditDetails}
                    placeholder="e.g., Bad weather, tasks can be done remotely..."
                />

                {(isApproved || isNew) && (
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
