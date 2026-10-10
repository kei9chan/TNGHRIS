import type { OpsAssignment } from './types';
export const filters = ['All', 'Due Today', 'This Week', 'This Month', 'Completed', 'Overdue'] as const;
export type OpsFilter = typeof filters[number];
export const manilaDay = (value: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
export const formatDue = (value: string) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
export const isOpen = (a: OpsAssignment) => a.status === 'Assigned' || a.status === 'In Progress';
export function matchesFilter(a: OpsAssignment, filter: OpsFilter, now = new Date()): boolean {
  if (filter === 'All') return true;
  if (filter === 'Completed') return a.status === 'Completed';
  if (!isOpen(a)) return false;
  const today = manilaDay(now), due = manilaDay(a.due_at);
  if (filter === 'Due Today') return today === due;
  if (filter === 'Overdue') return new Date(a.due_at).getTime() < now.getTime();
  if (filter === 'This Month') return today.slice(0, 7) === due.slice(0, 7);
  const day = new Date(today + 'T00:00:00Z');
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  const start = day.toISOString().slice(0, 10); day.setUTCDate(day.getUTCDate() + 6);
  return due >= start && due <= day.toISOString().slice(0, 10);
}
export const safeUrl = (value?: string) => { try { const url = new URL(value || ''); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } };
