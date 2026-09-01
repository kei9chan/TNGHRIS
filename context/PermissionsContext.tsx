import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { supabase } from '../services/supabaseClient';
import { Resource, Permission, AccessScope } from '../types';
import { useAuth } from '../hooks/useAuth';

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
    refreshPermissions: () => Promise<void>;
}

export const PermissionsContext = createContext<PermissionsContextType>({
    permissionsMatrix: {},
    effectiveRbac: null,
    loadingPermissions: true,
    authorizationError: null,
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
    const hasLoadedRef = useRef(false);

    const refreshPermissions = useCallback(async () => {
        if (!hasLoadedRef.current) setLoadingPermissions(true);
        setAuthorizationError(null);
        try {
            const { data, error } = await supabase.rpc('get_my_effective_rbac');
            if (error) throw error;
            const payload = (data || {}) as any;
            if (!payload.authorized) {
                const diagnostic = payload.diagnostic || 'No active approved role assignment was found.';
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
        } catch (err: any) {
            const diagnostic = err?.message || 'Authorization could not be loaded. Access is denied until the problem is resolved.';
            console.error('Failed to load effective RBAC:', err);
            setEffectiveRbac(emptyEffective(diagnostic));
            setAuthorizationError(diagnostic);
        } finally {
            hasLoadedRef.current = true;
            setLoadingPermissions(false);
        }
    }, []);

    useEffect(() => {
        if (!user) {
            hasLoadedRef.current = false;
            setEffectiveRbac(null);
            setAuthorizationError(null);
            setLoadingPermissions(false);
            return;
        }
        refreshPermissions();
    }, [user?.id, user?.permissionUpdatedAt?.getTime(), refreshPermissions]);

    useEffect(() => {
        if (!user?.id) return;

        let disposed = false;
        let refreshing = false;
        const refreshAccess = async () => {
            if (disposed || refreshing) return;
            refreshing = true;
            try {
                await Promise.all([refreshPermissions(), refreshUser()]);
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
                () => void refreshAccess()
            )
            .subscribe();

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') void refreshAccess();
        };
        const intervalId = window.setInterval(() => void refreshAccess(), 30_000);
        window.addEventListener('focus', refreshAccess);
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            disposed = true;
            window.clearInterval(intervalId);
            window.removeEventListener('focus', refreshAccess);
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
            refreshPermissions,
        }}>
            {children}
        </PermissionsContext.Provider>
    );
};

export const usePermissionsContext = () => useContext(PermissionsContext);
