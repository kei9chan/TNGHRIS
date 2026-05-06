import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { approveRejectOtRequest } from '../services/otService';
import {
    LeaveRequest, LeaveRequestStatus,
    WFHRequest, WFHRequestStatus,
    OTRequest, OTStatus,
    ManpowerRequest, ManpowerRequestStatus,
    User
} from '../types';

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
        
        let leaveQuery = supabase.from('leave_requests').select('id, employee_id, employee_name, leave_type_id, start_date, end_date, start_time, end_time, duration_days, reason, status, history_log, attachment_url, approver_id, business_unit_id, department_id');
        let wfhQuery = supabase.from('wfh_requests').select('id, employee_id, employee_name, date, reason, status, report_link, approved_by, approved_at, rejection_reason, created_at');
        let otQuery = supabase.from('ot_requests').select('id, employee_id, employee_name, date, start_time, end_time, reason, status, submitted_at, approved_hours, manager_note, history_log, attachment_url').eq('status', OTStatus.Submitted);
        let manpowerQuery = supabase.from('manpower_requests').select('id, business_unit_id, business_unit_name, department_id, requester_id, requester_name, date_needed, forecasted_pax, general_note, items, grand_total, status, created_at, approved_by, approved_at, rejection_reason').eq('status', ManpowerRequestStatus.Pending);

        if (isHR) {
            leaveQuery = leaveQuery.eq('status', 'pending').order('start_date', { ascending: false });
            wfhQuery = wfhQuery.eq('status', WFHRequestStatus.Pending).order('created_at', { ascending: false });
            manpowerQuery = manpowerQuery.eq('status', ManpowerRequestStatus.Pending).order('created_at', { ascending: false });
            // For OT, the original HRDashboard only fetched reporteeIds OT.
            if (reporteeIds.length > 0) {
                otQuery = otQuery.in('employee_id', reporteeIds).order('submitted_at', { ascending: false });
            } else {
                // Return empty if no reportees
                otQuery = otQuery.eq('id', 'invalid-id-to-return-none');
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
            wfhQuery = wfhQuery.in('employee_id', reporteeIds);
            otQuery = otQuery.in('employee_id', reporteeIds);
            manpowerQuery = manpowerQuery.in('requester_id', reporteeIds);
        }

        const [leaveRes, wfhRes, otRes, manpowerRes] = await Promise.all([
            leaveQuery, wfhQuery, otQuery, manpowerQuery
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
                reason: row.reason,
                status: row.status as WFHRequestStatus,
                reportLink: row.report_link || undefined,
                approvedBy: row.approved_by || undefined,
                approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
                rejectionReason: row.rejection_reason || undefined,
                createdAt: row.created_at ? new Date(row.created_at) : new Date(),
            }));
            setPendingWfhApprovals(mapped.filter(r => r.status === WFHRequestStatus.Pending));
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
        const { error } = await supabase
            .from('wfh_requests')
            .update({ status: WFHRequestStatus.Approved, approved_by: user.id, approved_at: new Date().toISOString() })
            .eq('id', requestId);
        if (error) { 
            alert(error.message || 'Failed to approve WFH request.'); 
            throw error; 
        }
        setPendingWfhApprovals(prev => prev.filter(r => r.id !== requestId));
    };

    const handleRejectWFH = async (requestId: string, reason: string) => {
        if (!user) return;
        const { error } = await supabase
            .from('wfh_requests')
            .update({ status: WFHRequestStatus.Rejected, rejection_reason: reason })
            .eq('id', requestId);
        if (error) { 
            alert(error.message || 'Failed to reject WFH request.'); 
            throw error; 
        }
        setPendingWfhApprovals(prev => prev.filter(r => r.id !== requestId));
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
