
import React, { useState, useEffect } from 'react';
import { WFHRequest } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';

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

    const handleApproveClick = () => {
        if (window.confirm(`Approve WFH request for ${request.employeeName} on ${new Date(request.date).toLocaleDateString()}?`)) {
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
            title="Review WFH Request"
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
                <div className="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-100 dark:border-teal-800">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <span className="block text-xs uppercase text-gray-500 dark:text-gray-400 font-semibold">Employee</span>
                            <span className="block mt-1 text-lg font-bold text-gray-900 dark:text-white">{request.employeeName}</span>
                        </div>
                        <div>
                            <span className="block text-xs uppercase text-gray-500 dark:text-gray-400 font-semibold">Requested Date</span>
                            <span className="block mt-1 text-lg font-bold text-gray-900 dark:text-white">
                                {new Date(request.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </span>
                        </div>
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
