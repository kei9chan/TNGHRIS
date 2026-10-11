import type { OpsWorkspace } from './types';

export const operationsMainViews = ['Today', 'Progress', 'Tasks', 'Settings'];

// Use the same server-returned capabilities in the page and the app menu.
export function operationsToolViews(workspace: OpsWorkspace | null): string[] {
  if (!workspace) return [];
  const libraries = workspace.masterAdmin || workspace.units.some(unit => unit.edit || unit.assign);
  const team = workspace.units.some(unit => unit.manage || unit.assign) || workspace.assignments.some(a => a.assignee_id !== workspace.actor);
  return [
    ...(libraries ? ['Task Library', 'Checklist Library'] : []),
    ...(workspace.masterAdmin || workspace.units.some(unit => unit.edit) ? ['Create Checklist'] : []),
    ...(workspace.units.some(unit => unit.assign) ? ['Assign Tasks'] : []),
    ...(libraries || team ? ['Scheduling'] : []),
    ...(workspace.units.some(unit => unit.manage && unit.edit && unit.assign) ? ['Events'] : []),
    ...(workspace.units.some(unit => unit.review) ? ['Review'] : []),
    ...(libraries || team ? ['Team Progress'] : []),
    'Maintenance', 'Coverage',
  ];
}
