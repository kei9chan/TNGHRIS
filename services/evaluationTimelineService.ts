import { EvaluationTimeline, TimelineStatus } from '../types';
import { supabase } from './supabaseClient';

export type CalendarEvaluationType = 'Monthly' | 'Quarterly' | 'Annual' | 'Onboarding';

export interface EvaluationTimelineOption extends EvaluationTimeline {
  year: number;
  periodLabel: string;
}

const normalizeType = (value: unknown): EvaluationTimeline['type'] => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'monthly') return 'Monthly';
  if (normalized === 'quarterly') return 'Quarterly';
  if (normalized === 'annual') return 'Annual';
  if (normalized === 'onboarding') return 'Onboarding';
  return 'Custom';
};

const formatPeriodLabel = (type: EvaluationTimeline['type'], start: Date, name: string) => {
  if (type === 'Monthly') return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (type === 'Quarterly') return name;
  return name;
};

export const mapEvaluationTimelineOption = (row: any): EvaluationTimelineOption => {
  const rolloutDate = row.rollout_date ? new Date(`${row.rollout_date}T00:00:00Z`) : new Date();
  const endDate = row.end_date ? new Date(`${row.end_date}T00:00:00Z`) : rolloutDate;
  const type = normalizeType(row.type);
  return {
    id: row.id,
    businessUnitId: row.business_unit_id || '',
    name: row.name || 'Evaluation period',
    type,
    rolloutDate,
    endDate,
    status: (row.status || TimelineStatus.Active) as TimelineStatus,
    year: rolloutDate.getUTCFullYear(),
    periodLabel: formatPeriodLabel(type, rolloutDate, row.name || 'Evaluation period'),
  };
};

export const loadEvaluationTimelines = async (year?: number): Promise<EvaluationTimelineOption[]> => {
  if (year) {
    const { error: ensureError } = await supabase.rpc('ensure_evaluation_calendar_periods', { p_year: year });
    if (ensureError) throw new Error(ensureError.message || 'Unable to prepare evaluation periods.');
  }

  const { data, error } = await supabase
    .from('evaluation_timelines')
    .select('id, name, type, rollout_date, end_date, status')
    .order('rollout_date', { ascending: false });
  if (error) throw new Error(error.message || 'Unable to load evaluation timelines.');
  return (data || []).map(mapEvaluationTimelineOption);
};

export const buildEvaluationYearOptions = (timelines: EvaluationTimelineOption[], selectedYear?: number) => {
  const currentYear = new Date().getFullYear();
  const years = new Set<number>(Array.from({ length: 6 }, (_, index) => currentYear - index));
  timelines.forEach(timeline => years.add(timeline.year));
  if (selectedYear) years.add(selectedYear);
  return [...years].sort((a, b) => b - a);
};
