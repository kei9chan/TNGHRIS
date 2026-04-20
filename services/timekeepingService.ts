import { supabase } from './supabaseClient';
import {
  ServiceArea, DemandTypeConfig, StaffingRequirement, OperatingHours,
  AttendanceRecord, AttendanceExceptionRecord, TimeEvent, OTRequest,
} from '../types';

// ---------------------------------------------------------------------------
// Row Types
// ---------------------------------------------------------------------------
type ServiceAreaRow = {
  id: string; business_unit_id: string; name: string;
  capacity?: number | null; description?: string | null;
};

type DemandTypeConfigRow = {
  id: string; business_unit_id: string; tier: string; color: string;
  label: string; description?: string | null;
};

type StaffingRequirementRow = {
  id: string; area_id: string; role: string; day_type_tier: string;
  min_count: number; max_count?: number | null;
  start_time?: string | null; end_time?: string | null;
};

type OperatingHoursRow = {
  id: string; business_unit_id: string; day_of_week: number;
  open_time: string; close_time: string; is_closed: boolean;
};

type AttendanceRecordRow = {
  id: string; employee_id: string; date: string; shift_id?: string | null;
  clock_in?: string | null; clock_out?: string | null;
  hours_worked: number; overtime_hours: number; status: string;
  is_holiday: boolean; holiday_type?: string | null;
  late_minutes: number; undertime_minutes: number;
};

type AttendanceExceptionRow = {
  id: string; employee_id: string; employee_name: string; date: string;
  exception_type: string; details: string; status: string;
  resolution_note?: string | null; resolved_by?: string | null;
  resolved_at?: string | null;
};

type TimeEventRow = {
  id: string; employee_id: string; timestamp: string; type: string;
  source: string; site_id?: string | null; photo_url?: string | null;
  latitude?: number | null; longitude?: number | null;
};

type OTRequestRow = {
  id: string; employee_id: string; employee_name: string; date: string;
  start_time: string; end_time: string; hours: number; reason: string;
  status: string; approved_by?: string | null; approved_at?: string | null;
  business_unit_id?: string | null;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const mapServiceArea = (r: ServiceAreaRow): ServiceArea => ({
  id: r.id, businessUnitId: r.business_unit_id, name: r.name,
  capacity: r.capacity ?? undefined, description: r.description || undefined,
} as any);

const mapDemandType = (r: DemandTypeConfigRow): DemandTypeConfig => ({
  id: r.id, businessUnitId: r.business_unit_id, tier: r.tier as any,
  color: r.color, label: r.label, description: r.description || undefined,
} as any);

const mapStaffingReq = (r: StaffingRequirementRow): StaffingRequirement => ({
  id: r.id, areaId: r.area_id, role: r.role, dayTypeTier: r.day_type_tier as any,
  minCount: r.min_count, maxCount: r.max_count ?? undefined,
  startTime: r.start_time || undefined, endTime: r.end_time || undefined,
} as any);

const mapOperatingHours = (r: OperatingHoursRow): OperatingHours => ({
  id: r.id, businessUnitId: r.business_unit_id, dayOfWeek: r.day_of_week,
  openTime: r.open_time, closeTime: r.close_time, isClosed: r.is_closed,
} as any);

const mapAttendanceRecord = (r: AttendanceRecordRow): AttendanceRecord => ({
  id: r.id, employeeId: r.employee_id, date: new Date(r.date),
  shiftId: r.shift_id || undefined,
  clockIn: r.clock_in ? new Date(r.clock_in) : undefined,
  clockOut: r.clock_out ? new Date(r.clock_out) : undefined,
  hoursWorked: r.hours_worked, overtimeHours: r.overtime_hours,
  status: r.status as any, isHoliday: r.is_holiday,
  holidayType: r.holiday_type as any || undefined,
  lateMinutes: r.late_minutes, undertimeMinutes: r.undertime_minutes,
} as any);

const mapAttendanceException = (r: AttendanceExceptionRow): AttendanceExceptionRecord => ({
  id: r.id, employeeId: r.employee_id, employeeName: r.employee_name,
  date: new Date(r.date), exceptionType: r.exception_type as any,
  details: r.details, status: r.status as any,
  resolutionNote: r.resolution_note || undefined,
  resolvedBy: r.resolved_by || undefined,
  resolvedAt: r.resolved_at ? new Date(r.resolved_at) : undefined,
} as any);

const mapTimeEvent = (r: TimeEventRow): TimeEvent => ({
  id: r.id, employeeId: r.employee_id, timestamp: new Date(r.timestamp),
  type: r.type as any, source: r.source as any,
  siteId: r.site_id || undefined,
  photoUrl: r.photo_url || undefined,
  latitude: r.latitude ?? undefined, longitude: r.longitude ?? undefined,
} as any);

const mapOTRequest = (r: OTRequestRow): OTRequest => ({
  id: r.id, employeeId: r.employee_id, employeeName: r.employee_name,
  date: new Date(r.date), startTime: r.start_time, endTime: r.end_time,
  hours: r.hours, reason: r.reason, status: r.status as any,
  approvedBy: r.approved_by || undefined,
  approvedAt: r.approved_at ? new Date(r.approved_at) : undefined,
  businessUnitId: r.business_unit_id || undefined,
} as any);

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

// Workforce Planning
export const fetchServiceAreas = async (buId?: string): Promise<ServiceArea[]> => {
  let q = supabase.from('service_areas').select('*').order('name', { ascending: true });
  if (buId) q = q.eq('business_unit_id', buId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as ServiceAreaRow[]).map(mapServiceArea);
};

export const fetchDemandTypes = async (buId?: string): Promise<DemandTypeConfig[]> => {
  let q = supabase.from('demand_type_configs').select('*').order('tier', { ascending: true });
  if (buId) q = q.eq('business_unit_id', buId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as DemandTypeConfigRow[]).map(mapDemandType);
};

export const fetchStaffingRequirements = async (): Promise<StaffingRequirement[]> => {
  const { data, error } = await supabase.from('staffing_requirements').select('*');
  if (error) throw new Error(error.message);
  return (data as StaffingRequirementRow[]).map(mapStaffingReq);
};

export const fetchOperatingHours = async (buId?: string): Promise<OperatingHours[]> => {
  let q = supabase.from('operating_hours').select('*').order('day_of_week', { ascending: true });
  if (buId) q = q.eq('business_unit_id', buId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as OperatingHoursRow[]).map(mapOperatingHours);
};

// Attendance
export const fetchAttendanceRecords = async (): Promise<AttendanceRecord[]> => {
  const { data, error } = await supabase.from('attendance_records').select('*').order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as AttendanceRecordRow[]).map(mapAttendanceRecord);
};

export const fetchAttendanceExceptions = async (): Promise<AttendanceExceptionRecord[]> => {
  const { data, error } = await supabase.from('attendance_exceptions').select('*').order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as AttendanceExceptionRow[]).map(mapAttendanceException);
};

// Time Events
export const fetchTimeEvents = async (employeeId?: string): Promise<TimeEvent[]> => {
  let q = supabase.from('time_events').select('*').order('timestamp', { ascending: false });
  if (employeeId) q = q.eq('employee_id', employeeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as TimeEventRow[]).map(mapTimeEvent);
};

// OT Requests
export const fetchOTRequests = async (): Promise<OTRequest[]> => {
  const { data, error } = await supabase.from('ot_requests').select('*').order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as OTRequestRow[]).map(mapOTRequest);
};

export const saveOTRequest = async (ot: Partial<OTRequest> & Record<string, any>): Promise<OTRequest> => {
  const payload = {
    employee_id: ot.employeeId, employee_name: ot.employeeName,
    date: ot.date ? new Date(ot.date).toISOString().split('T')[0] : null,
    start_time: ot.startTime, end_time: ot.endTime, hours: ot.hours,
    reason: ot.reason, status: ot.status,
    approved_by: ot.approvedBy || null,
    approved_at: ot.approvedAt ? new Date(ot.approvedAt).toISOString() : null,
    business_unit_id: ot.businessUnitId || null,
  };
  const { data, error } = ot.id
    ? await supabase.from('ot_requests').update(payload).eq('id', ot.id).select().single()
    : await supabase.from('ot_requests').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return mapOTRequest(data as OTRequestRow);
};
