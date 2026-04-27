import { supabase } from '../../services/supabaseClient';
import React, { useState, useEffect, useMemo } from 'react';
import { Resignation, ResignationStatus, Role, OnboardingChecklist, OnboardingTask, OnboardingTaskStatus, NotificationType, Asset, AssetAssignment, AssetStatus } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import AssignOnboardingModal from './AssignOnboardingModal';
import RejectReasonModal from '../feedback/RejectReasonModal';
import { logActivity } from '../../services/auditService';
import { useAuth } from '../../hooks/useAuth';
import AssetReturnModal from './AssetReturnModal';

interface ResignationDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    resignation: Resignation;
    onUpdate: () => void;
}

const DetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-gray-900 dark:text-white">{children}</dd>
    </div>
);

const ResignationDetailModal: React.FC<ResignationDetailModalProps> = ({ isOpen, onClose, resignation, onUpdate }) => {
    const { user } = useAuth();
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);

    // New state for Asset Return
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [assetToReturn, setAssetToReturn] = useState<{ asset: Asset, assignment: AssetAssignment } | null>(null);

    const [assets, setAssets] = useState<Asset[]>([]);
    const [assignments, setAssignments] = useState<AssetAssignment[]>([]);
    const [isLoadingAssets, setIsLoadingAssets] = useState(false);

    useEffect(() => {
        let active = true;
        const loadAssets = async () => {
            if (!resignation || !isOpen) return;
            setIsLoadingAssets(true);
            try {
                const { data: assignmentRows, error: assignmentError } = await supabase
                    .from('asset_assignments')
                    .select('id, asset_id, employee_id, condition_on_assign, is_acknowledged, date_assigned, date_returned, acknowledged_at, signed_document_url, condition_on_return')
                    .eq('employee_id', resignation.employeeId)
                    .order('date_assigned', { ascending: false });
                if (assignmentError) throw assignmentError;

                const mappedAssignments: AssetAssignment[] =
                    (assignmentRows || []).map((row: any) => ({
                        id: row.id,
                        assetId: row.asset_id,
                        employeeId: row.employee_id,
                        conditionOnAssign: row.condition_on_assign || '',
                        conditionOnReturn: row.condition_on_return || undefined,
                        isAcknowledged: !!row.is_acknowledged,
                        dateAssigned: row.date_assigned ? new Date(row.date_assigned) : new Date(),
                        dateReturned: row.date_returned ? new Date(row.date_returned) : undefined,
                        acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
                        signedDocumentUrl: row.signed_document_url || undefined,
                    })) || [];

                const assetIds = Array.from(new Set(mappedAssignments.map(a => a.assetId)));
                let mappedAssets: Asset[] = [];
                if (assetIds.length > 0) {
                    const { data: assetRows, error: assetError } = await supabase
                        .from('assets')
                        .select('id, asset_tag, name, type, business_unit_id, serial_number, purchase_date, value, status, notes')
                        .in('id', assetIds);
                    if (assetError) throw assetError;
                    mappedAssets =
                        (assetRows || []).map((row: any) => ({
                            id: row.id,
                            assetTag: row.asset_tag,
                            name: row.name,
                            type: row.type,
                            businessUnitId: row.business_unit_id,
                            serialNumber: row.serial_number || undefined,
                            purchaseDate: row.purchase_date ? new Date(row.purchase_date) : undefined,
                            value: row.value ?? undefined,
                            status: row.status,
                            notes: row.notes || undefined,
                        })) || [];
                }

                if (!active) return;
                setAssignments(mappedAssignments);
                setAssets(mappedAssets);
            } catch (err) {
                console.error('Failed to load employee assets', err);
            } finally {
                if (active) setIsLoadingAssets(false);
            }
        };

        loadAssets();
        return () => {
            active = false;
        };
    }, [resignation, isOpen, onUpdate]);

    const assignedAssets = useMemo(() => {
        const activeAssignments = assignments.filter(a => a.employeeId === resignation.employeeId);
        return activeAssignments.map(assignment => {
            const asset = assets.find(a => a.id === assignment.assetId);
            if (!asset) return null;
            return { assignment, asset };
        }).filter((item): item is { assignment: AssetAssignment, asset: Asset } => item !== null);
    }, [assignments, assets, resignation]);

    const allAssetsReturned = useMemo(() => {
        if (assignedAssets.length === 0) return true;
        const activeAssignments = assignedAssets.filter(item => !item.assignment.dateReturned);
        return activeAssignments.length === 0;
    }, [assignedAssets]);


    const handleAcknowledgeClick = async () => {
        try {
            const { error } = await supabase
                .from('resignations')
                .update({ status: ResignationStatus.ForClearance })
                .eq('id', resignation.id);
            if (error) throw error;

            if(user) {
                logActivity(user, 'APPROVE', 'Resignation', resignation.id, `Acknowledged resignation and began offboarding.`);
            }
            alert("Resignation acknowledged. Offboarding process has begun.");
            onUpdate();
            onClose();
        } catch (err) {
            console.error("Failed to acknowledge resignation:", err);
            alert("Failed to update status. Please try again.");
        }
    };

    const handleConfirmReject = async (reason: string) => {
        try {
            const { error } = await supabase
                .from('resignations')
                .update({ 
                    status: ResignationStatus.ReturnedForEdits,
                    rejection_reason: reason 
                })
                .eq('id', resignation.id);
            if (error) throw error;

            // Note: Notifications implementation skipped if not available, but we try inserting
            try {
                await supabase.from('notifications').insert({
                    user_id: resignation.employeeId,
                    type: NotificationType.ResignationReturned,
                    message: `Your resignation was returned by HR. Reason: ${reason}`,
                    link: '/submit-resignation',
                    is_read: false,
                    related_entity_id: resignation.id
                });
            } catch (notifErr) {
                console.warn('Failed to insert notification:', notifErr);
            }

            if(user) {
                logActivity(user, 'REJECT', 'Resignation', resignation.id, `Rejected resignation. Reason: ${reason}`);
            }
            
            alert("Resignation has been returned to the employee with your notes.");
            onUpdate();
            setIsRejectModalOpen(false);
            onClose();
        } catch (err) {
            console.error("Failed to reject resignation:", err);
            alert("Failed to update status. Please try again.");
        }
    };
    
    const handleCompleteOffboarding = async () => {
        if (!user) return;

        try {
            const { error: updateResError } = await supabase
                .from('resignations')
                .update({ status: ResignationStatus.Completed })
                .eq('id', resignation.id);
            
            if (updateResError) throw updateResError;

            const { error } = await supabase
                .from('hris_users')
                .update({ 
                    status: 'Inactive', 
                    end_date: resignation.lastWorkingDay 
                })
                .eq('id', resignation.employeeId);
                
            if (error) {
                console.error("Error updating user status in DB:", error);
                alert("Failed to update user status in the database.");
            }

            logActivity(user, 'UPDATE', 'Resignation', resignation.id, `Completed offboarding clearance for ${resignation.employeeName}.`);
            alert('Offboarding complete. Employee has been marked as inactive.');
            onUpdate();
            onClose();
        } catch (err) {
            console.error("Failed to execute DB update:", err);
            alert("Failed to complete offboarding.");
        }
    };

    const handleConfirmReturn = async (assignmentId: string, returnCondition: string, newStatus: AssetStatus) => {
        const item = assignedAssets.find(a => a.assignment.id === assignmentId);
        if (!item) return;

        try {
            const { error: assignmentError } = await supabase
                .from('asset_assignments')
                .update({
                    date_returned: new Date().toISOString(),
                    condition_on_return: returnCondition
                })
                .eq('id', assignmentId);
            
            if (assignmentError) throw assignmentError;

            const { error: assetError } = await supabase
                .from('assets')
                .update({
                    status: newStatus
                })
                .eq('id', item.asset.id);
            
            if (assetError) throw assetError;

            if(user) {
                logActivity(user, 'UPDATE', 'AssetAssignment', assignmentId, `Marked asset as returned for employee ID ${resignation.employeeId}.`);
            }
            onUpdate();
            setIsReturnModalOpen(false);
            setAssetToReturn(null);
        } catch (err) {
            console.error("Failed to mark asset as returned:", err);
            alert("Failed to mark asset as returned.");
        }
    };

    const footer = (
        <div className="flex justify-end w-full space-x-2">
            {resignation.status === ResignationStatus.PendingHRReview ? (
                <>
                    <Button variant="danger" onClick={() => setIsRejectModalOpen(true)}>Return for Edits</Button>
                    <Button onClick={handleAcknowledgeClick}>Acknowledge & Begin Offboarding</Button>
                </>
            ) : resignation.status === ResignationStatus.ForClearance ? (
                 <Button onClick={handleCompleteOffboarding} disabled={!allAssetsReturned} title={!allAssetsReturned ? 'All assets must be marked as returned first.' : ''}>
                    Complete Offboarding
                </Button>
            ) : (
                <Button variant="secondary" onClick={onClose}>Close</Button>
            )}
        </div>
    );
    
    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={`Resignation Details: ${resignation.employeeName}`}
                footer={footer}
            >
                <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                    <DetailItem label="Employee">{resignation.employeeName}</DetailItem>
                    <DetailItem label="Submission Date">{new Date(resignation.submissionDate).toLocaleString()}</DetailItem>
                    <DetailItem label="Last Working Day">{new Date(resignation.lastWorkingDay).toLocaleDateString()}</DetailItem>
                    <DetailItem label="Status">{resignation.status}</DetailItem>
                    <div className="sm:col-span-2">
                        <DetailItem label="Reason for Resignation">
                            <p className="whitespace-pre-wrap p-3 bg-gray-50 dark:bg-gray-900/50 border dark:border-gray-700 rounded-md">
                                {resignation.reason}
                            </p>
                        </DetailItem>
                    </div>
                    <div className="sm:col-span-2">
                        <DetailItem label="Attachment">
                            {resignation.attachmentUrl ? (
                                <a href={resignation.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">{resignation.attachmentUrl}</a>
                            ) : (
                                'No attachment provided.'
                            )}
                        </DetailItem>
                    </div>
                </dl>
                {resignation.status === ResignationStatus.ForClearance && (
                    <div className="pt-4 mt-4 border-t dark:border-gray-600">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Assigned Assets for Clearance</h3>
                        {isLoadingAssets ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Loading assets...</p>
                        ) : assignedAssets.length > 0 ? (
                            <ul className="mt-2 space-y-3">
                                {assignedAssets.map(({ asset, assignment }) => (
                                    <li key={asset.id} className="p-3 bg-gray-100 dark:bg-gray-700/50 rounded-md flex justify-between items-center">
                                        <div>
                                            <p className="font-semibold">{asset.assetTag} - {asset.name}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Assigned: {new Date(assignment.dateAssigned).toLocaleDateString()} | Condition: {assignment.conditionOnAssign}</p>
                                            {assignment.dateReturned && (
                                                <p className="text-xs font-bold text-green-600 dark:text-green-400 mt-1">
                                                    Returned on {new Date(assignment.dateReturned).toLocaleDateString()}
                                                </p>
                                            )}
                                        </div>
                                        {!assignment.dateReturned && (
                                            <Button size="sm" onClick={() => {
                                                setAssetToReturn({ asset, assignment });
                                                setIsReturnModalOpen(true);
                                            }}>
                                                Mark as Returned
                                            </Button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">No assets assigned to this employee.</p>
                        )}
                    </div>
                )}
            </Modal>

            {assetToReturn && (
                <AssetReturnModal
                    isOpen={isReturnModalOpen}
                    onClose={() => setIsReturnModalOpen(false)}
                    asset={assetToReturn.asset}
                    assignment={assetToReturn.assignment}
                    onConfirm={handleConfirmReturn}
                />
            )}
            
            <RejectReasonModal
                isOpen={isRejectModalOpen}
                onClose={() => setIsRejectModalOpen(false)}
                onSubmit={handleConfirmReject}
                title="Reason for Rejection"
                prompt="Please provide a reason for returning this resignation. This will be visible to the employee."
                submitText="Return to Employee"
            />
        </>
    );
};

export default ResignationDetailModal;