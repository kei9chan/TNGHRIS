import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { OTRequest, OTStatus, Role, OTRequestHistory, Permission } from '../../types';
import { NotificationType } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useSettings } from '../../context/SettingsContext';
import { useUsers, useBusinessUnits, useShiftTemplates, useAttendanceRecords, useShiftAssignments } from '../../hooks/useHRData';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import OTRequestTable from '../../components/payroll/OTRequestTable';
import OTRequestModal from '../../components/payroll/OTRequestModal';
import OTStats from '../../components/payroll/OTStats';
import OTCalendar from '../../components/payroll/OTCalendar';
import OTLedger from '../../components/payroll/OTLedger';
import EditableDescription from '../../components/ui/EditableDescription';
import { logActivity } from '../../services/auditService';
import { fetchOtRequests, saveOtRequest, approveRejectOtRequest, managerApproveOtRequest, bodApproveOtRequest, deleteOtRequest, withdrawOtRequest, verifyAndConvertOT } from '../../services/otService';
import { createNotification } from '../../services/notificationService';
import { fetchApproverConfigs } from '../../services/approverConfigService';
import { supabase } from '../../services/supabaseClient';

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
    const { approverConfigs } = useSettings();
    const location = useLocation();
    const navigate = useNavigate();
    
    const [requests, setRequests] = useState<OTRequest[]>([]);
    const [reporteeIds, setReporteeIds] = useState<string[]>([]);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<OTRequest | null>(null);
    const [showSuccessToast, setShowSuccessToast] = useState(false);

    const { users: hrUsers } = useUsers();
    const { businessUnits: hrBusinessUnits } = useBusinessUnits();
    const { shiftTemplates: hrShiftTemplates } = useShiftTemplates();
    const { attendanceRecords: hrAttendanceRecords } = useAttendanceRecords();
    const { shiftAssignments: hrShiftAssignments } = useShiftAssignments();

    // Check if the current user is a configured BOD approver (by role OR by admin config)
    const isConfiguredBOD = useMemo(() => {
        if (!user) return false;
        if (user.role === Role.BOD) return true;
        const bodIds: string[] = approverConfigs.bodApprovers.user_ids || [];
        return bodIds.includes(user.id);
    }, [user, approverConfigs]);

    const otAccess = getOtAccess();
    // Configured BOD approvers can also approve
    const canApprove = otAccess.canApprove || reporteeIds.length > 0 || hasDirectReports() || isConfiguredBOD;
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

    useEffect(() => {
        const loadReportees = async () => {
            if (!user?.id) {
                setReporteeIds([]);
                return;
            }
            const { data, error } = await supabase
                .from('hris_users')
                .select('id')
                .eq('reports_to', user.id);
            if (error || !data) {
                setReporteeIds([]);
                return;
            }
            setReporteeIds(data.map((row: any) => row.id).filter(Boolean));
        };
        loadReportees();
    }, [user?.id]);
    
    // Dashboard State
    const [activeTab, setActiveTab] = useState<Tab>('my_ot');
    const [viewFilter, setViewFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
    
    // BU Filter State (for privileged roles)
    const [selectedBuFilter, setSelectedBuFilter] = useState<string>('all');
    
    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(hrBusinessUnits), [getAccessibleBusinessUnits, hrBusinessUnits]);
    const scopedRequests = useMemo(() => otAccess.filterRequests(requests), [otAccess, requests]);

    useEffect(() => {
         // Default to first accessible BU if limited scope and not "all"
        if (accessibleBus.length === 1) {
            setSelectedBuFilter(accessibleBus[0].id);
        }
    }, [accessibleBus]);

    // Handle Quick Link state — also auto-switch to Team Approvals for BOD notification links
    useEffect(() => {
        if (location.state?.openNewOTModal) {
            setSelectedRequest(null);
            setIsModalOpen(true);
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate]);

    // When arriving from a notification (no modal state), BOD approvers should land on Team Approvals
    useEffect(() => {
        if (isConfiguredBOD && !location.state?.openNewOTModal) {
            setActiveTab('team_approvals');
        }
    }, [isConfiguredBOD]);

    // Identify if user is "Privileged" to see BU-wide stats
    const isPrivilegedViewer = useMemo(() => {
        if (!user) return false;
        // Configured BOD approvers (regardless of role) are also privileged viewers
        if (isConfiguredBOD) return true;
        return [
            Role.Admin,
            Role.BOD,
            Role.GeneralManager,
            Role.HRManager,
            Role.HRStaff,
            Role.OperationsDirector,
            Role.BusinessUnitManager
        ].includes(user.role);
    }, [user, isConfiguredBOD]);

    // Filter requests based on selected BU (for privileged users)
    const buFilteredRequests = useMemo(() => {
        const accessibleBuIds = new Set(accessibleBus.map(b => b.id));
        
        // Filter down to accessible BUs first
        let filtered = scopedRequests.filter(r => {
             const employee = hrUsers.find(u => u.id === r.employeeId);
             const employeeBuId = hrBusinessUnits.find(b => b.name === employee?.businessUnit)?.id;
             return employeeBuId && accessibleBuIds.has(employeeBuId);
        });

        if (selectedBuFilter !== 'all') {
            const buName = hrBusinessUnits.find(b => b.id === selectedBuFilter)?.name;
            if (buName) {
                filtered = filtered.filter(r => {
                    const employee = hrUsers.find(u => u.id === r.employeeId);
                    return employee?.businessUnit === buName;
                });
            }
        }
        return filtered;
    }, [requests, selectedBuFilter, accessibleBus, hrUsers, hrBusinessUnits]);


    // 1. "My OT" Data
    const myRequests = useMemo(() => {
        if (!user) return [];
        return scopedRequests.filter(r => r.employeeId === user.id);
    }, [scopedRequests, user]);

    // 2. "Team Approvals" Data
    const teamRequests = useMemo(() => {
        if (!user || !canApprove) return [];

        let visibleRequests: OTRequest[] = [];

        // Regular managers see Submitted + PendingBOD requests from their direct reports
        if (reporteeIds.length > 0) {
            const reporteeRequests = requests.filter(r =>
                reporteeIds.includes(r.employeeId) && (
                    r.status === OTStatus.Submitted || r.status === OTStatus.PendingBOD
                )
            );
            visibleRequests = [...visibleRequests, ...reporteeRequests];
        }

        // Configured BOD approvers see ALL PendingBOD requests org-wide
        if (isConfiguredBOD) {
            const bodRequests = requests.filter(r => r.status === OTStatus.PendingBOD);
            visibleRequests = [...visibleRequests, ...bodRequests];
        }

        // Deduplicate in case a request is both from a direct report and PendingBOD
        const uniqueRequests = Array.from(new Map(visibleRequests.map(r => [r.id, r])).values());
        return uniqueRequests;
    }, [requests, reporteeIds, user, canApprove, isConfiguredBOD]);

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
         return hrShiftAssignments;
    }, [user, hrShiftAssignments]);

    // 7. Filtered Display Data based on Active Tab & Sub-filter (For Table View)
    const displayedTableRequests = useMemo(() => {
        let data = activeTab === 'team_approvals' ? teamRequests : myRequests;

        if (activeTab === 'my_ot' && viewFilter !== 'all') {
            if (viewFilter === 'pending') data = data.filter(r =>
                r.status === OTStatus.Submitted ||
                r.status === OTStatus.Draft ||
                r.status === OTStatus.PendingBOD
            );
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

    const handleDeleteRequest = async (requestId: string) => {
        if (window.confirm('Are you sure you want to delete this draft?')) {
            try {
                await deleteOtRequest(requestId);
                setRequests(prev => prev.filter(r => r.id !== requestId));
                if (user) {
                    logActivity(user, 'DELETE', 'OTRequest', requestId, 'Deleted draft OT request.');
                }
            } catch (err: any) {
                alert(err?.message || 'Failed to delete request.');
            }
        }
    };

    const handleConvertRequest = async (requestId: string) => {
        if (!user) return;
        if (!window.confirm("Are you sure you want to verify this OT and convert the approved hours into Offset Leave?")) return;
        try {
            const updated = await verifyAndConvertOT(requestId, user.id);
            setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
            
            // Notify the employee
            if (updated.employeeId) {
                createNotification({
                    userId: updated.employeeId,
                    title: '✅ Offset Leave Converted',
                    message: `Your approved Offset OT for ${new Date(updated.date).toLocaleDateString()} has been verified and converted to your Offset Leave balance.`,
                    type: NotificationType.OT_APPROVED,
                    link: '/payroll/leave',
                }).catch(console.error);
            }
        } catch (error: any) {
            console.error('Failed to convert OT', error);
            alert(error.message || 'Failed to convert OT');
        }
    };

    const handleWithdrawRequest = async (requestId: string) => {
        if (!user) return;
        const reqToWithdraw = requests.find(r => r.id === requestId);
        if (!reqToWithdraw) return;

        try {
            const updated = await withdrawOtRequest(reqToWithdraw, user);
            setRequests(prev => prev.map(r => r.id === requestId ? updated : r));
            logActivity(user, 'UPDATE', 'OTRequest', requestId, 'Withdrew OT request.');
        } catch (err: any) {
            alert(err?.message || 'Failed to withdraw request.');
        }
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

                // Notify the manager that an OT request needs their approval
                if (user.managerId) {
                    createNotification({
                        userId: user.managerId,
                        title: '📋 OT Request Pending Approval',
                        message: `${user.name} submitted an overtime request for your approval.`,
                        type: NotificationType.OT_SUBMITTED,
                        link: '/payroll/overtime-requests',
                    }).catch(e => console.error('Failed to send OT submission notification', e));
                }
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
        const canReview = reporteeIds.includes(requestToUpdate.employeeId || '');
        if (!otAccess.canActOn(requestToUpdate as OTRequest) && !canReview) {
            alert('You do not have permission to act on this request.');
            return;
        }

        const isSubmitted  = requestToUpdate.status === OTStatus.Submitted;
        const isPendingBOD = requestToUpdate.status === OTStatus.PendingBOD;

        const action = newStatus === OTStatus.Approved ? 'Approved' : 'Rejected';
        const detailText = `${action}${details.approvedHours ? ` ${details.approvedHours.toFixed(2)} hours.` : '.'} Note: ${details.managerNote || 'N/A'}`;

        const newHistoryEntry: OTRequestHistory = {
            userId: user.id,
            userName: user.name,
            timestamp: new Date(),
            action,
            details: detailText
        };

        try {
            let updated: OTRequest;

            if (isSubmitted && newStatus === OTStatus.Approved) {
                if (user.role === Role.BOD || isConfiguredBOD) {
                    // Bypass Step 2 → BOD is the manager, go straight to fully Approved
                    updated = await bodApproveOtRequest(requestToUpdate.id!, details);
                    updated.historyLog = [...(updated.historyLog || []), newHistoryEntry];
                    setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
                    logActivity(user, 'APPROVE', 'OTRequest', requestToUpdate.id!, `BOD gave direct final approval for ${requestToUpdate.employeeName}'s OT request`);

                    if (requestToUpdate.employeeId) {
                        createNotification({
                            userId: requestToUpdate.employeeId,
                            title: '✅ OT Request Fully Approved',
                            message: `Your OT request has been fully approved by your manager (BOD).`,
                            type: NotificationType.OT_APPROVED,
                            link: '/payroll/overtime-requests',
                        }).catch(console.error);
                    }

                    // Notify HR/Timekeeping about the final approval
                    try {
                        const { data: hrUsersData } = await supabase
                            .from('hris_users')
                            .select('id')
                            .in('role', [Role.HRManager, Role.HRStaff, Role.Admin]);
                        
                        if (hrUsersData) {
                            hrUsersData.forEach(hr => {
                                createNotification({
                                    userId: hr.id,
                                    title: '✅ OT Request Approved (BOD Direct)',
                                    message: `${requestToUpdate.employeeName}'s OT request has been fully approved by their BOD manager and is ready for timekeeping.`,
                                    type: NotificationType.OT_APPROVED,
                                    link: '/payroll/overtime-requests',
                                }).catch(console.error);
                            });
                        }
                    } catch (e) {
                        console.error('Failed to notify HR of OT approval', e);
                    }
                } else {
                    // Step 2 → Reporting Manager approves: advance to PendingBOD
                    updated = await managerApproveOtRequest(requestToUpdate.id!, details);
                    updated.historyLog = [...(updated.historyLog || []), newHistoryEntry];
                    setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
                    logActivity(user, 'APPROVE', 'OTRequest', requestToUpdate.id!, `Manager approved OT for ${requestToUpdate.employeeName} — forwarded to BOD`);

                    // Notify BOD (configured approvers + role-based BOD users)
                    try {
                        const configs = await fetchApproverConfigs();
                        const configuredIds: string[] = configs.bodApprovers.user_ids || [];

                        const { data: roleBodUsers } = await supabase
                            .from('hris_users')
                            .select('id')
                            .eq('role', Role.BOD);
                        const roleIds: string[] = (roleBodUsers || []).map((u: any) => u.id);

                        const allBodIds = Array.from(new Set([...configuredIds, ...roleIds]));

                        allBodIds.forEach(bodId => {
                            createNotification({
                                userId: bodId,
                                title: '📋 OT Request Pending BOD Approval',
                                message: `${requestToUpdate.employeeName}'s OT request was approved by their Reporting Manager and requires your final approval.`,
                                type: NotificationType.OT_PENDING_BOD,
                                link: '/payroll/overtime-requests',
                            }).catch(console.error);
                        });
                    } catch (e) {
                        console.error('Failed to fetch BOD approvers for OT notification', e);
                    }

                    // Notify employee
                    if (requestToUpdate.employeeId) {
                        createNotification({
                            userId: requestToUpdate.employeeId,
                            title: '🔄 OT Request Forwarded to BOD',
                            message: `Your OT request has been approved by your Reporting Manager and is now pending BOD final approval.`,
                            type: NotificationType.OT_PENDING_BOD,
                            link: '/payroll/overtime-requests',
                        }).catch(console.error);
                    }
                }

            } else if (isPendingBOD && newStatus === OTStatus.Approved) {
                // Step 3 → BOD gives final approval
                updated = await bodApproveOtRequest(requestToUpdate.id!, details);
                updated.historyLog = [...(updated.historyLog || []), newHistoryEntry];
                setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
                logActivity(user, 'APPROVE', 'OTRequest', requestToUpdate.id!, `BOD gave final approval for ${requestToUpdate.employeeName}'s OT request`);

                if (requestToUpdate.employeeId) {
                    createNotification({
                        userId: requestToUpdate.employeeId,
                        title: '✅ OT Request Fully Approved',
                        message: `Your OT request has been fully approved by the BOD.`,
                        type: NotificationType.OT_APPROVED,
                        link: '/payroll/overtime-requests',
                    }).catch(console.error);
                }

                // Notify HR/Timekeeping about the final approval
                try {
                    const { data: hrUsersData } = await supabase
                        .from('hris_users')
                        .select('id')
                        .in('role', [Role.HRManager, Role.HRStaff, Role.Admin]);
                    
                    if (hrUsersData) {
                        hrUsersData.forEach(hr => {
                            createNotification({
                                userId: hr.id,
                                title: '✅ OT Request Approved (BOD)',
                                message: `${requestToUpdate.employeeName}'s OT request has been fully approved by the BOD and is ready for timekeeping.`,
                                type: NotificationType.OT_APPROVED,
                                link: '/payroll/overtime-requests',
                            }).catch(console.error);
                        });
                    }
                } catch (e) {
                    console.error('Failed to notify HR of OT approval', e);
                }

            } else {
                // Rejection at any stage
                updated = await approveRejectOtRequest(requestToUpdate.id!, newStatus, details);
                updated.historyLog = [...(updated.historyLog || []), newHistoryEntry];
                setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
                const actionType = newStatus === OTStatus.Approved ? 'APPROVE' : 'REJECT';
                logActivity(user, actionType, 'OTRequest', requestToUpdate.id!, `${action} OT request for ${requestToUpdate.employeeName}`);

                if (requestToUpdate.employeeId) {
                    const isApproved = newStatus === OTStatus.Approved;
                    createNotification({
                        userId: requestToUpdate.employeeId,
                        title: isApproved ? '✅ OT Request Approved' : '❌ OT Request Rejected',
                        message: isApproved
                            ? `Your OT request${details.approvedHours ? ` (${details.approvedHours.toFixed(2)} hrs)` : ''} has been approved by ${user.name}.`
                            : `Your OT request has been rejected by ${user.name}${details.managerNote ? `: "${details.managerNote}"` : '.'}`,
                        type: isApproved ? NotificationType.OT_APPROVED : NotificationType.OT_REJECTED,
                        link: '/payroll/overtime-requests',
                    }).catch(console.error);
                }
            }

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
                    templates={hrShiftTemplates}
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
                        onConvert={user?.role === Role.HRManager || user?.role === Role.HRStaff || user?.role === Role.Admin || user?.role === Role.GeneralManager ? handleConvertRequest : undefined}
                        canReviewRequest={(req) =>
                            reporteeIds.includes(req.employeeId) ||
                            otAccess.canActOn(req) ||
                            (isConfiguredBOD && req.status === OTStatus.PendingBOD)
                        }
                    />
                </Card>
            )}

            <OTRequestModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveRequest}
                onApproveOrReject={handleApprovalAction}
                requestToEdit={selectedRequest}
                canApproveOverride={!!selectedRequest && reporteeIds.includes(selectedRequest.employeeId)}
                attendanceRecords={hrAttendanceRecords}
                shiftAssignments={relevantShifts} // Pass shifts for context awareness
                shiftTemplates={hrShiftTemplates} // Pass templates for context awareness
            />
        </div>
    );
};

export default OvertimeRequests;

