
import React, { useState, useMemo, useEffect } from 'react';
import { AssetRequest, AssetRequestStatus, Permission, AssetStatus, NotificationType, EnrichedAssetRequest, User, Asset, AssetAssignment } from '../../types';
import { mockBusinessUnits, mockNotifications } from '../../services/mockData';
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
import { supabase } from '../../services/supabaseClient';

type AssetRequestRow = {
    id: string;
    request_type: 'Request' | 'Return';
    employee_id: string;
    employee_name: string;
    asset_description: string;
    justification: string;
    status: AssetRequestStatus | string;
    requested_at: string;
    manager_id: string;
    manager_notes?: string | null;
    approved_at?: string | null;
    rejected_at?: string | null;
    fulfilled_at?: string | null;
    asset_id?: string | null;
    employee_submission_notes?: string | null;
    employee_proof_url?: string | null;
    employee_submitted_at?: string | null;
    rejection_reason?: string | null;
};

const mapRequestRow = (row: AssetRequestRow): AssetRequest => ({
    id: row.id,
    requestType: row.request_type,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    assetDescription: row.asset_description,
    justification: row.justification,
    status: row.status as AssetRequestStatus,
    requestedAt: new Date(row.requested_at),
    managerId: row.manager_id,
    managerNotes: row.manager_notes ?? undefined,
    approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
    rejectedAt: row.rejected_at ? new Date(row.rejected_at) : undefined,
    fulfilledAt: row.fulfilled_at ? new Date(row.fulfilled_at) : undefined,
    assetId: row.asset_id ?? undefined,
    employeeSubmissionNotes: row.employee_submission_notes ?? undefined,
    employeeProofUrl: row.employee_proof_url ?? undefined,
    employeeSubmittedAt: row.employee_submitted_at ? new Date(row.employee_submitted_at) : undefined,
    rejectionReason: row.rejection_reason ?? undefined,
});

type AssignmentRow = {
    id: string;
    asset_id: string;
    employee_id: string;
    date_assigned: string;
    date_returned?: string | null;
    condition_on_assign: string;
    condition_on_return?: string | null;
    manager_proof_url_on_return?: string | null;
    is_acknowledged?: boolean | null;
    acknowledged_at?: string | null;
};

const mapAssignmentRow = (row: AssignmentRow): AssetAssignment => ({
    id: row.id,
    assetId: row.asset_id,
    employeeId: row.employee_id,
    dateAssigned: new Date(row.date_assigned),
    dateReturned: row.date_returned ? new Date(row.date_returned) : undefined,
    conditionOnAssign: row.condition_on_assign,
    conditionOnReturn: row.condition_on_return || undefined,
    managerProofUrlOnReturn: row.manager_proof_url_on_return || undefined,
    isAcknowledged: !!row.is_acknowledged,
    acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
});

const AssetRequests: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const canManage = can('AssetRequests', Permission.Approve);
    const canRequest = can('AssetRequests', Permission.Create);

    const [requests, setRequests] = useState<AssetRequest[]>([]);
    const [employees, setEmployees] = useState<User[]>([]);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [assignments, setAssignments] = useState<AssetAssignment[]>([]);
    const [isManagerRejectModalOpen, setIsManagerRejectModalOpen] = useState(false);
    const [isReturnConfirmModalOpen, setIsReturnConfirmModalOpen] = useState(false);
    const [isSubmissionModalOpen, setIsSubmissionModalOpen] = useState(false);
    const [isRejectionViewModalOpen, setIsRejectionViewModalOpen] = useState(false);
    const [isReturnRequestModalOpen, setIsReturnRequestModalOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<EnrichedAssetRequest | null>(null);

    useEffect(() => {
        const loadEmployees = async () => {
            try {
                const { data, error } = await supabase
                    .from('hris_users')
                    .select('id, full_name, role, status, position');
                if (error) throw error;
                const mapped =
                    data?.map((u: any) => ({
                        id: u.id,
                        name: u.full_name,
                        email: '',
                        role: u.role,
                        status: u.status,
                        position: (u as any)?.position,
                    })) || [];
                setEmployees(mapped);
            } catch (err) {
                console.error('Failed to load employees for asset requests', err);
                setEmployees([]);
            }
        };
        const loadAssets = async () => {
            try {
                const { data, error } = await supabase.from('assets').select('*');
                if (error) throw error;
                const mapped =
                    data?.map((row: any) => ({
                        id: row.id,
                        assetTag: row.asset_tag,
                        name: row.name,
                        type: row.type,
                        businessUnitId: row.business_unit_id,
                        serialNumber: row.serial_number || undefined,
                        purchaseDate: row.purchase_date ? new Date(row.purchase_date) : new Date(),
                        value: row.value ?? 0,
                        status: row.status as AssetStatus,
                        notes: row.notes || undefined,
                    })) || [];
                setAssets(mapped);
            } catch (err) {
                console.error('Failed to load assets for requests', err);
                setAssets([]);
            }
        };
        const loadRequests = async () => {
            try {
                const { data, error } = await supabase
                    .from('asset_requests')
                    .select('*')
                    .order('requested_at', { ascending: false });
                if (error) throw error;
                setRequests((data as AssetRequestRow[] | null)?.map(mapRequestRow) || []);
            } catch (err) {
                console.error('Failed to load asset requests', err);
                setRequests([]);
            }
        };
        const loadAssignments = async () => {
            try {
                const { data, error } = await supabase.from('asset_assignments').select('*');
                if (error) throw error;
                setAssignments((data as AssignmentRow[] | null)?.map(mapAssignmentRow) || []);
            } catch (err) {
                console.error('Failed to load asset assignments for requests', err);
                setAssignments([]);
            }
        };
        loadEmployees();
        loadAssets();
        loadRequests();
        loadAssignments();
    }, []);

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
        const userMap = new Map(employees.map(u => [u.id, u]));
        const assetMap = new Map(assets.map(a => [a.id, a]));
        const buMap = new Map(mockBusinessUnits.map(b => [b.id, b.name]));

        return requests.map(req => {
            const asset = req.assetId ? assetMap.get(req.assetId) : null;
            const employee = userMap.get(req.employeeId);
            const businessUnitName = employee?.businessUnitId ? buMap.get(employee.businessUnitId) || 'N/A' : 'N/A';
            const requester = userMap.get(req.managerId);

            // active assignment for this asset/employee
            const activeAssignment = assignments.find(a => a.assetId === req.assetId && a.employeeId === req.employeeId && !a.dateReturned);

            return {
                ...req,
                assetName: asset?.name || req.assetDescription,
                assetTag: asset?.assetTag,
                businessUnitName: businessUnitName,
                requester,
                assignmentId: activeAssignment?.id,
            };
        });
    }, [requests, user, canManage, employees, assets, assignments]);
    
    const filteredRequests = useMemo(() => {
        return enrichedRequests.filter(req => {
            const search = filters.searchTerm.toLowerCase();
            const searchMatch = !search ||
                req.employeeName.toLowerCase().includes(search) ||
                req.assetName.toLowerCase().includes(search) ||
                req.id.toLowerCase().includes(search);
            
            const statusMatch = filters.status === 'all' || req.status === filters.status;
            const typeMatch = filters.type === 'all' || req.requestType === filters.type;
            
            const buMatch = !filters.bu || req.businessUnitName === mockBusinessUnits.find(b => b.id === filters.bu)?.name;

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
    
    const updateRequestState = (updated: AssetRequest) => {
        setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
    };

    const handleConfirmReject = async (reason: string) => {
        if (!selectedRequest || !user) return;
        try {
            const { data, error } = await supabase
                .from('asset_requests')
                .update({
                    status: AssetRequestStatus.Rejected,
                    rejection_reason: reason,
                    rejected_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', selectedRequest.id)
                .select('*')
                .single();
            if (error) throw error;
            const mapped = mapRequestRow(data as AssetRequestRow);
            updateRequestState(mapped);
            logActivity(user, 'REJECT', 'AssetRequest', selectedRequest.id, `Rejected request. Reason: ${reason}`);
        } catch (err) {
            console.error('Failed to reject request', err);
            alert('Failed to reject request. Please try again.');
        } finally {
            setIsManagerRejectModalOpen(false);
            setIsReturnConfirmModalOpen(false);
        }
    };
    
    const handleSaveSubmission = async (notes: string, proofUrl: string) => {
        if (!selectedRequest || !user) return;
        try {
            const { data, error } = await supabase
                .from('asset_requests')
                .update({
                    status: AssetRequestStatus.Returned,
                    employee_submission_notes: notes,
                    employee_proof_url: proofUrl,
                    employee_submitted_at: new Date().toISOString(),
                    rejection_reason: null,
                    rejected_at: null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', selectedRequest.id)
                .select('*')
                .single();
            if (error) throw error;
            const mapped = mapRequestRow(data as AssetRequestRow);
            updateRequestState(mapped);
            logActivity(user, 'UPDATE', 'AssetRequest', selectedRequest.id, `Submitted asset return proof.`);
        } catch (err) {
            console.error('Failed to submit return proof', err);
            alert('Failed to submit return proof. Please try again.');
        } finally {
            setIsSubmissionModalOpen(false);
            setIsRejectionViewModalOpen(false);
        }
    };

    const handleConfirmReturn = async (assignmentId: string | undefined, returnCondition: string, newStatus: AssetStatus, managerProofUrl?: string) => {
        if (!selectedRequest || !user) return;
        if (!assignmentId) {
            alert('No active assignment found for this asset/employee. Cannot complete return.');
            return;
        }

        try {
            // Update assignment
            await supabase
                .from('asset_assignments')
                .update({
                    date_returned: new Date().toISOString(),
                    condition_on_return: returnCondition,
                    manager_proof_url_on_return: managerProofUrl || null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', assignmentId);

            // Update asset status
            if (selectedRequest.assetId) {
                await supabase
                    .from('assets')
                    .update({ status: newStatus, updated_at: new Date().toISOString() })
                    .eq('id', selectedRequest.assetId);
            }

            // Update request status
            const { data, error } = await supabase
                .from('asset_requests')
                .update({
                    status: AssetRequestStatus.Fulfilled,
                    fulfilled_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', selectedRequest.id)
                .select('*')
                .single();
            if (error) throw error;
            const mapped = mapRequestRow(data as AssetRequestRow);
            updateRequestState(mapped);

            logActivity(user, 'APPROVE', 'AssetRequest', selectedRequest.id, `Approved asset return. New status: ${newStatus}. Condition: ${returnCondition}`);
        } catch (err) {
            console.error('Failed to complete return', err);
            alert('Failed to complete return. Please try again.');
        } finally {
            setIsReturnConfirmModalOpen(false);
        }
    };
    
    const handleResubmit = () => {
        setIsRejectionViewModalOpen(false);
        setTimeout(() => setIsSubmissionModalOpen(true), 150);
    };

    const handleReturnAsset = () => {
        setIsReturnRequestModalOpen(true);
    };

    const handleSaveReturnRequest = async (request: AssetRequest) => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('asset_requests')
                .insert({
                    request_type: request.requestType,
                    employee_id: request.employeeId,
                    employee_name: request.employeeName,
                    asset_id: request.assetId,
                    asset_description: request.assetDescription,
                    justification: request.justification,
                    status: AssetRequestStatus.Pending,
                    requested_at: new Date().toISOString(),
                    manager_id: user.id,
                })
                .select('*')
                .single();
            if (error) throw error;
            const mapped = mapRequestRow(data as AssetRequestRow);
            setRequests(prev => [mapped, ...prev]);
            logActivity(user, 'CREATE', 'AssetRequest', mapped.id, `Created return request for asset ID ${mapped.assetId} from employee ID ${mapped.employeeId}`);
            alert('Return request submitted.');
        } catch (err) {
            console.error('Failed to create return request', err);
            alert('Failed to create return request. Please try again.');
        } finally {
            setIsReturnRequestModalOpen(false);
        }
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
                        user?.id === selectedRequest.managerId &&
                        (selectedRequest.status === AssetRequestStatus.Returned || selectedRequest.status === AssetRequestStatus.Pending)
                    }
                    assets={assets}
                    assignments={assignments}
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
                    assets={assets}
                    assignments={assignments}
                />
            )}
        </div>
    );
};

export default AssetRequests;
