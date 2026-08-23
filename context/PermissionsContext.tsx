import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
    const { user } = useAuth();
    const [effectiveRbac, setEffectiveRbac] = useState<EffectiveRbac | null>(null);
    const [loadingPermissions, setLoadingPermissions] = useState(true);
    const [authorizationError, setAuthorizationError] = useState<string | null>(null);

    const refreshPermissions = async () => {
        setLoadingPermissions(true);
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
            });
        } catch (err: any) {
            const diagnostic = err?.message || 'Authorization could not be loaded. Access is denied until the problem is resolved.';
            console.error('Failed to load effective RBAC:', err);
            setEffectiveRbac(emptyEffective(diagnostic));
            setAuthorizationError(diagnostic);
        } finally {
            setLoadingPermissions(false);
        }
    };

    useEffect(() => {
        if (!user) {
            setEffectiveRbac(null);
            setAuthorizationError(null);
            setLoadingPermissions(false);
            return;
        }
        refreshPermissions();
    }, [user?.id, user?.permissionUpdatedAt?.getTime()]);

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
