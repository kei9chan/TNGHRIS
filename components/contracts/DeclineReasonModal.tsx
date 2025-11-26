import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

interface DeclineReasonModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (reason: string) => void;
}

const DeclineReasonModal: React.FC<DeclineReasonModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const [reason, setReason] = useState('');

    const handleSubmit = () => {
        if (reason.trim()) {
            onSubmit(reason);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Reason for Declining"
            footer={
                <div className="flex w-full justify-end space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button variant="danger" onClick={handleSubmit} disabled={!reason.trim()}>Decline Document</Button>
                </div>
            }
        >
            <Textarea
                label="Please provide a reason for declining this document. This will be recorded in the audit trail."
                id="rejection-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                required
            />
        </Modal>
    );
};

export default DeclineReasonModal;