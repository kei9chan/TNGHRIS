import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

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
        if(isOpen) {
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
            title={title || "Reason for Rejection"}
            footer={
                <div className="flex w-full justify-end space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button variant="danger" onClick={handleSubmit} disabled={!reason.trim()}>{submitText || 'Confirm Rejection'}</Button>
                </div>
            }
        >
            <Textarea
                label={prompt || "Please provide a reason for rejecting this resolution. This will be visible to HR."}
                id="rejection-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                required
                autoFocus
            />
        </Modal>
    );
};

export default RejectReasonModal;