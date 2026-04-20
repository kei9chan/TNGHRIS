import { supabase } from './supabaseClient';
import { User, BusinessUnit, Department, Role, RateType, TaxStatus, AccessScope, EmploymentStatus } from '../types';

// ---------------------------------------------------------------------------
// Row Types
// ---------------------------------------------------------------------------
type HrisUserRow = {
  id: string;
  auth_user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  status: string;
  is_photo_enrolled: boolean;
  business_unit?: string | null;
  business_unit_id?: string | null;
  department?: string | null;
  department_id?: string | null;
  position?: string | null;
  date_hired?: string | null;
  birth_date?: string | null;
  sss_no?: string | null;
  pagibig_no?: string | null;
  philhealth_no?: string | null;
  tin?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_account_type?: string | null;
  leave_quota_vacation?: number | null;
  leave_quota_sick?: number | null;
  leave_last_credit_date?: string | null;
  employment_status?: string | null;
  rate_type?: string | null;
  rate_amount?: number | null;
  tax_status?: string | null;
  salary_basic?: number | null;
  salary_deminimis?: number | null;
  salary_reimbursable?: number | null;
  data_access_scope?: any | null;
  reports_to?: string | null;
};

type BusinessUnitRow = {
  id: string;
  name: string;
  code?: string | null;
  color?: string | null;
};

type DepartmentRow = {
  id: string;
  business_unit_id: string;
  name: string;
  code?: string | null;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const mapUser = (row: HrisUserRow): User => ({
  id: row.id,
  authUserId: row.auth_user_id,
  name: row.full_name,
  email: row.email,
  role: row.role as Role,
  department: row.department || '',
  businessUnit: row.business_unit || '',
  departmentId: row.department_id || undefined,
  businessUnitId: row.business_unit_id || undefined,
  status: row.status as 'Active' | 'Inactive',
  employmentStatus: (row.employment_status as EmploymentStatus) || undefined,
  isPhotoEnrolled: row.is_photo_enrolled,
  dateHired: row.date_hired ? new Date(row.date_hired) : new Date(),
  birthDate: row.birth_date ? new Date(row.birth_date) : undefined,
  position: row.position || '',
  reportsTo: row.reports_to || undefined,
  salary: row.salary_basic != null ? {
    basic: row.salary_basic || 0,
    deminimis: row.salary_deminimis || 0,
    reimbursable: row.salary_reimbursable || 0,
  } : undefined,
  monthlySalary: row.salary_basic != null ? (row.salary_basic || 0) + (row.salary_deminimis || 0) + (row.salary_reimbursable || 0) : undefined,
  sssNo: row.sss_no || undefined,
  pagibigNo: row.pagibig_no || undefined,
  philhealthNo: row.philhealth_no || undefined,
  tin: row.tin || undefined,
  emergencyContact: row.emergency_contact_name ? {
    name: row.emergency_contact_name,
    relationship: row.emergency_contact_relationship || '',
    phone: row.emergency_contact_phone || '',
  } : undefined,
  bankingDetails: row.bank_name ? {
    bankName: row.bank_name,
    accountNumber: row.bank_account_number || '',
    accountType: (row.bank_account_type as 'Savings' | 'Checking') || 'Savings',
  } : undefined,
  rateType: row.rate_type as RateType | undefined,
  rateAmount: row.rate_amount || undefined,
  taxStatus: row.tax_status as TaxStatus | undefined,
  leaveQuotaVacation: row.leave_quota_vacation || undefined,
  leaveQuotaSick: row.leave_quota_sick || undefined,
  leaveLastCreditDate: row.leave_last_credit_date ? new Date(row.leave_last_credit_date) : undefined,
  accessScope: row.data_access_scope as AccessScope | undefined,
});

const mapBusinessUnit = (row: BusinessUnitRow): BusinessUnit => ({
  id: row.id,
  name: row.name,
  code: row.code || undefined,
  color: row.color || undefined,
});

const mapDepartment = (row: DepartmentRow): Department => ({
  id: row.id,
  name: row.name,
  businessUnitId: row.business_unit_id,
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase
    .from('hris_users')
    .select('*')
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message || 'Failed to fetch users');
  return (data as HrisUserRow[]).map(mapUser);
};

export const fetchUserById = async (userId: string): Promise<User | null> => {
  const { data, error } = await supabase
    .from('hris_users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return mapUser(data as HrisUserRow);
};

export const fetchUserByAuthId = async (authUserId: string): Promise<User | null> => {
  const { data, error } = await supabase
    .from('hris_users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error || !data) return null;
  return mapUser(data as HrisUserRow);
};

export const fetchBusinessUnits = async (): Promise<BusinessUnit[]> => {
  const { data, error } = await supabase
    .from('business_units')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message || 'Failed to fetch business units');
  return (data as BusinessUnitRow[]).map(mapBusinessUnit);
};

export const fetchDepartments = async (): Promise<Department[]> => {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message || 'Failed to fetch departments');
  return (data as DepartmentRow[]).map(mapDepartment);
};

export const fetchDepartmentsByBusinessUnit = async (businessUnitId: string): Promise<Department[]> => {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('business_unit_id', businessUnitId)
    .order('name', { ascending: true });

  if (error) throw new Error(error.message || 'Failed to fetch departments');
  return (data as DepartmentRow[]).map(mapDepartment);
};

export const fetchUsersByBusinessUnit = async (businessUnitId: string): Promise<User[]> => {
  const { data, error } = await supabase
    .from('hris_users')
    .select('*')
    .eq('business_unit_id', businessUnitId)
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message || 'Failed to fetch users by BU');
  return (data as HrisUserRow[]).map(mapUser);
};
