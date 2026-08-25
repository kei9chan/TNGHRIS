import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { createNotification } from '../services/notificationService';
import { processTimeRequestApproval, sendConditionalApprovalEmails } from '../services/approverConfigService';
import {
    LeaveRequest, LeaveRequestStatus,
    WFHRequest, WFHRequestStatus,
    OTRequest, OTStatus,
    ManpowerRequest, ManpowerRequestStatus,
    NotificationType,
    User, Role
} from '../types';
import { getTimeApprovalReason } from '../utils/approvalPresentation';

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
    const [approvalError, setApprovalError] = useState<string | null>(null);
    const [approvalsLoading, setApprovalsLoading] = useState(true);

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
            setApprovalError(null);
            setApprovalsLoading(false);
            return;
        }

        setApprovalsLoading(true);
        setApprovalError(null);

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

        // Leave/WFH/OT are scoped to direct reports plus explicit escalation
        // assignments. A broad BOD or HR role no longer creates a global queue.
        const assignedRoles = new Set([user.role, ...(user.roles || [])]);
        const isGlobalHrAuthority = assignedRoles.has(Role.BOD) || assignedRoles.has(Role.HRManager);
        const { data: assignmentRows, error: assignmentError } = await supabase
            .rpc('get_my_pending_time_approval_ids');
        if (assignmentError) {
            setApprovalError(`Conditional approval assignments could not be loaded. ${assignmentError.message}`);
        }
        const assignedIds = (kind: string) => (assignmentRows || [])
            .filter((row: any) => row.request_type === kind)
            .map((row: any) => row.request_id as string);
        const assignedLeaveIds = assignedIds('leave');
        const assignedWfhIds = assignedIds('wfh');
        const assignedOtIds = assignedIds('overtime');

        let skipLeave = false;
        let skipWfh = false;
        let skipOt = false;
        let skipManpower = false;

        let leaveQuery = supabase
            .from('leave_requests')
            .select('id, employee_id, employee_name, leave_type_id, start_date, end_date, start_time, end_time, duration_days, reason, status, history_log, attachment_url, approver_id, business_unit_id, department_id, approval_route, approval_reason, approval_context');
        let wfhQuery = supabase
            .from('wfh_requests')
            .select('id, employee_id, employee_name, date, end_date, reason, status, report_link, approved_by, approved_at, rejection_reason, created_at, approval_route, approval_reason, approval_context');
        let otQuery = supabase
            .from('ot_requests')
            .select('id, employee_id, employee_name, date, start_time, end_time, reason, status, submitted_at, approved_hours, manager_note, history_log, attachment_url, approval_route, approval_reason, approval_context');
        let manpowerQuery = supabase
            .from('manpower_requests')
            .select('id, business_unit_id, business_unit_name, department_id, requester_id, requester_name, date_needed, forecasted_pax, general_note, items, grand_total, status, created_at, approved_by, approved_at, rejection_reason')
            .eq('status', ManpowerRequestStatus.Pending);

        if (assignedLeaveIds.length) leaveQuery = leaveQuery.in('id', assignedLeaveIds);
        else skipLeave = true;

        if (assignedWfhIds.length) wfhQuery = wfhQuery.in('id', assignedWfhIds);
        else skipWfh = true;

        if (assignedOtIds.length) otQuery = otQuery.in('id', assignedOtIds);
        else skipOt = true;

        leaveQuery = leaveQuery.order('start_date', { ascending: false });
        wfhQuery = wfhQuery.order('created_at', { ascending: false });
        otQuery = otQuery.order('submitted_at', { ascending: false });

        if (isGlobalHrAuthority) {
            manpowerQuery = manpowerQuery.order('created_at', { ascending: false });
        } else if (reporteeIds.length) {
            manpowerQuery = manpowerQuery.in('requester_id', reporteeIds);
        } else skipManpower = true;

        const emptyResult = { data: [] as unknown[], error: null };
        const [leaveRes, wfhRes, otRes, manpowerRes] = await Promise.all([
            skipLeave    ? Promise.resolve(emptyResult) : leaveQuery,
            skipWfh      ? Promise.resolve(emptyResult) : wfhQuery,
            skipOt       ? Promise.resolve(emptyResult) : otQuery,
            skipManpower ? Promise.resolve(emptyResult) : manpowerQuery,
        ]);

        const queryFailures = [
            ['Leave', leaveRes.error],
            ['WFH', wfhRes.error],
            ['Overtime', otRes.error],
            ['Manpower', manpowerRes.error],
        ].filter(([, error]) => Boolean(error)) as Array<[string, { message?: string }]>;

        if (queryFailures.length) {
            const diagnostic = queryFailures
                .map(([workflow, error]) => `${workflow}: ${error.message || 'query failed'}`)
                .join(' | ');
            console.error('Pending approvals could not be loaded:', diagnostic);
            setApprovalError(`Pending approvals could not be loaded. ${diagnostic}`);
        }

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
                approvalRoute: row.approval_route || undefined,
                approvalReason: row.approval_reason || undefined,
                approvalContext: row.approval_context || undefined,
            }));
            // Include Pending (normal flow), PendingGM (for GM), PendingBOD (for BOD)
            setPendingLeaveApprovals(mapped.filter(r =>
                r.status === LeaveRequestStatus.Pending ||
                r.status === LeaveRequestStatus.PendingGM ||
                r.status === LeaveRequestStatus.PendingBOD
            ));
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
                approvalRoute: row.approval_route || undefined,
                approvalReason: row.approval_reason || undefined,
                approvalContext: row.approval_context || undefined,
            }));
            setPendingWfhApprovals(mapped);
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
                    approvalRoute: row.approval_route || undefined,
                    approvalReason: row.approval_reason || undefined,
                    approvalContext: row.approval_context || undefined,
                }))
            );
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
        }
        setApprovalsLoading(false);
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
        const result: any = await processTimeRequestApproval('leave', request.id, approved ? 'approve' : 'reject', notes);
        if (result?.notifyEscalation) sendConditionalApprovalEmails('leave', request.id).catch(error => console.error('Approval email failed', error));
        if (request.employeeId) createNotification({
            userId: request.employeeId,
            title: approved ? (result?.route === 'BOD_REQUIRED' ? '🔄 Leave Request Forwarded for Final Approval' : '✅ Leave Request Approved') : '❌ Leave Request Rejected',
            message: getTimeApprovalReason('leave', result?.context, result?.context?.reason, result?.route === 'BOD_REQUIRED') || `Your leave request was ${approved ? 'approved' : 'rejected'}.`,
            type: approved ? NotificationType.LEAVE_APPROVED : NotificationType.LEAVE_DECISION,
            link: `/approvals?type=leave&item=${request.id}`,
        }).catch(error => console.error('Leave notification failed', error));
        setPendingLeaveApprovals(prev => prev.filter(r => r.id !== request.id));
    };

    const handleApproveWFH = async (requestId: string) => {
        if (!user) return;
        const request = pendingWfhApprovals.find(r => r.id === requestId);
        if (!request) return;
        
        try {
            const result: any = await processTimeRequestApproval('wfh', requestId, 'approve');
            if (result?.notifyEscalation) sendConditionalApprovalEmails('wfh', requestId).catch(error => console.error('Approval email failed', error));
            if (request.employeeId) createNotification({
                userId: request.employeeId,
                title: result?.route === 'BOD_REQUIRED' ? '🔄 WFH Request Forwarded for Final Approval' : '✅ WFH Request Approved',
                message: getTimeApprovalReason('wfh', result?.context, result?.context?.reason, result?.route === 'BOD_REQUIRED') || 'Your WFH request was approved.',
                type: NotificationType.WFH_APPROVED,
                link: `/approvals?type=wfh&item=${requestId}`,
            }).catch(error => console.error('WFH notification failed', error));
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
            await processTimeRequestApproval('wfh', requestId, 'reject', reason);

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
            const result: any = await processTimeRequestApproval('overtime', request.id, newStatus === OTStatus.Approved ? 'approve' : 'reject', details.managerNote);
            if (result?.notifyEscalation) sendConditionalApprovalEmails('overtime', request.id).catch(error => console.error('Approval email failed', error));
            if (request.employeeId) createNotification({
                userId: request.employeeId,
                title: newStatus === OTStatus.Rejected ? '❌ OT Request Rejected' : (result?.route === 'BOD_REQUIRED' ? '🔄 OT Request Forwarded for Final Approval' : '✅ OT Request Approved'),
                message: getTimeApprovalReason('overtime', result?.context, result?.context?.reason, result?.route === 'BOD_REQUIRED') || `Your overtime request was ${newStatus === OTStatus.Approved ? 'approved' : 'rejected'}.`,
                type: newStatus === OTStatus.Approved ? NotificationType.OT_APPROVED : NotificationType.OT_REJECTED,
                link: `/approvals?type=overtime&item=${request.id}`,
            }).catch(error => console.error('OT notification failed', error));

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
        approvalError,
        approvalsLoading,
        handleLeaveApproval,
        handleApproveWFH,
        handleRejectWFH,
        handleApproveRejectOT,
        handleApproveManpower,
        handleRejectManpower,
        refreshApprovals: fetchApprovals
    };
}
