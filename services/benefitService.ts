import { supabase } from './supabaseClient';
import { BenefitType, BenefitRequest, BenefitRequestStatus, User } from '../types';

// ---------------------------------------------------------------------------
// Row Types
// ---------------------------------------------------------------------------
type BenefitTypeRow = {
  id: string;
  name: string;
  description: string;
  max_value?: number | null;
  requires_bod_approval: boolean;
  is_active: boolean;
};

type BenefitRequestRow = {
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
  hr_endorsed_by?: string | null;
  hr_endorsed_at?: string | null;
  bod_approved_by?: string | null;
  bod_approved_at?: string | null;
  fulfilled_by?: string | null;
  fulfilled_at?: string | null;
  voucher_code?: string | null;
  rejection_reason?: string | null;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const mapBenefitType = (row: BenefitTypeRow): BenefitType => ({
  id: row.id,
  name: row.name,
  description: row.description,
  maxValue: row.max_value ?? undefined,
  requiresBodApproval: row.requires_bod_approval,
  isActive: row.is_active,
});

const mapBenefitRequest = (row: BenefitRequestRow): BenefitRequest => ({
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
  hrEndorsedBy: row.hr_endorsed_by || undefined,
  hrEndorsedAt: row.hr_endorsed_at ? new Date(row.hr_endorsed_at) : undefined,
  bodApprovedBy: row.bod_approved_by || undefined,
  bodApprovedAt: row.bod_approved_at ? new Date(row.bod_approved_at) : undefined,
  fulfilledBy: row.fulfilled_by || undefined,
  fulfilledAt: row.fulfilled_at ? new Date(row.fulfilled_at) : undefined,
  voucherCode: row.voucher_code || undefined,
  rejectionReason: row.rejection_reason || undefined,
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchBenefitTypes = async (): Promise<BenefitType[]> => {
  const { data, error } = await supabase.from('benefit_types').select('*').order('name', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to fetch benefit types');
  return (data as BenefitTypeRow[]).map(mapBenefitType);
};

export const saveBenefitType = async (bt: Partial<BenefitType>): Promise<BenefitType> => {
  const payload = {
    name: bt.name,
    description: bt.description,
    max_value: bt.maxValue ?? null,
    requires_bod_approval: bt.requiresBodApproval ?? false,
    is_active: bt.isActive ?? true,
  };

  const { data, error } = bt.id
    ? await supabase.from('benefit_types').update(payload).eq('id', bt.id).select().single()
    : await supabase.from('benefit_types').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save benefit type');
  return mapBenefitType(data as BenefitTypeRow);
};

export const fetchBenefitRequests = async (): Promise<BenefitRequest[]> => {
  const { data, error } = await supabase.from('benefit_requests').select('*').order('submission_date', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to fetch benefit requests');
  return (data as BenefitRequestRow[]).map(mapBenefitRequest);
};

export const fetchBenefitRequestsByEmployee = async (employeeId: string): Promise<BenefitRequest[]> => {
  const { data, error } = await supabase
    .from('benefit_requests')
    .select('*')
    .eq('employee_id', employeeId)
    .order('submission_date', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to fetch benefit requests');
  return (data as BenefitRequestRow[]).map(mapBenefitRequest);
};

export const createBenefitRequest = async (request: Partial<BenefitRequest>, user: User): Promise<BenefitRequest> => {
  const payload = {
    employee_id: user.id,
    employee_name: user.name,
    benefit_type_id: request.benefitTypeId,
    benefit_type_name: request.benefitTypeName || '',
    amount: request.amount ?? null,
    details: request.details || '',
    date_needed: request.dateNeeded ? new Date(request.dateNeeded).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    status: BenefitRequestStatus.PendingHR,
    submission_date: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('benefit_requests').insert(payload).select().single();
  if (error) throw new Error(error.message || 'Failed to create benefit request');
  return mapBenefitRequest(data as BenefitRequestRow);
};

export const updateBenefitRequest = async (id: string, updates: Partial<BenefitRequest>): Promise<BenefitRequest> => {
  const payload: Record<string, any> = {};
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.hrEndorsedBy !== undefined) payload.hr_endorsed_by = updates.hrEndorsedBy;
  if (updates.hrEndorsedAt !== undefined) payload.hr_endorsed_at = new Date(updates.hrEndorsedAt).toISOString();
  if (updates.bodApprovedBy !== undefined) payload.bod_approved_by = updates.bodApprovedBy;
  if (updates.bodApprovedAt !== undefined) payload.bod_approved_at = new Date(updates.bodApprovedAt).toISOString();
  if (updates.fulfilledBy !== undefined) payload.fulfilled_by = updates.fulfilledBy;
  if (updates.fulfilledAt !== undefined) payload.fulfilled_at = new Date(updates.fulfilledAt).toISOString();
  if (updates.voucherCode !== undefined) payload.voucher_code = updates.voucherCode;
  if (updates.rejectionReason !== undefined) payload.rejection_reason = updates.rejectionReason;

  const { data, error } = await supabase.from('benefit_requests').update(payload).eq('id', id).select().single();
  if (error) throw new Error(error.message || 'Failed to update benefit request');
  return mapBenefitRequest(data as BenefitRequestRow);
};
