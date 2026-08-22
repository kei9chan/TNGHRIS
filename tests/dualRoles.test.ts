import { describe, expect, it } from 'vitest';
import { Permission, Role, User } from '../types';
import {
  getUserRoleIds,
  hasAnyRole,
  hasRole,
  mergeResourcePermissions,
  mergeRolePermissions,
  permissionSetAllows,
} from '../services/roleAccess';

const userWithRoles = (primary: Role, roleIds: Role[]): User => ({
  id: 'user-id',
  name: 'Test User',
  email: 'test@example.com',
  role: primary,
  roleIds,
  department: '',
  businessUnit: '',
  status: 'Active',
  isPhotoEnrolled: false,
  dateHired: new Date('2026-01-01'),
  position: '',
});

describe('limited dual-role resolution', () => {
  it('recognizes the owner combination as both Admin and BOD', () => {
    const user = userWithRoles(Role.BOD, [Role.BOD, Role.Admin]);
    expect(hasRole(user, Role.Admin)).toBe(true);
    expect(hasRole(user, Role.BOD)).toBe(true);
    expect(hasRole(user, Role.IT)).toBe(false);
  });

  it('recognizes the IT combination without inventing BOD authority', () => {
    const user = userWithRoles(Role.IT, [Role.IT, Role.Admin]);
    expect(hasRole(user, Role.Admin)).toBe(true);
    expect(hasRole(user, Role.IT)).toBe(true);
    expect(hasRole(user, Role.BOD)).toBe(false);
  });

  it('retains the primary role and removes duplicate assignments', () => {
    const user = userWithRoles(Role.BOD, [Role.Admin, Role.BOD, Role.Admin]);
    expect(getUserRoleIds(user)).toEqual([Role.BOD, Role.Admin]);
  });

  it('does not infer BOD from Admin alone', () => {
    const user = userWithRoles(Role.Admin, [Role.Admin]);
    expect(hasAnyRole(user, [Role.BOD])).toBe(false);
  });
});

describe('effective feature permissions', () => {
  it('unions permissions from both roles', () => {
    const permissions = mergeRolePermissions([Role.BOD, Role.Admin], {
      [Role.BOD]: [Permission.Approve],
      [Role.Admin]: [Permission.Manage],
    });
    expect(permissions).toEqual(expect.arrayContaining([Permission.Approve, Permission.Manage]));
  });

  it('unions resource permissions without affecting unrelated resources', () => {
    const matrix: Partial<Record<Role, Partial<Record<string, Permission[]>>>> = {
      [Role.BOD]: { WFH: [Permission.Approve] },
      [Role.IT]: { Helpdesk: [Permission.Manage] },
    };
    expect(mergeResourcePermissions([Role.BOD, Role.Admin], matrix, 'WFH'))
      .toEqual([Permission.Approve]);
    expect(mergeResourcePermissions([Role.IT, Role.Admin], matrix, 'WFH'))
      .toEqual([]);
  });

  it('treats Manage as an explicit feature-level superset', () => {
    expect(permissionSetAllows([Permission.Manage], Permission.Approve)).toBe(true);
    expect(permissionSetAllows([Permission.View], Permission.Approve)).toBe(false);
  });
});
