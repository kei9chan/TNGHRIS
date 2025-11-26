
import React from 'react';
import { EnrichedAssetRequest } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface AssetRejectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onResubmit: () => void;
    request: EnrichedAssetRequest;
}

const AssetRejectionModal: React.FC<AssetRejectionModalProps> = ({ isOpen, onClose, onResubmit, request }) => {
    
    const footer = (
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button onClick={onResubmit}>Resubmit Return</Button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Asset Return Rejected" footer={footer}>
            <div className="space-y-4">
                <p>Your return submission for <span className="font-semibold">{request.assetName}</span> was rejected by your manager.</p>
                <div className="p-4 bg-red-50 dark:bg-red-900/40 rounded-lg border border-red-200 dark:border-red-700">
                    <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">Manager's Reason:</h4>
                    <p className="mt-2 text-sm text-red-700 dark:text-red-300 italic">
                        "{request.rejectionReason || 'No reason provided.'}"
                    </p>
                </div>
                <p>Please click "Resubmit Return" to provide new proof or details.</p>
            </div>
        </Modal>
    );
};

export default AssetRejectionModal;
