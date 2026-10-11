import { isOpen, matchesFilter } from './presentation';
import type { OpsAssignment } from './types';

export const todayCategories = ['Events', 'Maintenance', 'Daily Checklists', 'Other Tasks'] as const;
export function todayCategory(assignment: OpsAssignment): typeof todayCategories[number] {
  if (assignment.event) return 'Events';
  if (assignment.maintenance) return 'Maintenance';
  return assignment.kind === 'checklist' ? 'Daily Checklists' : 'Other Tasks';
}
export function todayWork(assignments: OpsAssignment[], now = new Date()): OpsAssignment[] {
  const rows = assignments.filter(a => isOpen(a) && (matchesFilter(a, 'Due Today', now) || matchesFilter(a, 'Overdue', now) || !!(a.event && new Date(a.event.start) <= now && now < new Date(a.event.end))))
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  const seen = new Set<string>();
  return rows.filter(a => {
    const key = a.execution?.shared && a.checklist_run_id ? `run:${a.checklist_run_id}` : a.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
