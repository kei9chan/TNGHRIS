import React from 'react';
import { Navigate } from 'react-router-dom';
import { Permission, Resource } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';

const LoadingAccess = () => (
  <div className="flex min-h-[50vh] items-center justify-center" aria-label="Resolving access">
    <div className="h-12 w-12 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
  </div>
);

export const AccessDenied: React.FC<{ detail?: string }> = ({ detail }) => (
  <main className="mx-auto mt-12 max-w-xl rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
    <p className="text-sm font-semibold uppercase tracking-wide text-red-600">403 Access Denied</p>
    <h1 className="mt-2 text-2xl font-bold text-slate-900">You do not have access to this page.</h1>
    <p className="mt-3 text-slate-600">
      {detail || 'Ask an HRIS administrator to review your assigned role and permissions.'}
    </p>
  </main>
);

interface PermissionRouteProps {
  children: React.ReactElement;
  resource: Resource | string;
  action?: Permission;
}

const PermissionRoute: React.FC<PermissionRouteProps> = ({
  children,
  resource,
  action = Permission.View,
}) => {
  const { user, loading: authLoading, profileError } = useAuth();
  const { can, loading: permissionsLoading, error } = usePermissions();

  if (authLoading || permissionsLoading) return <LoadingAccess />;
  if (!user) {
    return profileError ? <AccessDenied detail={profileError} /> : <Navigate to="/login" replace />;
  }
  if (error) return <AccessDenied detail={error} />;
  if (!can(resource, action)) return <AccessDenied />;
  return children;
};

export default PermissionRoute;
