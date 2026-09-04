import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { User } from '../types';
import { fetchOfferApprovalPackage, fetchPendingOfferApprovalIds } from '../services/offerApprovalService';
import { fetchMyAssetApprovalQueue } from '../services/assetApprovalService';

type PendingStep = {
  userId?: string;
  userName?: string;
  name?: string;
  role?: string;
  status?: string;
  order?: number;
};

export type PendingNTEApproval = {
  id: string;
  incidentReportId: string;
  employeeId: string;
  employeeName: string;
  reference: string;
  caseReference: string;
  category: string;
  businessUnitId?: string;
  businessUnit: string;
  assignedHandler: string;
  status: string;
  createdAt: Date;
  deadline?: Date;
  currentStep: string;
  canonicalKey: string;
};

export type PendingPANApproval = {
  id: string;
  employeeId: string;
  employeeName: string;
  reference: string;
  action: string;
  status: string;
  createdAt: Date;
  effectiveDate: Date;
  currentStep: string;
  canonicalKey: string;
};

export type PendingRequisitionApproval = {
  id: string;
  title: string;
  reference: string;
  businessUnitId?: string;
  departmentId?: string;
  status: string;
  createdAt: Date;
  currentStep: string;
  canonicalKey: string;
};

export type PendingAwardApproval = {
  id: string;
  employeeId: string;
  employeeName: string;
  awardTitle: string;
  reference: string;
  businessUnitId?: string;
  departmentId?: string;
  status: string;
  createdAt: Date;
  currentStep: string;
  canonicalKey: string;
};

export type PendingOfferApproval = {
  id: string;
  offerId: string;
  candidateId: string;
  candidateName: string;
  reference: string;
  jobTitle: string;
  businessUnit: string;
  status: string;
  approvalStage: string;
  createdAt: Date;
  currentStep: string;
  canonicalKey: string;
};

export type PendingAssetApproval = {
  id: string;
  employeeId: string;
  employeeName: string;
  assetDescription: string;
  businessUnitId?: string;
  departmentId?: string;
  status: string;
  approvalStage: string;
  createdAt: Date;
  currentStep: string;
  approvalProgress: string;
  isActionable: boolean;
  viewerActionStatus?: string;
  approvalIssue?: string;
  canonicalKey: string;
};

const isPending = (status?: string) => String(status || '').trim().toLowerCase() === 'pending';
const AWARD_PENDING_STATUSES = ['PendingApproval', 'Pending Approval'] as const;

const actionLabel = (action: Record<string, unknown> | null | undefined) => {
  if (!action) return 'Personnel action';
  const labels: string[] = [];
  if (action.changeOfStatus) labels.push('Regularization / Status Change');
  if (action.promotion) labels.push('Promotion');
  if (action.transfer) labels.push('Transfer');
  if (action.salaryIncrease) labels.push('Salary Increase');
  if (action.changeOfJobTitle) labels.push('Job Title Change');
  if (typeof action.others === 'string' && action.others.trim()) labels.push(action.others.trim());
  return labels.join(', ') || 'Personnel action';
};

export function useAdditionalApprovals(user: User | null) {
  const [pendingNTEApprovals, setPendingNTEApprovals] = useState<PendingNTEApproval[]>([]);
  const [pendingPANApprovals, setPendingPANApprovals] = useState<PendingPANApproval[]>([]);
  const [pendingRequisitionApprovals, setPendingRequisitionApprovals] = useState<PendingRequisitionApproval[]>([]);
  const [pendingAwardApprovals, setPendingAwardApprovals] = useState<PendingAwardApproval[]>([]);
  const [pendingOfferApprovals, setPendingOfferApprovals] = useState<PendingOfferApproval[]>([]);
  const [pendingAssetApprovals, setPendingAssetApprovals] = useState<PendingAssetApproval[]>([]);
  const [additionalApprovalError, setAdditionalApprovalError] = useState<string | null>(null);

  const refreshAdditionalApprovals = useCallback(async () => {
    if (!user?.id) {
      setPendingNTEApprovals([]);
      setPendingPANApprovals([]);
      setPendingRequisitionApprovals([]);
      setPendingAwardApprovals([]);
      setPendingOfferApprovals([]);
      setPendingAssetApprovals([]);
      setAdditionalApprovalError(null);
      return;
    }

    let offerLoadError: any = null;
    const offerIdsPromise = fetchPendingOfferApprovalIds().catch((error: any) => {
      offerLoadError = error;
      return [] as Awaited<ReturnType<typeof fetchPendingOfferApprovalIds>>;
    });
    let assetLoadError: any = null;
    const assetQueuePromise = fetchMyAssetApprovalQueue().catch((error: any) => {
      assetLoadError = error;
      return [] as Awaited<ReturnType<typeof fetchMyAssetApprovalQueue>>;
    });
    const [nteResult, [panResult, requisitionResult, awardResult], offerIds, assetQueue] = await Promise.all([
      supabase.rpc('get_my_pending_nte_approvals'),
      Promise.all([
      supabase
        .from('pans')
        .select('id,employee_id,employee_name,effective_date,status,action_taken,routing_steps,created_at,updated_at')
        .eq('status', 'Pending Approval')
        .order('updated_at', { ascending: false }),
      supabase
        .rpc('get_my_pending_job_requisition_approvals'),
      supabase
        .from('employee_awards')
        .select('id,employee_id,business_unit_id,department_id,status,submitted_at,approver_id,approver_steps,hris_users:employee_id(full_name),award_templates(title)')
        .in('status', [...AWARD_PENDING_STATUSES])
        .order('submitted_at', { ascending: false }),
      ]),
      offerIdsPromise,
      assetQueuePromise,
    ]);

    const offerPackageErrors: any[] = [];
    const offerPackages = await Promise.all(offerIds.map(async item => {
      try { return await fetchOfferApprovalPackage(item.requestId); } catch (error: any) {
        offerPackageErrors.push(error);
        return null;
      }
    }));

    const nteRows = nteResult.data || [];
    const errors = [nteResult.error, panResult.error, requisitionResult.error, awardResult.error, offerLoadError, assetLoadError, ...offerPackageErrors].filter(Boolean);
    setAdditionalApprovalError(errors.length ? errors.map(error => error!.message).join(' · ') : null);

    setPendingNTEApprovals(nteRows.map((row: any) => {
      const reference = row.nte_code || (row.nte_number ? `NTE-${row.nte_number}` : `NTE-${String(row.id).slice(0, 8)}`);
      const caseReference = row.case_number ? `TNGIR-${String(row.case_number).padStart(5, '0')}` : row.incident_report_id;
      return {
        id: row.id,
        incidentReportId: row.incident_report_id,
        employeeId: row.recipient_employee_id || '',
        employeeName: row.recipient_name || 'Employee',
        reference,
        caseReference,
        category: row.category || 'Notice to Explain',
        businessUnitId: row.business_unit_id || undefined,
        businessUnit: row.business_unit_name || 'Not assigned',
        assignedHandler: row.assigned_to_name || 'Not assigned',
        status: row.status,
        createdAt: new Date(row.created_at || row.updated_at || Date.now()),
        deadline: row.response_deadline ? new Date(row.response_deadline) : undefined,
        currentStep: row.approval_role || 'Required NTE approval',
        canonicalKey: `nte:${row.id}:${row.approval_id}`,
      };
    }));

    setPendingPANApprovals((panResult.data || []).flatMap((row: any) => {
      const steps: PendingStep[] = Array.isArray(row.routing_steps) ? row.routing_steps : [];
      const stepIndex = steps.findIndex(step => step.userId === user.id && isPending(step.status));
      if (stepIndex < 0) return [];
      const step = steps[stepIndex];
      return [{
        id: row.id,
        employeeId: row.employee_id,
        employeeName: row.employee_name || 'Employee',
        reference: `PAN-${String(row.id).slice(0, 8).toUpperCase()}`,
        action: actionLabel(row.action_taken),
        status: row.status,
        createdAt: new Date(row.updated_at || row.created_at || Date.now()),
        effectiveDate: new Date(row.effective_date || row.updated_at || Date.now()),
        currentStep: step.role || step.name || `Approval step ${stepIndex + 1}`,
        canonicalKey: `pan:${row.id}:${step.order ?? stepIndex}`,
      }];
    }));

    setPendingRequisitionApprovals((requisitionResult.data || []).flatMap((row: any) => {
      return [{
        id: row.id,
        title: row.title,
        reference: row.req_code || `REQ-${String(row.id).slice(0, 8).toUpperCase()}`,
        businessUnitId: row.business_unit_id || undefined,
        departmentId: row.department_id || undefined,
        status: row.status,
        createdAt: new Date(row.created_at || Date.now()),
        currentStep: row.current_step || 'Required requisition approval',
        canonicalKey: `requisition:${row.id}:${row.step_order ?? 0}`,
      }];
    }));

    setPendingAwardApprovals((awardResult.data || []).flatMap((row: any) => {
      const steps: PendingStep[] = Array.isArray(row.approver_steps) ? row.approver_steps : [];
      const stepIndex = steps.findIndex(step => step.userId === user.id && isPending(step.status));
      const isAssignedLegacyApprover = row.approver_id === user.id;
      if (stepIndex < 0 && !isAssignedLegacyApprover) return [];
      const step = stepIndex >= 0 ? steps[stepIndex] : undefined;
      return [{
        id: row.id,
        employeeId: row.employee_id,
        employeeName: row.hris_users?.full_name || 'Employee',
        awardTitle: row.award_templates?.title || 'Award',
        reference: `AWARD-${String(row.id).slice(0, 8).toUpperCase()}`,
        businessUnitId: row.business_unit_id || undefined,
        departmentId: row.department_id || undefined,
        status: 'Pending Approval',
        createdAt: new Date(row.submitted_at || Date.now()),
        currentStep: step?.userName || step?.name || 'Award approval',
        canonicalKey: `award:${row.id}:${step?.order ?? stepIndex ?? 0}`,
      }];
    }));

    setPendingOfferApprovals(offerPackages.flatMap((pkg, index) => {
      if (!pkg) return [];
      const queue = offerIds[index];
      const candidateName = `${pkg.candidate.firstName} ${pkg.candidate.lastName}`.trim() || 'Candidate';
      return [{
        id: pkg.request.id,
        offerId: pkg.offer.id,
        candidateId: pkg.candidate.id,
        candidateName,
        reference: pkg.offer.offerNumber || `OFFER-${String(pkg.offer.id).slice(0, 8).toUpperCase()}`,
        jobTitle: pkg.offer.offerDetails?.jobTitle || pkg.application.roleTitleSnapshot || 'Position not recorded',
        businessUnit: pkg.offer.offerDetails?.businessUnit || 'Business unit not recorded',
        status: pkg.request.status,
        approvalStage: pkg.request.approvalStage,
        createdAt: pkg.request.submittedAt || queue.assignedAt,
        currentStep: pkg.request.approvalStage === 'HR_MANAGER' ? 'HR Manager approval' : 'BOD / GM approval',
        canonicalKey: `offer:${pkg.request.id}:${pkg.request.approvalStage}`,
      }];
    }));

    setPendingAssetApprovals(assetQueue.map(row => ({
      id: row.requestId,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      assetDescription: row.assetDescription,
      businessUnitId: row.businessUnitId,
      departmentId: row.departmentId,
      status: 'Pending',
      approvalStage: row.approvalStage,
      createdAt: row.requestedAt,
      currentStep: row.currentStep,
      approvalProgress: row.approvalProgress,
      isActionable: row.isActionable,
      viewerActionStatus: row.viewerActionStatus,
      approvalIssue: row.approvalIssue,
      canonicalKey: `asset:${row.requestId}:${row.approvalStage}:${row.viewerActionStatus || 'READ_ONLY'}`,
    })));
  }, [user?.id]);

  useEffect(() => {
    refreshAdditionalApprovals();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshAdditionalApprovals();
    }, 30000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshAdditionalApprovals();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshAdditionalApprovals]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`asset-approval-queue-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asset_requests' }, () => {
        void refreshAdditionalApprovals();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refreshAdditionalApprovals, user?.id]);

  return {
    pendingNTEApprovals,
    pendingPANApprovals,
    pendingRequisitionApprovals,
    pendingAwardApprovals,
    pendingOfferApprovals,
    pendingAssetApprovals,
    additionalApprovalError,
    refreshAdditionalApprovals,
  };
}
