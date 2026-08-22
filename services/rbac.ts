import { AccessScope, BusinessUnit, Permission } from '../types';

export type EffectivePermissionMap = Record<string, Permission[]>;

export interface RoleMetadata {
  id: string;
  dashboardType: 'employee' | 'manager' | 'hr' | 'executive';
}

export const resolveRoleMetadata = (
  roleId: string | null | undefined,
  roles: RoleMetadata[],
): RoleMetadata => {
  const resolved = roleId ? roles.find(role => role.id === roleId) : undefined;
  if (!resolved) {
    throw new Error('Your account has an invalid role assignment. Please contact an administrator.');
  }
  return resolved;
};

const ALL_ACTIONS: Permission[] = [
  Permission.View,
  Permission.Create,
  Permission.Edit,
  Permission.Approve,
  Permission.Manage,
];

export const normalizeAccessScope = (value: unknown): AccessScope => {
  if (!value || typeof value !== 'object') return { type: 'HOME_ONLY' };
  const candidate = value as { type?: unknown; allowedBuIds?: unknown };
  if (candidate.type === 'GLOBAL') return { type: 'GLOBAL' };
  if (candidate.type === 'SPECIFIC') {
    return {
      type: 'SPECIFIC',
      allowedBuIds: Array.isArray(candidate.allowedBuIds)
        ? [...new Set(candidate.allowedBuIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
        : [],
    };
  }
  return { type: 'HOME_ONLY' };
};

export const expandPermissions = (permissions: Permission[] = []): Permission[] => {
  if (permissions.includes(Permission.Manage)) return ALL_ACTIONS;
  const expanded = new Set(permissions);
  if (
    expanded.has(Permission.Create) ||
    expanded.has(Permission.Edit) ||
    expanded.has(Permission.Approve)
  ) {
    expanded.add(Permission.View);
  }
  return [...expanded];
};

export const canFromPermissions = (
  permissionMap: EffectivePermissionMap,
  resource: string,
  action: Permission,
  superAdmin = false,
): boolean => {
  if (superAdmin) return true;
  return expandPermissions(permissionMap[resource]).includes(action);
};

export const allowedBusinessUnitIds = (
  scope: AccessScope,
  homeBusinessUnitId?: string,
): string[] | null => {
  if (scope.type === 'GLOBAL') return null;
  if (scope.type === 'SPECIFIC') return scope.allowedBuIds || [];
  return homeBusinessUnitId ? [homeBusinessUnitId] : [];
};

export const filterBusinessUnitsByScope = (
  businessUnits: BusinessUnit[],
  scope: AccessScope,
  homeBusinessUnitId?: string,
): BusinessUnit[] => {
  const allowed = allowedBusinessUnitIds(scope, homeBusinessUnitId);
  if (allowed === null) return businessUnits;
  const allowedSet = new Set(allowed);
  return businessUnits.filter(unit => allowedSet.has(unit.id));
};

export const dispatchRbacInvalidation = () => {
  window.dispatchEvent(new CustomEvent('hris:rbac-invalidated'));
};
