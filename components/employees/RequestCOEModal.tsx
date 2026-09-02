import React, { useEffect, useMemo, useState } from 'react';
import {
    COE_PURPOSE_OPTIONS,
    COEPurpose,
    COERequest,
    COERequestStatus,
} from '../../types';
import { useBusinessUnits } from '../../hooks/useHRData';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabaseClient';

interface RequestCOEModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (request: Partial<COERequest>) => void | Promise<void>;
}

const isUuid = (value?: string | null) =>
    !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const RequestCOEModal: React.FC<RequestCOEModalProps> = ({ isOpen, onClose, onSave }) => {
    const { user } = useAuth();
    const { businessUnits } = useBusinessUnits();
    const [purpose, setPurpose] = useState<COEPurpose | null>(null);
    const [otherPurpose, setOtherPurpose] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [positionLabel, setPositionLabel] = useState<string | undefined>(user?.role);

    const businessUnit = useMemo(
        () => businessUnits.find(item => item.id === user?.businessUnitId)
            || businessUnits.find(item => item.name === user?.businessUnit),
        [businessUnits, user?.businessUnit, user?.businessUnitId],
    );
    const businessUnitId = businessUnit?.id || (isUuid(user?.businessUnitId) ? user.businessUnitId : '') || '';

    useEffect(() => {
        if (!isOpen) return;

        setPurpose(null);
        setOtherPurpose('');

        let active = true;
        const roleRequest = user?.id
            ? supabase.from('hris_users').select('role').eq('id', user.id).maybeSingle()
            : Promise.resolve({ data: null });

        roleRequest
            .then(roleResult => {
                if (!active) return;
                setPositionLabel(roleResult.data?.role || user?.role);
            })
            .catch(() => {
                if (!active) return;
                setPositionLabel(user?.role);
            });

        return () => {
            active = false;
        };
    }, [isOpen, user]);

    const handleSave = async () => {
        if (!user) return;
        if (!purpose) {
            alert('Please choose what this COE is for.');
            return;
        }
        if (purpose === COEPurpose.Others && !otherPurpose.trim()) {
            alert('Please specify the purpose.');
            return;
        }
        setIsSubmitting(true);
        try {
            await onSave({
                employeeId: user.id,
                employeeName: user.name,
                businessUnitId,
                purpose,
                otherPurposeDetail: purpose === COEPurpose.Others ? otherPurpose.trim() : undefined,
                dateRequested: new Date(),
                status: COERequestStatus.PendingHRManagerApproval,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Request Certificate of Employment"
            size="3xl"
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button
                        onClick={handleSave}
                        isLoading={isSubmitting}
                        disabled={!purpose || (purpose === COEPurpose.Others && !otherPurpose.trim()) || isSubmitting}
                    >
                        Submit Request
                    </Button>
                </div>
            }
        >
            <div className="space-y-5">
                <div className="p-4 bg-gray-50 dark:bg-slate-700 rounded-md border border-gray-200 dark:border-gray-600">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Employee Details</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="block text-xs text-gray-500 dark:text-gray-400">Name</span>
                            <span className="font-medium text-gray-900 dark:text-white">{user?.name}</span>
                        </div>
                        <div>
                            <span className="block text-xs text-gray-500 dark:text-gray-400">Position</span>
                            <span className="font-medium text-gray-900 dark:text-white">{positionLabel || 'N/A'}</span>
                        </div>
                        <div className="col-span-2">
                            <span className="block text-xs text-gray-500 dark:text-gray-400">Business Unit</span>
                            <span className="font-medium text-gray-900 dark:text-white">{businessUnit?.name || user?.businessUnit || 'N/A'}</span>
                        </div>
                    </div>
                </div>

                <section>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">What is this COE for?</h3>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {COE_PURPOSE_OPTIONS.map(option => {
                            const isSelected = purpose === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => setPurpose(option.value)}
                                    className={`rounded-lg border px-3 py-3 text-left text-sm transition ${isSelected
                                        ? 'border-indigo-500 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-200 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-100 dark:ring-indigo-900'
                                        : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 dark:border-gray-600 dark:bg-slate-800 dark:text-gray-200'}`}
                                >
                                    <span className="font-medium">{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {purpose === COEPurpose.Others && (
                    <Input
                        label="Please specify"
                        value={otherPurpose}
                        onChange={event => setOtherPurpose(event.target.value)}
                        placeholder="Enter purpose..."
                        required
                    />
                )}

                <p className="text-xs text-gray-500 dark:text-gray-400">
                    Your request will be submitted to the active HR Manager for approval. The system will use the default COE format for your business unit and selected purpose.
                </p>
            </div>
        </Modal>
    );
};

export default RequestCOEModal;
