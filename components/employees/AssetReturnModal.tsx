import React, { useState, useEffect } from 'react';
import { Asset, AssetAssignment, AssetStatus } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';

interface AssetReturnModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (assignmentId: string, returnCondition: string, newStatus: AssetStatus) => void;
    asset: Asset;
    assignment: AssetAssignment;
}

const AssetReturnModal: React.FC<AssetReturnModalProps> = ({ isOpen, onClose, onConfirm, asset, assignment }) => {
    const [returnCondition, setReturnCondition] = useState('');
    const [newStatus, setNewStatus] = useState<AssetStatus>(AssetStatus.Available);

    useEffect(() => {
        if (isOpen) {
            setReturnCondition('');
            setNewStatus(AssetStatus.Available);
        }
    }, [isOpen]);

    const handleConfirm = () => {
        if (!returnCondition.trim()) {
            alert('Please describe the condition of the returned asset.');
            return;
        }
        onConfirm(assignment.id, returnCondition, newStatus);
    };

    const footer = (
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleConfirm}>Confirm Return</Button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Mark "${asset.name}" as Returned`} footer={footer}>
            <div className="space-y-4">
                <p>You are marking <span className="font-semibold">{asset.assetTag} - {asset.name}</span> as returned. Please update its status and condition.</p>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Asset Status</label>
                    <select
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value as AssetStatus)}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                    >
                        <option value={AssetStatus.Available}>Available</option>
                        <option value={AssetStatus.InRepair}>In Repair</option>
                        <option value={AssetStatus.Retired}>Retired</option>
                    </select>
                </div>
                <Textarea
                    label="Condition on Return"
                    id="returnCondition"
                    value={returnCondition}
                    onChange={(e) => setReturnCondition(e.target.value)}
                    rows={3}
                    placeholder="e.g., Good condition, minor scratches on the lid. Charger included."
                    required
                />
            </div>
        </Modal>
    );
};

export default AssetReturnModal;