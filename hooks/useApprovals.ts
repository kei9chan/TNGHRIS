import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { approveRejectOtRequest } from '../services/otService';
import { createNotification } from '../services/notificationService';
import {
    LeaveRequest, LeaveRequestStatus,
    WFHRequest, WFHRequestStatus,
    OTRequest, OTStatus,
    ManpowerRequest, ManpowerRequestStatus,
    NotificationType,
    User, Role
} from '../types';
import { deptHeadApproveWfhRequest, bodApproveWfhRequest, rejectWfhRequest } from '../services/wfhService';

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
                default: return LeaveRequestStatus.Pending;
            }
        };

        // For OT, it's typically direct reportees only, even for HR (based on existing logic).
        // For others, if HR, fetch all pending. If Manager, fetch for reportees.
        // Let's match the existing logic:

        // Skip flags: when true we short-circuit and return [] instead of calling Supabase.
        // This avoids the `id=eq.invalid-id-to-return-none` hack that caused 400 errors
        // because Supabase validates UUID format on the id column.
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
            .select('id, employee_id, employee_name, date, start_time, end_time, reason, status, submitted_at, approved_hours, manager_note, history_log, attachment_url')
            .eq('status', OTStatus.Submitted);
        let manpowerQuery = supabase
            .from('manpower_requests')
            .select('id, business_unit_id, business_unit_name, department_id, requester_id, requester_name, date_needed, forecasted_pax, general_note, items, grand_total, status, created_at, approved_by, approved_at, rejection_reason')
            .eq('status', ManpowerRequestStatus.Pending);

        // BOD users have org-wide authority — they approve all PendingBOD WFH requests
        // regardless of direct-report relationships (managers skip Dept Head and go straight to BOD).
        const isBOD = user?.role === Role.BOD;

        if (isHR) {
            leaveQuery = leaveQuery.eq('status', 'pending').order('start_date', { ascending: false });
            wfhQuery = wfhQuery.eq('status', WFHRequestStatus.ForTimekeeping).order('created_at', { ascending: false });
            manpowerQuery = manpowerQuery.eq('status', ManpowerRequestStatus.Pending).order('created_at', { ascending: false });
            // For OT, the original HRDashboard only fetched reporteeIds OT.
            if (reporteeIds.length > 0) {
                otQuery = otQuery.in('employee_id', reporteeIds).order('submitted_at', { ascending: false });
            } else {
                skipOt = true; // No reportees — skip OT query entirely
            }
        } else if (isBOD) {
            // BOD sees all pending leaves and WFH requests org-wide for final approval.
            // They also see OT/manpower scoped to their reportees only (standard).
            leaveQuery = leaveQuery.eq('status', 'pending').order('start_date', { ascending: false });
            // BOD approves ALL PendingBOD WFH requests — no employee_id filter.
            wfhQuery = wfhQuery.eq('status', WFHRequestStatus.PendingBOD).order('created_at', { ascending: false });
            if (reporteeIds.length > 0) {
                otQuery = otQuery.in('employee_id', reporteeIds).order('submitted_at', { ascending: false });
                manpowerQuery = manpowerQuery.in('requester_id', reporteeIds);
            } else {
                skipOt = true;       // No reportees — skip OT query
                skipManpower = true; // No reportees — skip manpower query
            }
        } else {
            if (reporteeIds.length === 0) {
                setPendingLeaveApprovals([]);
                setPendingWfhApprovals([]);
                setPendingOtApprovals([]);
                setPendingManpowerApprovals([]);
                return;
            }
            leaveQuery = leaveQuery.in('employee_id', reporteeIds);
            // Dept Head approvers see PendingDeptHead requests from their direct reports.
            wfhQuery = wfhQuery.eq('status', WFHRequestStatus.PendingDeptHead).in('employee_id', reporteeIds);
            otQuery = otQuery.in('employee_id', reporteeIds);
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
            setPendingLeaveApprovals(mapped.filter(r => r.status === LeaveRequestStatus.Pending));
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

    // Approval Handlers
    const handleLeaveApproval = async (request: Partial<LeaveRequest>, approved: boolean, notes?: string) => {
        if (!user || !request.id) return;
        const historyEntry = {
            action: approved ? 'Approved' : 'Rejected',
            by: user.id,
            date: new Date().toISOString(),
            note: notes || 'Processed via Dashboard'
        };
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
            await approveRejectOtRequest(request.id, newStatus, details);
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
