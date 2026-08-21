import { Permission, Role, User } from '../types';

export type RoleBearingUser = Pick<User, 'role' | 'roleIds'> | null | undefined;

export const getUserRoleIds = (user: RoleBearingUser): Role[] => {
  if (!user) return [];
  const values = [user.role, ...(user.roleIds || [])].filter(Boolean) as Role[];
  return [...new Set(values)];
};

export const hasRole = (user: RoleBearingUser, role: Role): boolean =>
  getUserRoleIds(user).includes(role);

export const hasAnyRole = (user: RoleBearingUser, roles: Role[]): boolean => {
  const assigned = new Set(getUserRoleIds(user));
  return roles.some(role => assigned.has(role));
};

export const mergeRolePermissions = (
  roleIds: Role[],
  matrix: Partial<Record<Role, Permission[]>>,
): Permission[] => {
  const merged = new Set<Permission>();
  roleIds.forEach(roleId => (matrix[roleId] || []).forEach(permission => merged.add(permission)));
  return [...merged];
};

export const mergeResourcePermissions = <TResource extends string>(
  roleIds: Role[],
  matrix: Partial<Record<Role, Partial<Record<TResource, Permission[]>>>>,
  resource: TResource,
): Permission[] => {
  const merged = new Set<Permission>();
  roleIds.forEach(roleId =>
    (matrix[roleId]?.[resource] || []).forEach(permission => merged.add(permission)),
  );
  return [...merged];
};

export const permissionSetAllows = (
  permissions: Permission[],
  requested: Permission,
): boolean => {
  if (permissions.includes(Permission.Manage)) return true;
  if (requested === Permission.View && permissions.length > 0) return true;
  return permissions.includes(requested);
};
