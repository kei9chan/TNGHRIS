// src/context/AuthContext.tsx
import React, { createContext, useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import { User, Role } from '../types';
import { isTransientNetworkError, retryTransientSupabaseRead, supabase } from '../services/supabaseClient';
import { withAuthDeadline } from '../services/authDeadline';
import { fetchEffectiveRbacSnapshot } from '../services/rbacService';

// Keep this so existing imports don't break.
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
  authError: string | null;
  retryAuth: () => void;
  login: (email: string, pass: string) => Promise<User | null>;
  forceLogin: (email: string, pass: string) => Promise<User | null>;
  loginWithGoogle: () => Promise<User | null>;
  logout: () => void;
  connectGoogle: () => void;
  refreshUser: () => Promise<User | null>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

// --- helpers --------------------------------------------------------

type SupabaseUser = {
  id: string;
  email?: string | null;
};

/**
 * Map a string coming from DB -> Role enum.
 */
const mapRoleFromDb = (raw: string | null): Role | null => {
  if (!raw) return null;
  const trimmed = raw.trim();

  // exact enum key match, e.g. "Admin"
  if ((Role as any)[trimmed]) {
    return (Role as any)[trimmed] as Role;
  }

  // case-insensitive match against enum values
  const upper = trimmed.toUpperCase();
  const match = Object.values(Role).find(
    (val) => String(val).toUpperCase() === upper
  );
  return (match as Role) ?? null;
};

const isActiveStatus = (status?: string | null) =>
  (status || '').toString().toLowerCase() === 'active';

type AuthNotice = 'hr_pending' | 'account_inactive' | 'authorization_unavailable';

const setAuthNotice = (notice: AuthNotice) => {
  try {
    localStorage.setItem('authNotice', notice);
  } catch {
    // ignore storage failures
  }
};

const setHrPendingNotice = () => setAuthNotice('hr_pending');
const setAccountInactiveNotice = () => setAuthNotice('account_inactive');
const setAuthorizationUnavailableNotice = () => setAuthNotice('authorization_unavailable');
const ACTIVE_SESSION_RECHECK_MS = 5 * 60_000;
const profileHydrationInFlight = new Map<string, Promise<User | null>>();

/**
 * Build a User directly from Supabase data — no more legacy mock merging.
 */
const applyAuthUserId = (
  sbUser: SupabaseUser,
  base: User
): User => {
  return { ...base, authUserId: sbUser.id };
};

/**
 * Given a Supabase auth user, load their HRIS profile and build our app User.
 * Uses the hris_users table: id, full_name, role, status, auth_user_id.
 * Unknown, inactive, or missing role assignments fail closed. A Supabase
 * account is not an HRIS account until it has an active approved assignment.
 */
const loadAppUserFromSupabase = async (
  sbUser: SupabaseUser | null
): Promise<User | null> => {
  if (!sbUser) return null;

  const [{ data: bootstrapData, error }, { data: rbacData, error: rbacError }] = await Promise.all([
    retryTransientSupabaseRead(() => supabase.rpc('get_my_hris_bootstrap')),
    fetchEffectiveRbacSnapshot(sbUser.id),
  ]);
  const data = bootstrapData as any;

  if (error) {
    console.error('AuthProvider: failed to load HRIS profile', error);
    if (isTransientNetworkError(error)) {
      throw new SupabaseAuthError('The authorization service could not be reached. Please try again.', 'network_unavailable');
    }
    throw new SupabaseAuthError(`Unable to load your HRIS access profile: ${error.message}`, 'rbac_profile_error');
  }

  if (!data) {
    console.warn('AuthProvider: no hris_users row found', sbUser.id);
    return null;
  }

  if (!isActiveStatus(data.status)) {
    throw new SupabaseAuthError(
      'Your HRIS account is inactive. Contact HR or an administrator if access should be restored.',
      'account_inactive'
    );
  }

  const mappedRole = mapRoleFromDb(data.role);
  if (!mappedRole) {
    throw new SupabaseAuthError(`Unknown or inactive HRIS role: ${data.role || 'none'}`, 'invalid_role');
  }

  if (rbacError) {
    if (isTransientNetworkError(rbacError)) {
      throw new SupabaseAuthError('The authorization service could not be reached. Please try again.', 'network_unavailable');
    }
    throw new SupabaseAuthError(`Unable to resolve effective permissions: ${rbacError.message}`, 'rbac_resolver_error');
  }
  const effective = (rbacData || {}) as any;
  if (!effective.authorized) {
    throw new SupabaseAuthError(effective.diagnostic || 'No active approved role assignment was found.', 'inactive_role');
  }
  const effectiveRoles = (effective.roles || []).map((role: string) => mapRoleFromDb(role)).filter(Boolean) as Role[];
  const primaryRole = mapRoleFromDb(effective.primaryRole) || mappedRole;

  const appUser: User = {
    id: data.id ?? sbUser.id,
    name: data.full_name ?? sbUser.email ?? 'User',
    email: data.email ?? (sbUser.email as string) ?? '',
    role: primaryRole,
    status: data.status as 'Active' | 'Inactive',
    department: data.department ?? '',
    departmentId: (data as any)?.department_id ?? undefined,
    businessUnit: data.business_unit ?? '',
    businessUnitId: (data as any)?.business_unit_id ?? undefined,
    position: data.position ?? '',
    employeeId: (data as any)?.employee_id,
    dateHired: data.date_hired ? new Date(data.date_hired) : new Date(),
    isPhotoEnrolled: data.is_photo_enrolled ?? false,
    managerId: (data as any)?.reports_to ?? undefined,
    roles: effectiveRoles,
    dashboardType: effective.dashboardType || (data as any)?.dashboard_type || 'employee',
    accessScope: effective.dataScope || (data as any)?.data_access_scope || { type: 'SELF' },
    sensitivePermissions: effective.sensitive || {},
    workflowPermissions: effective.workflows || {},
    authorizationDiagnostic: (data as any)?.permission_diagnostic || undefined,
    permissionUpdatedAt: (data as any)?.permission_updated_at ? new Date((data as any).permission_updated_at) : undefined,
    permissionUpdatedBy: (data as any)?.permission_updated_by || undefined,
  } as User;

  return applyAuthUserId(sbUser, appUser);
};

/**
 * Supabase can emit an auth-state event while the explicit login/initial-load
 * path is hydrating the same account. Share that work so bootstrap and RBAC
 * are not fetched twice during dashboard startup.
 */
const buildAppUserFromSupabase = (
  sbUser: SupabaseUser | null
): Promise<User | null> => {
  if (!sbUser) return Promise.resolve(null);

  const existing = profileHydrationInFlight.get(sbUser.id);
  if (existing) return existing;

  const hydration = withAuthDeadline(loadAppUserFromSupabase(sbUser));
  profileHydrationInFlight.set(sbUser.id, hydration);
  const clearHydration = () => {
    if (profileHydrationInFlight.get(sbUser.id) === hydration) {
      profileHydrationInFlight.delete(sbUser.id);
    }
  };
  void hydration.then(clearHydration, clearHydration);
  return hydration;
};

// --- provider -------------------------------------------------------

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const authGeneration = useRef(0);
  const explicitLogin = useRef(false);
  const currentUser = useRef(user);
  currentUser.current = user;
  const retryAuth = () => setRetryVersion(v => v + 1);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    const generation = authGeneration.current;
    const { data, error } = await withAuthDeadline(retryTransientSupabaseRead(() => supabase.auth.getUser()));
    if (generation !== authGeneration.current) return null;
    if (error || !data.user) {
      if (!error) setUser(null);
      return null;
    }

    const refreshed = await buildAppUserFromSupabase(data.user as SupabaseUser);
    if (generation !== authGeneration.current) return null;
    if (refreshed) setUser(refreshed);
    return refreshed;
  }, []);

  // On first load, get current Supabase session + HRIS profile
  useEffect(() => {
    let mounted = true;

    const generation = ++authGeneration.current;
    const init = async () => {
      setLoading(true);
      setAuthError(null);
      try {
        // Session storage supplies only an identity hint. Both server RPCs must
        // verify the current account and permissions before it is exposed.
        const { data, error } = await withAuthDeadline(supabase.auth.getSession());
        if (!mounted || generation !== authGeneration.current) return;
        if (error) throw error;
        if (!data.session?.user) { setUser(null); return; }
        await hydrateSupabaseUser(data.session.user as SupabaseUser, false, generation);
      } catch (error) {
        if (mounted && generation === authGeneration.current) {
          console.error('[Auth] startup verification failed', error);
          setUser(null);
          setAuthError('HRIS could not verify your access in time. Retry the connection.');
        }
      } finally {
        if (mounted && generation === authGeneration.current) setLoading(false);
      }
    };

    void init();

    // Keep auth state in sync if Supabase session changes
    const pendingAuthTimers = new Set<number>();
    const { data: sub } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || explicitLogin.current) return;
        if (!session?.user) {
          ++authGeneration.current;
          setUser(null);
          setLoading(false);
          return;
        }
        if (event === 'SIGNED_IN' && currentUser.current?.authUserId === session.user.id) return;
        const eventGeneration = ++authGeneration.current;
        const sameAccount = currentUser.current?.authUserId === session.user.id;
        if (!sameAccount) setUser(null);
        setLoading(true);
        // Supabase warns against starting client API calls inside this callback.
        // Defer profile hydration until the auth event's internal lock is released.
        const timerId = window.setTimeout(() => {
          pendingAuthTimers.delete(timerId);
          if (!mounted || eventGeneration !== authGeneration.current) return;
          setLoading(true);
          void hydrateSupabaseUser(session.user as SupabaseUser, sameAccount, eventGeneration)
            .finally(() => { if (mounted && eventGeneration === authGeneration.current) setLoading(false); });
        }, 0);
        pendingAuthTimers.add(timerId);
      }
    );

    return () => {
      mounted = false;
      ++authGeneration.current;
      pendingAuthTimers.forEach(timerId => window.clearTimeout(timerId));
      pendingAuthTimers.clear();
      sub.subscription.unsubscribe();
    };
  }, [retryVersion]);

  /**
   * Resolve the server-side RBAC profile before exposing a signed-in user to
   * the application. Unknown or broken assignments never become Employee.
   */
  const hydrateSupabaseUser = async (sbUser: SupabaseUser, preserveExisting = false, generation = authGeneration.current) => {
    if (!preserveExisting) {
      setUser(null);
    }

    try {
      const hydrated = await buildAppUserFromSupabase(sbUser);
      if (generation !== authGeneration.current) return;
      setAuthError(null);
      if (hydrated) {
        if (!isActiveStatus(hydrated.status)) {
          setAccountInactiveNotice();
          await withAuthDeadline(supabase.auth.signOut(), 4_000).catch(() => { });
          setUser(null);
          return;
        }
        setUser(hydrated);
        return;
      }
      // No HRIS profile yet -> treat as pending HR approval
      setHrPendingNotice();
      await withAuthDeadline(supabase.auth.signOut(), 4_000).catch(() => { });
      setUser(null);
    } catch (err) {
      if (generation !== authGeneration.current) return;
      console.error('[Auth] hydrateSupabaseUser failed to load HRIS profile', err);
      if (isTransientNetworkError(err)) {
        if (!preserveExisting || !currentUser.current) {
          setUser(null);
          setAuthError('HRIS could not verify your access in time. Retry the connection.');
        }
        return;
      }
      if (err instanceof SupabaseAuthError && err.code === 'network_unavailable') {
        if (!preserveExisting) {
          setAuthorizationUnavailableNotice();
          setUser(null);
        }
        return;
      }
      if (err instanceof SupabaseAuthError && err.code === 'account_inactive') {
        setAccountInactiveNotice();
      } else if (err instanceof SupabaseAuthError && (
        err.code === 'rbac_profile_error' || err.code === 'rbac_resolver_error'
      )) {
        setAuthorizationUnavailableNotice();
      } else {
        setAuthorizationUnavailableNotice();
      }
      await withAuthDeadline(supabase.auth.signOut(), 4_000).catch(() => { });
      setUser(null);
    }
  };

  // Backend status and Supabase Auth revocation are authoritative. Recheck an
  // open browser periodically and whenever it regains focus so an employee who
  // is offboarded in another session is signed out without a hard refresh.
  useEffect(() => {
    if (!user?.authUserId) return;

    let disposed = false;
    let checking = false;

    const validateActiveAccount = async () => {
      if (checking || disposed) return;
      checking = true;
      try {
        const { data, error } = await retryTransientSupabaseRead(
          () => supabase.rpc('get_my_hris_bootstrap')
        );
        if (error) {
          console.warn('[Auth] active-session recheck failed', error);
          return;
        }
        const profile = data as any;
        if (!profile || !isActiveStatus(profile.status)) {
          setAccountInactiveNotice();
          await withAuthDeadline(supabase.auth.signOut(), 4_000).catch(() => { });
          if (!disposed) setUser(null);
        }
      } finally {
        checking = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void validateActiveAccount();
    };

    const intervalId = window.setInterval(() => void validateActiveAccount(), ACTIVE_SESSION_RECHECK_MS);
    window.addEventListener('focus', validateActiveAccount);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', validateActiveAccount);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.authUserId]);

  const login = async (
    email: string,
    pass: string
  ): Promise<User | null> => {

    if (explicitLogin.current) throw new SupabaseAuthError('Sign-in is already in progress.');
    explicitLogin.current = true;
    const generation = ++authGeneration.current;
    setLoading(true);
    setAuthError(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      // -- 1) Try Supabase first ----------------------------------------------
      let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'] = {
        user: null,
        session: null,
      };
      let error: any = null;

      try {
        const result = await withAuthDeadline(supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: pass,
        }));
        data = result.data;
        error = result.error;
      } catch (err) {
        console.error('[Auth] Supabase signInWithPassword threw', err);
        error = err;
      }



      let supabaseErrorCode =
        (error as any)?.code || (error instanceof SupabaseAuthError ? error.code : undefined);
      let supabaseErrorMsg =
        error?.message ??
        (supabaseErrorCode === 'email_not_confirmed'
          ? 'Please verify your email before signing in.'
          : 'Login failed. Please check your credentials.');
      if (error && /banned|disabled|inactive/i.test(String(error?.message || ''))) {
        supabaseErrorCode = 'account_inactive';
        supabaseErrorMsg = 'Your HRIS account is inactive. Contact HR or an administrator if access should be restored.';
      }

      if (error && isTransientNetworkError(error)) {
        supabaseErrorCode = 'network_unavailable';
      }
      if (!error && data?.user && data?.session) {
        console.log('[Auth] Supabase signInWithPassword succeeded');
        const sbUser = data.user as SupabaseUser;
        const profile = await buildAppUserFromSupabase(sbUser);
        if (!profile) {
          setHrPendingNotice();
          await withAuthDeadline(supabase.auth.signOut(), 4_000).catch(() => { });
          throw new SupabaseAuthError(
            'Your account is pending HR approval.',
            'hr_pending'
          );
        }
        const userCandidate = profile;
        const statusLower = (userCandidate.status || '').toString().toLowerCase();
        const isActive = statusLower === 'active';
        if (!isActive) {
          setAccountInactiveNotice();
          await withAuthDeadline(supabase.auth.signOut(), 4_000).catch(() => { });
          throw new SupabaseAuthError(
            'Your HRIS account is inactive. Contact HR or an administrator if access should be restored.',
            'account_inactive'
          );
        }

        if (generation !== authGeneration.current) return null;
        setUser(userCandidate);
        return userCandidate;
      }

      console.warn('[Auth] signInWithPassword failed', error);
      throw new SupabaseAuthError(supabaseErrorMsg, supabaseErrorCode);
    } finally {
      explicitLogin.current = false;
      if (generation === authGeneration.current) setLoading(false);
    }
  };

  // For now, forceLogin behaves the same as login (no device binding yet).
  const forceLogin = login;

  const loginWithGoogle = async (): Promise<User | null> => {
    alert('Google login is not wired to Supabase yet.');
    return null;
  };

  const logout = () => {
    ++authGeneration.current;
    setUser(null);
    setLoading(false);
    setAuthError(null);
    supabase.auth
      .signOut()
      .catch((err) => console.error('AuthProvider.logout error', err))
      .finally(() => setUser(null));
  };

  const connectGoogle = () => {
    alert('Google Calendar and recruitment email are managed securely by the TNG HRIS server. No personal Google connection is required.');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        retryAuth,
        login,
        forceLogin,
        loginWithGoogle,
        logout,
        connectGoogle,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
