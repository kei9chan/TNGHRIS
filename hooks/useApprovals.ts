import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { approveRejectOtRequest, gmApproveOtRequest, bodApproveOtRequest } from '../services/otService';
import { createNotification } from '../services/notificationService';
import { fetchApproverConfigs } from '../services/approverConfigService';
import { gmApproveLeaveRequest, bodApproveLeaveRequest } from '../services/leaveService';
import {
    LeaveRequest, LeaveRequestStatus,
    WFHRequest, WFHRequestStatus,
    OTRequest, OTStatus,
    ManpowerRequest, ManpowerRequestStatus,
    NotificationType,
    User, Role
} from '../types';
import { deptHeadApproveWfhRequest, gmApproveWfhRequest, bodApproveWfhRequest, rejectWfhRequest } from '../services/wfhService';

interface UseApprovalsOptions {
    user: User | null;
    isHR?: boolean;
    reporteeIds?: string[];
}

export function useApprovals({ user, isHR = false, reporteeIds = [] }: UseApprovalsOptions) {
    const [pendingLeaveApprovals, setPendingLeaveApprovals] = useState<LeaveRequest[]>([]);
    const [pendingWfhApprovals, setPendingWfhApprovals] = useState<WFHRequest[]>([]);
    const [pendingOtApprovals, setPendingOtApprovals] = useState<OTRequest[]>([]);
    const [pendingManpowerApprovals, setPendingManpowerApprovals] = useState<ManpowerRequest[]>([]);
    const [leaveTypes, setLeaveTypes] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        const loadLeaveTypes = async () => {
            const { data, error } = await supabase
                .from('leave_types')
                .select('id, name')
                .order('name');
            if (!error && data) {
                setLeaveTypes(data.map((row: any) => ({ id: row.id, name: row.name })));
            }
        };
        loadLeaveTypes();
    }, []);

    const fetchApprovals = useCallback(async () => {
        if (!user) {
            setPendingLeaveApprovals([]);
            setPendingWfhApprovals([]);
            setPendingOtApprovals([]);
            setPendingManpowerApprovals([]);
            return;
        }

        const normalizeLeaveStatus = (status: string | null | undefined): LeaveRequestStatus => {
            const key = (status || '').toString().trim().toLowerCase();
            switch (key) {
                case 'approved': return LeaveRequestStatus.Approved;
                case 'rejected': return LeaveRequestStatus.Rejected;
                case 'cancelled': case 'canceled': return LeaveRequestStatus.Cancelled;
                case 'draft': return LeaveRequestStatus.Draft;
                case 'pendinggm': return LeaveRequestStatus.PendingGM;
                case 'pendingbod': return LeaveRequestStatus.PendingBOD;
                default: return LeaveRequestStatus.Pending;
            }
        };

        // ---------------------------------------------------------------
        // Determine if this user is a configured GM or BOD approver
        // ---------------------------------------------------------------
        let isGM = user.role === Role.GeneralManager;
        const isBOD = user.role === Role.BOD;

        // Also check the dynamic approver config table
        try {
            const configs = await fetchApproverConfigs();
            if (configs.gmApprover.user_id === user.id) isGM = true;
            // BOD list from config — check if user is in it
            // (Note: role-based BOD already handled above)
        } catch { /* fallback to role-only check */ }

        let skipOt = false;
        let skipManpower = false;

        let leaveQuery = supabase
            .from('leave_requests')
            .select('id, employee_id, employee_name, leave_type_id, start_date, end_date, start_time, end_time, duration_days, reason, status, history_log, attachment_url, approver_id, business_unit_id, department_id');
        let wfhQuery = supabase
            .from('wfh_requests')
            .select('id, employee_id, employee_name, date, end_date, reason, status, report_link, approved_by, approved_at, rejection_reason, created_at');
        let otQuery = supabase
            .from('ot_requests')
            .select('id, employee_id, employee_name, date, start_time, end_time, reason, status, submitted_at, approved_hours, manager_note, history_log, attachment_url');
        let manpowerQuery = supabase
            .from('manpower_requests')
            .select('id, business_unit_id, business_unit_name, department_id, requester_id, requester_name, date_needed, forecasted_pax, general_note, items, grand_total, status, created_at, approved_by, approved_at, rejection_reason')
            .eq('status', ManpowerRequestStatus.Pending);

        if (isHR) {
            leaveQuery = leaveQuery.eq('status', 'pending').order('start_date', { ascending: false });
            wfhQuery = wfhQuery.eq('status', WFHRequestStatus.ForTimekeeping).order('created_at', { ascending: false });
            manpowerQuery = manpowerQuery.eq('status', ManpowerRequestStatus.Pending).order('created_at', { ascending: false });
            if (reporteeIds.length > 0) {
                otQuery = otQuery.in('employee_id', reporteeIds).eq('status', OTStatus.Submitted).order('submitted_at', { ascending: false });
            } else {
                skipOt = true;
            }
        } else if (isGM) {
            // GM sees PendingGM requests across the organization
            leaveQuery = leaveQuery.eq('status', LeaveRequestStatus.PendingGM).order('start_date', { ascending: false });
            wfhQuery = wfhQuery.eq('status', WFHRequestStatus.PendingGM).order('created_at', { ascending: false });
            otQuery = otQuery.eq('status', OTStatus.PendingGM).order('submitted_at', { ascending: false });
            // GM also sees manpower from their reportees
            if (reporteeIds.length > 0) {
                manpowerQuery = manpowerQuery.in('requester_id', reporteeIds);
            } else {
                skipManpower = true;
            }
        } else if (isBOD) {
            // BOD sees PendingBOD requests across the organization for final approval
            leaveQuery = leaveQuery.eq('status', LeaveRequestStatus.PendingBOD).order('start_date', { ascending: false });
            wfhQuery = wfhQuery.eq('status', WFHRequestStatus.PendingBOD).order('created_at', { ascending: false });
            otQuery = otQuery.eq('status', OTStatus.PendingBOD).order('submitted_at', { ascending: false });
            if (reporteeIds.length > 0) {
                manpowerQuery = manpowerQuery.in('requester_id', reporteeIds);
            } else {
                skipManpower = true;
            }
        } else {
            // Regular manager sees submitted requests from direct reports
            if (reporteeIds.length === 0) {
                setPendingLeaveApprovals([]);
                setPendingWfhApprovals([]);
                setPendingOtApprovals([]);
                setPendingManpowerApprovals([]);
                return;
            }
            leaveQuery = leaveQuery.in('employee_id', reporteeIds).eq('status', 'Pending');
            wfhQuery = wfhQuery.eq('status', WFHRequestStatus.PendingDeptHead).in('employee_id', reporteeIds);
            otQuery = otQuery.in('employee_id', reporteeIds).eq('status', OTStatus.Submitted);
            manpowerQuery = manpowerQuery.in('requester_id', reporteeIds);
        }

        const emptyResult = { data: [] as unknown[], error: null };
        const [leaveRes, wfhRes, otRes, manpowerRes] = await Promise.all([
            leaveQuery,
            wfhQuery,
            skipOt       ? Promise.resolve(emptyResult) : otQuery,
            skipManpower ? Promise.resolve(emptyResult) : manpowerQuery,
        ]);

        if (!leaveRes.error && leaveRes.data) {
            const mapped = leaveRes.data.map((row: any) => ({
                id: row.id,
                employeeId: row.employee_id,
                employeeName: row.employee_name,
                leaveTypeId: row.leave_type_id,
                startDate: new Date(row.start_date),
                endDate: new Date(row.end_date),
                startTime: row.start_time || undefined,
                endTime: row.end_time || undefined,
                durationDays: Number(row.duration_days),
                reason: row.reason,
                status: normalizeLeaveStatus(row.status),
                historyLog: row.history_log || [],
                attachmentUrl: row.attachment_url || undefined,
                approverId: row.approver_id || undefined,
                businessUnitId: row.business_unit_id || undefined,
                departmentId: row.department_id || undefined,
            }));
            // Include Pending (normal flow), PendingGM (for GM), PendingBOD (for BOD)
            setPendingLeaveApprovals(mapped.filter(r =>
                r.status === LeaveRequestStatus.Pending ||
                r.status === LeaveRequestStatus.PendingGM ||
                r.status === LeaveRequestStatus.PendingBOD
            ));
        } else {
            setPendingLeaveApprovals([]);
        }

        if (!wfhRes.error && wfhRes.data) {
            const mapped = wfhRes.data.map((row: any) => ({
                id: row.id,
                employeeId: row.employee_id,
                employeeName: row.employee_name,
                date: row.date ? new Date(row.date) : new Date(),
                endDate: row.end_date ? new Date(row.end_date) : undefined,
                reason: row.reason,
                status: row.status as WFHRequestStatus,
                reportLink: row.report_link || undefined,
                approvedBy: row.approved_by || undefined,
                approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
                rejectionReason: row.rejection_reason || undefined,
                createdAt: row.created_at ? new Date(row.created_at) : new Date(),
            }));
            setPendingWfhApprovals(mapped);
        } else {
            setPendingWfhApprovals([]);
        }

        if (!otRes.error && otRes.data) {
            setPendingOtApprovals(
                otRes.data.map((row: any) => ({
                    id: row.id,
                    employeeId: row.employee_id,
                    employeeName: row.employee_name,
                    date: row.date ? new Date(row.date) : new Date(),
                    startTime: row.start_time,
                    endTime: row.end_time,
                    reason: row.reason,
                    status: row.status as OTStatus,
                    submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
                    approvedHours: row.approved_hours ?? undefined,
                    managerNote: row.manager_note ?? undefined,
                    historyLog: row.history_log || [],
                    attachmentUrl: row.attachment_url ?? undefined,
                }))
            );
        } else {
            setPendingOtApprovals([]);
        }

        if (!manpowerRes.error && manpowerRes.data) {
            setPendingManpowerApprovals(
                manpowerRes.data.map((row: any) => ({
                    id: row.id,
                    businessUnitId: row.business_unit_id || '',
                    departmentId: row.department_id || undefined,
                    businessUnitName: row.business_unit_name || 'Unknown BU',
                    requestedBy: row.requester_id,
                    requesterName: row.requester_name,
                    date: row.date_needed ? new Date(row.date_needed) : new Date(),
                    forecastedPax: row.forecasted_pax || 0,
                    generalNote: row.general_note || '',
                    items: Array.isArray(row.items) ? row.items : (row.items ? JSON.parse(row.items) : []),
                    grandTotal: row.grand_total || 0,
                    status: row.status as ManpowerRequestStatus,
                    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
                    approvedBy: row.approved_by || undefined,
                    approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
                    rejectionReason: row.rejection_reason || undefined,
                }))
            );
        } else {
            setPendingManpowerApprovals([]);
        }
    }, [user, isHR, reporteeIds]);

    useEffect(() => {
        let active = true;
        const load = async () => {
            if (active) {
                await fetchApprovals();
            }
        };
        load();
        
        // Optional polling for approvals
        const interval = setInterval(() => {
            if (active) load();
        }, 30000); // 30 seconds

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [fetchApprovals]);

    // ===================================================================
    // Approval Handlers
    // ===================================================================

    const handleLeaveApproval = async (request: Partial<LeaveRequest>, approved: boolean, notes?: string) => {
        if (!user || !request.id) return;
        const historyEntry = {
            action: approved ? 'Approved' : 'Rejected',
            by: user.id,
            date: new Date().toISOString(),
            note: notes || 'Processed via Dashboard'
        };

        // Determine if this is a GM or BOD approval stage
        const isPendingGM = request.status === LeaveRequestStatus.PendingGM;
        const isPendingBOD = request.status === LeaveRequestStatus.PendingBOD;

        if (isPendingGM && approved) {
            // GM approves → advance to PendingBOD
            await gmApproveLeaveRequest(request.id, user.id);

            // Notify BOD users
            supabase.from('hris_users').select('id').eq('role', Role.BOD)
                .then(({ data: bodUsers }) => {
                    bodUsers?.forEach(bod => {
                        createNotification({
                            userId: bod.id,
                            title: '📋 Leave Request Pending BOD Approval',
                            message: `${request.employeeName}'s leave request has been approved by GM and requires your final approval.`,
                            type: NotificationType.LEAVE_PENDING_BOD,
                            link: '/payroll/leave-requests',
                        }).catch(e => console.error('Failed to send BOD leave notification', e));
                    });
                });

            // Notify requester
            if (request.employeeId) {
                createNotification({
                    userId: request.employeeId,
                    title: '🔄 Leave Request Forwarded to BOD',
                    message: `Your leave request has been approved by the GM and is now pending BOD approval.`,
                    type: NotificationType.LEAVE_PENDING_BOD,
                    link: '/payroll/leave-requests',
                }).catch(e => console.error('Failed to send leave GM forwarded notification', e));
            }

        } else if (isPendingBOD && approved) {
            // BOD gives final approval
            await bodApproveLeaveRequest(request.id, user.id);

            if (request.employeeId) {
                createNotification({
                    userId: request.employeeId,
                    title: '✅ Leave Request Approved',
                    message: `Your leave request has been fully approved by BOD.`,
                    type: NotificationType.LEAVE_APPROVED,
                    link: '/payroll/leave-requests',
                }).catch(e => console.error('Failed to send BOD leave approved notification', e));
            }

        } else {
            // Standard flow (regular employee → manager) or rejection at any stage
            const newStatus = approved ? LeaveRequestStatus.Approved : LeaveRequestStatus.Rejected;
            const { error } = await supabase
                .from('leave_requests')
                .update({
                    status: newStatus,
                    approver_id: user.id,
                    history_log: [...(request.historyLog || []), historyEntry],
                })
                .eq('id', request.id);
            if (error) { 
                alert(error.message || 'Failed to update leave request.'); 
                throw error; 
            }
        }

        setPendingLeaveApprovals(prev => prev.filter(r => r.id !== request.id));
    };

    const handleApproveWFH = async (requestId: string) => {
        if (!user) return;
        const request = pendingWfhApprovals.find(r => r.id === requestId);
        if (!request) return;
        
        try {
            if (request.status === WFHRequestStatus.PendingDeptHead) {
                await deptHeadApproveWfhRequest(requestId, user.id);

                // Notify the requester that their request moved forward
                if (request.employeeId) {
                    createNotification({
                        userId: request.employeeId,
                        title: '🔄 WFH Request Forwarded',
                        message: `Your WFH request for ${new Date(request.date).toLocaleDateString()} has been approved by your department head and is now pending BOD approval.`,
                        type: NotificationType.WFH_SUBMITTED,
                        link: '/payroll/wfh-requests',
                    }).catch(e => console.error('Failed to send dept head WFH forwarded notification', e));
                }

                // Notify all BOD users
                supabase
                    .from('hris_users')
                    .select('id')
                    .eq('role', Role.BOD)
                    .then(({ data: bodUsers }) => {
                        if (bodUsers) {
                            bodUsers.forEach(bod => {
                                createNotification({
                                    userId: bod.id,
                                    title: '📋 WFH Request Pending BOD Approval',
                                    message: `${request.employeeName}'s WFH request for ${new Date(request.date).toLocaleDateString()} has been approved by the department head and requires your final approval.`,
                                    type: NotificationType.WFH_SUBMITTED,
                                    link: '/payroll/wfh-requests',
                                }).catch(e => console.error('Failed to send BOD WFH notification', e));
                            });
                        }
                    });

            } else if (request.status === WFHRequestStatus.PendingGM) {
                // GM approves → advance to PendingBOD
                await gmApproveWfhRequest(requestId, user.id);

                // Notify the requester
                if (request.employeeId) {
                    createNotification({
                        userId: request.employeeId,
                        title: '🔄 WFH Request Forwarded to BOD',
                        message: `Your WFH request for ${new Date(request.date).toLocaleDateString()} has been approved by the GM and is now pending BOD approval.`,
                        type: NotificationType.WFH_PENDING_GM,
                        link: '/payroll/wfh-requests',
                    }).catch(e => console.error('Failed to send GM WFH forwarded notification', e));
                }

                // Notify all BOD users
                supabase
                    .from('hris_users')
                    .select('id')
                    .eq('role', Role.BOD)
                    .then(({ data: bodUsers }) => {
                        if (bodUsers) {
                            bodUsers.forEach(bod => {
                                createNotification({
                                    userId: bod.id,
                                    title: '📋 WFH Request Pending BOD Approval',
                                    message: `${request.employeeName}'s WFH request for ${new Date(request.date).toLocaleDateString()} has been approved by the GM and requires your final approval.`,
                                    type: NotificationType.WFH_SUBMITTED,
                                    link: '/payroll/wfh-requests',
                                }).catch(e => console.error('Failed to send BOD WFH notification', e));
                            });
                        }
                    });

            } else if (request.status === WFHRequestStatus.PendingBOD) {
                await bodApproveWfhRequest(requestId, user.id);

                // Notify the requester of final approval
                if (request.employeeId) {
                    createNotification({
                        userId: request.employeeId,
                        title: '✅ WFH Request Approved',
                        message: `Your WFH request for ${new Date(request.date).toLocaleDateString()} has been fully approved by BOD.`,
                        type: NotificationType.WFH_APPROVED,
                        link: '/payroll/wfh-requests',
                    }).catch(e => console.error('Failed to send BOD WFH approved notification', e));
                }
            } else {
                // Fallback for any other state if needed
                const { error } = await supabase
                    .from('wfh_requests')
                    .update({ status: WFHRequestStatus.ForTimekeeping, approved_by: user.id, approved_at: new Date().toISOString() })
                    .eq('id', requestId);
                if (error) throw error;
            }
            setPendingWfhApprovals(prev => prev.filter(r => r.id !== requestId));
        } catch (error: any) {
            alert(error.message || 'Failed to approve WFH request.');
            throw error;
        }
    };

    const handleRejectWFH = async (requestId: string, reason: string) => {
        if (!user) return;
        const request = pendingWfhApprovals.find(r => r.id === requestId);
        try {
            await rejectWfhRequest(requestId, user.id, reason);

            // Notify the requester of rejection
            if (request?.employeeId) {
                createNotification({
                    userId: request.employeeId,
                    title: '❌ WFH Request Rejected',
                    message: `Your WFH request for ${new Date(request.date).toLocaleDateString()} has been rejected by ${user.name}${reason ? `: "${reason}"` : '.'}`,
                    type: NotificationType.WFH_REJECTED,
                    link: '/payroll/wfh-requests',
                }).catch(e => console.error('Failed to send WFH rejection notification', e));
            }

            setPendingWfhApprovals(prev => prev.filter(r => r.id !== requestId));
        } catch (error: any) {
            alert(error.message || 'Failed to reject WFH request.');
            throw error;
        }
    };

    const handleApproveRejectOT = async (
        request: Partial<OTRequest>,
        newStatus: OTStatus.Approved | OTStatus.Rejected,
        details: { approvedHours?: number; managerNote?: string }
    ) => {
        if (!request.id) return;
        try {
            const isPendingGM = request.status === OTStatus.PendingGM;
            const isPendingBOD = request.status === OTStatus.PendingBOD;

            if (isPendingGM && newStatus === OTStatus.Approved) {
                // GM approves → advance to PendingBOD
                await gmApproveOtRequest(request.id, details);

                // Notify BOD users
                supabase.from('hris_users').select('id').eq('role', Role.BOD)
                    .then(({ data: bodUsers }) => {
                        bodUsers?.forEach(bod => {
                            createNotification({
                                userId: bod.id,
                                title: '📋 OT Request Pending BOD Approval',
                                message: `${request.employeeName}'s OT request has been approved by GM and requires your final approval.`,
                                type: NotificationType.OT_PENDING_BOD,
                                link: '/payroll/overtime',
                            }).catch(e => console.error('Failed to send BOD OT notification', e));
                        });
                    });

                if (request.employeeId) {
                    createNotification({
                        userId: request.employeeId,
                        title: '🔄 OT Request Forwarded to BOD',
                        message: `Your OT request has been approved by the GM and is now pending BOD approval.`,
                        type: NotificationType.OT_PENDING_BOD,
                        link: '/payroll/overtime',
                    }).catch(e => console.error('Failed to send OT GM forwarded notification', e));
                }
            } else if (isPendingBOD && newStatus === OTStatus.Approved) {
                // BOD gives final approval
                await bodApproveOtRequest(request.id, details);

                if (request.employeeId) {
                    createNotification({
                        userId: request.employeeId,
                        title: '✅ OT Request Approved',
                        message: `Your OT request has been fully approved by BOD.`,
                        type: NotificationType.OT_APPROVED,
                        link: '/payroll/overtime',
                    }).catch(e => console.error('Failed to send BOD OT approved notification', e));
                }
            } else {
                // Standard flow or rejection at any stage
                await approveRejectOtRequest(request.id, newStatus, details);
            }

            setPendingOtApprovals(prev => prev.filter(r => r.id !== request.id));
        } catch (error: any) {
            alert(error?.message || 'Failed to update OT request.');
            throw error;
        }
    };

    const handleApproveManpower = async (requestId: string) => {
        if (!user) return;
        const { error } = await supabase
            .from('manpower_requests')
            .update({ status: ManpowerRequestStatus.Approved, approved_by: user.id, approved_at: new Date().toISOString() })
            .eq('id', requestId);
        if (error) { 
            alert('Error approving request.'); 
            throw error; 
        }
        setPendingManpowerApprovals(prev => prev.filter(r => r.id !== requestId));
        alert('Manpower Request Approved.');
    };

    const handleRejectManpower = async (requestId: string, reason: string) => {
        if (!user) return;
        const { error } = await supabase
            .from('manpower_requests')
            .update({ status: ManpowerRequestStatus.Rejected, rejection_reason: reason })
            .eq('id', requestId);
        if (error) { 
            alert('Error rejecting request.'); 
            throw error; 
        }
        setPendingManpowerApprovals(prev => prev.filter(r => r.id !== requestId));
        alert('Manpower Request Rejected.');
    };

    return {
        pendingLeaveApprovals,
        pendingWfhApprovals,
        pendingOtApprovals,
        pendingManpowerApprovals,
        leaveTypes,
        handleLeaveApproval,
        handleApproveWFH,
        handleRejectWFH,
        handleApproveRejectOT,
        handleApproveManpower,
        handleRejectManpower,
        refreshApprovals: fetchApprovals
    };
}
