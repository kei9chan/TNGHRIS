import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../services/supabaseClient';
import { PermissionsMatrix, Role, Resource, Permission } from '../types';

interface PermissionsContextType {
    permissionsMatrix: Record<string, Partial<Record<Resource, Permission[]>>>;
    loadingPermissions: boolean;
    refreshPermissions: () => Promise<void>;
}

export const PermissionsContext = createContext<PermissionsContextType>({
    permissionsMatrix: {},
    loadingPermissions: true,
    refreshPermissions: async () => {},
});

export const PermissionsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Store matrix with lowercase role keys for case-insensitive matching
    const [permissionsMatrix, setPermissionsMatrix] = useState<Record<string, Partial<Record<Resource, Permission[]>>>>({});
    const [loadingPermissions, setLoadingPermissions] = useState<boolean>(true);

    const refreshPermissions = async () => {
        setLoadingPermissions(true);
        try {
            const { data: permRows, error } = await supabase
                .from('role_permissions')
                .select('role_id, resource_id, permissions');

            if (error) {
                console.error('Failed to fetch role permissions:', error);
                setLoadingPermissions(false);
                return;
            }

            const matrix: Record<string, Partial<Record<Resource, Permission[]>>> = {};
            (permRows || []).forEach((row: any) => {
                const roleKey = (row.role_id || '').toLowerCase();
                if (!matrix[roleKey]) {
                    matrix[roleKey] = {};
                }
                (matrix[roleKey] as any)[row.resource_id] = row.permissions || [];
            });

            setPermissionsMatrix(matrix);
        } catch (err) {
            console.error('Error fetching role permissions:', err);
        } finally {
            setLoadingPermissions(false);
        }
    };

    useEffect(() => {
        refreshPermissions();
    }, []);

    return (
        <PermissionsContext.Provider value={{ permissionsMatrix, loadingPermissions, refreshPermissions }}>
            {children}
        </PermissionsContext.Provider>
    );
};

export const usePermissionsContext = () => useContext(PermissionsContext);
