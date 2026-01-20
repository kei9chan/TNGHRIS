




import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { COERequest, COERequestStatus, COETemplate, NotificationType, Permission, Role, User } from '../../types';
import { mockCOERequests, mockCOETemplates, mockUsers, mockBusinessUnits, mockNotifications } from '../../services/mockData';
import { approveCoeRequest, fetchActiveCoeTemplates, fetchCoeRequestById, fetchCoeRequests, rejectCoeRequest } from '../../services/coeService';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import PrintableCOE from '../../components/admin/PrintableCOE';
import RejectReasonModal from '../../components/feedback/RejectReasonModal';
import RequestCOEModal from '../../components/employees/RequestCOEModal';
import { logActivity } from '../../services/auditService';

const COERequests: React.FC = () => {
    const { user } = useAuth();
    const { can, getAccessibleBusinessUnits } = usePermissions();
    const location = useLocation();
    
    // Permission check to see if user can manage (Approve/Reject) or just view own
    const canManage = can('COE', Permission.Manage) || can('COE', Permission.Approve);
    const canRequest = can('COE', Permission.Create);

    const [requests, setRequests] = useState<COERequest[]>(mockCOERequests);
    const [coeTemplates, setCoeTemplates] = useState<COETemplate[]>(mockCOETemplates);
    const [templatesLoaded, setTemplatesLoaded] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Actions State
    const [requestToReject, setRequestToReject] = useState<COERequest | null>(null);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [printData, setPrintData] = useState<{ template: COETemplate, request: COERequest, employee: any } | null>(null);
    const [autoOpenedRequestId, setAutoOpenedRequestId] = useState<string | null>(null);

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);
    const accessibleBuIds = useMemo(() => new Set(accessibleBus.map(b => b.id)), [accessibleBus]);

    useEffect(() => {
        let isMounted = true;

        const loadCOEData = async () => {
            try {
                const [reqs, templates] = await Promise.all([
                    fetchCoeRequests(),
                    fetchActiveCoeTemplates()
                ]);
                if (!isMounted) return;
                setRequests(reqs);
                setCoeTemplates(templates);
                setTemplatesLoaded(true);
            } catch (error) {
                if (!isMounted) return;
                setRequests([...mockCOERequests]);
                setCoeTemplates([...mockCOETemplates]);
                setTemplatesLoaded(true);
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
            if (!canManage) {
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
    }, [requests, accessibleBuIds, statusFilter, searchTerm, canManage, user]);

    const resolveEmployee = async (employeeId: string): Promise<User | null> => {
        if (user?.id === employeeId) {
            return user;
        }

        const local = mockUsers.find(u => u.id === employeeId);
        if (local) {
            return local;
        }

        const { data, error } = await supabase
            .from('hris_users')
            .select('id, full_name, email, role, status, business_unit, business_unit_id, department, department_id, position, date_hired')
            .eq('id', employeeId)
            .maybeSingle();

        if (error || !data) {
            return null;
        }

        const roleValue = Object.values(Role).includes(data.role as Role)
            ? (data.role as Role)
            : (user?.role || Role.Employee);

        return {
            id: data.id,
            name: data.full_name || 'Unknown',
            email: data.email || '',
            role: roleValue,
            department: data.department || '',
            businessUnit: data.business_unit || '',
            departmentId: data.department_id || undefined,
            businessUnitId: data.business_unit_id || undefined,
            status: data.status === 'Inactive' ? 'Inactive' : 'Active',
            isPhotoEnrolled: false,
            dateHired: data.date_hired ? new Date(data.date_hired) : new Date(),
            position: data.position || '',
            monthlySalary: undefined
        };
    };

    const resolveTemplate = (businessUnitId: string): COETemplate | null => {
        const activeTemplates = coeTemplates.filter(t => t.isActive);
        const mockActiveTemplates = mockCOETemplates.filter(t => t.isActive);

        return (
            activeTemplates.find(t => t.businessUnitId === businessUnitId)
            || mockActiveTemplates.find(t => t.businessUnitId === businessUnitId)
            || activeTemplates[0]
            || mockActiveTemplates[0]
            || coeTemplates[0]
            || mockCOETemplates[0]
            || null
        );
    };

    const requestId = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return params.get('requestId');
    }, [location.search]);

    useEffect(() => {
        if (!requestId || autoOpenedRequestId === requestId || !templatesLoaded) return;

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

            const hasAccess = canManage
                ? (target.employeeId === user?.id || accessibleBuIds.has(target.businessUnitId))
                : target.employeeId === user?.id;

            if (!hasAccess) {
                alert('You do not have access to this COE request.');
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
                alert('This COE request is not approved yet.');
                setAutoOpenedRequestId(requestId);
                return;
            }

            const template = resolveTemplate(target.businessUnitId);

            const employee = await resolveEmployee(target.employeeId);

            if (template && employee) {
                setPrintData({ template, request: target, employee });
            } else {
                alert('Cannot view document: Template or Employee data missing.');
            }

            setAutoOpenedRequestId(requestId);
        };

        void openPreview();
    }, [requestId, autoOpenedRequestId, requests, canManage, accessibleBuIds, user, coeTemplates, templatesLoaded]);

    const getBuName = (id: string) => mockBusinessUnits.find(b => b.id === id)?.name || 'Unknown BU';

    const handleSaveCOERequest = (request: Partial<COERequest>) => {
        const newRequest: COERequest = {
            id: `COE-${Date.now()}`,
            ...request
        } as COERequest;
        mockCOERequests.unshift(newRequest);
        if (user) {
            logActivity(user, 'CREATE', 'COERequest', newRequest.id, `Requested COE for ${newRequest.purpose}`);
        }
        setIsRequestModalOpen(false);
        alert("Certificate of Employment request submitted.");
        setRequests([...mockCOERequests]);
    };

    const handleApprove = async (request: COERequest) => {
        if (!user) return;

        const template = coeTemplates.find(t => t.businessUnitId === request.businessUnitId && t.isActive)
            || mockCOETemplates.find(t => t.businessUnitId === request.businessUnitId && t.isActive);
        if (!template) {
            alert(`No active COE Template found for ${getBuName(request.businessUnitId)}. Please create one in Employee > COE > Templates.`);
            return;
        }

        const generatedUrl = `generated_coe_${request.id}.pdf`;
        try {
            const updated = await approveCoeRequest(request.id, user.id, generatedUrl);
            setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));

            // Notify
            mockNotifications.unshift({
                id: `notif-coe-app-${Date.now()}`,
                userId: request.employeeId,
                type: NotificationType.COE_UPDATE,
                title: 'COE Request Approved',
                message: `Your request for a Certificate of Employment has been approved.`,
                link: `/employees/coe/requests?requestId=${request.id}`,
                isRead: false,
                createdAt: new Date(),
                relatedEntityId: request.id
            });

            logActivity(user, 'APPROVE', 'COERequest', request.id, `Approved COE for ${request.employeeName}`);
            
            // Auto-open print view
            const employee = mockUsers.find(u => u.id === request.employeeId) || user;
            setPrintData({ template, request: updated, employee });
        } catch (error: any) {
            alert(error?.message || 'Failed to approve COE request.');
        }
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
            // Notify
            mockNotifications.unshift({
                id: `notif-coe-rej-${Date.now()}`,
                userId: requestToReject.employeeId,
                type: NotificationType.COE_UPDATE,
                title: 'COE Request Rejected',
                message: `Your COE request was rejected: ${reason}`,
                link: `/employees/coe/requests?requestId=${requestToReject.id}`,
                isRead: false,
                createdAt: new Date(),
                relatedEntityId: requestToReject.id
            });

            logActivity(user, 'REJECT', 'COERequest', requestToReject.id, `Rejected COE. Reason: ${reason}`);
        } catch (error: any) {
            alert(error?.message || 'Failed to reject COE request.');
        }

        setIsRejectModalOpen(false);
        setRequestToReject(null);
    };

    const handleViewDocument = async (request: COERequest) => {
        const template = resolveTemplate(request.businessUnitId);
        const employee = await resolveEmployee(request.employeeId);
        
        if (template && employee) {
            setPrintData({ template, request, employee });
        } else {
            alert("Cannot view document: Template or Employee data missing.");
        }
    };

    const getStatusBadge = (status: COERequestStatus) => {
        switch(status) {
            case COERequestStatus.Approved: return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200">Approved</span>;
            case COERequestStatus.Rejected: return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200">Rejected</span>;
            case COERequestStatus.Pending: return <span className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200">Pending</span>;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">COE Requests</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                        {canManage ? "Manage and issue Certificates of Employment." : "View and track your COE requests."}
                    </p>
                </div>
                {canRequest && (
                    <Button onClick={() => setIsRequestModalOpen(true)}>Request COE</Button>
                )}
            </div>

            <Card>
                <div className="p-4 flex flex-col md:flex-row gap-4">
                    <div className="flex-grow">
                         <Input 
                            label="" 
                            placeholder={canManage ? "Search by Employee or ID..." : "Search by ID..."}
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
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{req.purpose.replace(/_/g, ' ')}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{getStatusBadge(req.status)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {canManage && req.status === COERequestStatus.Pending ? (
                                            <div className="flex justify-end space-x-2">
                                                <Button size="sm" variant="danger" onClick={() => handleRejectClick(req)}>Reject</Button>
                                                <Button size="sm" variant="success" onClick={() => handleApprove(req)}>Approve</Button>
                                            </div>
                                        ) : req.status === COERequestStatus.Approved ? (
                                            <Button size="sm" variant="secondary" onClick={() => handleViewDocument(req)}>View/Print</Button>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                             {filteredRequests.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-10 text-gray-500 dark:text-gray-400">No requests found.</td>
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
            
            <RequestCOEModal
                isOpen={isRequestModalOpen}
                onClose={() => setIsRequestModalOpen(false)}
                onSave={handleSaveCOERequest}
            />

            {printData && createPortal(
                <PrintableCOE
                    template={printData.template}
                    request={printData.request}
                    employee={printData.employee}
                    onClose={() => setPrintData(null)}
                />,
                document.body
            )}
        </div>
    );
};

export default COERequests;
