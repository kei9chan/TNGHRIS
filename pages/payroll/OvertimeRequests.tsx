
import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { OTRequest, OTStatus, Role, OTRequestHistory, Permission } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { mockOtRequests, mockAttendanceRecords, mockShiftAssignments, mockShiftTemplates, mockUsers, mockBusinessUnits } from '../../services/mockData';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import OTRequestTable from '../../components/payroll/OTRequestTable';
import OTRequestModal from '../../components/payroll/OTRequestModal';
import OTStats from '../../components/payroll/OTStats';
import OTCalendar from '../../components/payroll/OTCalendar';
import OTLedger from '../../components/payroll/OTLedger';
import EditableDescription from '../../components/ui/EditableDescription';
import { logActivity } from '../../services/auditService';
import { fetchOtRequests, saveOtRequest, approveRejectOtRequest } from '../../services/otService';

type Tab = 'my_ot' | 'team_approvals' | 'calendar' | 'ledger';

const SuccessToast: React.FC<{ message: string; show: boolean; onClose: () => void }> = ({ message, show, onClose }) => {
    useEffect(() => {
        if (show) {
            const timer = setTimeout(() => {
                onClose();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [show, onClose]);

    if (!show) return null;

    return (
        <div className="fixed top-20 right-5 z-50 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg shadow-lg animate-fade-in-out" role="alert">
            <strong className="font-bold">Success! </strong>
            <span className="block sm:inline">{message}</span>
        </div>
    );
};

const OvertimeRequests: React.FC = () => {
    const { user } = useAuth();
    const { hasDirectReports, getAccessibleBusinessUnits, getOtAccess } = usePermissions();
    const location = useLocation();
    const navigate = useNavigate();
    
    const [requests, setRequests] = useState<OTRequest[]>([]);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<OTRequest | null>(null);
    const [showSuccessToast, setShowSuccessToast] = useState(false);

    const otAccess = getOtAccess();
    const canApprove = otAccess.canApprove || hasDirectReports();
    const canViewLedger = canApprove;
    
    useEffect(() => {
        const loadRequests = async () => {
            try {
                const data = await fetchOtRequests();
                setRequests(data);
            } catch (error) {
                console.error('Failed to load OT requests', error);
            }
        };
        loadRequests();
    }, []);
    
    // Dashboard State
    const [activeTab, setActiveTab] = useState<Tab>('my_ot');
    const [viewFilter, setViewFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
    
    // BU Filter State (for privileged roles)
    const [selectedBuFilter, setSelectedBuFilter] = useState<string>('all');
    
    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);
    const scopedRequests = useMemo(() => otAccess.filterRequests(requests), [otAccess, requests]);

    useEffect(() => {
         // Default to first accessible BU if limited scope and not "all"
        if (accessibleBus.length === 1) {
            setSelectedBuFilter(accessibleBus[0].id);
        }
    }, [accessibleBus]);

    // Handle Quick Link state
    useEffect(() => {
        if (location.state?.openNewOTModal) {
            setSelectedRequest(null);
            setIsModalOpen(true);
            // Clear state to prevent re-opening on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate]);

    // Identify if user is "Privileged" to see BU-wide stats
    const isPrivilegedViewer = useMemo(() => {
        if (!user) return false;
        return [
            Role.Admin,
            Role.BOD,
            Role.GeneralManager,
            Role.HRManager,
            Role.HRStaff,
            Role.OperationsDirector,
            Role.BusinessUnitManager
        ].includes(user.role);
    }, [user]);

    // Filter requests based on selected BU (for privileged users)
    const buFilteredRequests = useMemo(() => {
        const accessibleBuIds = new Set(accessibleBus.map(b => b.id));
        
        // Filter down to accessible BUs first
        let filtered = scopedRequests.filter(r => {
             const employee = mockUsers.find(u => u.id === r.employeeId);
             const employeeBuId = mockBusinessUnits.find(b => b.name === employee?.businessUnit)?.id;
             return employeeBuId && accessibleBuIds.has(employeeBuId);
        });

        if (selectedBuFilter !== 'all') {
            const buName = mockBusinessUnits.find(b => b.id === selectedBuFilter)?.name;
            if (buName) {
                filtered = filtered.filter(r => {
                    const employee = mockUsers.find(u => u.id === r.employeeId);
                    return employee?.businessUnit === buName;
                });
            }
        }
        return filtered;
    }, [requests, selectedBuFilter, accessibleBus]);


    // 1. "My OT" Data
    const myRequests = useMemo(() => {
        if (!user) return [];
        return scopedRequests.filter(r => r.employeeId === user.id);
    }, [scopedRequests, user]);

    // 2. "Team Approvals" Data
    const teamRequests = useMemo(() => {
        if (!user || !canApprove) return [];
        if (isPrivilegedViewer) {
             return buFilteredRequests.filter(r => r.status === OTStatus.Submitted);
        }
        return scopedRequests.filter(r => r.status === OTStatus.Submitted && r.employeeId !== user.id);
    }, [scopedRequests, user, canApprove, isPrivilegedViewer, buFilteredRequests]);

    // 3. Calendar Data Source
    const calendarRequests = useMemo(() => {
        if (!user) return [];
        if (canApprove) {
             if (isPrivilegedViewer) {
                 return buFilteredRequests;
             }
             return scopedRequests.filter(r => r.employeeId === user.id || r.status === OTStatus.Submitted); 
        }
        return myRequests;
    }, [scopedRequests, user, canApprove, myRequests, isPrivilegedViewer, buFilteredRequests]);
    
    // 4. Ledger Data Source (All Requests available to the viewer)
    const ledgerRequests = useMemo(() => {
        if (!user || !canViewLedger) return [];
        if (isPrivilegedViewer) {
            return buFilteredRequests;
        }
        return scopedRequests.filter(r => r.employeeId === user.id || r.status === OTStatus.Submitted); 
    }, [scopedRequests, user, canViewLedger, isPrivilegedViewer, buFilteredRequests]);


    // 5. Data for Stats Cards
    const statsData = useMemo(() => {
        return isPrivilegedViewer ? buFilteredRequests : myRequests;
    }, [isPrivilegedViewer, buFilteredRequests, myRequests]);


    // 6. Shift Data for Context
    // Passed to calendar and modal for context-aware features (e.g., auto-fill shift end time)
    const relevantShifts = useMemo(() => {
         if (!user) return [];
         // In a real app, we'd fetch specific shifts. For mock, pass all.
         return mockShiftAssignments;
    }, [user]);

    // 7. Filtered Display Data based on Active Tab & Sub-filter (For Table View)
    const displayedTableRequests = useMemo(() => {
        let data = activeTab === 'team_approvals' ? teamRequests : myRequests;

        if (activeTab === 'my_ot' && viewFilter !== 'all') {
            if (viewFilter === 'pending') data = data.filter(r => r.status === OTStatus.Submitted || r.status === OTStatus.Draft);
            if (viewFilter === 'approved') data = data.filter(r => r.status === OTStatus.Approved);
            if (viewFilter === 'rejected') data = data.filter(r => r.status === OTStatus.Rejected);
        }
        
        return data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [activeTab, viewFilter, myRequests, teamRequests]);


    const handleNewRequest = () => {
        setSelectedRequest(null);
        setIsModalOpen(true);
    };

    const handleEditRequest = (request: OTRequest) => {
        setSelectedRequest(request);
        setIsModalOpen(true);
    };

    const handleDeleteRequest = (requestId: string) => {
        if (window.confirm('Are you sure you want to delete this draft?')) {
            setRequests(prev => prev.filter(r => r.id !== requestId));
             const idx = mockOtRequests.findIndex(r => r.id === requestId);
             if (idx > -1) mockOtRequests.splice(idx, 1);
             if (user) {
                 logActivity(user, 'DELETE', 'OTRequest', requestId, 'Deleted draft OT request.');
             }
        }
    };

    const handleWithdrawRequest = (requestId: string) => {
        if (!user) return;
        const newHistoryEntry: OTRequestHistory = {
            userId: user.id,
            userName: user.name,
            timestamp: new Date(),
            action: 'Withdrawn',
            details: 'Request withdrawn by employee.'
        };
        const update = (r: OTRequest) => r.id === requestId ? { ...r, status: OTStatus.Draft, submittedAt: undefined, historyLog: [...(r.historyLog || []), newHistoryEntry] } : r;
        
        setRequests(prev => prev.map(update));
        const idx = mockOtRequests.findIndex(r => r.id === requestId);
        if (idx > -1) mockOtRequests[idx] = update(mockOtRequests[idx]) as OTRequest;
        
        logActivity(user, 'UPDATE', 'OTRequest', requestId, 'Withdrew OT request.');
    };

    const handleSaveRequest = async (requestToSave: Partial<OTRequest>, status: OTStatus) => {
        if (!user) return;
        if (!otAccess.canRequest) {
            alert('You do not have permission to file an OT request.');
            return;
        }

        const newHistoryEntry: OTRequestHistory = {
            userId: user.id,
            userName: user.name,
            timestamp: new Date(),
            action: status === OTStatus.Submitted ? 'Submitted' : (requestToSave.id ? 'Edited' : 'Created'),
            details: status === OTStatus.Submitted ? `Submitted for approval.` : `Saved as draft.`
        };

        const updatedRequestData: Partial<OTRequest> = { 
            ...requestToSave, 
            status,
            historyLog: [...(requestToSave.historyLog || []), newHistoryEntry],
            submittedAt: status === OTStatus.Submitted ? (requestToSave.submittedAt || new Date()) : requestToSave.submittedAt
        };

        try {
            const saved = await saveOtRequest(updatedRequestData, status, user);
            setRequests(prev => {
                const existing = prev.find(r => r.id === saved.id);
                if (existing) {
                    return prev.map(r => r.id === saved.id ? saved : r);
                }
                return [...prev, saved];
            });
            logActivity(user, requestToSave.id ? 'UPDATE' : 'CREATE', 'OTRequest', saved.id, `Set OT request status to ${status}`);
            setIsModalOpen(false);
            if (status === OTStatus.Submitted) {
                setShowSuccessToast(true);
            }
        } catch (error: any) {
            alert(error?.message || 'Failed to save OT request.');
        }
    };

    const handleApprovalAction = async (
        requestToUpdate: Partial<OTRequest>,
        newStatus: OTStatus.Approved | OTStatus.Rejected,
        details: { approvedHours?: number, managerNote?: string }
    ) => {
        if (!user) return;
        if (!otAccess.canActOn(requestToUpdate as OTRequest)) {
            alert('You do not have permission to act on this request.');
            return;
        }
        const action = newStatus === OTStatus.Approved ? 'Approved' : 'Rejected';
        const detailText = `${action}${details.approvedHours ? ` ${details.approvedHours.toFixed(2)} hours.` : '.'} Note: ${details.managerNote || 'N/A'}`;

        const newHistoryEntry: OTRequestHistory = {
            userId: user.id,
            userName: user.name,
            timestamp: new Date(),
            action,
            details: detailText
        };
        
        const updater = (r: OTRequest) => r.id === requestToUpdate.id
                ? { ...r, status: newStatus, approvedHours: details.approvedHours, managerNote: details.managerNote, historyLog: [...(r.historyLog || []), newHistoryEntry] }
                : r;

        try {
            const updated = await approveRejectOtRequest(requestToUpdate.id!, newStatus, details);
            updated.historyLog = [...(updated.historyLog || []), newHistoryEntry];
            setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
            const actionType = newStatus === OTStatus.Approved ? 'APPROVE' : 'REJECT';
            logActivity(user, actionType, 'OTRequest', requestToUpdate.id!, `${action} OT request for ${requestToUpdate.employeeName}`);
            setIsModalOpen(false);
        } catch (error: any) {
            alert(error?.message || 'Failed to update OT request.');
        }
    };

    const getTabClass = (tabName: Tab) => {
        return `px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === tabName ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`;
    };

    return (
        <div className="space-y-6">
            <SuccessToast show={showSuccessToast} message="Submitted successfully." onClose={() => setShowSuccessToast(false)} />

            <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Overtime Management</h1>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                        {isPrivilegedViewer ? "Administrative Overview" : "Track and request overtime"}
                    </p>
                </div>
                <div className="flex items-center space-x-4">
                    {isPrivilegedViewer && (
                        <select
                            value={selectedBuFilter}
                            onChange={(e) => setSelectedBuFilter(e.target.value)}
                            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            <option value="all">All Business Units</option>
                            {accessibleBus.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    )}
                    <Button onClick={handleNewRequest}>+ New OT Request</Button>
                </div>
            </div>
            
            <EditableDescription descriptionKey="payrollOvertimeDesc" className="mb-4"/>
            
            {/* Dashboard Stats - Data source depends on role and filter */}
            <OTStats requests={statsData} />

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 p-1 bg-white dark:bg-slate-800 rounded-lg shadow-sm w-fit">
                <button className={getTabClass('my_ot')} onClick={() => setActiveTab('my_ot')}>
                    My OT
                </button>
                {canApprove && (
                    <button className={getTabClass('team_approvals')} onClick={() => setActiveTab('team_approvals')}>
                        Team Approvals 
                        {teamRequests.length > 0 && <span className="ml-2 bg-red-100 text-red-800 text-xs font-semibold px-2 py-0.5 rounded-full">{teamRequests.length}</span>}
                    </button>
                )}
                <button className={getTabClass('calendar')} onClick={() => setActiveTab('calendar')}>
                    OT Calendar
                </button>
                 {canViewLedger && (
                    <button className={getTabClass('ledger')} onClick={() => setActiveTab('ledger')}>
                        Ledger & Reports
                    </button>
                )}
            </div>

            {/* Filters (Only for My OT) */}
            {activeTab === 'my_ot' && (
                <Card>
                    <div className="flex space-x-4 p-1">
                        <button onClick={() => setViewFilter('all')} className={`text-sm font-medium ${viewFilter === 'all' ? 'text-indigo-600 underline' : 'text-gray-500'}`}>All</button>
                        <button onClick={() => setViewFilter('pending')} className={`text-sm font-medium ${viewFilter === 'pending' ? 'text-indigo-600 underline' : 'text-gray-500'}`}>Pending</button>
                        <button onClick={() => setViewFilter('approved')} className={`text-sm font-medium ${viewFilter === 'approved' ? 'text-indigo-600 underline' : 'text-gray-500'}`}>Approved</button>
                        <button onClick={() => setViewFilter('rejected')} className={`text-sm font-medium ${viewFilter === 'rejected' ? 'text-indigo-600 underline' : 'text-gray-500'}`}>Rejected</button>
                    </div>
                </Card>
            )}

            {activeTab === 'calendar' ? (
                 <OTCalendar 
                    requests={calendarRequests} 
                    shifts={relevantShifts}
                    templates={mockShiftTemplates}
                 />
            ) : activeTab === 'ledger' && canViewLedger ? (
                <OTLedger requests={ledgerRequests} />
            ) : (
                <Card>
                    <OTRequestTable
                        requests={displayedTableRequests}
                        onEdit={handleEditRequest}
                        onDelete={handleDeleteRequest}
                        onWithdraw={handleWithdrawRequest}
                    />
                </Card>
            )}

            <OTRequestModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveRequest}
                onApproveOrReject={handleApprovalAction}
                requestToEdit={selectedRequest}
                attendanceRecords={mockAttendanceRecords}
                shiftAssignments={relevantShifts} // Pass shifts for context awareness
                shiftTemplates={mockShiftTemplates} // Pass templates for context awareness
            />
        </div>
    );
};

export default OvertimeRequests;
