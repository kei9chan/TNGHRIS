import React, { useState, useMemo } from 'react';
import { Resignation, ResignationStatus, Role, OnboardingChecklist, OnboardingTask, OnboardingTaskStatus, NotificationType, Asset, AssetAssignment, AssetStatus } from '../../types';
import { mockResignations, mockOnboardingChecklists, mockOnboardingTemplates, mockUsers, mockNotifications, mockAssets, mockAssetAssignments } from '../../services/mockData';
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

    const assignedAssets = useMemo(() => {
        if (!resignation) return [];
        
        const assignments = mockAssetAssignments.filter(a => a.employeeId === resignation.employeeId);
        
        return assignments.map(assignment => {
            const asset = mockAssets.find(asset => asset.id === assignment.assetId);
            return { assignment, asset };
        }).filter(item => item.asset) as { assignment: AssetAssignment, asset: Asset }[];
    // We use onUpdate as a dependency to force this memo to re-calculate when mock data changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resignation, onUpdate]);

    const allAssetsReturned = useMemo(() => {
        const activeAssignments = assignedAssets.filter(item => !item.assignment.dateReturned);
        return activeAssignments.length === 0;
    }, [assignedAssets]);


    const handleAcknowledgeClick = () => {
        const resIndex = mockResignations.findIndex(r => r.id === resignation.id);
        if (resIndex > -1) {
            mockResignations[resIndex].status = ResignationStatus.ForClearance;
        }
        if(user) {
            logActivity(user, 'APPROVE', 'Resignation', resignation.id, `Acknowledged resignation and began offboarding.`);
        }
        alert("Resignation acknowledged. Offboarding process has begun.");
        onUpdate();
        onClose();
    };

    const handleConfirmReject = (reason: string) => {
        const resIndex = mockResignations.findIndex(r => r.id === resignation.id);
        if (resIndex > -1) {
            mockResignations[resIndex].status = ResignationStatus.ReturnedForEdits;
            mockResignations[resIndex].rejectionReason = reason;
        }

        mockNotifications.push({
            id: `notif-${Date.now()}-${resignation.employeeId}`,
            userId: resignation.employeeId,
            type: NotificationType.ResignationReturned,
            message: `Your resignation was returned by HR. Reason: ${reason}`,
            link: '/submit-resignation',
            isRead: false,
            createdAt: new Date(),
            relatedEntityId: resignation.id,
        });

        if(user) {
            logActivity(user, 'REJECT', 'Resignation', resignation.id, `Rejected resignation. Reason: ${reason}`);
        }
        
        alert("Resignation has been returned to the employee with your notes.");
        onUpdate();
        setIsRejectModalOpen(false);
        onClose();
    };
    
    const handleCompleteOffboarding = () => {
        if (!user) return;
        const resIndex = mockResignations.findIndex(r => r.id === resignation.id);
        if (resIndex > -1) {
            mockResignations[resIndex].status = ResignationStatus.Completed;
        }

        const userIndex = mockUsers.findIndex(u => u.id === resignation.employeeId);
        if (userIndex > -1) {
            mockUsers[userIndex].status = 'Inactive';
            mockUsers[userIndex].endDate = resignation.lastWorkingDay;
        }

        logActivity(user, 'UPDATE', 'Resignation', resignation.id, `Completed offboarding clearance for ${resignation.employeeName}.`);
        alert('Offboarding complete. Employee has been marked as inactive.');
        onUpdate();
        onClose();
    };

    const handleConfirmReturn = (assignmentId: string, returnCondition: string, newStatus: AssetStatus) => {
        const assignmentIndex = mockAssetAssignments.findIndex(a => a.id === assignmentId);
        if (assignmentIndex === -1) return;

        const updatedAssignment = {
            ...mockAssetAssignments[assignmentIndex],
            dateReturned: new Date(),
            conditionOnReturn: returnCondition,
        };
        mockAssetAssignments[assignmentIndex] = updatedAssignment;

        const assetId = updatedAssignment.assetId;
        const assetIndex = mockAssets.findIndex(a => a.id === assetId);
        if (assetIndex > -1) {
            mockAssets[assetIndex].status = newStatus;
        }
        if(user) {
            logActivity(user, 'UPDATE', 'AssetAssignment', assignmentId, `Marked asset as returned for employee ID ${resignation.employeeId}.`);
        }
        onUpdate();
        setIsReturnModalOpen(false);
        setAssetToReturn(null);
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
                        {assignedAssets.length > 0 ? (
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