import React, { useState, useEffect } from 'react';
import { BusinessUnit } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface BusinessUnitModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (bu: { id?: string, name: string }) => void;
    bu: BusinessUnit | null;
}

const BusinessUnitModal: React.FC<BusinessUnitModalProps> = ({ isOpen, onClose, onSave, bu }) => {
    const [name, setName] = useState('');

    useEffect(() => {
        if (isOpen) {
            setName(bu?.name || '');
        }
    }, [bu, isOpen]);

    const handleSave = () => {
        if (name.trim()) {
            onSave({ id: bu?.id, name });
        } else {
            alert('Business Unit name cannot be empty.');
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={bu ? 'Edit Business Unit' : 'Add New Business Unit'}
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>{bu ? 'Save Changes' : 'Add Business Unit'}</Button>
                </div>
            }
        >
            <Input
                label="Business Unit Name"
                id="bu-name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoFocus
            />
        </Modal>
    );
};

export default BusinessUnitModal;