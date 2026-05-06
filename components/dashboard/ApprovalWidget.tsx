import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { useApprovals } from '../../hooks/useApprovals';
import Card from '../ui/Card';
import Button from '../ui/Button';

// Modals — opened directly in the dashboard, no page navigation needed
import LeaveRequestModal from '../payroll/LeaveRequestModal';
import WFHReviewModal from '../payroll/WFHReviewModal';
import OTRequestModal from '../payroll/OTRequestModal';
import ManpowerReviewModal from '../payroll/ManpowerReviewModal';

import {
    LeaveRequest,
    WFHRequest,
    OTRequest,
    ManpowerRequest,
    OTStatus,
} from '../../types';

// ── Type badge colours ───────────────────────────────────────────────────────
const BADGE: Record<string, string> = {
    Leave:     'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    WFH:       'bg-blue-100   text-blue-800   dark:bg-blue-900/40   dark:text-blue-300',
    Overtime:  'bg-amber-100  text-amber-800  dark:bg-amber-900/40  dark:text-amber-300',
    Manpower:  'bg-teal-100   text-teal-800   dark:bg-teal-900/40   dark:text-teal-300',
};

function fmtDate(d: Date | string | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Single row component ─────────────────────────────────────────────────────
interface ApprovalRowProps {
    type: string;
    name: string;
    subtitle: string;
    onReview: () => void;
}

function ApprovalRow({ type, name, subtitle, onReview }: ApprovalRowProps) {
    return (
        <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
                <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${BADGE[type] ?? 'bg-gray-100 text-gray-700'}`}>
                    {type}
                </span>
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>
                </div>
            </div>
            <Button size="small" variant="secondary" onClick={onReview} className="shrink-0">
                Review
            </Button>
        </div>
    );
}

// ── Main widget ──────────────────────────────────────────────────────────────
export default function ApprovalWidget() {
    const { user, profile } = useAuth();
    const isHR = profile?.role === 'HR' || profile?.department === 'HR';
    const [reporteeIds, setReporteeIds] = useState<string[]>([]);

    // ── Active modal state ───────────────────────────────────────────────────
    const [leaveModal,    setLeaveModal]    = useState<LeaveRequest    | null>(null);
    const [wfhModal,      setWfhModal]      = useState<WFHRequest      | null>(null);
    const [otModal,       setOtModal]       = useState<OTRequest       | null>(null);
    const [manpowerModal, setManpowerModal] = useState<ManpowerRequest | null>(null);

    useEffect(() => {
        if (!user) return;
        supabase
            .from('employees')
            .select('id')
            .eq('manager_id', user.id)
            .then(({ data }) => {
                if (data) setReporteeIds(data.map(d => d.id).filter(Boolean));
            });
    }, [user]);

    const {
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
    } = useApprovals({ user, isHR, reporteeIds });

    const totalApprovals =
        pendingLeaveApprovals.length +
        pendingWfhApprovals.length +
        pendingOtApprovals.length +
        pendingManpowerApprovals.length;

    if (!user || totalApprovals === 0) return null;

    return (
        <>
            <Card title={`Pending Approvals (${totalApprovals})`}>
                <div className="flex flex-col gap-2">

                    {/* ── Leave ─────────────────────────────────────────── */}
                    {pendingLeaveApprovals.map(req => (
                        <React.Fragment key={`leave-${req.id}`}>
                            <ApprovalRow
                                type="Leave"
                                name={req.employeeName ?? '—'}
                                subtitle={`${fmtDate(req.startDate)} → ${fmtDate(req.endDate)}`}
                                onReview={() => setLeaveModal(req)}
                            />
                        </React.Fragment>
                    ))}

                    {/* ── WFH ───────────────────────────────────────────── */}
                    {pendingWfhApprovals.map(req => (
                        <React.Fragment key={`wfh-${req.id}`}>
                            <ApprovalRow
                                type="WFH"
                                name={req.employeeName ?? '—'}
                                subtitle={fmtDate(req.date)}
                                onReview={() => setWfhModal(req)}
                            />
                        </React.Fragment>
                    ))}

                    {/* ── Overtime ──────────────────────────────────────── */}
                    {pendingOtApprovals.map(req => (
                        <React.Fragment key={`ot-${req.id}`}>
                            <ApprovalRow
                                type="Overtime"
                                name={req.employeeName ?? '—'}
                                subtitle={`${fmtDate(req.date)}  ${req.startTime ?? ''} – ${req.endTime ?? ''}`}
                                onReview={() => setOtModal(req)}
                            />
                        </React.Fragment>
                    ))}

                    {/* ── Manpower ──────────────────────────────────────── */}
                    {pendingManpowerApprovals.map(req => (
                        <React.Fragment key={`manpower-${req.id}`}>
                            <ApprovalRow
                                type="Manpower"
                                name={req.requesterName ?? '—'}
                                subtitle={req.businessUnitName ?? '—'}
                                onReview={() => setManpowerModal(req)}
                            />
                        </React.Fragment>
                    ))}
                </div>
            </Card>

            {/* ══ Modals — rendered at widget level, no navigation ══════════ */}

            {/* Leave modal */}
            <LeaveRequestModal
                isOpen={!!leaveModal}
                onClose={() => setLeaveModal(null)}
                request={leaveModal}
                leaveTypes={leaveTypes}
                onSave={() => {/* read-only in review mode */}}
                onApprove={async (req, approved, notes) => {
                    await handleLeaveApproval(req, approved, notes);
                    setLeaveModal(null);
                }}
            />

            {/* WFH modal */}
            <WFHReviewModal
                isOpen={!!wfhModal}
                onClose={() => setWfhModal(null)}
                request={wfhModal}
                onApprove={async (id) => {
                    await handleApproveWFH(id);
                    setWfhModal(null);
                }}
                onReject={async (id, reason) => {
                    await handleRejectWFH(id, reason);
                    setWfhModal(null);
                }}
            />

            {/* OT modal */}
            <OTRequestModal
                isOpen={!!otModal}
                onClose={() => setOtModal(null)}
                requestToEdit={otModal}
                onSave={() => {/* read-only in review mode */}}
                onApproveOrReject={async (req, status, details) => {
                    await handleApproveRejectOT(
                        req,
                        status as OTStatus.Approved | OTStatus.Rejected,
                        details
                    );
                    setOtModal(null);
                }}
                canApproveOverride={otModal ? reporteeIds.includes(otModal.employeeId) : false}
                attendanceRecords={[]}
                shiftAssignments={[]}
                shiftTemplates={[]}
            />

            {/* Manpower modal */}
            <ManpowerReviewModal
                isOpen={!!manpowerModal}
                onClose={() => setManpowerModal(null)}
                request={manpowerModal}
                onApprove={async (id) => {
                    await handleApproveManpower(id);
                    setManpowerModal(null);
                }}
                onReject={async (id, reason) => {
                    await handleRejectManpower(id, reason);
                    setManpowerModal(null);
                }}
                canApprove={true}
            />
        </>
    );
}
