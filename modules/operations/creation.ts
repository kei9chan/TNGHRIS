import type {OpsTemplate, OpsVersion} from './types';
import type {Config} from './schedule';

export function latestVersion(template: OpsTemplate): OpsVersion | undefined {
  return template.versions.reduce<OpsVersion | undefined>((latest, v) => !latest || v.version > latest.version ? v : latest, undefined);
}
export function publishedChoices(templates: OpsTemplate[], unit: string) {
  return templates.filter(t => t.status === 'Published' && (!t.business_unit_id || t.business_unit_id === unit)).flatMap(template => {
    const version = latestVersion(template);
    return version ? [{template, version}] : [];
  });
}
export const responseOptions = [{value:'none',label:'Check off'}, {value:'yes_no',label:'Yes / No'}, {value:'photo',label:'Photo'}, {value:'numeric',label:'Number'}, {value:'text',label:'Text'}];
export const scheduleOptions = [{value:'once',label:'One-time'}, {value:'daily',label:'Daily'}, {value:'weekly',label:'Weekly'}, {value:'monthly',label:'Monthly'}, {value:'yearly',label:'Yearly'}, {value:'dates',label:'Selected dates'}, {value:'annual_dates',label:'Times per year'}];
export function scheduleSummary(c: Config, enabled = true) {
  if (!enabled) return 'As needed · assign when ready';
  const n = c.interval || 1;
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const frequency = c.frequency === 'once' ? `Once on ${c.start_date}` : c.frequency === 'daily' ? n === 1 ? 'Every day' : `Every ${n} days` : c.frequency === 'weekly' ? `${n === 1 ? 'Weekly' : `Every ${n} weeks`} · ${c.weekdays.map(d=>days[d-1]).join(', ')}` : c.frequency === 'monthly' ? `${n === 1 ? 'Monthly' : `Every ${n} months`} · day ${c.month_day}` : c.frequency === 'yearly' ? `Every ${n} year${n===1?'':'s'}` : c.frequency === 'dates' ? `${c.service_dates?.length || 0} selected dates` : `${c.annual_dates?.length || 0} times per year`;
  return `${frequency} · ${c.anchor === 'fixed' ? `due ${c.due_time}` : c.anchor === 'shift_start' ? 'from shift start' : 'from shift end'}`;
}
export function scheduleError(c: Config, enabled = true, staffing = true) {
  if (!enabled) return '';
  if (!c.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(c.start_date)) return 'Choose a start date.';
  if (c.end_date && c.end_date < c.start_date) return 'End date must be on or after the start date.';
  if (!Number.isInteger(c.interval) || c.interval < 1 || c.interval > 366) return 'Repeat interval must be between 1 and 366.';
  if (c.frequency === 'weekly' && !c.weekdays.length) return 'Select at least one weekday.';
  if (c.frequency === 'dates' && (!c.service_dates?.length || c.service_dates.some(d=>!d))) return 'Choose the service dates.';
  if (c.frequency === 'dates' && new Set(c.service_dates).size !== c.service_dates?.length) return 'Select each date only once.';
  if (c.frequency === 'annual_dates' && (!c.annual_dates?.length || c.annual_dates.length !== c.times_per_year)) return 'Add one date for each service per year.';
  if (!c.start_time || !c.end_time || !c.due_time) return 'Choose the start, end, and due times.';
  const minutes = (s:string) => Number(s.slice(0,2))*60+Number(s.slice(3,5));
  const start = minutes(c.start_time), end = minutes(c.end_time)+c.end_day_offset*1440, due = minutes(c.due_time)+c.due_day_offset*1440;
  if (end <= start || due < start || due > end) return 'The deadline must fall within the work window. For overnight work, choose Next day.';
  if (staffing && c.anchor !== 'fixed' && (!c.reference_employee || c.duration_minutes < 1 || c.due_offset > c.duration_minutes)) return 'Choose a shift reference and a deadline within its work window.';
  return '';
}
