import { describe, expect, it } from 'vitest';
import { Permission } from '../types';
import {
  allowedBusinessUnitIds,
  canFromPermissions,
  expandPermissions,
  normalizeAccessScope,
  resolveRoleMetadata,
} from '../services/rbac';

describe('dynamic roles', () => {
  it('recognizes a custom HR Head role that is not in the legacy enum', () => {
    expect(resolveRoleMetadata('HR Head', [{ id: 'HR Head', dashboardType: 'hr' }]))
      .toEqual({ id: 'HR Head', dashboardType: 'hr' });
  });

  it('fails closed for an invalid role instead of returning Employee', () => {
    expect(() => resolveRoleMetadata('Typo Role', [{ id: 'Employee', dashboardType: 'employee' }]))
      .toThrow(/invalid role assignment/i);
  });
});

describe('effective permissions', () => {
  it('expands manage to every action', () => {
    expect(expandPermissions([Permission.Manage])).toEqual(expect.arrayContaining(Object.values(Permission)));
  });

  it('lets create/edit/approve imply view', () => {
    expect(expandPermissions([Permission.Approve])).toContain(Permission.View);
  });

  it('does not let GLOBAL scope invent a feature permission', () => {
    const permissions = { Employees: [Permission.View] };
    expect(canFromPermissions(permissions, 'Payroll', Permission.View)).toBe(false);
  });

  it('uses database permission changes without role-name logic', () => {
    const permissions = { Employees: [Permission.View] };
    expect(canFromPermissions(permissions, 'Employees', Permission.View)).toBe(true);
    expect(canFromPermissions({}, 'Employees', Permission.View)).toBe(false);
  });
});

describe('data scope', () => {
  it('returns null for GLOBAL to represent every business unit', () => {
    expect(allowedBusinessUnitIds({ type: 'GLOBAL' }, 'home')).toBeNull();
  });

  it('keeps an empty SPECIFIC scope fail-closed', () => {
    expect(allowedBusinessUnitIds(normalizeAccessScope({ type: 'SPECIFIC', allowedBuIds: [] }), 'home'))
      .toEqual([]);
  });

  it('uses only the assigned unit for HOME_ONLY', () => {
    expect(allowedBusinessUnitIds({ type: 'HOME_ONLY' }, 'home')).toEqual(['home']);
  });
});
