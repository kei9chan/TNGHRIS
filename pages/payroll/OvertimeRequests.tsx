import OvertimeWeekReview from '../../components/overtime/OvertimeWeekReview';
import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { OTRequest, OTStatus, OTRequestHistory, Permission } from '../../types';
import { NotificationType } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useSettings } from '../../context/SettingsContext';
import { useUsers, useBusinessUnits, useShiftTemplates, useAttendanceRecords, useShiftAssignments } from '../../hooks/useHRData';
import Modal from '../../components/ui/Modal';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import OTRequestTable from '../../components/payroll/OTRequestTable';
import OTRequestModal from '../../components/payroll/OTRequestModal';
import OTStats from '../../components/payroll/OTStats';
import OTCalendar from '../../components/payroll/OTCalendar';
import OTLedger from '../../components/payroll/OTLedger';
import EditableDescription from '../../components/ui/EditableDescription';
import { logActivity } from '../../services/auditService';
import { fetchOtRequestById, fetchOtRequests, saveOtRequest, deleteOtRequest, withdrawOtRequest, verifyAndConvertOT } from '../../services/otService';
import { createNotification } from '../../services/notificationService';
import { processTimeRequestApproval, sendConditionalApprovalEmails } from '../../services/approverConfigService';
import { supabase } from '../../services/supabaseClient';
import { getApprovalRequestId } from '../../services/approvalDeepLinks';
import { hasPendingTimeApprovalAssignment } from '../../services/timeApprovalAssignmentService';
import { getApprovalStatusLabel, getOvertimeWeekDetails, getTimeApprovalReason } from '../../utils/approvalPresentation';

type Tab = 'all_requests' | 'my_ot' | 'team_approvals' | 'hr_verification' | 'calendar' | 'ledger';

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
    const { getAccessibleBusinessUnits, getOtAccess, can: canModule } = usePermissions();
    const { approverConfigs } = useSettings();
    const location = useLocation();
    const navigate = useNavigate();
    
    const [reportScope,setReportScope]=useState<{overview:boolean;global:boolean;businessUnits:{id:string;name:string}[]}>({overview:false,global:false,businessUnits:[]});
    const [loadingRequests,setLoadingRequests]=useState(true);
    const [loadError,setLoadError]=useState('');
    const [reload,setReload]=useState(0);
    const [viewRequest,setViewRequest]=useState<OTRequest|null>(null);
    const [search,setSearch]=useState('');
    const [requests, setRequests] = useState<OTRequest[]>([]);
    const [reporteeIds, setReporteeIds] = useState<string[]>([]);
    const [reporteeIdsLoaded, setReporteeIdsLoaded] = useState(false);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<OTRequest | null>(null);
    const [showSuccessToast, setShowSuccessToast] = useState(false);
    const [openedReviewId, setOpenedReviewId] = useState<string | null>(null);
    const [reviewLoadError, setReviewLoadError] = useState('');
    const [reviewPage,setReviewPage]=useState(0);

    const { users: hrUsers } = useUsers();
    const { businessUnits: hrBusinessUnits } = useBusinessUnits();
    const { shiftTemplates: hrShiftTemplates } = useShiftTemplates();
    const { attendanceRecords: hrAttendanceRecords } = useAttendanceRecords();
    const { shiftAssignments: hrShiftAssignments } = useShiftAssignments();

    // Only the explicitly configured conditional approver group receives BOD-stage OT.
    const isConfiguredBOD = useMemo(() => {
        if (!user) return false;
        const bodIds: string[] = approverConfigs.conditionalTimeApprovals.user_ids || [];
        return bodIds.includes(user.id);
    }, [user, approverConfigs]);

    const otAccess = getOtAccess();
    const canCreate = otAccess.canRequest;
    const canManage = canModule('OT', Permission.Manage);
    // Configured BOD approvers can also approve
    const isBuManager=[user?.role,...(user?.roles||[])].includes('Business Unit Manager' as any);
    const canApprove = otAccess.canApprove || reporteeIds.length > 0 || isBuManager || isConfiguredBOD;
    const canViewLedger = reportScope.overview || canApprove;
    
    useEffect(() => {
        let active=true;
        setLoadingRequests(true);setLoadError('');
        Promise.all([fetchOtRequests(),supabase.rpc('get_ot_reporting_scope')]).then(([data,scope])=>{
            if(!active)return;if(scope.error)throw scope.error;
            setRequests(data);setReportScope(scope.data);
            if(!scope.data.overview)setActiveTab('my_ot');
        }).catch(error=>{if(active)setLoadError(error.message||'Unable to load overtime requests.');})
        .finally(()=>{if(active)setLoadingRequests(false);});
        return()=>{active=false;};
    }, [user?.id,reload]);
    useEffect(()=>{const refresh=()=>setReload(x=>x+1);window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);

    useEffect(() => {
        const loadReportees = async () => {
            if (!user?.id) {
                setReporteeIds([]);
                setReporteeIdsLoaded(false);
                return;
            }
            const { data, error } = await supabase
                .from('hris_users')
                .select('id')
                .eq('reports_to', user.id);
            if (error || !data) {
                setReporteeIds([]);
                setReporteeIdsLoaded(true);
                return;
            }
            setReporteeIds(data.map((row: any) => row.id).filter(Boolean));
            setReporteeIdsLoaded(true);
        };
        loadReportees();
    }, [user?.id]);
    
    // Dashboard State
    const [activeTab, setActiveTab] = useState<Tab>('all_requests');
    const [viewFilter, setViewFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
    
    // BU Filter State (for privileged roles)
    const [selectedBuFilter, setSelectedBuFilter] = useState<string>('all');
    
    const accessibleBus = reportScope.businessUnits;
    const scopedRequests = requests; // Server RLS is the authority for viewing records.

    useEffect(() => {
         // Default to first accessible BU if limited scope and not "all"
        if (accessibleBus.length === 1) {
            setSelectedBuFilter(accessibleBus[0].id);
        }
    }, [accessibleBus]);

    // Handle Quick Link state — also auto-switch to Team Approvals for BOD notification links
    useEffect(() => {
        if (location.state?.openNewOTModal) {
            const seed=location.state.attendanceOt;
            setSelectedRequest(seed&&user?{employeeId:user.id,employeeName:user.name,date:new Date(seed.date+'T12:00:00+08:00'),startTime:seed.startTime,endTime:seed.endTime,reason:'',otType:'Paid',paidOtType:'Regular Overtime',status:OTStatus.Draft,historyLog:[]} as OTRequest:null);
            setIsModalOpen(true);
            navigate(location.pathname, { replace: true, state: {} });
        }
        const searchParams = new URLSearchParams(location.search);
        const tab = searchParams.get('tab');
        if (tab === 'hr_verification') {
            setActiveTab('hr_verification');
        }
    }, [location.state, navigate, location.search]);

    const isPrivilegedViewer = reportScope.overview;
    const buFilteredRequests = useMemo(() => selectedBuFilter==='all'?scopedRequests:scopedRequests.filter(r=>r.businessUnitId===selectedBuFilter),[scopedRequests,selectedBuFilter]);


    // 1. "My OT" Data
    const myRequests = useMemo(() => {
        if (!user) return [];
        return scopedRequests.filter(r => r.employeeId === user.id);
    }, [scopedRequests, user]);

    // 2. "Team Approvals" Data
    const teamRequests = useMemo(() => {
        if (!user || !canApprove) return [];

        let visibleRequests: OTRequest[] = [];

        // Direct managers act only on the manager stage.
        if (reporteeIds.length > 0) {
            const reporteeRequests = requests.filter(r =>
                reporteeIds.includes(r.employeeId) && r.status === OTStatus.Submitted
            );
            visibleRequests = [...visibleRequests, ...reporteeRequests];
        }
        if (isBuManager) {
            visibleRequests.push(...requests.filter(r=>reportScope.businessUnits.some(b=>b.id===r.businessUnitId)&&r.employeeId!==user.id&&([OTStatus.Submitted,OTStatus.PendingGM].includes(r.status)||(r.status===OTStatus.Approved&&r.approvedHours==null))));
        }

        // Configured BOD approvers see ALL PendingBOD requests org-wide
        if (isConfiguredBOD) {
            const bodRequests = requests.filter(r => r.status === OTStatus.PendingBOD);
            visibleRequests = [...visibleRequests, ...bodRequests];
        }

        // Deduplicate in case a request is both from a direct report and PendingBOD
        const uniqueRequests = Array.from(new Map(visibleRequests.map(r => [r.id, r])).values());
        return uniqueRequests;
    }, [requests, reporteeIds, user, canApprove, isConfiguredBOD,isBuManager,reportScope.businessUnits]);

    // A Review link loads the exact record independently of My OT/team list filters.
    useEffect(() => {
        const reviewId = getApprovalRequestId(location.search);
        if (!reviewId || !user?.id || !reporteeIdsLoaded || reviewId === openedReviewId) return;

        let cancelled = false;
        setReviewLoadError('');
        fetchOtRequestById(reviewId)
            .then(async request => {
                if (cancelled) return;
                if (!request) throw new Error('This overtime request is no longer available or is not assigned to you.');
                let canReview = reporteeIds.includes(request.employeeId)
                    || otAccess.canActOn(request)
                    || (isConfiguredBOD && request.status === OTStatus.PendingBOD);
                if (!canReview && request.employeeId !== user.id) {
                    canReview = await hasPendingTimeApprovalAssignment('overtime', reviewId, user.id);
                }
                if (request.employeeId !== user.id && !canReview) {
                    throw new Error('This overtime request is not assigned to you for review.');
                }
                if (cancelled) return;
                setRequests(previous => [request, ...previous.filter(candidate => candidate.id !== request.id)]);
                setActiveTab(request.employeeId === user.id ? 'my_ot' : 'team_approvals');
                setSelectedRequest(request);
                setIsModalOpen(request.employeeId === user.id);
                setOpenedReviewId(reviewId);
            })
            .catch((error: any) => {
                if (cancelled) return;
                setOpenedReviewId(reviewId);
                setReviewLoadError(error?.message || 'The assigned overtime request could not be loaded.');
            });

        return () => {
            cancelled = true;
        };
    // otAccess is recreated by the permission helper; the stable auth/scope inputs below
    // are sufficient and avoid cancelling the exact-record query on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search, user?.id, reporteeIdsLoaded, reporteeIds, isConfiguredBOD]);

    // 3. Calendar Data Source
    const calendarRequests = useMemo(() => {
        if (isPrivilegedViewer) return buFilteredRequests;
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

    // 5b. Data for HR Verification
    const hrVerificationRequests = useMemo(() => {
        if (!user || (!canViewLedger && !isConfiguredBOD)) return [];
        const baseRequests = isPrivilegedViewer ? buFilteredRequests : scopedRequests;
        return baseRequests.filter(r => 
            r.status === OTStatus.Approved && 
            r.otType === 'Offset' && 
            !r.isConverted
        );
    }, [scopedRequests, buFilteredRequests, isPrivilegedViewer, user, canViewLedger, isConfiguredBOD]);


    // 6. Shift Data for Context
    // Passed to calendar and modal for context-aware features (e.g., auto-fill shift end time)
    const relevantShifts = useMemo(() => {
         if (!user) return [];
         return hrShiftAssignments;
    }, [user, hrShiftAssignments]);

    // 7. Filtered Display Data based on Active Tab & Sub-filter (For Table View)
    const displayedTableRequests = useMemo(() => {
        let data = myRequests;
        if (activeTab === 'all_requests') data = buFilteredRequests;
        if (activeTab === 'team_approvals') data = teamRequests;
        if (activeTab === 'hr_verification') data = hrVerificationRequests;

        if ((activeTab === 'my_ot' || activeTab === 'all_requests') && viewFilter !== 'all') {
            if (viewFilter === 'pending') data = data.filter(r =>
                r.status === OTStatus.Submitted ||
                r.status === OTStatus.Draft ||
                r.status === OTStatus.PendingBOD
            );
            if (viewFilter === 'approved') data = data.filter(r => r.status === OTStatus.Approved);
            if (viewFilter === 'rejected') data = data.filter(r => r.status === OTStatus.Rejected);
        }
        
        const params=new URLSearchParams(location.search);
        const employee=params.get('employee');
        const workDate=params.get('date');
        if(employee)data=data.filter(r=>r.employeeId===employee);
        if(workDate)data=data.filter(r=>r.date.toISOString().slice(0,10)===workDate);
        data=data.filter(r=>`${r.employeeName} ${r.reason}`.toLowerCase().includes(search.toLowerCase()));
        return [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [activeTab, viewFilter, myRequests, teamRequests, hrVerificationRequests,buFilteredRequests,search,location.search]);
    useEffect(()=>setReviewPage(0),[activeTab,viewFilter,selectedBuFilter,search,location.search]);
    const reviewStart=reviewPage*12;
    const reviewIds=displayedTableRequests.slice(reviewStart,reviewStart+12).map(r=>r.id);


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
            const saved = await saveOtRequest(updatedRequestData, status, user, false);
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
                    const week = getOvertimeWeekDetails(saved.approvalContext);
                    const thresholdReason = getTimeApprovalReason('overtime', saved.approvalContext, saved.approvalReason, saved.approvalRoute === 'BOD_REQUIRED');
                    createNotification({
                        userId: user.managerId,
                        title: '📋 OT Request Pending Approval',
                        message: `${user.name} submitted an overtime request. Status: ${getApprovalStatusLabel(saved.status)}.${week.range ? ` Week covered: ${week.range}.` : ''}${thresholdReason ? ` ${thresholdReason}` : ''}`,
                        type: NotificationType.OT_SUBMITTED,
                        link: `/approvals?type=overtime&item=${saved.id}`,
                    }).catch(e => console.error('Failed to send OT submission notification', e));
                    sendConditionalApprovalEmails('overtime', saved.id).catch(error => console.error('Manager approval email failed', error));
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
        if (!otAccess.canActOn(requestToUpdate as OTRequest) && !canReview && !isConfiguredBOD) {
            alert('You do not have permission to act on this request.');
            return;
        }

        const action = newStatus === OTStatus.Approved ? 'Approved' : 'Rejected';
        const detailText = `${action}${details.approvedHours ? ` ${details.approvedHours.toFixed(2)} hours.` : '.'} Note: ${details.managerNote || 'N/A'}`;

        try {
            const result: any = await processTimeRequestApproval('overtime', requestToUpdate.id!, newStatus === OTStatus.Approved ? 'approve' : 'reject', details.managerNote, details.approvedHours);
            if (result?.notifyEscalation) sendConditionalApprovalEmails('overtime', requestToUpdate.id!).catch(console.error);
            logActivity(user, newStatus === OTStatus.Approved ? 'APPROVE' : 'REJECT', 'OTRequest', requestToUpdate.id!, `${detailText} ${result?.context?.reason || ''}`);
            if (requestToUpdate.employeeId) createNotification({
                userId: requestToUpdate.employeeId,
                title: newStatus === OTStatus.Rejected ? '❌ OT Request Rejected' : (result?.route === 'BOD_REQUIRED' ? '🔄 OT Request Forwarded for Final Approval' : '✅ OT Request Approved'),
                message: getTimeApprovalReason('overtime', result?.context, result?.context?.reason, result?.route === 'BOD_REQUIRED') || detailText,
                type: newStatus === OTStatus.Approved ? NotificationType.OT_APPROVED : NotificationType.OT_REJECTED,
                link: `/approvals?type=overtime&item=${requestToUpdate.id}`,
            }).catch(console.error);
            const refreshed = await fetchOtRequests();
            setRequests(refreshed);

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
            {loadError&&<div role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">Overtime requests could not be loaded: {loadError} <Button onClick={()=>setReload(x=>x+1)}>Retry</Button></div>}
            {loadingRequests&&<p role="status">Loading overtime requests…</p>}
            <SuccessToast show={showSuccessToast} message="Submitted successfully." onClose={() => setShowSuccessToast(false)} />
            {reviewLoadError && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                    <strong>Unable to open overtime review.</strong> {reviewLoadError}
                </div>
            )}

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
                            <option value="all">{reportScope.global?"All Business Units":"All assigned business units"}</option>
                            {accessibleBus.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    )}
                    {canCreate && <Button onClick={handleNewRequest}>+ New OT Request</Button>}
                </div>
            </div>
            
            <EditableDescription descriptionKey="payrollOvertimeDesc" className="mb-4"/>
            
            {/* Dashboard Stats - Data source depends on role and filter */}
            <OTStats requests={statsData} />
            <div className="flex flex-wrap items-center gap-3"><label>Find employee or reason<input className="ml-3 rounded border p-2" value={search} onChange={e=>setSearch(e.target.value)}/></label><Button variant="secondary" onClick={()=>setReload(x=>x+1)}>Refresh requests</Button><span>{buFilteredRequests.length} accessible requests</span></div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 p-1 bg-white dark:bg-slate-800 rounded-lg shadow-sm w-fit">
                {reportScope.overview&&<button className={getTabClass('all_requests')} onClick={()=>setActiveTab('all_requests')}>All requests</button>}
                <button className={getTabClass('my_ot')} onClick={() => setActiveTab('my_ot')}>
                    My OT
                </button>
                {canApprove && (
                    <button className={getTabClass('team_approvals')} onClick={() => setActiveTab('team_approvals')}>
                        Team Approvals 
                        {teamRequests.length > 0 && <span className="ml-2 bg-red-100 text-red-800 text-xs font-semibold px-2 py-0.5 rounded-full">{teamRequests.length}</span>}
                    </button>
                )}
                {(canViewLedger || isConfiguredBOD) && (
                    <button className={getTabClass('hr_verification')} onClick={() => setActiveTab('hr_verification')}>
                        Pending Conversion
                        {hrVerificationRequests.length > 0 && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                                {hrVerificationRequests.length}
                            </span>
                        )}
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
            {(activeTab === 'all_requests' || activeTab === 'my_ot' || activeTab === 'hr_verification') && (
                <Card>
                    <div className="flex space-x-4 p-1">
                        <button onClick={() => setViewFilter('all')} className={`text-sm font-medium ${viewFilter === 'all' ? 'text-indigo-600 underline' : 'text-gray-500'}`}>All</button>
                        <button onClick={() => setViewFilter('pending')} className={`text-sm font-medium ${viewFilter === 'pending' ? 'text-indigo-600 underline' : 'text-gray-500'}`}>Pending</button>
                        <button onClick={() => setViewFilter('approved')} className={`text-sm font-medium ${viewFilter === 'approved' ? 'text-indigo-600 underline' : 'text-gray-500'}`}>Approved</button>
                        <button onClick={() => setViewFilter('rejected')} className={`text-sm font-medium ${viewFilter === 'rejected' ? 'text-indigo-600 underline' : 'text-gray-500'}`}>Rejected</button>
                    </div>
                </Card>
            )}

            {activeTab === 'team_approvals' || activeTab === 'all_requests' ? <><div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800"><span>Reviewing requests {displayedTableRequests.length?reviewStart+1:0}–{Math.min(reviewStart+12,displayedTableRequests.length)} of {displayedTableRequests.length}</span><button className="rounded border px-3 py-2 disabled:opacity-40" disabled={!reviewPage} onClick={()=>setReviewPage(p=>p-1)}>Previous</button><button className="rounded border px-3 py-2 disabled:opacity-40" disabled={reviewStart+12>=displayedTableRequests.length} onClick={()=>setReviewPage(p=>p+1)}>Next</button></div><OvertimeWeekReview initialRequestId={openedReviewId||undefined} requestIds={reviewIds} onChanged={()=>setReload(n=>n+1)}/></> : activeTab === 'calendar' ? (
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
                        onView={setViewRequest}
                        onDelete={handleDeleteRequest}
                        onWithdraw={handleWithdrawRequest}
                        onConvert={canManage || canModule('OT', Permission.Finalize) ? handleConvertRequest : undefined}
                        canReviewRequest={(req) =>
                            reporteeIds.includes(req.employeeId) ||
                            otAccess.canActOn(req) ||
                            (isConfiguredBOD && req.status === OTStatus.PendingBOD)
                        }
                    />
                </Card>
            )}

            <Modal isOpen={!!viewRequest} onClose={()=>setViewRequest(null)} title="Overtime request details">
                {viewRequest&&<div className="space-y-4"><h2 className="text-xl font-bold">{viewRequest.employeeName}</h2><p>{new Date(viewRequest.date).toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Manila'})} · {viewRequest.startTime}–{viewRequest.endTime}</p><p>{accessibleBus.find(b=>b.id===viewRequest.businessUnitId)?.name||'Business unit not recorded'} · {viewRequest.status}</p><p>Requested: {viewRequest.requestedHours??'Not recorded'} hours · Approved: {viewRequest.approvedHours??'Not approved'} hours</p><div className="rounded-xl bg-violet-50 p-4 text-slate-900"><b>Reason</b><p className="whitespace-pre-wrap">{viewRequest.reason}</p></div><p>Manager note: {viewRequest.managerNote||'None'}</p><details><summary>Request history</summary><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(viewRequest.historyLog,null,2)}</pre></details></div>}
            </Modal>
            <OTRequestModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveRequest}
                onApproveOrReject={handleApprovalAction}
                requestToEdit={selectedRequest}
                canApproveOverride={!!selectedRequest && (
                    reporteeIds.includes(selectedRequest.employeeId)
                    || (isConfiguredBOD && selectedRequest.status === OTStatus.PendingBOD)
                )}
                attendanceRecords={hrAttendanceRecords}
                shiftAssignments={relevantShifts} // Pass shifts for context awareness
                shiftTemplates={hrShiftTemplates} // Pass templates for context awareness
            />
        </div>
    );
};

export default OvertimeRequests;
