import React, { createContext, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AccessScope, DashboardType, User } from '../types';
import { supabase } from '../services/supabaseClient';
import { normalizeAccessScope } from '../services/rbac';

export class DeviceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceConflictError';
  }
}

export class SupabaseAuthError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'SupabaseAuthError';
    this.code = code;
  }
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  profileError: string | null;
  refreshUser: () => Promise<User | null>;
  login: (email: string, pass: string) => Promise<User | null>;
  forceLogin: (email: string, pass: string) => Promise<User | null>;
  loginWithGoogle: () => Promise<User | null>;
  logout: () => void;
  connectGoogle: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

type SupabaseUser = { id: string; email?: string | null };

const INVALID_ROLE_MESSAGE =
  'Your account has an invalid role assignment. Please contact an administrator.';

const isActiveStatus = (status?: string | null) =>
  (status || '').toString().toLowerCase() === 'active';

const setHrPendingNotice = () => {
  try {
    localStorage.setItem('authNotice', 'hr_pending');
  } catch {
    // Storage is optional.
  }
};

const buildAppUserFromSupabase = async (sbUser: SupabaseUser): Promise<User> => {
  const { data: profile, error: profileError } = await supabase
    .from('hris_users')
    .select(
      'id, full_name, role, status, department, business_unit, position, date_hired, is_photo_enrolled, email, business_unit_id, department_id, reports_to, data_access_scope, auth_user_id',
    )
    .eq('auth_user_id', sbUser.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) {
    throw new SupabaseAuthError('Your account is pending HR approval.', 'hr_pending');
  }
  if (!profile.role || typeof profile.role !== 'string') {
    throw new SupabaseAuthError(INVALID_ROLE_MESSAGE, 'invalid_role');
  }

  const { data: role, error: roleError } = await supabase
    .from('roles')
    .select('id, description, dashboard_type')
    .eq('id', profile.role)
    .maybeSingle();

  if (roleError) throw roleError;
  if (!role) throw new SupabaseAuthError(INVALID_ROLE_MESSAGE, 'invalid_role');

  return {
    id: profile.id,
    authUserId: sbUser.id,
    name: profile.full_name ?? sbUser.email ?? 'User',
    email: profile.email ?? sbUser.email ?? '',
    role: role.id,
    roleId: role.id,
    roleDescription: role.description ?? undefined,
    dashboardType: (role.dashboard_type || 'employee') as DashboardType,
    status: profile.status ?? 'Inactive',
    department: profile.department ?? '',
    departmentId: profile.department_id ?? undefined,
    businessUnit: profile.business_unit ?? '',
    businessUnitId: profile.business_unit_id ?? undefined,
    position: profile.position ?? '',
    dateHired: profile.date_hired ? new Date(profile.date_hired) : new Date(),
    isPhotoEnrolled: profile.is_photo_enrolled ?? false,
    reportsTo: profile.reports_to ?? undefined,
    managerId: profile.reports_to ?? undefined,
    accessScope: normalizeAccessScope(profile.data_access_scope) as AccessScope,
  } as User;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const currentAuthUser = useRef<SupabaseUser | null>(null);

  const hydrateSupabaseUser = useCallback(async (sbUser: SupabaseUser): Promise<User | null> => {
    currentAuthUser.current = sbUser;
    setLoading(true);
    setProfileError(null);
    try {
      const hydrated = await buildAppUserFromSupabase(sbUser);
      if (!isActiveStatus(hydrated.status)) {
        setHrPendingNotice();
        await supabase.auth.signOut().catch(() => undefined);
        setUser(null);
        return null;
      }
      setUser(hydrated);
      return hydrated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load your HRIS profile.';
      console.error('[Auth] failed to hydrate HRIS profile', error);
      setUser(null);
      setProfileError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    let sbUser = currentAuthUser.current;
    if (!sbUser) {
      const { data } = await supabase.auth.getUser();
      sbUser = data.user as SupabaseUser | null;
    }
    if (!sbUser) {
      setUser(null);
      setLoading(false);
      return null;
    }
    return hydrateSupabaseUser(sbUser);
  }, [hydrateSupabaseUser]);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (error || !data.user) {
        setUser(null);
        setLoading(false);
        return;
      }
      void hydrateSupabaseUser(data.user as SupabaseUser);
    });

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        currentAuthUser.current = null;
        setUser(null);
        setLoading(false);
        return;
      }
      void hydrateSupabaseUser(session.user as SupabaseUser);
    });

    const onFocus = () => void refreshUser();
    const onRbacInvalidated = () => void refreshUser();
    window.addEventListener('focus', onFocus);
    window.addEventListener('hris:rbac-invalidated', onRbacInvalidated);

    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('hris:rbac-invalidated', onRbacInvalidated);
    };
  }, [hydrateSupabaseUser, refreshUser]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`current-hris-user:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'hris_users', filter: `id=eq.${user.id}` },
        () => void refreshUser(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshUser, user?.id]);

  const login = async (email: string, pass: string): Promise<User | null> => {
    setLoading(true);
    setProfileError(null);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pass,
    });
    if (error || !data.user) {
      setLoading(false);
      throw new SupabaseAuthError(
        error?.message || 'Login failed. Please check your credentials.',
        error?.code,
      );
    }
    const profile = await hydrateSupabaseUser(data.user as SupabaseUser);
    if (!profile) {
      throw new SupabaseAuthError(INVALID_ROLE_MESSAGE, 'invalid_profile');
    }
    return profile;
  };

  const forceLogin = login;
  const loginWithGoogle = async (): Promise<User | null> => {
    alert('Google login is not wired to Supabase yet.');
    return null;
  };
  const logout = () => {
    void supabase.auth.signOut().finally(() => {
      currentAuthUser.current = null;
      setUser(null);
    });
  };
  const connectGoogle = () => alert('Connect Google is not implemented in Supabase yet.');

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        profileError,
        refreshUser,
        login,
        forceLogin,
        loginWithGoogle,
        logout,
        connectGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
