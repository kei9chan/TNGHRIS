
import React, { useState, useEffect, useMemo } from 'react';
import { AssetRequestStatus, Asset, AssetAssignment, AssetStatus, EnrichedAssetRequest } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import FileUploader from '../ui/FileUploader';
import Input from '../ui/Input';

interface AssetReturnConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (assignmentId: string, returnCondition: string, newStatus: AssetStatus, managerProofUrl?: string) => void;
    request: EnrichedAssetRequest;
    onRejectRequest: () => void;
    isActionable: boolean;
    assets: Asset[];
    assignments: AssetAssignment[];
}

const AssetReturnConfirmationModal: React.FC<AssetReturnConfirmationModalProps> = ({ isOpen, onClose, onConfirm, request, onRejectRequest, isActionable, assets, assignments }) => {
    const [returnCondition, setReturnCondition] = useState('');
    const [newStatus, setNewStatus] = useState<AssetStatus>(AssetStatus.Available);
    const [managerProofFile, setManagerProofFile] = useState<File | null>(null);
    const [managerProofLink, setManagerProofLink] = useState('');


    const assignment = useMemo(() => {
        return assignments.find(a => a.assetId === request.assetId && a.employeeId === request.employeeId && !a.dateReturned);
    }, [request, assignments]);

    useEffect(() => {
        if (isOpen) {
            setReturnCondition(assignment?.conditionOnReturn || '');
            const asset = assets.find(a => a.id === request.assetId);
            setNewStatus(asset?.status || AssetStatus.Available);
            setManagerProofFile(null);
            setManagerProofLink('');
        }
    }, [isOpen, request, assignment, assets]);

    const handleConfirm = () => {
        if (!assignment) {
            alert("Could not find an active assignment for this asset and employee.");
            return;
        }
        if (!returnCondition.trim()) {
            alert('Please describe the condition of the returned asset.');
            return;
        }
        const proofUrl = managerProofFile ? `file://${managerProofFile.name}` : managerProofLink;
        onConfirm(assignment.id, returnCondition, newStatus, proofUrl);
    };

    const footer = (
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>
                {isActionable ? 'Cancel' : 'Close'}
            </Button>
            {isActionable && (
                <>
                    <Button variant="danger" onClick={onRejectRequest}>Reject Submission</Button>
                    <Button onClick={handleConfirm}>Confirm Return &amp; Approve Request</Button>
                </>
            )}
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Return Details for ${request.assetTag}`} footer={footer}>
            <div className="space-y-4">
                <p>You are reviewing the return of <span className="font-semibold">{request.assetName}</span> from <span className="font-semibold">{request.employeeName}</span>.</p>
                
                <div className="p-4 bg-gray-100 dark:bg-slate-900/40 rounded-lg border dark:border-slate-600">
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Employee's Submission</h4>
                    <p className="text-xs text-gray-500">Submitted on: {request.employeeSubmittedAt ? new Date(request.employeeSubmittedAt).toLocaleString() : 'N/A'}</p>
                    <p className="mt-2 text-sm"><strong>Notes:</strong> {request.employeeSubmissionNotes || 'No notes provided.'}</p>
                    {request.employeeProofUrl && (
                        <p className="mt-1 text-sm">
                            <strong>Proof:</strong> 
                            <a href={request.employeeProofUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline ml-2 truncate">
                                {request.employeeProofUrl}
                            </a>
                        </p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Asset Status</label>
                    <select
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value as AssetStatus)}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                        disabled={!isActionable}
                    >
                        <option value={AssetStatus.Available}>Available</option>
                        <option value={AssetStatus.InRepair}>In Repair</option>
                        <option value={AssetStatus.Retired}>Retired (Lost/Damaged)</option>
                    </select>
                </div>
                <Textarea
                    label="Condition on Return (Verified by Manager)"
                    id="returnCondition"
                    value={returnCondition}
                    onChange={(e) => setReturnCondition(e.target.value)}
                    rows={3}
                    placeholder="e.g., Verified good condition, minor scratches on the lid. Charger included."
                    required
                    disabled={!isActionable}
                />
                
                {isActionable ? (
                     <div className="pt-4 border-t dark:border-gray-600">
                        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Additional Proof (Optional)</h4>
                        <FileUploader onFileUpload={setManagerProofFile} maxSize={2 * 1024 * 1024} />
                        <div className="relative my-2"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300 dark:border-gray-600" /></div><div className="relative flex justify-center"><span className="bg-white dark:bg-slate-800 px-2 text-sm text-gray-500">OR</span></div></div>
                        <Input label="" id="manager-proof-link" value={managerProofLink} onChange={e => setManagerProofLink(e.target.value)} placeholder="Submit a link for proof..." />
                    </div>
                ) : (
                    assignment?.managerProofUrlOnReturn && (
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/40 rounded-lg border dark:border-blue-600">
                            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Manager's Proof</h4>
                            <p className="mt-1 text-sm">
                                <a href={assignment.managerProofUrlOnReturn} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline truncate">
                                    {assignment.managerProofUrlOnReturn}
                                </a>
                            </p>
                        </div>
                    )
                )}
            </div>
        </Modal>
    );
};

export default AssetReturnConfirmationModal;
