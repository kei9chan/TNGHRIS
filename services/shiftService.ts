import { supabase } from './supabaseClient';
import { ShiftTemplate, ShiftAssignment, Site } from '../types';

// ---------------------------------------------------------------------------
// Row Types
// ---------------------------------------------------------------------------
type ShiftTemplateRow = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  grace_period_minutes: number;
  business_unit_id: string;
  color: string;
  is_flexible?: boolean | null;
  min_hours_per_day?: number | null;
  min_days_per_week?: number | null;
};

type ShiftAssignmentRow = {
  id: string;
  employee_id: string;
  shift_template_id: string;
  date: string;
  location_id: string;
  assigned_area_id?: string | null;
};

type SiteRow = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  business_unit_id: string;
  allowed_wifi_ssids?: any;
  grace_period_minutes?: number | null;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const mapShiftTemplate = (row: ShiftTemplateRow): ShiftTemplate => ({
  id: row.id,
  name: row.name,
  startTime: row.start_time,
  endTime: row.end_time,
  breakMinutes: row.break_minutes,
  gracePeriodMinutes: row.grace_period_minutes,
  businessUnitId: row.business_unit_id,
  color: row.color,
  isFlexible: row.is_flexible ?? undefined,
  minHoursPerDay: row.min_hours_per_day ?? undefined,
  minDaysPerWeek: row.min_days_per_week ?? undefined,
});

const mapShiftAssignment = (row: ShiftAssignmentRow): ShiftAssignment => ({
  id: row.id,
  employeeId: row.employee_id,
  shiftTemplateId: row.shift_template_id,
  date: new Date(row.date),
  locationId: row.location_id,
  assignedAreaId: row.assigned_area_id || undefined,
});

const mapSite = (row: SiteRow): Site => ({
  id: row.id,
  name: row.name,
  latitude: row.latitude,
  longitude: row.longitude,
  radiusMeters: row.radius_meters,
  businessUnitId: row.business_unit_id,
  allowedWifiSSIDs: Array.isArray(row.allowed_wifi_ssids) ? row.allowed_wifi_ssids : [],
  gracePeriodMinutes: row.grace_period_minutes ?? undefined,
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchShiftTemplates = async (): Promise<ShiftTemplate[]> => {
  const { data, error } = await supabase.from('shift_templates').select('*').order('name', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to fetch shift templates');
  return (data as ShiftTemplateRow[]).map(mapShiftTemplate);
};

export const fetchShiftTemplatesByBU = async (businessUnitId: string): Promise<ShiftTemplate[]> => {
  const { data, error } = await supabase
    .from('shift_templates')
    .select('*')
    .eq('business_unit_id', businessUnitId)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to fetch shift templates');
  return (data as ShiftTemplateRow[]).map(mapShiftTemplate);
};

export const saveShiftTemplate = async (template: Partial<ShiftTemplate>): Promise<ShiftTemplate> => {
  const payload = {
    name: template.name,
    start_time: template.startTime,
    end_time: template.endTime,
    break_minutes: template.breakMinutes ?? 60,
    grace_period_minutes: template.gracePeriodMinutes ?? 15,
    business_unit_id: template.businessUnitId,
    color: template.color || '#3B82F6',
    is_flexible: template.isFlexible ?? false,
    min_hours_per_day: template.minHoursPerDay ?? null,
    min_days_per_week: template.minDaysPerWeek ?? null,
  };

  const { data, error } = template.id
    ? await supabase.from('shift_templates').update(payload).eq('id', template.id).select().single()
    : await supabase.from('shift_templates').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save shift template');
  return mapShiftTemplate(data as ShiftTemplateRow);
};

export const fetchShiftAssignments = async (dateRange?: { start: string; end: string }): Promise<ShiftAssignment[]> => {
  let query = supabase.from('shift_assignments').select('*').order('date', { ascending: true });
  if (dateRange) {
    query = query.gte('date', dateRange.start).lte('date', dateRange.end);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to fetch shift assignments');
  return (data as ShiftAssignmentRow[]).map(mapShiftAssignment);
};

export const saveShiftAssignment = async (assignment: Partial<ShiftAssignment>): Promise<ShiftAssignment> => {
  const payload = {
    employee_id: assignment.employeeId,
    shift_template_id: assignment.shiftTemplateId,
    date: assignment.date ? new Date(assignment.date).toISOString().split('T')[0] : null,
    location_id: assignment.locationId,
    assigned_area_id: assignment.assignedAreaId || null,
  };

  const { data, error } = assignment.id
    ? await supabase.from('shift_assignments').update(payload).eq('id', assignment.id).select().single()
    : await supabase.from('shift_assignments').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save shift assignment');
  return mapShiftAssignment(data as ShiftAssignmentRow);
};

export const fetchSites = async (): Promise<Site[]> => {
  const { data, error } = await supabase.from('sites').select('*').order('name', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to fetch sites');
  return (data as SiteRow[]).map(mapSite);
};

export const fetchSitesByBU = async (businessUnitId: string): Promise<Site[]> => {
  const { data, error } = await supabase.from('sites').select('*').eq('business_unit_id', businessUnitId).order('name', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to fetch sites');
  return (data as SiteRow[]).map(mapSite);
};

export const saveSite = async (site: Partial<Site>): Promise<Site> => {
  const payload = {
    name: site.name,
    latitude: site.latitude ?? 0,
    longitude: site.longitude ?? 0,
    radius_meters: site.radiusMeters ?? 100,
    business_unit_id: site.businessUnitId,
    allowed_wifi_ssids: site.allowedWifiSSIDs || [],
    grace_period_minutes: site.gracePeriodMinutes ?? null,
  };

  const { data, error } = site.id
    ? await supabase.from('sites').update(payload).eq('id', site.id).select().single()
    : await supabase.from('sites').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save site');
  return mapSite(data as SiteRow);
};
