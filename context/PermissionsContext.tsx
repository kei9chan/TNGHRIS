import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { isTransientNetworkError, supabase } from '../services/supabaseClient';
import { Resource, Permission, AccessScope } from '../types';
import { useAuth } from '../hooks/useAuth';
import { fetchEffectiveRbacSnapshot } from '../services/rbacService';

export interface EffectiveRbac {
    authorized: boolean;
    userId?: string;
    roles: string[];
    primaryRole?: string;
    dashboardType?: string;
    dataScope?: AccessScope;
    features: Partial<Record<Resource, Permission[]>>;
    sensitive: Record<string, Permission[]>;
    workflows: Record<string, Permission[]>;
    cacheVersion?: number;
    selfServiceInherited?: boolean;
    diagnostic?: string;
}

interface PermissionsContextType {
    permissionsMatrix: Record<string, Partial<Record<Resource, Permission[]>>>;
    effectiveRbac: EffectiveRbac | null;
    loadingPermissions: boolean;
    authorizationError: string | null;
    authorizationTransient: boolean;
    refreshPermissions: () => Promise<void>;
}

export const PermissionsContext = createContext<PermissionsContextType>({
    permissionsMatrix: {},
    effectiveRbac: null,
    loadingPermissions: true,
    authorizationError: null,
    authorizationTransient: false,
    refreshPermissions: async () => {},
});

const emptyEffective = (diagnostic: string): EffectiveRbac => ({
    authorized: false,
    roles: [],
    features: {},
    sensitive: {},
    workflows: {},
    diagnostic,
});

export const PermissionsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user, refreshUser } = useAuth();
    const [effectiveRbac, setEffectiveRbac] = useState<EffectiveRbac | null>(null);
    const [loadingPermissions, setLoadingPermissions] = useState(true);
    const [authorizationError, setAuthorizationError] = useState<string | null>(null);
    const [authorizationTransient, setAuthorizationTransient] = useState(false);
    const hasLoadedRef = useRef(false);
    const hasAuthorizedSnapshotRef = useRef(false);

    const loadPermissions = useCallback(async (force = false) => {
        if (!hasLoadedRef.current) setLoadingPermissions(true);
        setAuthorizationError(null);
        setAuthorizationTransient(false);
        try {
            const cacheKey = user?.authUserId || user?.id;
            if (!cacheKey) return;
            const { data, error } = await fetchEffectiveRbacSnapshot(cacheKey, force);
            if (error) throw error;
            const payload = (data || {}) as any;
            if (!payload.authorized) {
                const diagnostic = payload.diagnostic || 'No active approved role assignment was found.';
                hasAuthorizedSnapshotRef.current = false;
                setEffectiveRbac(emptyEffective(diagnostic));
                setAuthorizationError(diagnostic);
                return;
            }
            setEffectiveRbac({
                authorized: true,
                userId: payload.userId,
                roles: payload.roles || [],
                primaryRole: payload.primaryRole,
                dashboardType: payload.dashboardType,
                dataScope: payload.dataScope,
                features: payload.features || {},
                sensitive: payload.sensitive || {},
                workflows: payload.workflows || {},
                cacheVersion: payload.cacheVersion,
                selfServiceInherited: payload.selfServiceInherited === true,
            });
            hasAuthorizedSnapshotRef.current = true;
        } catch (err: any) {
            const diagnostic = err?.message || 'Authorization could not be loaded. Access is denied until the problem is resolved.';
            console.error('Failed to load effective RBAC:', err);
            if (isTransientNetworkError(err)) {
                if (hasAuthorizedSnapshotRef.current) {
                    console.warn('Keeping the last verified RBAC snapshot during a temporary network failure.');
                    setAuthorizationError(null);
                    setAuthorizationTransient(false);
                    return;
                }
                setEffectiveRbac(null);
                setAuthorizationError('The authorization service could not be reached after several attempts.');
                setAuthorizationTransient(true);
                return;
            }
            hasAuthorizedSnapshotRef.current = false;
            setEffectiveRbac(emptyEffective(diagnostic));
            setAuthorizationError(diagnostic);
        } finally {
            hasLoadedRef.current = true;
            setLoadingPermissions(false);
        }
    }, [user?.authUserId, user?.id]);

    const refreshPermissions = useCallback(() => loadPermissions(true), [loadPermissions]);

    useEffect(() => {
        if (!user) {
            hasLoadedRef.current = false;
            hasAuthorizedSnapshotRef.current = false;
            setEffectiveRbac(null);
            setAuthorizationError(null);
            setAuthorizationTransient(false);
            setLoadingPermissions(false);
            return;
        }
        void loadPermissions(false);
    }, [user?.id, user?.permissionUpdatedAt?.getTime(), loadPermissions]);

    useEffect(() => {
        if (!user?.id) return;

        let disposed = false;
        let refreshing = false;
        const refreshAccess = async (includeProfile = false) => {
            if (disposed || refreshing) return;
            refreshing = true;
            try {
                if (includeProfile) {
                    await Promise.all([refreshPermissions(), refreshUser()]);
                } else {
                    await refreshPermissions();
                }
            } catch (error) {
                console.warn('Unable to refresh effective access.', error);
            } finally {
                refreshing = false;
            }
        };

        const channel = supabase
            .channel(`rbac-cache-${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'rbac_cache_versions',
                    filter: `user_id=eq.${user.id}`,
                },
                () => void refreshAccess(true)
            )
            .subscribe();

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') void refreshAccess(false);
        };
        const handleFocus = () => void refreshAccess(false);
        const intervalId = window.setInterval(() => void refreshAccess(false), 5 * 60_000);
        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            disposed = true;
            window.clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibility);
            void supabase.removeChannel(channel);
        };
    }, [user?.id, refreshPermissions, refreshUser]);

    const permissionsMatrix = effectiveRbac?.authorized
        ? { effective: effectiveRbac.features }
        : {};

    return (
        <PermissionsContext.Provider value={{
            permissionsMatrix,
            effectiveRbac,
            loadingPermissions,
            authorizationError,
            authorizationTransient,
            refreshPermissions,
        }}>
            {children}
        </PermissionsContext.Provider>
    );
};

export const usePermissionsContext = () => useContext(PermissionsContext);
