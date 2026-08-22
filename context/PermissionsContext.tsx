import React, { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { BusinessUnit, Permission, Resource, Role } from '../types';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabaseClient';
import {
  canFromPermissions,
  EffectivePermissionMap,
  filterBusinessUnitsByScope,
  normalizeAccessScope,
} from '../services/rbac';

interface PermissionsContextValue {
  loading: boolean;
  error: string | null;
  permissionMap: EffectivePermissionMap;
  can: (resource: Resource | string, action: Permission) => boolean;
  canAny: (resource: Resource | string, actions: Permission[]) => boolean;
  getEffectivePermissions: () => EffectivePermissionMap;
  getAccessibleBusinessUnits: (units: BusinessUnit[]) => BusinessUnit[];
  isGlobalScope: boolean;
  dashboardType: 'employee' | 'manager' | 'hr' | 'executive';
  refreshPermissions: () => Promise<void>;
}

export const PermissionsContext = createContext<PermissionsContextValue | undefined>(undefined);

export const PermissionsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionMap, setPermissionMap] = useState<EffectivePermissionMap>({});

  const isSuperAdmin = user?.role === Role.Admin;
  const scope = useMemo(() => normalizeAccessScope(user?.accessScope), [user?.accessScope]);

  const refreshPermissions = useCallback(async () => {
    if (!user?.roleId && !user?.role) {
      setPermissionMap({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const roleId = user.roleId || user.role;
    const { data, error: queryError } = await supabase
      .from('role_permissions')
      .select('resource_id, permissions')
      .eq('role_id', roleId);

    if (queryError) {
      console.error('[RBAC] failed to load effective permissions', queryError);
      setPermissionMap({});
      setError('Unable to resolve your permissions. Access has been denied for safety.');
      setLoading(false);
      return;
    }

    const next: EffectivePermissionMap = {};
    for (const row of data || []) {
      if (typeof row.resource_id !== 'string' || !Array.isArray(row.permissions)) continue;
      next[row.resource_id] = row.permissions.filter((value): value is Permission =>
        Object.values(Permission).includes(value as Permission),
      );
    }
    setPermissionMap(next);
    setLoading(false);
  }, [user?.role, user?.roleId]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }
    void refreshPermissions();
  }, [authLoading, refreshPermissions]);

  useEffect(() => {
    if (!user?.role) return;
    const refresh = () => void refreshPermissions();
    window.addEventListener('hris:rbac-invalidated', refresh);
    const channel = supabase
      .channel(`effective-permissions:${user.role}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'role_permissions', filter: `role_id=eq.${user.role}` },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'roles', filter: `id=eq.${user.role}` },
        refresh,
      )
      .subscribe();
    return () => {
      window.removeEventListener('hris:rbac-invalidated', refresh);
      void supabase.removeChannel(channel);
    };
  }, [refreshPermissions, user?.role]);

  const can = useCallback(
    (resource: Resource | string, action: Permission) =>
      !authLoading &&
      !loading &&
      !error &&
      canFromPermissions(permissionMap, resource, action, isSuperAdmin),
    [authLoading, error, isSuperAdmin, loading, permissionMap],
  );

  const value = useMemo<PermissionsContextValue>(
    () => ({
      loading: authLoading || loading,
      error,
      permissionMap,
      can,
      canAny: (resource, actions) => actions.some(action => can(resource, action)),
      getEffectivePermissions: () => permissionMap,
      getAccessibleBusinessUnits: units =>
        filterBusinessUnitsByScope(units, scope, user?.businessUnitId),
      isGlobalScope: scope.type === 'GLOBAL',
      dashboardType: user?.dashboardType || 'employee',
      refreshPermissions,
    }),
    [authLoading, can, error, loading, permissionMap, refreshPermissions, scope, user?.businessUnitId, user?.dashboardType],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
};
