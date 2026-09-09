import { PulseSurveyQuestion, SurveyResponse } from '../types';
export type PulseAnswer = SurveyResponse['answers'][number]['value'];
export const requiredQuestion = (q: PulseSurveyQuestion) => q.required ?? q.type === 'rating';
export const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0,4)) > 0 && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
export function validateQuestion(q: PulseSurveyQuestion): string {
  if (!q.text.trim()) return 'Enter the question text.';
  if (q.type === 'checkboxes') {
    const choices = q.choices || [];
    if (!choices.length || choices.some(c => !c.label.trim())) return 'Add at least one choice and fill in every label.';
    if (new Set(choices.map(c => c.label.trim().toLowerCase())).size !== choices.length) return 'Choice labels must be unique.';
    const min = q.minSelections ?? 0, max = q.maxSelections ?? choices.length;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || min > max || max > choices.length) return 'Selection limits must be whole numbers within the number of choices, with minimum no greater than maximum.';
  }
  if (q.type === 'date' && ((q.minDate && !validDate(q.minDate)) || (q.maxDate && !validDate(q.maxDate)) || (q.minDate && q.maxDate && q.minDate > q.maxDate))) return 'Enter valid date limits with minimum no later than maximum.';
  return '';
}
export function validateAnswer(q: PulseSurveyQuestion, value?: PulseAnswer): string {
  const empty = value === undefined || value === '' || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length);
  if (empty) return requiredQuestion(q) ? 'This question is required.' : '';
  if (q.type === 'rating') return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5 ? '' : 'Choose a rating from 1 to 5.';
  if (q.type === 'text') return typeof value === 'string' ? '' : 'Enter text.';
  if (q.type === 'yes_no') return value === 'Yes' || value === 'No' ? '' : 'Select Yes or No.';
  if (q.type === 'checkboxes') {
    if (!Array.isArray(value) || new Set(value).size !== value.length || value.some(v => !q.choices?.some(c => c.id === v))) return 'Select valid choices.';
    const min = Math.max(requiredQuestion(q) ? 1 : 0, q.minSelections ?? 0), max = q.maxSelections ?? q.choices?.length ?? 0;
    return value.length < min || value.length > max ? `Select between ${min} and ${max} choices.` : '';
  }
  if (q.type === 'date') return typeof value === 'string' && validDate(value) && (!q.minDate || value >= q.minDate) && (!q.maxDate || value <= q.maxDate) ? '' : 'Choose a valid date within the allowed range.';
  if (q.type === 'time') return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? '' : 'Choose a valid time.';
  return 'Unsupported response type.';
}
export function formatPulseAnswer(q: PulseSurveyQuestion, value?: PulseAnswer): string {
  if (value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map(id => q.choices?.find(c => c.id === id)?.label || id).join('; ');
  if (q.type === 'time' && q.timeFormat === '12' && typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)) {
    const h = Number(value.slice(0,2)); return `${h % 12 || 12}:${value.slice(3)} ${h < 12 ? 'AM' : 'PM'}`;
  }
  return String(value);
}
export const mapPulseQuestion = (q: any): PulseSurveyQuestion => ({ id: q.id, text: q.text, type: q.question_type, required: q.is_required ?? q.question_type === 'rating', choices: q.choices || [], minSelections: q.min_selections ?? undefined, maxSelections: q.max_selections ?? undefined, minDate: q.min_date || undefined, maxDate: q.max_date || undefined, timeFormat: q.time_format || '24' });
export const csvCell = (v: string) => '"' + (/^[=+@\-\t\r]/.test(v) ? "'" + v : v).replaceAll('"', '""') + '"';
