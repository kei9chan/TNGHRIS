import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

// FIX: Add optional props for title, prompt, and submitText to make the modal more flexible.
interface RejectReasonModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (reason: string) => void;
    title?: string;
    prompt?: string;
    submitText?: string;
}

const RejectReasonModal: React.FC<RejectReasonModalProps> = ({ isOpen, onClose, onSubmit, title, prompt, submitText }) => {
    const [reason, setReason] = useState('');

    useEffect(() => {
        if (isOpen) {
            setReason('');
        }
    }, [isOpen]);

    const handleSubmit = () => {
        if (reason.trim()) {
            onSubmit(reason);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            // FIX: Use the title prop with a fallback.
            title={title || "Reason for Rejection"}
            footer={
                <div className="flex w-full justify-end space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    {/* FIX: Use the submitText prop with a fallback. */}
                    <Button variant="danger" onClick={handleSubmit} disabled={!reason.trim()}>{submitText || 'Reject Submission'}</Button>
                </div>
            }
        >
            <Textarea
                // FIX: Use the prompt prop with a fallback.
                label={prompt || "Please provide a reason for rejecting this change request. This will be visible to the employee."}
                id="rejection-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                required
            />
        </Modal>
    );
};

export default RejectReasonModal;