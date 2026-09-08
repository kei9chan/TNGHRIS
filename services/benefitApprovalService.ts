import { BenefitRequest, BenefitRequestStatus } from '../types';
import { supabase } from './supabaseClient';

type BenefitApprovalRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  benefit_type_id: string;
  benefit_type_name: string;
  amount?: number | null;
  details: string;
  date_needed: string;
  status: string;
  submission_date: string;
  current_step?: string | null;
  hr_endorsed_by?: string | null;
  hr_endorsed_at?: string | null;
  bod_approved_by?: string | null;
  bod_approved_at?: string | null;
  fulfilled_by?: string | null;
  fulfilled_at?: string | null;
  voucher_code?: string | null;
  rejection_reason?: string | null;
};

export type PendingBenefitApproval = BenefitRequest & {
  currentStep: string;
  canonicalKey: string;
};

export const mapBenefitApprovalRow = (row: BenefitApprovalRow): BenefitRequest => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeName: row.employee_name,
  benefitTypeId: row.benefit_type_id,
  benefitTypeName: row.benefit_type_name,
  amount: row.amount ?? undefined,
  details: row.details,
  dateNeeded: new Date(row.date_needed),
  status: row.status as BenefitRequestStatus,
  submissionDate: new Date(row.submission_date),
  hrEndorsedBy: row.hr_endorsed_by ?? undefined,
  hrEndorsedAt: row.hr_endorsed_at ? new Date(row.hr_endorsed_at) : undefined,
  bodApprovedBy: row.bod_approved_by ?? undefined,
  bodApprovedAt: row.bod_approved_at ? new Date(row.bod_approved_at) : undefined,
  fulfilledBy: row.fulfilled_by ?? undefined,
  fulfilledAt: row.fulfilled_at ? new Date(row.fulfilled_at) : undefined,
  voucherCode: row.voucher_code ?? undefined,
  rejectionReason: row.rejection_reason ?? undefined,
});

export const fetchMyPendingBenefitApprovals = async (): Promise<PendingBenefitApproval[]> => {
  const { data, error } = await supabase.rpc('get_my_pending_benefit_approvals');
  if (error) throw new Error(error.message || 'Failed to load benefit approvals');
  return (data || []).map((row: BenefitApprovalRow) => ({
    ...mapBenefitApprovalRow(row),
    currentStep: row.current_step || 'Required benefit approval',
    canonicalKey: `benefit:${row.id}:${row.status}`,
  }));
};

export const reviewBenefitRequest = async (
  requestId: string,
  approved: boolean,
  reason?: string,
): Promise<BenefitRequest> => {
  const { data, error } = await supabase.rpc('review_benefit_request', {
    p_request_id: requestId,
    p_approved: approved,
    p_reason: reason?.trim() || null,
  });
  if (error) throw new Error(error.message || 'Failed to review benefit request');
  return mapBenefitApprovalRow(data as BenefitApprovalRow);
};
