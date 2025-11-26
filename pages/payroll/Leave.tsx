
import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { mockLeaveBalances, mockLeaveRequests, mockLeaveTypes, mockUsers, mockLeaveLedger, mockNotifications } from '../../services/mockData';
import { LeaveBalance, LeaveRequest, LeaveRequestStatus, Permission, User, LeaveLedgerEntry, Role, LeaveLedgerEntryType, NotificationType } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LeaveBalanceCard from '../../components/payroll/LeaveBalanceCard';
import LeaveRequestTable from '../../components/payroll/LeaveRequestTable';
import LeaveRequestModal from '../../components/payroll/LeaveRequestModal';
import { logActivity } from '../../services/auditService';
import LeaveLedgerTable from '../../components/payroll/LeaveLedgerTable';
import RejectReasonModal from '../../components/feedback/RejectReasonModal';
import Toast from '../../components/ui/Toast';
import LeaveCalendar from '../../components/payroll/LeaveCalendar';
import LeaveLedger from '../../components/payroll/LeaveLedger';
import ManualLeaveEntryModal from '../../components/payroll/ManualLeaveEntryModal';

type ActiveView = 'my_requests' | 'team_requests' | 'schedule' | 'ledger';

const Leave: React.FC = () => {
    const { user } = useAuth();
    const { can, hasDirectReports, getVisibleEmployeeIds } = usePermissions();
    
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(mockLeaveRequests);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);

    // Rejection Modal State
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [requestToReject, setRequestToReject] = useState<LeaveRequest | null>(null);
    
    // Manual Entry Modal State
    const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);

    const canApprove = can('Leave', Permission.Approve) || hasDirectReports();
    const canViewLedger = canApprove || can('Leave', Permission.Manage);
    const canManageLedger = can('Leave', Permission.Manage);
    
    const [activeView, setActiveView] = useState<ActiveView>(canApprove ? 'team_requests' : 'my_requests');
    
    const [toastInfo, setToastInfo] = useState<{ show: boolean, title: string, message: string, icon?: React.ReactNode }>({ show: false, title: '', message: '' });

    // Force update state to trigger re-renders when mock data changes
    const [updateTrigger, setUpdateTrigger] = useState(0);

    useEffect(() => {
        // Check for external updates to mockUsers (e.g. from Profile edits)
        const interval = setInterval(() => {
             setUpdateTrigger(prev => prev + 1);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    // Helper to sync User Profile Balance (Mock Data Sync)
    const syncUserProfileBalance = (employeeId: string, leaveTypeId: string, change: number) => {
        // Find index to update reference directly
        const userIndex = mockUsers.findIndex(u => u.id === employeeId);
        if (userIndex > -1) {
            const targetUser = mockUsers[userIndex];
            if (!targetUser.leaveInfo) {
                 targetUser.leaveInfo = { balances: { vacation: 0, sick: 0 }, accrualRate: 0 };
            }
            if (targetUser.leaveInfo.balances) {
                if (leaveTypeId === 'lt1') targetUser.leaveInfo.balances.vacation += change;
                else if (leaveTypeId === 'lt2') targetUser.leaveInfo.balances.sick += change;
            }
        }
    };
    
    // Helper function to calculate current balance from ledger
    const calculateBalance = (employeeId: string, leaveTypeId: string): number => {
        const entries = mockLeaveLedger.filter(l => l.employeeId === employeeId && l.leaveTypeId === leaveTypeId);
        return entries.reduce((sum, entry) => sum + entry.change, 0);
    };

    const myBalances = useMemo(() => {
        if (!user) return [];
        
        // Get the most up-to-date user object from the mock DB
        const liveUser = mockUsers.find(u => u.id === user.id) || user;
        
        return mockLeaveTypes.map(lt => {
            let profileBalance = 0;
            if (liveUser.leaveInfo?.balances) {
                if (lt.id === 'lt1') profileBalance = liveUser.leaveInfo.balances.vacation;
                else if (lt.id === 'lt2') profileBalance = liveUser.leaveInfo.balances.sick;
            }

             // Check Ledger (Dynamic history)
            const ledgerSum = calculateBalance(user.id, lt.id);
            const hasLedgerActivity = mockLeaveLedger.some(l => l.employeeId === user.id && l.leaveTypeId === lt.id);
            
            const available = hasLedgerActivity ? ledgerSum : profileBalance;

            return { 
                employeeId: user.id,
                leaveTypeId: lt.id,
                opening: 0,
                accrued: 0,
                used: 0,
                adjusted: 0,
                available: available, 
                name: lt.name 
            };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, updateTrigger]);

    const myRequests = useMemo(() => {
        if (!user) return [];
        return leaveRequests.filter(r => r.employeeId === user.id);
    }, [leaveRequests, user]);

    const teamRequests = useMemo(() => {
        if (!user) return [];
        return leaveRequests.filter(r => r.approverId === user.id && r.status === LeaveRequestStatus.Pending);
    }, [leaveRequests, user]);
    
    const myLedgerEntries = useMemo(() => {
        if (!user) return [];
        return mockLeaveLedger.filter(l => l.employeeId === user.id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, mockLeaveLedger, updateTrigger]);

    // --- Calendar & Ledger Data Logic ---
    const visibleRequests = useMemo(() => {
        if (!user) return [];
        const visibleIds = getVisibleEmployeeIds();
        
        // Admin/HR see everything
        if ([Role.Admin, Role.HRManager, Role.HRStaff].includes(user.role)) {
            return leaveRequests;
        }

        // Managers see their team + self
        if (canApprove) {
            return leaveRequests.filter(r => visibleIds.includes(r.employeeId));
        }
        
        // Regular employees see only their own
        return leaveRequests.filter(r => r.employeeId === user.id);
    }, [user, leaveRequests, canApprove, getVisibleEmployeeIds]);

    const calendarLeaves = useMemo(() => {
        return visibleRequests.filter(r => r.status === LeaveRequestStatus.Approved);
    }, [visibleRequests]);


    const handleOpenModal = (request: LeaveRequest | null) => {
        setSelectedRequest(request);
        setIsModalOpen(true);
    };

    const createLedgerEntry = (employeeId: string, leaveTypeId: string, type: LeaveLedgerEntryType, change: number, notes: string, date?: Date) => {
        // 0. If this is the first entry for this user/type, we might need to initialize from profile balance first
        const hasActivity = mockLeaveLedger.some(l => l.employeeId === employeeId && l.leaveTypeId === leaveTypeId);
        if (!hasActivity) {
             const targetUser = mockUsers.find(u => u.id === employeeId);
             let initialBalance = 0;
             if (targetUser && targetUser.leaveInfo?.balances) {
                if (leaveTypeId === 'lt1') initialBalance = targetUser.leaveInfo.balances.vacation;
                else if (leaveTypeId === 'lt2') initialBalance = targetUser.leaveInfo.balances.sick;
             }
             
             if (initialBalance > 0) {
                  mockLeaveLedger.unshift({
                    id: `led-init-${Date.now()}-${employeeId}`,
                    employeeId,
                    leaveTypeId,
                    date: new Date(new Date().getFullYear(), 0, 1), // Jan 1st
                    type: LeaveLedgerEntryType.Adjustment,
                    change: initialBalance,
                    balanceAfter: initialBalance,
                    notes: "System initialized from profile balance"
                 });
             }
        }

        // 1. Calculate balance after this change
        const currentBalance = calculateBalance(employeeId, leaveTypeId);
        const balanceAfter = currentBalance + change;

        const newEntry: LeaveLedgerEntry = {
            id: `led-${Date.now()}`,
            employeeId,
            leaveTypeId,
            date: date || new Date(),
            type,
            change,
            balanceAfter, 
            notes
        };
        mockLeaveLedger.unshift(newEntry);
        
        // 2. SYNC BACK TO USER PROFILE so Profile Page updates
        syncUserProfileBalance(employeeId, leaveTypeId, change);
        
        setUpdateTrigger(prev => prev + 1);
        return newEntry;
    };
    
    const handleManualEntrySave = (data: { employeeId: string; leaveTypeId: string; type: LeaveLedgerEntryType; change: number; date: Date; notes: string }) => {
        createLedgerEntry(data.employeeId, data.leaveTypeId, data.type, data.change, data.notes, data.date);
        if (user) {
             logActivity(user, 'UPDATE', 'LeaveLedger', 'Manual', `Manual ledger adjustment for employee ${data.employeeId}: ${data.change}`);
        }
        showToast('Adjustment Saved', 'The manual leave entry has been recorded.');
    };

    const showToast = (title: string, message: string) => {
        setToastInfo({ show: true, title, message });
        setTimeout(() => setToastInfo({ ...toastInfo, show: false }), 3000);
    };

    const handleSave = (requestToSave: Partial<LeaveRequest>, status: LeaveRequestStatus) => {
        if (!user) return;

        let finalStatus = status;
        let approverId = requestToSave.approverId;
        let details = `Request saved as ${status}.`;

        // Smart Submission Logic
        if (status === LeaveRequestStatus.Pending) {
            if (user.role === Role.BOD) {
                finalStatus = LeaveRequestStatus.Approved;
                details = "Auto-approved (Board Member).";
            } else {
                if (!user.managerId) {
                    alert("You do not have a reporting manager assigned. Please contact HR.");
                    return;
                }
                approverId = user.managerId;
                finalStatus = LeaveRequestStatus.Pending;
                details = "Submitted for approval.";
            }
        }
        
        const historyLog = {
            userId: user.id,
            userName: user.name,
            timestamp: new Date(),
            action: requestToSave.id ? 'Updated' : 'Created',
            details: details
        };

        let newRequest: LeaveRequest;

        if (requestToSave.id) {
            const updatedRequests = leaveRequests.map(r => r.id === requestToSave.id ? { ...r, ...requestToSave, status: finalStatus, approverId, historyLog: [...r.historyLog, historyLog] } as LeaveRequest : r);
            setLeaveRequests(updatedRequests);
            // Update mock
            const index = mockLeaveRequests.findIndex(r => r.id === requestToSave.id);
            if(index > -1) mockLeaveRequests[index] = updatedRequests.find(r => r.id === requestToSave.id)!;
            newRequest = updatedRequests.find(r => r.id === requestToSave.id)!;
            logActivity(user, 'UPDATE', 'LeaveRequest', newRequest.id, `Updated leave request to ${finalStatus}`);
        } else {
            newRequest = {
                id: `lr-${Date.now()}`,
                employeeId: user.id,
                employeeName: user.name,
                status: finalStatus,
                approverId, // Set the approver
                historyLog: [historyLog],
                approverChain: [], // Initialize empty chain
                ...requestToSave
            } as LeaveRequest;
            setLeaveRequests(prev => [newRequest, ...prev]);
            mockLeaveRequests.unshift(newRequest);
            logActivity(user, 'CREATE', 'LeaveRequest', newRequest.id, `Created new leave request`);
        }
            
        // If auto-approved for BOD, deduct from ledger immediately
        if (finalStatus === LeaveRequestStatus.Approved && requestToSave.leaveTypeId) {
                 const duration = requestToSave.durationDays || 1;
                 createLedgerEntry(user.id, requestToSave.leaveTypeId, LeaveLedgerEntryType.Usage, -duration, `Auto-approved leave request ${newRequest.id}`);
                 showToast('Leave Auto-Approved', 'Your leave request has been automatically approved and deducted from your balance.');
        } else if (finalStatus === LeaveRequestStatus.Pending && approverId) {
                 // Send Notification to Manager
                 mockNotifications.unshift({
                    id: `notif-leave-req-${Date.now()}`,
                    userId: approverId,
                    type: NotificationType.LEAVE_REQUEST,
                    title: 'New Leave Request',
                    message: `${user.name} has requested leave for ${new Date(newRequest.startDate).toLocaleDateString()}.`,
                    link: '/payroll/leave',
                    isRead: false,
                    createdAt: new Date(),
                    relatedEntityId: newRequest.id
                 });
                 showToast('Request Submitted', 'Your leave request has been submitted for approval.');
        }
        
        setIsModalOpen(false);
    };
    
    const handleApproval = (request: LeaveRequest, approved: boolean, notes: string) => {
        if (!user) return;
        const newStatus = approved ? LeaveRequestStatus.Approved : LeaveRequestStatus.Rejected;
        
        const historyLog = {
            userId: user.id,
            userName: user.name,
            timestamp: new Date(),
            action: approved ? 'Approved' : 'Rejected',
            details: notes ? `Manager notes: ${notes}` : undefined
        };

        const updatedRequests = leaveRequests.map(r => r.id === request.id ? { ...r, status: newStatus, historyLog: [...r.historyLog, historyLog] } : r);
        setLeaveRequests(updatedRequests);
        
        // Update mock source
        const reqIndex = mockLeaveRequests.findIndex(r => r.id === request.id);
        if (reqIndex > -1) mockLeaveRequests[reqIndex] = { ...mockLeaveRequests[reqIndex], status: newStatus, historyLog: [...mockLeaveRequests[reqIndex].historyLog, historyLog] };

        // Adjust balance in Ledger/Profile if approved
        if (approved) {
            const daysUsed = request.durationDays;
            createLedgerEntry(request.employeeId, request.leaveTypeId, LeaveLedgerEntryType.Usage, -daysUsed, `Approved request ${request.id}`);
            showToast('Request Approved', `Leave request for ${request.employeeName} has been approved.`);
        } else {
            showToast('Request Rejected', `Leave request for ${request.employeeName} has been rejected.`);
        }
        
        // Send Notification to Employee
        mockNotifications.unshift({
            id: `notif-leave-dec-${Date.now()}`,
            userId: request.employeeId,
            type: NotificationType.LEAVE_DECISION,
            title: `Leave Request ${approved ? 'Approved' : 'Rejected'}`,
            message: `Your leave request for ${new Date(request.startDate).toLocaleDateString()} has been ${approved ? 'approved' : 'rejected'}.`,
            link: '/payroll/leave',
            isRead: false,
            createdAt: new Date(),
            relatedEntityId: request.id
        });
        
        logActivity(user, approved ? 'APPROVE' : 'REJECT', 'LeaveRequest', request.id, `Leave for ${request.employeeName} ${approved ? 'approved' : 'rejected'}.`);
        setIsModalOpen(false);
    };

    // Quick Action Handlers
    const handleQuickApprove = (request: LeaveRequest) => {
        if(window.confirm(`Approve leave request for ${request.employeeName}?`)) {
            handleApproval(request, true, 'Quick approval from list');
        }
    };

    const handleQuickReject = (request: LeaveRequest) => {
        setRequestToReject(request);
        setIsRejectModalOpen(true);
    };

    const handleConfirmReject = (reason: string) => {
        if (requestToReject) {
            handleApproval(requestToReject, false, reason);
            setIsRejectModalOpen(false);
            setRequestToReject(null);
        }
    };

    const getTabClass = (viewName: ActiveView) => {
        return `px-3 py-2 font-medium text-sm rounded-md cursor-pointer transition-colors ${activeView === viewName ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`;
    };

    return (
        <div className="space-y-6">
             <Toast 
                show={toastInfo.show} 
                onClose={() => setToastInfo(prev => ({ ...prev, show: false }))} 
                title={toastInfo.title}
                message={toastInfo.message}
                icon={toastInfo.icon}
            />

             <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Leave Management</h1>
                <Button onClick={() => handleOpenModal(null)}>Request Leave</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myBalances.map(balance => (
                    <LeaveBalanceCard key={balance.leaveTypeId} balance={balance} />
                ))}
            </div>

            <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 p-1 bg-white dark:bg-slate-800 rounded-lg shadow-sm w-fit">
                <button className={getTabClass('my_requests')} onClick={() => setActiveView('my_requests')}>My Requests</button>
                {canApprove && <button className={getTabClass('team_requests')} onClick={() => setActiveView('team_requests')}>Team Requests ({teamRequests.length})</button>}
                <button className={getTabClass('schedule')} onClick={() => setActiveView('schedule')}>Schedule & Calendar</button>
                {canViewLedger && <button className={getTabClass('ledger')} onClick={() => setActiveView('ledger')}>Ledger & Reports</button>}
            </div>

            {activeView === 'my_requests' && (
                <div className="space-y-6">
                    <Card>
                        <div className="p-2">
                            <LeaveRequestTable 
                                requests={myRequests}
                                onSelectRequest={handleOpenModal}
                                isManagerView={false}
                            />
                        </div>
                    </Card>
                    <Card title="Balance Ledger">
                        <LeaveLedgerTable ledgerEntries={myLedgerEntries} />
                    </Card>
                </div>
            )}

            {activeView === 'team_requests' && (
                 <Card>
                    <div className="p-2">
                        <LeaveRequestTable 
                            requests={teamRequests}
                            onSelectRequest={handleOpenModal}
                            isManagerView={true}
                            onApprove={handleQuickApprove}
                            onReject={handleQuickReject}
                        />
                    </div>
                </Card>
            )}

            {activeView === 'schedule' && user && (
                <div className="space-y-4">
                    <LeaveCalendar 
                        leaves={calendarLeaves} 
                        currentUser={user} 
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                        {canApprove ? "Showing approved leaves for you and your team." : "Showing your approved leaves."}
                    </p>
                </div>
            )}
            
            {activeView === 'ledger' && canViewLedger && (
                <div className="space-y-6">
                     {canManageLedger && (
                         <div className="flex justify-end">
                            <Button variant="secondary" onClick={() => setIsManualEntryOpen(true)}>
                                + Manual Adjustment / Migration
                            </Button>
                        </div>
                     )}
                     <LeaveLedger requests={visibleRequests} />
                </div>
            )}

            <LeaveRequestModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                request={selectedRequest}
                balances={myBalances}
                onSave={handleSave}
                onApprove={handleApproval}
            />

            <RejectReasonModal
                isOpen={isRejectModalOpen}
                onClose={() => setIsRejectModalOpen(false)}
                onSubmit={handleConfirmReject}
                title="Reject Leave Request"
                prompt="Please provide a reason for rejecting this leave request."
                submitText="Reject Request"
            />
            
            <ManualLeaveEntryModal 
                isOpen={isManualEntryOpen}
                onClose={() => setIsManualEntryOpen(false)}
                onSave={handleManualEntrySave}
            />

        </div>
    );
};

export default Leave;
