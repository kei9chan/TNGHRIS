import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { User } from '../types';

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

const isPending = (status?: string) => String(status || '').trim().toLowerCase() === 'pending';

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
  const [additionalApprovalError, setAdditionalApprovalError] = useState<string | null>(null);

  const refreshAdditionalApprovals = useCallback(async () => {
    if (!user?.id) {
      setPendingNTEApprovals([]);
      setPendingPANApprovals([]);
      setPendingRequisitionApprovals([]);
      setPendingAwardApprovals([]);
      setAdditionalApprovalError(null);
      return;
    }

    const [nteResult, panResult, requisitionResult, awardResult] = await Promise.all([
      supabase
        .from('ntes')
        .select('id,incident_report_id,recipients,recipient_names,response_deadline,status,approval_log,created_at,updated_at,nte_number,nte_code')
        .eq('status', 'PendingApproval')
        .order('created_at', { ascending: false }),
      supabase
        .from('pans')
        .select('id,employee_id,employee_name,effective_date,status,action_taken,routing_steps,created_at,updated_at')
        .eq('status', 'Pending Approval')
        .order('updated_at', { ascending: false }),
      supabase
        .from('job_requisitions')
        .select('id,req_code,title,business_unit_id,department_id,status,created_at,routing_steps')
        .eq('status', 'PendingApproval')
        .order('created_at', { ascending: false }),
      supabase
        .from('employee_awards')
        .select('id,employee_id,business_unit_id,department_id,status,submitted_at,approver_id,approver_steps,hris_users:employee_id(full_name),award_templates(title)')
        .in('status', ['PendingApproval', 'Pending Approval', 'Pending'])
        .order('submitted_at', { ascending: false }),
    ]);

    const errors = [nteResult.error, panResult.error, requisitionResult.error, awardResult.error].filter(Boolean);
    setAdditionalApprovalError(errors.length ? errors.map(error => error!.message).join(' · ') : null);

    const nteRows = (nteResult.data || []).filter((row: any) =>
      (Array.isArray(row.approval_log) ? row.approval_log : []).some(
        (step: PendingStep) => step.userId === user.id && isPending(step.status)
      )
    );
    const incidentIds = Array.from(new Set(nteRows.map((row: any) => row.incident_report_id).filter(Boolean)));
    const incidentResult = incidentIds.length
      ? await supabase
          .from('incident_reports')
          .select('id,case_number,category,business_unit_id,business_unit_name,assigned_to_name')
          .in('id', incidentIds)
      : { data: [], error: null };
    if (incidentResult.error) {
      setAdditionalApprovalError(current => [current, incidentResult.error?.message].filter(Boolean).join(' · '));
    }
    const incidents = new Map((incidentResult.data || []).map((row: any) => [row.id, row]));

    setPendingNTEApprovals(nteRows.map((row: any) => {
      const steps: PendingStep[] = Array.isArray(row.approval_log) ? row.approval_log : [];
      const stepIndex = steps.findIndex(step => step.userId === user.id && isPending(step.status));
      const step = steps[stepIndex];
      const incident: any = incidents.get(row.incident_report_id);
      const reference = row.nte_code || (row.nte_number ? `NTE-${row.nte_number}` : `NTE-${String(row.id).slice(0, 8)}`);
      const caseReference = incident?.case_number ? `TNGIR-${String(incident.case_number).padStart(5, '0')}` : row.incident_report_id;
      return {
        id: row.id,
        incidentReportId: row.incident_report_id,
        employeeId: row.recipients?.[0] || '',
        employeeName: row.recipient_names?.[0] || 'Employee',
        reference,
        caseReference,
        category: incident?.category || 'Notice to Explain',
        businessUnitId: incident?.business_unit_id || undefined,
        businessUnit: incident?.business_unit_name || 'Not assigned',
        assignedHandler: incident?.assigned_to_name || 'Not assigned',
        status: row.status,
        createdAt: new Date(row.created_at || row.updated_at || Date.now()),
        deadline: row.response_deadline ? new Date(row.response_deadline) : undefined,
        currentStep: step?.userName || step?.name || `Approval step ${stepIndex + 1}`,
        canonicalKey: `nte:${row.id}:${stepIndex}`,
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
      const steps: PendingStep[] = Array.isArray(row.routing_steps) ? row.routing_steps : [];
      const stepIndex = steps.findIndex(step => step.userId === user.id && isPending(step.status));
      if (stepIndex < 0) return [];
      const step = steps[stepIndex];
      return [{
        id: row.id,
        title: row.title,
        reference: row.req_code || `REQ-${String(row.id).slice(0, 8).toUpperCase()}`,
        businessUnitId: row.business_unit_id || undefined,
        departmentId: row.department_id || undefined,
        status: row.status,
        createdAt: new Date(row.created_at || Date.now()),
        currentStep: step.role || step.name || `Approval step ${stepIndex + 1}`,
        canonicalKey: `requisition:${row.id}:${step.order ?? stepIndex}`,
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
  }, [user?.id]);

  useEffect(() => {
    refreshAdditionalApprovals();
    const interval = window.setInterval(refreshAdditionalApprovals, 30000);
    return () => window.clearInterval(interval);
  }, [refreshAdditionalApprovals]);

  return {
    pendingNTEApprovals,
    pendingPANApprovals,
    pendingRequisitionApprovals,
    pendingAwardApprovals,
    additionalApprovalError,
    refreshAdditionalApprovals,
  };
}
