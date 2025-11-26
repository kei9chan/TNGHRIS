
import React, { useState, useMemo, useEffect } from 'react';
import { ManpowerRequest, ManpowerRequestStatus, Role, Permission } from '../../types';
import { mockManpowerRequests, mockBusinessUnits } from '../../services/mockData';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import ManpowerRequestModal from '../../components/payroll/ManpowerRequestModal';
import ManpowerReviewModal from '../../components/payroll/ManpowerReviewModal';
import { logActivity } from '../../services/auditService';

const getStatusColor = (status: ManpowerRequestStatus) => {
    switch (status) {
        case ManpowerRequestStatus.Approved: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200';
        case ManpowerRequestStatus.Rejected: return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200';
        case ManpowerRequestStatus.Pending: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200';
        default: return 'bg-gray-100 text-gray-800';
    }
};

const ManpowerPlanning: React.FC = () => {
    const { user } = useAuth();
    const { can, getAccessibleBusinessUnits } = usePermissions();
    const canCreate = can('Manpower', Permission.Create);
    const canApprove = can('Manpower', Permission.Approve);
    const canViewAll = can('Manpower', Permission.Manage) || [Role.HRManager, Role.HRStaff, Role.Admin].includes(user?.role as Role);

    const [requests, setRequests] = useState<ManpowerRequest[]>(mockManpowerRequests);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<ManpowerRequest | null>(null);
    
    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (JSON.stringify(mockManpowerRequests) !== JSON.stringify(requests)) {
                setRequests([...mockManpowerRequests]);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [requests]);

    const filteredRequests = useMemo(() => {
        if (!user) return [];
        
        let filtered = requests;
        
        // Scope Filter: Only show requests for BUs the user has access to
        const accessibleBuIds = new Set(accessibleBus.map(b => b.id));
        filtered = filtered.filter(r => accessibleBuIds.has(r.businessUnitId));

        // Role Filter: If user is NOT an Admin/HR/Approver, they only see their own requests
        if (!canViewAll && !canApprove) {
            filtered = filtered.filter(r => r.requestedBy === user.id);
        }
        
        return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [requests, user, canViewAll, canApprove, accessibleBus]);

    const handleSaveRequest = (request: ManpowerRequest) => {
        mockManpowerRequests.unshift(request);
        setRequests([...mockManpowerRequests]);
        if (user) {
            logActivity(user, 'CREATE', 'ManpowerRequest', request.id, `Created On-Call Request for ${request.date}`);
        }
        alert("Request submitted for approval.");
        setIsCreateModalOpen(false);
    };

    const handleApprove = (requestId: string) => {
        const index = mockManpowerRequests.findIndex(r => r.id === requestId);
        if (index > -1) {
            mockManpowerRequests[index].status = ManpowerRequestStatus.Approved;
            mockManpowerRequests[index].approvedBy = user?.id;
            mockManpowerRequests[index].approvedAt = new Date();
            setRequests([...mockManpowerRequests]);
            setIsReviewModalOpen(false);
            
             if (user) {
                logActivity(user, 'APPROVE', 'ManpowerRequest', requestId, `Approved On-Call Request`);
            }
            alert("Manpower Request Approved.");
        } else {
            console.error("Request ID not found:", requestId);
            alert("Error: Could not find the request to approve.");
        }
    };

    const handleReject = (requestId: string, reason: string) => {
        const index = mockManpowerRequests.findIndex(r => r.id === requestId);
        if (index > -1) {
            mockManpowerRequests[index].status = ManpowerRequestStatus.Rejected;
            mockManpowerRequests[index].rejectionReason = reason;
            setRequests([...mockManpowerRequests]);
            setIsReviewModalOpen(false);
            
            if (user) {
                logActivity(user, 'REJECT', 'ManpowerRequest', requestId, `Rejected On-Call Request. Reason: ${reason}`);
            }
            alert("Manpower Request Rejected.");
        } else {
             console.error("Request ID not found:", requestId);
             alert("Error: Could not find the request to reject.");
        }
    };

    const openReview = (req: ManpowerRequest) => {
        setSelectedRequest(req);
        setIsReviewModalOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Manpower Planning</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage and approve daily on-call staffing requests.</p>
                </div>
                {canCreate && (
                    <Button onClick={() => setIsCreateModalOpen(true)}>+ Request On-Call</Button>
                )}
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date Needed</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Business Unit</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Forecast PAX</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Requester</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Created At</th>
                                <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredRequests.map(req => (
                                <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => openReview(req)}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                        {new Date(req.date).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {req.businessUnitName}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {req.forecastedPax}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {req.requesterName}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(req.status)}`}>
                                            {req.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {new Date(req.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openReview(req); }}>
                                            {canApprove && req.status === ManpowerRequestStatus.Pending ? 'Review' : 'View'}
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {filteredRequests.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                        No requests found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <ManpowerRequestModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={handleSaveRequest}
            />

            <ManpowerReviewModal
                isOpen={isReviewModalOpen}
                onClose={() => setIsReviewModalOpen(false)}
                request={selectedRequest}
                onApprove={handleApprove}
                onReject={handleReject}
                canApprove={canApprove}
            />
        </div>
    );
};

export default ManpowerPlanning;
