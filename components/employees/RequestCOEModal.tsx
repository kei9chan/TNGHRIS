
import React, { useState, useEffect } from 'react';
import { COEPurpose, COERequest, COERequestStatus } from '../../types';
import { mockBusinessUnits } from '../../services/mockData';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useAuth } from '../../hooks/useAuth';

interface RequestCOEModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (request: Partial<COERequest>) => void;
}

const RequestCOEModal: React.FC<RequestCOEModalProps> = ({ isOpen, onClose, onSave }) => {
    const { user } = useAuth();
    const [purpose, setPurpose] = useState<COEPurpose>(COEPurpose.LoanApplication);
    const [otherPurpose, setOtherPurpose] = useState('');

    useEffect(() => {
        if (isOpen) {
            setPurpose(COEPurpose.LoanApplication);
            setOtherPurpose('');
        }
    }, [isOpen]);

    const handleSave = () => {
        if (purpose === COEPurpose.Others && !otherPurpose.trim()) {
            alert("Please specify the purpose.");
            return;
        }
        
        const businessUnit = mockBusinessUnits.find(b => b.name === user?.businessUnit);

        const request: Partial<COERequest> = {
            employeeId: user?.id,
            employeeName: user?.name,
            businessUnitId: businessUnit?.id || '',
            purpose,
            otherPurposeDetail: purpose === COEPurpose.Others ? otherPurpose : undefined,
            dateRequested: new Date(),
            status: COERequestStatus.Pending
        };
        onSave(request);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Request Certificate of Employment"
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Submit Request</Button>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="p-4 bg-gray-50 dark:bg-slate-700 rounded-md border border-gray-200 dark:border-gray-600">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Employee Details</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="block text-xs text-gray-500 dark:text-gray-400">Name</span>
                            <span className="font-medium text-gray-900 dark:text-white">{user?.name}</span>
                        </div>
                         <div>
                            <span className="block text-xs text-gray-500 dark:text-gray-400">Position</span>
                            <span className="font-medium text-gray-900 dark:text-white">{user?.position}</span>
                        </div>
                         <div className="col-span-2">
                            <span className="block text-xs text-gray-500 dark:text-gray-400">Business Unit</span>
                            <span className="font-medium text-gray-900 dark:text-white">{user?.businessUnit}</span>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Purpose</label>
                    <select
                        value={purpose}
                        onChange={(e) => setPurpose(e.target.value as COEPurpose)}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                    >
                        {Object.values(COEPurpose).map(p => (
                            <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
                        ))}
                    </select>
                </div>

                {purpose === COEPurpose.Others && (
                    <Input
                        label="Please specify"
                        value={otherPurpose}
                        onChange={(e) => setOtherPurpose(e.target.value)}
                        placeholder="Enter purpose..."
                        required
                    />
                )}
                
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    Your request will be submitted to HR for approval. Once approved, you will be able to download the certificate from your profile documents.
                </p>
            </div>
        </Modal>
    );
};

export default RequestCOEModal;
