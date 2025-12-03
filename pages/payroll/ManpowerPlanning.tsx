
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ManpowerRequest, ManpowerRequestStatus, Role } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import ManpowerRequestModal from '../../components/payroll/ManpowerRequestModal';
import ManpowerReviewModal from '../../components/payroll/ManpowerReviewModal';
import { logActivity } from '../../services/auditService';
import { supabase } from '../../services/supabaseClient';

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

    const [requests, setRequests] = useState<ManpowerRequest[]>([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<ManpowerRequest | null>(null);
    
    const role = user?.role as Role | undefined;

    const canCreate = useMemo(() => {
        if (!role) return false;
        return [
            Role.Admin,
            Role.HRManager,
            Role.HRStaff,
            Role.OperationsDirector,
            Role.BusinessUnitManager,
            Role.Manager,
        ].includes(role);
    }, [role]);

    const canApprove = useMemo(() => {
        if (!role) return false;
        return [
            Role.Admin,
            Role.HRManager,
            Role.HRStaff,
            Role.OperationsDirector,
            Role.BusinessUnitManager,
            Role.Manager,
        ].includes(role);
    }, [role]);

    const loadRequests = useCallback(async () => {
        if (!user || !role) return;

        let query = supabase.from('manpower_requests').select('*').order('created_at', { ascending: false });

        switch (role) {
            case Role.Admin:
            case Role.HRManager:
            case Role.HRStaff:
                // full visibility
                break;
            case Role.BOD:
                // view all
                break;
            case Role.GeneralManager:
            case Role.OperationsDirector:
            case Role.BusinessUnitManager:
                if (user.businessUnitId) {
                    query = query.eq('business_unit_id', user.businessUnitId);
                } else {
                    query = query.eq('requester_id', user.id);
                }
                break;
            case Role.Manager:
                if (user.departmentId) {
                    query = query.eq('department_id', user.departmentId);
                } else if (user.businessUnitId) {
                    query = query.eq('business_unit_id', user.businessUnitId);
                } else {
                    query = query.eq('requester_id', user.id);
                }
                break;
            case Role.Employee:
                query = query.eq('requester_id', user.id);
                break;
            case Role.FinanceStaff:
            case Role.Auditor:
                // logs: view all
                break;
            case Role.Recruiter:
            case Role.IT:
            default:
                // No access
                query = query.eq('requester_id', '__none__');
                break;
        }

        const { data, error } = await query;
        if (error) {
            console.error('Failed to load manpower requests', error);
            setRequests([]);
            return;
        }

            const mapped = (data || []).map((r: any) => ({
                id: r.id,
                businessUnitId: r.business_unit_id || '',
                departmentId: r.department_id || undefined,
                businessUnitName: r.business_unit_name || 'Unknown BU',
                requestedBy: r.requester_id,
            requesterName: r.requester_name,
            date: r.date_needed ? new Date(r.date_needed) : new Date(),
            forecastedPax: r.forecasted_pax || 0,
            generalNote: r.general_note || '',
            items: Array.isArray(r.items) ? r.items : (r.items ? JSON.parse(r.items) : []),
            grandTotal: r.grand_total || 0,
                status: r.status as ManpowerRequestStatus,
                createdAt: r.created_at ? new Date(r.created_at) : new Date(),
            approvedBy: r.approved_by || undefined,
            approvedAt: r.approved_at ? new Date(r.approved_at) : undefined,
            rejectionReason: r.rejection_reason || undefined,
        })) as ManpowerRequest[];

        setRequests(mapped);
    }, [role, user]);

    useEffect(() => {
        loadRequests();
    }, [loadRequests]);

    const filteredRequests = useMemo(() => {
        return requests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [requests]);

    const handleSaveRequest = () => {
        // After modal insert we reload from Supabase
        loadRequests();
        setIsCreateModalOpen(false);
    };

    const handleApprove = async (requestId: string) => {
        if (!user) return;
        const { error } = await supabase
            .from('manpower_requests')
            .update({ status: ManpowerRequestStatus.Approved, approved_by: user.id, approved_at: new Date().toISOString() })
            .eq('id', requestId);

        if (error) {
            alert('Error approving request. Please try again.');
            return;
        }

        logActivity(user, 'APPROVE', 'ManpowerRequest', requestId, 'Approved On-Call Request');
        setIsReviewModalOpen(false);
        loadRequests();
    };

    const handleReject = async (requestId: string, reason: string) => {
        if (!user) return;
        const { error } = await supabase
            .from('manpower_requests')
            .update({ status: ManpowerRequestStatus.Rejected, rejection_reason: reason })
            .eq('id', requestId);

        if (error) {
            alert('Error rejecting request. Please try again.');
            return;
        }

        logActivity(user, 'REJECT', 'ManpowerRequest', requestId, `Rejected On-Call Request. Reason: ${reason}`);
        setIsReviewModalOpen(false);
        loadRequests();
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
