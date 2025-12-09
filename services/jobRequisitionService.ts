import { supabase } from './supabaseClient';
import { JobRequisition, JobRequisitionStatus } from '../types';

type JobRequisitionRow = {
  id: string;
  req_code?: string | null;
  title: string;
  department_id: string;
  business_unit_id: string;
  headcount: number;
  employment_type: 'Full-Time' | 'Part-Time' | 'Contract';
  location_type: 'Onsite' | 'Hybrid' | 'Remote';
  work_location?: string | null;
  budgeted_salary_min?: number | null;
  budgeted_salary_max?: number | null;
  justification: string;
  created_by_user_id: string;
  status: JobRequisitionStatus;
  is_urgent?: boolean | null;
  routing_steps: any;
  created_at?: string;
  updated_at?: string;
};

const dbStatusToUi = (status: string): JobRequisitionStatus => {
  switch (status) {
    case 'PendingApproval':
    case 'Pending Approval':
      return JobRequisitionStatus.PendingApproval;
    case 'Draft':
      return JobRequisitionStatus.Draft;
    case 'Approved':
      return JobRequisitionStatus.Approved;
    case 'Rejected':
      return JobRequisitionStatus.Rejected;
    case 'Closed':
      return JobRequisitionStatus.Closed;
    default:
      return status as JobRequisitionStatus;
  }
};

const uiStatusToDb = (status?: JobRequisitionStatus | string | null) => {
  if (!status) return null;
  if (status === JobRequisitionStatus.PendingApproval || status === 'Pending Approval') return 'PendingApproval';
  return status.toString().replace(' ', '');
};

const mapRow = (row: JobRequisitionRow): JobRequisition => ({
  id: row.id,
  reqCode: row.req_code || '',
  title: row.title,
  departmentId: row.department_id,
  businessUnitId: row.business_unit_id,
  headcount: row.headcount || 0,
  employmentType: row.employment_type,
  locationType: row.location_type,
  workLocation: row.work_location || '',
  budgetedSalaryMin: row.budgeted_salary_min || 0,
  budgetedSalaryMax: row.budgeted_salary_max || 0,
  justification: row.justification,
  createdByUserId: row.created_by_user_id,
  status: dbStatusToUi(row.status as any),
  isUrgent: !!row.is_urgent,
  routingSteps: Array.isArray(row.routing_steps) ? row.routing_steps : [],
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
});

export const fetchJobRequisitions = async (): Promise<JobRequisition[]> => {
  const { data, error } = await supabase
    .from('job_requisitions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to load requisitions');
  return (data as JobRequisitionRow[]).map(mapRow);
};

export const saveJobRequisition = async (req: Partial<JobRequisition>): Promise<JobRequisition> => {
  const payload: Partial<JobRequisitionRow> = {
    req_code: req.reqCode,
    title: req.title,
    department_id: req.departmentId,
    business_unit_id: req.businessUnitId,
    headcount: req.headcount,
    employment_type: req.employmentType,
    location_type: req.locationType,
    work_location: req.workLocation,
    budgeted_salary_min: req.budgetedSalaryMin,
    budgeted_salary_max: req.budgetedSalaryMax,
    justification: req.justification,
    created_by_user_id: req.createdByUserId,
    status: uiStatusToDb(req.status) as any,
    is_urgent: req.isUrgent ?? false,
    routing_steps: req.routingSteps || [],
    updated_at: new Date().toISOString(),
  };

  const query = req.id
    ? supabase.from('job_requisitions').update(payload).eq('id', req.id).select().single()
    : supabase.from('job_requisitions').insert({ ...payload, created_at: new Date().toISOString() }).select().single();

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to save requisition');
  return mapRow(data as JobRequisitionRow);
};
