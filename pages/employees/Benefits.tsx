
import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { BenefitType, BenefitRequest, Permission, Role, BenefitRequestStatus, User, NotificationType } from '../../types';
import { mockBenefitTypes, mockBenefitRequests, mockUsers, mockNotifications } from '../../services/mockData';
import { logActivity } from '../../services/auditService';
import { useSettings } from '../../context/SettingsContext';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import BenefitTypeTable from '../../components/employees/BenefitTypeTable';
import BenefitTypeModal from '../../components/employees/BenefitTypeModal';
import BenefitRequestModal from '../../components/employees/BenefitRequestModal';
import BenefitApprovalsTable from '../../components/employees/BenefitApprovalsTable';
import BenefitBoardApprovalTable from '../../components/employees/BenefitBoardApprovalTable';
import BenefitFulfillmentTable from '../../components/employees/BenefitFulfillmentTable';
import FulfillmentModal from '../../components/employees/FulfillmentModal';
import RejectReasonModal from '../../components/feedback/RejectReasonModal';
import EditableDescription from '../../components/ui/EditableDescription';
import EmployeeMultiSelect from '../../components/feedback/EmployeeMultiSelect';

const getStatusColor = (status: BenefitRequestStatus) => {
    switch (status) {
        case BenefitRequestStatus.Approved: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
        case BenefitRequestStatus.PendingHR: 
        case BenefitRequestStatus.PendingBOD:
            return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200';
        case BenefitRequestStatus.Rejected:
        case BenefitRequestStatus.Cancelled:
            return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200';
        case BenefitRequestStatus.Fulfilled:
             return 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200';
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
};

const Benefits: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const { settings } = useSettings();
    const location = useLocation();
    const navigate = useNavigate();

    // --- State Management ---
    const [activeTab, setActiveTab] = useState('my_benefits');
    
    // Sync active tab with URL query param
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const tab = params.get('tab');
        if (tab) {
            setActiveTab(tab);
        }
    }, [location.search]);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        navigate(`?tab=${tab}`, { replace: true });
    };

    // Mock Data State
    const [benefitTypes, setBenefitTypes] = useState<BenefitType[]>(mockBenefitTypes);
    const [allRequests, setAllRequests] = useState<BenefitRequest[]>(mockBenefitRequests);
    const [myRequests, setMyRequests] = useState<BenefitRequest[]>([]);
    
    // Configuration Modal State
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [selectedBenefitType, setSelectedBenefitType] = useState<BenefitType | null>(null);

    // Request Modal State
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [requestingBenefit, setRequestingBenefit] = useState<BenefitType | null>(null);

    // Fulfillment Modal State
    const [isFulfillmentModalOpen, setIsFulfillmentModalOpen] = useState(false);
    const [requestToFulfill, setRequestToFulfill] = useState<BenefitRequest | null>(null);

    // Approval/Rejection State
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [requestToReject, setRequestToReject] = useState<BenefitRequest | null>(null);

    // Endorsement Modal State
    const [isEndorseModalOpen, setIsEndorseModalOpen] = useState(false);
    const [requestToEndorse, setRequestToEndorse] = useState<BenefitRequest | null>(null);
    const [selectedApprovers, setSelectedApprovers] = useState<User[]>([]);

    const canManage = can('Benefits', Permission.Manage);
    // Assuming HR/Admin can manage and approve
    const isAdminOrHR = user?.role === Role.Admin || user?.role === Role.HRManager || user?.role === Role.HRStaff;
    const isBOD = user?.role === Role.BOD || user?.role === Role.GeneralManager;

    const bodApproverPool = useMemo(() => {
        return mockUsers.filter(u => u.role === Role.BOD || u.role === Role.GeneralManager);
    }, []);

    // Keep local state in sync with mock data source
    useEffect(() => {
        const interval = setInterval(() => {
            if (mockBenefitRequests.length !== allRequests.length) {
                 setAllRequests([...mockBenefitRequests]);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [allRequests.length]);

    // Initial Load of My Requests
    useEffect(() => {
        if (user) {
            const userRequests = allRequests.filter(r => r.employeeId === user.id);
            setMyRequests(userRequests.sort((a,b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime()));
        }
    }, [user, allRequests]);

    // --- Configuration Handlers ---
    const handleOpenConfigModal = (bt: BenefitType | null) => {
        setSelectedBenefitType(bt);
        setIsConfigModalOpen(true);
    };

    const handleSaveBenefitType = (bt: BenefitType) => {
        if (bt.id) {
            // Update
            const updated = benefitTypes.map(b => b.id === bt.id ? bt : b);
            setBenefitTypes(updated);
            // Update mock source
            const idx = mockBenefitTypes.findIndex(b => b.id === bt.id);
            if (idx > -1) mockBenefitTypes[idx] = bt;
        } else {
            // Create
            const newBt = { ...bt, id: `bt-${Date.now()}` };
            setBenefitTypes([...benefitTypes, newBt]);
            mockBenefitTypes.push(newBt);
        }
        setIsConfigModalOpen(false);
    };

    const handleDeleteBenefitType = (id: string) => {
        if (window.confirm('Are you sure you want to delete this benefit type?')) {
            setBenefitTypes(prev => prev.filter(b => b.id !== id));
            const idx = mockBenefitTypes.findIndex(b => b.id === id);
            if (idx > -1) mockBenefitTypes.splice(idx, 1);
        }
    };

    // --- Request Handlers ---
    const handleRequestClick = (bt: BenefitType) => {
        setRequestingBenefit(bt);
        setIsRequestModalOpen(true);
    };

    const handleSubmitRequest = (requestData: Partial<BenefitRequest>) => {
        if (!user) return;
        
        const newRequest: BenefitRequest = {
            ...requestData,
            id: `BREQ-${Date.now()}`,
        } as BenefitRequest;

        mockBenefitRequests.unshift(newRequest);
        setAllRequests(prev => [newRequest, ...prev]);
        setMyRequests(prev => [newRequest, ...prev]);
        
        logActivity(user, 'CREATE', 'BenefitRequest', newRequest.id, `Requested ${newRequest.benefitTypeName}`);
        
        setIsRequestModalOpen(false);
        alert("Benefit request submitted successfully!");
    };

    // --- Approval Handlers ---
    const pendingHRRequests = useMemo(() => {
        return allRequests.filter(r => r.status === BenefitRequestStatus.PendingHR);
    }, [allRequests]);
    
    const processedHRRequests = useMemo(() => {
        // Shows requests that were either approved or rejected/endorsed by HR (status is not PendingHR)
        return allRequests.filter(r => r.status !== BenefitRequestStatus.PendingHR && r.status !== BenefitRequestStatus.PendingBOD).concat(
             allRequests.filter(r => r.status === BenefitRequestStatus.PendingBOD) // Also show what we endorsed
        ).sort((a,b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());
    }, [allRequests]);

    const pendingBODRequests = useMemo(() => {
        return allRequests.filter(r => r.status === BenefitRequestStatus.PendingBOD);
    }, [allRequests]);
    
    const processedBODRequests = useMemo(() => {
         // Shows Board history
         return allRequests.filter(r => 
             (r.status === BenefitRequestStatus.Approved || r.status === BenefitRequestStatus.Rejected || r.status === BenefitRequestStatus.Fulfilled) && 
             r.bodApprovedBy // Only show ones BOD touched
         ).sort((a,b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());
    }, [allRequests]);
    
    const approvedForFulfillmentRequests = useMemo(() => {
        return allRequests.filter(r => r.status === BenefitRequestStatus.Approved);
    }, [allRequests]);

    const fulfilledRequests = useMemo(() => {
        return allRequests
            .filter(r => r.status === BenefitRequestStatus.Fulfilled)
            .sort((a,b) => new Date(b.fulfilledAt || b.submissionDate).getTime() - new Date(a.fulfilledAt || a.submissionDate).getTime());
    }, [allRequests]);

    const handleHRApprove = (request: BenefitRequest) => {
        if (!user) return;
        
        const benefitType = benefitTypes.find(bt => bt.id === request.benefitTypeId);
        
        if (benefitType?.requiresBodApproval) {
            // Open Endorsement Modal
            setRequestToEndorse(request);
            setSelectedApprovers([]); // Reset selection
            setIsEndorseModalOpen(true);
        } else {
            // Direct Approval
            const update = (r: BenefitRequest) => {
                if (r.id === request.id) {
                    return { 
                        ...r, 
                        status: BenefitRequestStatus.Approved,
                        hrEndorsedBy: user.id,
                        hrEndorsedAt: new Date()
                    };
                }
                return r;
            };

            setAllRequests(prev => prev.map(update));
            setMyRequests(prev => prev.map(update));
            
            const idx = mockBenefitRequests.findIndex(r => r.id === request.id);
            if (idx > -1) mockBenefitRequests[idx] = update(mockBenefitRequests[idx]);

            // Notify Employee
             mockNotifications.unshift({
                id: `notif-benefit-app-${Date.now()}`,
                userId: request.employeeId,
                type: NotificationType.AWARD_RECEIVED, // Generic positive
                title: 'Benefit Approved',
                message: `Your request for ${request.benefitTypeName} has been approved by HR.`,
                link: '/employees/benefits',
                isRead: false,
                createdAt: new Date(),
                relatedEntityId: request.id
            });

            logActivity(user, 'APPROVE', 'BenefitRequest', request.id, `HR approved request for ${request.benefitTypeName}`);
            alert(`Request approved successfully.`);
        }
    };

    const handleConfirmEndorse = () => {
        if (!user || !requestToEndorse) return;
        
        if (selectedApprovers.length === 0) {
             alert("Please select at least one Board Member.");
             return;
        }

        const update = (r: BenefitRequest) => {
            if (r.id === requestToEndorse.id) {
                return { 
                    ...r, 
                    status: BenefitRequestStatus.PendingBOD,
                    hrEndorsedBy: user.id,
                    hrEndorsedAt: new Date()
                };
            }
            return r;
        };

        setAllRequests(prev => prev.map(update));
        setMyRequests(prev => prev.map(update));
        
        const idx = mockBenefitRequests.findIndex(r => r.id === requestToEndorse.id);
        if (idx > -1) mockBenefitRequests[idx] = update(mockBenefitRequests[idx]);
        
        // Send notifications to selected approvers
        selectedApprovers.forEach(approver => {
             mockNotifications.unshift({
                id: `notif-benefit-bod-${Date.now()}-${approver.id}`,
                userId: approver.id,
                type: NotificationType.AWARD_APPROVAL_REQUEST, // Generic approval type
                title: 'Benefit Approval Required',
                message: `HR has endorsed a benefit request from ${requestToEndorse.employeeName} for your approval.`,
                link: '/employees/benefits?tab=approvals',
                isRead: false,
                createdAt: new Date(),
                relatedEntityId: requestToEndorse.id
            });
        });

        logActivity(user, 'APPROVE', 'BenefitRequest', requestToEndorse.id, `HR endorsed request for ${requestToEndorse.benefitTypeName} to Board.`);
        alert(`Request endorsed to ${selectedApprovers.length} board member(s).`);
        
        setIsEndorseModalOpen(false);
        setRequestToEndorse(null);
    };
    
    const handleBODApprove = (request: BenefitRequest) => {
        if (!user) return;
        
        const update = (r: BenefitRequest) => {
            if (r.id === request.id) {
                return { 
                    ...r, 
                    status: BenefitRequestStatus.Approved,
                    bodApprovedBy: user.id,
                    bodApprovedAt: new Date()
                };
            }
            return r;
        };
        
        setAllRequests(prev => prev.map(update));
        setMyRequests(prev => prev.map(update));

        const idx = mockBenefitRequests.findIndex(r => r.id === request.id);
        if (idx > -1) {
             mockBenefitRequests[idx] = update(mockBenefitRequests[idx]);
        }
        
        // Notify Employee
        mockNotifications.unshift({
            id: `notif-benefit-bod-app-${Date.now()}`,
            userId: request.employeeId,
            type: NotificationType.AWARD_RECEIVED, 
            title: 'Benefit Approved',
            message: `Your request for ${request.benefitTypeName} has been approved by the Board.`,
            link: '/employees/benefits',
            isRead: false,
            createdAt: new Date(),
            relatedEntityId: request.id
        });

        // Notify HR for Fulfillment
        const hrUsers = mockUsers.filter(u => [Role.Admin, Role.HRManager, Role.HRStaff].includes(u.role));
        hrUsers.forEach(hrUser => {
             mockNotifications.unshift({
                id: `notif-benefit-fulfill-${Date.now()}-${hrUser.id}`,
                userId: hrUser.id,
                type: NotificationType.AWARD_APPROVAL_REQUEST, // Using this type so it shows in HR action items potentially, or generic notification list
                title: 'Benefit Ready for Fulfillment',
                message: `Board approved benefit for ${request.employeeName}. Please fulfill.`,
                link: '/employees/benefits?tab=fulfillment',
                isRead: false,
                createdAt: new Date(),
                relatedEntityId: request.id
            });
        });

        logActivity(user, 'APPROVE', 'BenefitRequest', request.id, `Board approved request for ${request.benefitTypeName}`);
        alert("Request approved by Board. HR has been notified for fulfillment.");
    };

    const handleReject = (request: BenefitRequest) => {
        setRequestToReject(request);
        setIsRejectModalOpen(true);
    };

    const handleConfirmReject = (reason: string) => {
        if (!user || !requestToReject) return;
        
        const update = (r: BenefitRequest) => {
            if (r.id === requestToReject.id) {
                return { 
                    ...r, 
                    status: BenefitRequestStatus.Rejected,
                    rejectionReason: reason
                };
            }
            return r;
        };

        setAllRequests(prev => prev.map(update));
        setMyRequests(prev => prev.map(update));

        const idx = mockBenefitRequests.findIndex(r => r.id === requestToReject.id);
        if (idx > -1) {
             mockBenefitRequests[idx] = update(mockBenefitRequests[idx]);
        }
        
         // Notify Employee
         mockNotifications.unshift({
            id: `notif-benefit-rej-${Date.now()}`,
            userId: requestToReject.employeeId,
            type: NotificationType.TICKET_UPDATE_REQUESTER, // Using generic alert icon
            title: 'Benefit Request Rejected',
            message: `Your request for ${requestToReject.benefitTypeName} was rejected. Reason: ${reason}`,
            link: '/employees/benefits',
            isRead: false,
            createdAt: new Date(),
            relatedEntityId: requestToReject.id
        });

        logActivity(user, 'REJECT', 'BenefitRequest', requestToReject.id, `Rejected request. Reason: ${reason}`);
        setIsRejectModalOpen(false);
        setRequestToReject(null);
    };
    
    // --- Fulfillment Handlers ---
    const handleOpenFulfillModal = (request: BenefitRequest) => {
        setRequestToFulfill(request);
        setIsFulfillmentModalOpen(true);
    };
    
    const handleConfirmFulfillment = (voucherCode: string) => {
        if (!user || !requestToFulfill) return;
        
         const update = (r: BenefitRequest) => {
            if (r.id === requestToFulfill.id) {
                return { 
                    ...r, 
                    status: BenefitRequestStatus.Fulfilled,
                    fulfilledBy: user.id,
                    fulfilledAt: new Date(),
                    voucherCode: voucherCode
                };
            }
            return r;
        };

        setAllRequests(prev => prev.map(update));
        setMyRequests(prev => prev.map(update));

        const idx = mockBenefitRequests.findIndex(r => r.id === requestToFulfill.id);
        if (idx > -1) {
             mockBenefitRequests[idx] = update(mockBenefitRequests[idx]);
        }
        
        // Notify Employee
         mockNotifications.unshift({
            id: `notif-benefit-full-${Date.now()}`,
            userId: requestToFulfill.employeeId,
            type: NotificationType.AWARD_RECEIVED,
            title: 'Benefit Fulfilled',
            message: `Your benefit ${requestToFulfill.benefitTypeName} has been fulfilled! Check details for voucher/code.`,
            link: '/employees/benefits',
            isRead: false,
            createdAt: new Date(),
            relatedEntityId: requestToFulfill.id
        });
        
        logActivity(user, 'UPDATE', 'BenefitRequest', requestToFulfill.id, `Fulfilled request. Code: ${voucherCode}`);
        setIsFulfillmentModalOpen(false);
        setRequestToFulfill(null);
        alert("Request marked as fulfilled.");
    };


    const getTabClass = (tabName: string) => 
        `px-4 py-2 text-sm font-medium rounded-md focus:outline-none transition-colors ${activeTab === tabName ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`;

    const activeBenefitTypes = useMemo(() => benefitTypes.filter(bt => bt.isActive), [benefitTypes]);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Benefits & Perks</h1>
                {canManage && activeTab === 'configuration' && (
                    <Button onClick={() => handleOpenConfigModal(null)}>Add Benefit Type</Button>
                )}
            </div>
            
            <div className="flex space-x-2 border-b border-gray-200 dark:border-gray-700 pb-2 overflow-x-auto">
                <button className={getTabClass('my_benefits')} onClick={() => handleTabChange('my_benefits')}>My Benefits</button>
                
                {(isAdminOrHR || isBOD) && (
                    <button className={getTabClass('approvals')} onClick={() => handleTabChange('approvals')}>
                        Approvals 
                        {isAdminOrHR && pendingHRRequests.length > 0 && (
                            <span className="ml-2 bg-red-100 text-red-800 text-xs font-semibold px-2 py-0.5 rounded-full">{pendingHRRequests.length}</span>
                        )}
                        {isBOD && pendingBODRequests.length > 0 && (
                             <span className="ml-2 bg-red-100 text-red-800 text-xs font-semibold px-2 py-0.5 rounded-full">{pendingBODRequests.length}</span>
                        )}
                    </button>
                )}
                
                {isAdminOrHR && (
                    <button className={getTabClass('fulfillment')} onClick={() => handleTabChange('fulfillment')}>
                        Fulfillment
                         {approvedForFulfillmentRequests.length > 0 && (
                            <span className="ml-2 bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded-full">{approvedForFulfillmentRequests.length}</span>
                        )}
                    </button>
                )}
                
                {isAdminOrHR && (
                    <button className={getTabClass('configuration')} onClick={() => handleTabChange('configuration')}>Configuration</button>
                )}
            </div>

            {activeTab === 'configuration' && isAdminOrHR && (
                <div className="space-y-6">
                    <EditableDescription descriptionKey="benefitsDesc" className="text-sm" />
                    <Card title="Benefit Catalog">
                        <BenefitTypeTable 
                            benefitTypes={benefitTypes} 
                            onEdit={handleOpenConfigModal} 
                            onDelete={handleDeleteBenefitType} 
                        />
                    </Card>
                </div>
            )}

            {activeTab === 'my_benefits' && (
                <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {activeBenefitTypes.map(bt => (
                            <Card key={bt.id} className="flex flex-col h-full hover:shadow-lg transition-shadow duration-200">
                                <div className="flex-grow">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{bt.name}</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{bt.description}</p>
                                    <div className="mt-4 space-y-1">
                                        {bt.maxValue && (
                                            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-md inline-block">
                                                Max: {settings.currency} {bt.maxValue.toLocaleString()}</p>
                                        )}
                                        {bt.requiresBodApproval && (
                                            <p className="text-xs text-orange-600 dark:text-orange-400 flex items-center">
                                                <span className="w-2 h-2 bg-orange-500 rounded-full mr-2"></span>
                                                Requires Board Approval
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-6 pt-4 border-t dark:border-gray-700">
                                    <Button className="w-full" onClick={() => handleRequestClick(bt)}>Request</Button>
                                </div>
                            </Card>
                        ))}
                         {activeBenefitTypes.length === 0 && (
                            <div className="col-span-full text-center py-12 text-gray-500">
                                No benefits are currently available.
                            </div>
                        )}
                    </div>

                    <Card title="My Request History">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-700">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Benefit</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date Submitted</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date Needed</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Notes/Voucher</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {myRequests.map(req => (
                                        <tr key={req.id}>
                                            <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">{req.benefitTypeName}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(req.submissionDate).toLocaleDateString()}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(req.dateNeeded).toLocaleDateString()}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white">
                                                {req.amount ? `${settings.currency} ${req.amount.toLocaleString()}` : '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(req.status)}`}>
                                                    {req.status}
                                                </span>
                                            </td>
                                             <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                                                {req.voucherCode || req.rejectionReason || '-'}
                                            </td>
                                        </tr>
                                    ))}
                                    {myRequests.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="text-center py-8 text-gray-500">You haven't submitted any requests yet.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {activeTab === 'approvals' && (
                <div className="space-y-6">
                    {isAdminOrHR && (
                        <>
                            <Card title="Pending HR Review">
                                <BenefitApprovalsTable 
                                    requests={pendingHRRequests} 
                                    benefitTypes={benefitTypes}
                                    onApprove={handleHRApprove}
                                    onReject={handleReject}
                                />
                            </Card>
                            <Card title="HR Processed History">
                                <BenefitApprovalsTable 
                                    requests={processedHRRequests} 
                                    benefitTypes={benefitTypes}
                                />
                            </Card>
                        </>
                    )}
                    
                    {isBOD && (
                        <>
                            <Card title="Pending Board Approval">
                                <BenefitBoardApprovalTable
                                    requests={pendingBODRequests}
                                    onApprove={handleBODApprove}
                                    onReject={handleReject}
                                />
                            </Card>
                            <Card title="Board Decision History">
                                <BenefitBoardApprovalTable
                                    requests={processedBODRequests}
                                />
                            </Card>
                        </>
                    )}
                </div>
            )}
            
            {activeTab === 'fulfillment' && isAdminOrHR && (
                <div className="space-y-6">
                    <Card title="Ready for Fulfillment">
                         <BenefitFulfillmentTable
                            requests={approvedForFulfillmentRequests}
                            onFulfill={handleOpenFulfillModal}
                         />
                    </Card>
                    <Card title="Fulfillment History">
                         <BenefitFulfillmentTable
                            requests={fulfilledRequests}
                         />
                    </Card>
                </div>
            )}

            <BenefitTypeModal
                isOpen={isConfigModalOpen}
                onClose={() => setIsConfigModalOpen(false)}
                benefitType={selectedBenefitType}
                onSave={handleSaveBenefitType}
            />

            {requestingBenefit && (
                <BenefitRequestModal
                    isOpen={isRequestModalOpen}
                    onClose={() => setIsRequestModalOpen(false)}
                    benefitType={requestingBenefit}
                    onSave={handleSubmitRequest}
                />
            )}

            {/* Endorsement Modal for BOD Selection */}
            {isEndorseModalOpen && requestToEndorse && (
                <Modal
                    isOpen={isEndorseModalOpen}
                    onClose={() => setIsEndorseModalOpen(false)}
                    title="Endorse to Board of Directors"
                    footer={
                        <div className="flex justify-end space-x-2 w-full">
                            <Button variant="secondary" onClick={() => setIsEndorseModalOpen(false)}>Cancel</Button>
                            <Button onClick={handleConfirmEndorse} disabled={selectedApprovers.length === 0}>Endorse & Notify</Button>
                        </div>
                    }
                >
                    <div className="space-y-4">
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-md text-blue-800 dark:text-blue-200 text-sm">
                            <p className="font-semibold">Board Approval Required</p>
                            <p>This benefit request requires approval from the Board of Directors. Please select the board members who should be notified to review this request.</p>
                            <p className="mt-2">Only one approval is required to proceed, but all selected members will be notified.</p>
                        </div>
                        <EmployeeMultiSelect 
                            label="Request Approval From (at least one BOD required)"
                            allUsers={bodApproverPool}
                            selectedUsers={selectedApprovers}
                            onSelectionChange={setSelectedApprovers}
                        />
                    </div>
                </Modal>
            )}

            <FulfillmentModal
                isOpen={isFulfillmentModalOpen}
                onClose={() => setIsFulfillmentModalOpen(false)}
                request={requestToFulfill}
                onConfirm={handleConfirmFulfillment}
            />

            <RejectReasonModal
                isOpen={isRejectModalOpen}
                onClose={() => setIsRejectModalOpen(false)}
                onSubmit={handleConfirmReject}
                title="Reject Benefit Request"
                prompt="Please provide a reason for rejecting this request."
            />
        </div>
    );
};

export default Benefits;
