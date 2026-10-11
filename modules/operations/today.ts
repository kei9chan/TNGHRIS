import { isOpen, matchesFilter } from './presentation';
import type { OpsAssignment } from './types';

export const todayCategories = ['Events', 'Maintenance', 'Daily Checklists', 'Other Tasks'] as const;
export function todayCategory(assignment: OpsAssignment): typeof todayCategories[number] {
  if (assignment.event) return 'Events';
  if (assignment.maintenance) return 'Maintenance';
  return assignment.kind === 'checklist' ? 'Daily Checklists' : 'Other Tasks';
}
export function todayWork(assignments: OpsAssignment[], now = new Date()): OpsAssignment[] {
  return assignments.filter(a => isOpen(a) && (matchesFilter(a, 'Due Today', now) || matchesFilter(a, 'Overdue', now)))
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
}
