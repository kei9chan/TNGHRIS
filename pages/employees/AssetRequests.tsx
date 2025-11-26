
import React, { useState, useMemo, useEffect } from 'react';
import { AssetRequest, AssetRequestStatus, Permission, AssetStatus, NotificationType, EnrichedAssetRequest } from '../../types';
import { mockAssetRequests, mockUsers, mockAssets, mockAssetAssignments, mockBusinessUnits, mockNotifications } from '../../services/mockData';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import AssetRequestsTable from '../../components/employees/AssetRequestsTable';
import RejectReasonModal from '../../components/feedback/RejectReasonModal';
import AssetReturnConfirmationModal from '../../components/employees/AssetReturnConfirmationModal';
import { logActivity } from '../../services/auditService';
import AssetReturnSubmissionModal from '../../components/employees/AssetReturnSubmissionModal';
import AssetRejectionModal from '../../components/employees/AssetRejectionModal';
import AssetReturnRequestModal from '../../components/employees/AssetReturnRequestModal';

const AssetRequests: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const canManage = can('AssetRequests', Permission.Approve);
    const canRequest = can('AssetRequests', Permission.Create);

    const [requests, setRequests] = useState<AssetRequest[]>(mockAssetRequests);
    const [isManagerRejectModalOpen, setIsManagerRejectModalOpen] = useState(false);
    const [isReturnConfirmModalOpen, setIsReturnConfirmModalOpen] = useState(false);
    const [isSubmissionModalOpen, setIsSubmissionModalOpen] = useState(false);
    const [isRejectionViewModalOpen, setIsRejectionViewModalOpen] = useState(false);
    const [isReturnRequestModalOpen, setIsReturnRequestModalOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<EnrichedAssetRequest | null>(null);

    // Force re-render if mock data changes
    useEffect(() => {
        const interval = setInterval(() => {
            if (mockAssetRequests.length !== requests.length) {
                setRequests([...mockAssetRequests]);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [requests.length]);

    const [filters, setFilters] = useState({
        searchTerm: '',
        status: 'all',
        type: 'all',
        bu: '',
    });

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const enrichedRequests = useMemo(() => {
        const userMap = new Map(mockUsers.map(u => [u.id, u]));
        const assetMap = new Map(mockAssets.map(a => [a.id, a]));
        const buMap = new Map(mockBusinessUnits.map(b => [b.id, b.name]));

        let viewableRequests = requests;
        if (!canManage && user) {
            viewableRequests = requests.filter(r => r.employeeId === user.id || r.managerId === user.id);
        }

        return viewableRequests.map(req => {
            const asset = req.assetId ? assetMap.get(req.assetId) : null;
            const employee = userMap.get(req.employeeId);
            const businessUnitName = buMap.get(mockBusinessUnits.find(bu => bu.name === employee?.businessUnit)?.id || '') || 'N/A';
            const requester = userMap.get(req.managerId);

            return {
                ...req,
                assetName: asset?.name || req.assetDescription,
                assetTag: asset?.assetTag,
                businessUnitName: businessUnitName,
                requester,
            };
        });
    }, [requests, user, canManage]);
    
    const filteredRequests = useMemo(() => {
        return enrichedRequests.filter(req => {
            const search = filters.searchTerm.toLowerCase();
            const searchMatch = !search ||
                req.employeeName.toLowerCase().includes(search) ||
                req.assetName.toLowerCase().includes(search) ||
                req.id.toLowerCase().includes(search);
            
            const statusMatch = filters.status === 'all' || req.status === filters.status;
            const typeMatch = filters.type === 'all' || req.requestType === filters.type;
            
            const employeeForBu = mockUsers.find(u => u.id === req.employeeId);
            const buForEmployee = mockBusinessUnits.find(b => b.name === employeeForBu?.businessUnit);
            const buMatch = !filters.bu || buForEmployee?.id === filters.bu;

            return searchMatch && statusMatch && typeMatch && buMatch;
        });
    }, [enrichedRequests, filters]);


    const handleReview = (request: EnrichedAssetRequest) => {
        setSelectedRequest(request);
        if (user?.id === request.employeeId) { // It's the returnee
            if (request.status === AssetRequestStatus.Pending && request.requestType === 'Return') {
                setIsSubmissionModalOpen(true);
            } else if (request.status === AssetRequestStatus.Rejected) {
                setIsRejectionViewModalOpen(true);
            } else {
                 setIsReturnConfirmModalOpen(true);
            }
        } else { // It's the requester or a third-party viewer
            setIsReturnConfirmModalOpen(true);
        }
    };
    
    const handleConfirmReject = (reason: string) => {
        if (!selectedRequest || !user) return;
        
        const reqIndex = mockAssetRequests.findIndex(r => r.id === selectedRequest.id);
        if (reqIndex > -1) {
            mockAssetRequests[reqIndex] = {
                ...mockAssetRequests[reqIndex],
                status: AssetRequestStatus.Rejected,
                rejectionReason: reason,
                rejectedAt: new Date(),
            };
            setRequests([...mockAssetRequests]);
            logActivity(user, 'REJECT', 'AssetRequest', selectedRequest.id, `Rejected request. Reason: ${reason}`);
            
            mockNotifications.unshift({
                id: `notif-asset-reject-${selectedRequest.id}`,
                userId: selectedRequest.employeeId,
                type: NotificationType.AssetRequestUpdate,
                title: 'Asset Return Rejected',
                message: `Your return for ${selectedRequest.assetName} was rejected. Click to view reason and resubmit.`,
                link: '/employees/asset-management/asset-requests',
                isRead: false,
                createdAt: new Date(),
                relatedEntityId: selectedRequest.id,
            });
        }
        setIsManagerRejectModalOpen(false);
        setIsReturnConfirmModalOpen(false);
    };
    
    const handleSaveSubmission = (notes: string, proofUrl: string) => {
        if (!selectedRequest || !user) return;

        const reqIndex = mockAssetRequests.findIndex(r => r.id === selectedRequest.id);
        if (reqIndex > -1) {
            mockAssetRequests[reqIndex] = {
                ...mockAssetRequests[reqIndex],
                status: AssetRequestStatus.Returned,
                employeeSubmissionNotes: notes,
                employeeProofUrl: proofUrl,
                employeeSubmittedAt: new Date(),
                rejectionReason: undefined,
                rejectedAt: undefined,
            };
            setRequests([...mockAssetRequests]);
            logActivity(user, 'UPDATE', 'AssetRequest', selectedRequest.id, `Submitted asset return proof.`);
        }
        setIsSubmissionModalOpen(false);
        setIsRejectionViewModalOpen(false);
    };

    const handleConfirmReturn = (assignmentId: string, returnCondition: string, newStatus: AssetStatus, managerProofUrl?: string) => {
        if (!selectedRequest || !user) return;

        const assignmentIndex = mockAssetAssignments.findIndex(a => a.id === assignmentId);
        if (assignmentIndex > -1) {
            mockAssetAssignments[assignmentIndex] = {
                ...mockAssetAssignments[assignmentIndex],
                dateReturned: new Date(),
                conditionOnReturn: returnCondition,
                managerProofUrlOnReturn: managerProofUrl,
            };
        }

        const assetId = mockAssetAssignments[assignmentIndex].assetId;
        const assetIndex = mockAssets.findIndex(a => a.id === assetId);
        if (assetIndex > -1) {
            mockAssets[assetIndex].status = newStatus;
        }

        const reqIndex = mockAssetRequests.findIndex(r => r.id === selectedRequest.id);
        if (reqIndex > -1) {
            mockAssetRequests[reqIndex] = {
                ...mockAssetRequests[reqIndex],
                status: AssetRequestStatus.Fulfilled,
                fulfilledAt: new Date(),
            };
        }
        
        setRequests([...mockAssetRequests]);
        logActivity(user, 'APPROVE', 'AssetRequest', selectedRequest.id, `Approved asset return. New status: ${newStatus}. Condition: ${returnCondition}`);
        setIsReturnConfirmModalOpen(false);
    };
    
    const handleResubmit = () => {
        setIsRejectionViewModalOpen(false);
        setTimeout(() => setIsSubmissionModalOpen(true), 150);
    };

    const handleReturnAsset = () => {
        setIsReturnRequestModalOpen(true);
    };

    const handleSaveReturnRequest = (request: AssetRequest) => {
        if (!user) return;
        
        mockAssetRequests.unshift(request);
        logActivity(user, 'CREATE', 'AssetRequest', request.id, `Created return request for asset ID ${request.assetId} from employee ID ${request.employeeId}`);
        alert('Return request created successfully.');
        setIsReturnRequestModalOpen(false);
        setRequests([...mockAssetRequests]);
    };


    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Asset Requests</h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        Track and manage all employee requests for new assets or asset returns.
                    </p>
                </div>
                {canRequest && <Button variant="secondary" onClick={handleReturnAsset}>Return Asset</Button>}
            </div>

            <Card>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                     <Input label="Search" name="searchTerm" placeholder="Request ID, asset, or employee..." value={filters.searchTerm} onChange={handleFilterChange} />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select name="status" value={filters.status} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 border-gray-300 dark:bg-slate-700 dark:border-slate-600 rounded-md">
                            <option value="all">All</option>
                            {Object.values(AssetRequestStatus).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Request Type</label>
                        <select name="type" value={filters.type} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 border-gray-300 dark:bg-slate-700 dark:border-slate-600 rounded-md">
                            <option value="all">All</option>
                            <option value="Request">Request</option>
                            <option value="Return">Return</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                        <select name="bu" value={filters.bu} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 border-gray-300 dark:bg-slate-700 dark:border-slate-600 rounded-md">
                            <option value="">All</option>
                            {mockBusinessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    </div>
                </div>
            </Card>

            <Card className="!p-0">
                <AssetRequestsTable
                    requests={filteredRequests}
                    onReview={handleReview}
                    currentUser={user}
                    canManage={canManage}
                />
            </Card>
            
            {selectedRequest && isSubmissionModalOpen && (
                <AssetReturnSubmissionModal
                    isOpen={isSubmissionModalOpen}
                    onClose={() => setIsSubmissionModalOpen(false)}
                    request={selectedRequest}
                    onSave={handleSaveSubmission}
                />
            )}

            {selectedRequest && isReturnConfirmModalOpen && (
                <AssetReturnConfirmationModal
                    isOpen={isReturnConfirmModalOpen}
                    onClose={() => setIsReturnConfirmModalOpen(false)}
                    request={selectedRequest}
                    onConfirm={handleConfirmReturn}
                    onRejectRequest={() => {
                        setIsReturnConfirmModalOpen(false);
                        setSelectedRequest(selectedRequest);
                        setIsManagerRejectModalOpen(true);
                    }}
                    isActionable={
                        user?.id === selectedRequest.requester?.id &&
                        selectedRequest.status === AssetRequestStatus.Returned
                    }
                />
            )}
            
            {selectedRequest && isRejectionViewModalOpen && (
                <AssetRejectionModal
                    isOpen={isRejectionViewModalOpen}
                    onClose={() => setIsRejectionViewModalOpen(false)}
                    request={selectedRequest}
                    onResubmit={handleResubmit}
                />
            )}

            <RejectReasonModal
                isOpen={isManagerRejectModalOpen}
                onClose={() => setIsManagerRejectModalOpen(false)}
                onSubmit={handleConfirmReject}
                title="Reason for Rejection"
                prompt="Please provide a reason for rejecting this asset request. This will be visible to the employee."
            />

            {isReturnRequestModalOpen && canRequest && (
                <AssetReturnRequestModal
                    isOpen={isReturnRequestModalOpen}
                    onClose={() => setIsReturnRequestModalOpen(false)}
                    onSave={handleSaveReturnRequest}
                />
            )}
        </div>
    );
};

export default AssetRequests;
