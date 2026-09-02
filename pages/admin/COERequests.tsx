// Phase A complete: mockDataCompat removed from COERequests





import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import {
    BusinessUnit,
    COEDocumentData,
    COEApprovalAuthority,
    COE_APPROVAL_AUTHORITY_LABELS,
    COE_APPROVAL_PENDING_LABELS,
    COERequest,
    COERequestStatus,
    getCoePurposeLabel,
    isPendingCoeRequestStatus,
} from '../../types';
import { createCoeRequest, fetchCoeDocument, fetchCoeRequestById, fetchCoeRequests, rejectCoeRequest, returnCoeRequest } from '../../services/coeService';
import { fetchCOEApprovalAuthority, getCOEApprovalRoles } from '../../services/approverConfigService';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import PrintableCOE from '../../components/admin/PrintableCOE';
import COEApprovalReviewModal from '../../components/admin/COEApprovalReviewModal';
import RejectReasonModal from '../../components/feedback/RejectReasonModal';
import RequestCOEModal from '../../components/employees/RequestCOEModal';
import { logActivity } from '../../services/auditService';

const COERequests: React.FC = () => {
    const { user } = useAuth();
    const { getAccessibleBusinessUnits, getCoeAccess } = usePermissions();
    const location = useLocation();

    const coeAccess = getCoeAccess();
    const [coeApprovalAuthority, setCoeApprovalAuthority] = useState<COEApprovalAuthority>(COEApprovalAuthority.HRManager);
    const [coeApprovalAuthorityLoaded, setCoeApprovalAuthorityLoaded] = useState(false);
    const [coeApprovalAuthorityError, setCoeApprovalAuthorityError] = useState<string | null>(null);
    const assignedRoles = useMemo(() => new Set([user?.role, ...(user?.roles || [])].filter(Boolean)), [user]);
    const isConfiguredApproverRole = useMemo(
        () => getCOEApprovalRoles(coeApprovalAuthority).some(role => assignedRoles.has(role)),
        [assignedRoles, coeApprovalAuthority],
    );
    const canManage = coeApprovalAuthorityLoaded && isConfiguredApproverRole && (coeAccess.canApprove || coeAccess.canReturn);
    const canViewAll = coeAccess.canView && coeAccess.scope !== 'self';
    const canRequest = coeAccess.canRequest;

    const [requests, setRequests] = useState<COERequest[]>([]);
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [dataLoaded, setDataLoaded] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Actions State
    const [requestToReject, setRequestToReject] = useState<COERequest | null>(null);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [requestToReturn, setRequestToReturn] = useState<COERequest | null>(null);
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [printData, setPrintData] = useState<COEDocumentData | null>(null);
    const [requestToReview, setRequestToReview] = useState<COERequest | null>(null);
    const [autoOpenedRequestId, setAutoOpenedRequestId] = useState<string | null>(null);
    const [documentError, setDocumentError] = useState<string | null>(null);
    const [loadingDocumentId, setLoadingDocumentId] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        fetchCOEApprovalAuthority()
            .then(authority => {
                if (!isMounted) return;
                setCoeApprovalAuthority(authority);
                setCoeApprovalAuthorityError(null);
            })
            .catch(error => {
                if (!isMounted) return;
                setCoeApprovalAuthorityError(error?.message || 'COE approval routing could not be loaded.');
            })
            .finally(() => {
                if (isMounted) setCoeApprovalAuthorityLoaded(true);
            });
        return () => {
            isMounted = false;
        };
    }, []);

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(businessUnits), [getAccessibleBusinessUnits, businessUnits]);
    const accessibleBuIds = useMemo(() => new Set(accessibleBus.map(b => b.id)), [accessibleBus]);

    useEffect(() => {
        let isMounted = true;

        const loadCOEData = async () => {
            try {
                const [reqs, buRows] = await Promise.all([
                    fetchCoeRequests(),
                    supabase.from('business_units').select('id, name')
                ]);
                if (!isMounted) return;
                let hydratedRequests = reqs;
                const approverIds = Array.from(new Set(reqs.map(request => request.approvedBy).filter(Boolean))) as string[];
                if (approverIds.length > 0) {
                    const { data: approverRows, error: approverError } = await supabase
                        .from('hris_users')
                        .select('id, full_name')
                        .in('id', approverIds);
                    if (!approverError && approverRows) {
                        const approverNames = new Map(approverRows.map((row: any) => [row.id, row.full_name]));
                        hydratedRequests = hydratedRequests.map(request => ({
                            ...request,
                            approvedByName: request.approvedBy ? approverNames.get(request.approvedBy) : undefined,
                        }));
                    }
                }
                const missingBuIds = reqs.filter(r => !r.businessUnitId).map(r => r.employeeId);
                if (missingBuIds.length > 0) {
                    const { data: userRows, error: userErr } = await supabase
                        .from('hris_users')
                        .select('id, business_unit_id')
                        .in('id', missingBuIds);
                    if (!userErr && userRows) {
                        const buMap = new Map(userRows.map((row: any) => [row.id, row.business_unit_id]));
                        hydratedRequests = hydratedRequests.map(req => ({
                            ...req,
                            businessUnitId: req.businessUnitId || buMap.get(req.employeeId) || ''
                        }));
                    }
                }
                setRequests(hydratedRequests);
                if (!buRows.error && buRows.data) {
                    setBusinessUnits(buRows.data.map((row: any) => ({ id: row.id, name: row.name })));
                } else {
                    setBusinessUnits([]);
                }
                setDataLoaded(true);
            } catch (error) {
                if (!isMounted) return;
                setRequests([]);
                setBusinessUnits([]);
                setDataLoaded(true);
                setDocumentError((error as Error)?.message || 'COE requests could not be loaded.');
            }
        };

        loadCOEData();

        return () => {
            isMounted = false;
        };
    }, []);

    const filteredRequests = useMemo(() => {
        return requests.filter(req => {
            // 1. Role/Scope Check
            if (!canViewAll) {
                // Regular employees only see their own requests
                if (req.employeeId !== user?.id) return false;
            } else {
                // Admins/Managers see requests within their BU scope
                if (req.employeeId !== user?.id && !accessibleBuIds.has(req.businessUnitId)) return false;
            }

            // 2. Status Filter
            const statusMatch = statusFilter === 'all' || req.status === statusFilter;
            
            // 3. Search Filter
            const searchMatch = !searchTerm || 
                req.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                req.id.toLowerCase().includes(searchTerm.toLowerCase());
            
            return statusMatch && searchMatch;
        }).sort((a, b) => new Date(b.dateRequested).getTime() - new Date(a.dateRequested).getTime());
    }, [requests, accessibleBuIds, statusFilter, searchTerm, canViewAll, user]);

    const requestId = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return params.get('requestId');
    }, [location.search]);

    useEffect(() => {
        if (!requestId || autoOpenedRequestId === requestId || !dataLoaded) return;

        const openPreview = async () => {
            let target = requests.find(req => req.id === requestId) || null;
            if (!target) {
                const fresh = await fetchCoeRequestById(requestId);
                if (fresh) {
                    setRequests(prev => {
                        const existingIndex = prev.findIndex(r => r.id === fresh.id);
                        if (existingIndex >= 0) {
                            const next = [...prev];
                            next[existingIndex] = fresh;
                            return next;
                        }
                        return [fresh, ...prev];
                    });
                    target = fresh;
                } else {
                    return;
                }
            }

            const hasAccess = canViewAll
                ? (target.employeeId === user?.id || accessibleBuIds.has(target.businessUnitId))
                : target.employeeId === user?.id;

            if (!hasAccess) {
                setDocumentError('You do not have access to this COE request.');
                setAutoOpenedRequestId(requestId);
                return;
            }

            let isApproved = String(target.status).toLowerCase() === String(COERequestStatus.Approved).toLowerCase();
            if (!isApproved) {
                const fresh = await fetchCoeRequestById(requestId);
                if (fresh) {
                    setRequests(prev => prev.map(r => r.id === fresh.id ? fresh : r));
                    target = fresh;
                    isApproved = String(target.status).toLowerCase() === String(COERequestStatus.Approved).toLowerCase();
                }
            }
            if (!isApproved) {
                setDocumentError('This COE request is not approved yet. It will be available after approval.');
                setAutoOpenedRequestId(requestId);
                return;
            }

            setLoadingDocumentId(target.id);
            setDocumentError(null);
            try {
                setPrintData(await fetchCoeDocument(target.id));
            } catch (error: any) {
                setDocumentError(error?.message || 'The approved COE could not be loaded. Please retry or contact HR.');
            } finally {
                setLoadingDocumentId(null);
            }

            setAutoOpenedRequestId(requestId);
        };

        void openPreview();
    }, [requestId, autoOpenedRequestId, requests, canViewAll, accessibleBuIds, user, dataLoaded]);

    const getBuName = (id: string) => businessUnits.find(b => b.id === id)?.name || 'Unknown BU';

    const handleSaveCOERequest = async (request: Partial<COERequest>) => {
        if (!user) return;
        try {
            const newReq = await createCoeRequest(request, user);
            setRequests(prev => [newReq, ...prev]);
            


            logActivity(user, 'CREATE', 'COERequest', newReq.id, `Requested COE for ${newReq.purpose}`);
            setIsRequestModalOpen(false);
            alert("Certificate of Employment request submitted.");
        } catch (err: any) {
            alert(err.message || 'Failed to submit COE request.');
        }
    };

    const handleApprove = (request: COERequest) => {
        if (!user) return;
        setDocumentError(null);
        setRequestToReview(request);
    };

    const handleCOEApproved = (documentData: COEDocumentData) => {
        setRequests(prev => prev.map(item => item.id === documentData.request.id ? documentData.request : item));
        if (user) {
            logActivity(user, 'APPROVE', 'COERequest', documentData.request.id, `Approved and sent COE for ${documentData.request.employeeName}`);
        }
        setRequestToReview(null);
        setPrintData(documentData);
    };

    const handleRejectClick = (request: COERequest) => {
        setRequestToReject(request);
        setIsRejectModalOpen(true);
    };

    const handleConfirmReject = async (reason: string) => {
        if (!user || !requestToReject) return;

        try {
            const updated = await rejectCoeRequest(requestToReject.id, user.id, reason);
            setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
            logActivity(user, 'REJECT', 'COERequest', requestToReject.id, `Rejected COE. Reason: ${reason}`);
        } catch (error: any) {
            alert(error?.message || 'Failed to reject COE request.');
        }

        setIsRejectModalOpen(false);
        setRequestToReject(null);
    };

    const handleReturnClick = (request: COERequest) => {
        if (!coeAccess.canReturnOn(request)) {
            alert('You do not have permission to return this request.');
            return;
        }
        setRequestToReturn(request);
        setIsReturnModalOpen(true);
    };

    const handleConfirmReturn = async (reason: string) => {
        if (!user || !requestToReturn) return;

        try {
            const updated = await returnCoeRequest(requestToReturn.id, user.id, reason);
            setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
            logActivity(user, 'UPDATE', 'COERequest', requestToReturn.id, `Returned COE request for revision. Reason: ${reason}`);
        } catch (error: any) {
            alert(error?.message || 'Failed to return COE request.');
        }

        setIsReturnModalOpen(false);
        setRequestToReturn(null);
    };

    const handleViewDocument = async (request: COERequest) => {
        setLoadingDocumentId(request.id);
        setDocumentError(null);
        try {
            setPrintData(await fetchCoeDocument(request.id));
        } catch (error: any) {
            setDocumentError(error?.message || 'The approved COE document could not be loaded. Verify the request record and try again.');
        } finally {
            setLoadingDocumentId(null);
        }
    };

    const getStatusBadge = (status: COERequestStatus) => {
        switch(status) {
            case COERequestStatus.Approved: return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200">Approved</span>;
            case COERequestStatus.Rejected: return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200">Rejected</span>;
            case COERequestStatus.Pending:
            case COERequestStatus.PendingHRManagerApproval: return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200">{status}</span>;
            case COERequestStatus.ReturnedForRevision: return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200">Returned for Revision</span>;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">COE Requests</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                        {canManage ? "Manage and issue Certificates of Employment." : "View and track COE requests."}
                    </p>
                </div>
                {canRequest && (
                    <Button onClick={() => setIsRequestModalOpen(true)}>Request COE</Button>
                )}
            </div>

            <Card>
                {documentError && (
                    <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200" role="alert">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="font-semibold">COE document could not be prepared</p>
                                <p className="mt-1 text-sm">{documentError}</p>
                            </div>
                            <button type="button" className="text-sm font-semibold underline" onClick={() => setDocumentError(null)}>Dismiss</button>
                        </div>
                    </div>
                )}
                {coeApprovalAuthorityError && (
                    <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200" role="alert">
                        <p className="font-semibold">COE approval routing is unavailable</p>
                        <p className="mt-1 text-sm">{coeApprovalAuthorityError} Approval actions are disabled until the configured authority can be verified.</p>
                    </div>
                )}
                <div className="p-4 flex flex-col md:flex-row gap-4">
                    <div className="flex-grow">
                         <Input 
                            label="" 
                            placeholder={canViewAll ? "Search by Employee or ID..." : "Search by ID..."}
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                        />
                    </div>
                    <div>
                        <select 
                            value={statusFilter} 
                            onChange={e => setStatusFilter(e.target.value)}
                            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            <option value="all">All Statuses</option>
                            {Object.values(COERequestStatus).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Request ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Employee</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Business Unit</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date Requested</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Purpose</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Approval Authority</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredRequests.map(req => (
                                <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{req.id}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{req.employeeName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{getBuName(req.businessUnitId)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(req.dateRequested).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        <div>{getCoePurposeLabel(req.purpose, req.otherPurposeDetail)}</div>
                                        {canViewAll && <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">{req.templateName || (req.templateId ? `Template ${req.templateId.slice(0, 8)}` : 'Default template pending')}</div>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{getStatusBadge(req.status)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {isPendingCoeRequestStatus(req.status)
                                            ? `Pending ${COE_APPROVAL_PENDING_LABELS[coeApprovalAuthority]}`
                                            : req.approvedByName
                                                ? `${req.status} by ${req.approvedByName}`
                                                : COE_APPROVAL_AUTHORITY_LABELS[coeApprovalAuthority]}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {isPendingCoeRequestStatus(req.status) && canManage ? (
                                            <div className="flex justify-end space-x-2">
                                                {coeAccess.canReturnOn(req) && <Button size="sm" variant="secondary" onClick={() => handleReturnClick(req)}>Return</Button>}
                                                {coeAccess.canActOn(req) && (
                                                    <>
                                                        <Button size="sm" variant="danger" onClick={() => handleRejectClick(req)}>Reject</Button>
                                                        <Button size="sm" variant="success" onClick={() => handleApprove(req)} disabled={loadingDocumentId === req.id}>
                                                            {loadingDocumentId === req.id ? 'Preparing…' : 'Approve'}
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        ) : req.status === COERequestStatus.Approved ? (
                                            <Button size="sm" variant="secondary" onClick={() => handleViewDocument(req)} disabled={loadingDocumentId === req.id}>
                                                {loadingDocumentId === req.id ? 'Loading…' : 'View / Print'}
                                            </Button>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                             {filteredRequests.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="text-center py-10 text-gray-500 dark:text-gray-400">No requests found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
            
            <RejectReasonModal
                isOpen={isRejectModalOpen}
                onClose={() => setIsRejectModalOpen(false)}
                onSubmit={handleConfirmReject}
                title="Reject COE Request"
            />

            <RejectReasonModal
                isOpen={isReturnModalOpen}
                onClose={() => setIsReturnModalOpen(false)}
                onSubmit={handleConfirmReturn}
                title="Return COE Request"
                prompt="Please provide revision notes for the employee."
                submitText="Return for Revision"
                submitVariant="primary"
            />
            
            <RequestCOEModal
                isOpen={isRequestModalOpen}
                onClose={() => setIsRequestModalOpen(false)}
                onSave={handleSaveCOERequest}
            />

            <COEApprovalReviewModal
                isOpen={Boolean(requestToReview)}
                request={requestToReview}
                onClose={() => setRequestToReview(null)}
                onApproved={handleCOEApproved}
            />

            {printData && createPortal(
                <PrintableCOE
                    documentData={printData}
                    onClose={() => setPrintData(null)}
                />,
                document.body
            )}
        </div>
    );
};

export default COERequests;
