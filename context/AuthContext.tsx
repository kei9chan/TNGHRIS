// src/context/AuthContext.tsx
import React, { createContext, useEffect, useState, ReactNode } from 'react';
import { User, Role } from '../types';
import { supabase } from '../services/supabaseClient';
import { mockUsers } from '../services/mockData';

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
  login: (email: string, pass: string) => Promise<User | null>;
  forceLogin: (email: string, pass: string) => Promise<User | null>;
  loginWithGoogle: () => Promise<User | null>;
  logout: () => void;
  connectGoogle: () => void;
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

const setHrPendingNotice = () => {
  try {
    localStorage.setItem('authNotice', 'hr_pending');
  } catch {
    // ignore storage failures
  }
};

/**
 * Legacy mock lookup by email – used as fallback while migrating.
 */
const findMockUserByEmail = (email: string): User | null => {
  const lower = email.trim().toLowerCase();
  const found = mockUsers.find((u) => u.email.toLowerCase() === lower);
  return found ?? null;
};

// Merge a Supabase-derived user with any matching mock user (by email)
// so the rest of the app that still expects mockData fields keeps working.
const mergeSupabaseWithLegacyMock = (
  sbUser: SupabaseUser,
  base: User
): User => {
  const mock = sbUser.email ? findMockUserByEmail(sbUser.email) : null;
  if (!mock) {
    return { ...base, authUserId: sbUser.id };
  }

  // Keep the mock IDs/structure for compatibility, but remember the Supabase auth id.
  return {
    ...mock,
    name: base.name || mock.name,
    email: base.email || mock.email,
    role: base.role || mock.role,
    status: base.status || mock.status,
    authUserId: sbUser.id,
  } as User;
};

/**
 * Given a Supabase auth user, load their HRIS profile and build our app User.
 * Uses the hris_users table: id, full_name, role, status, auth_user_id.
 * If there is NO hris_users row yet, we fall back to a minimal user object
 * based only on Supabase info so Supabase-only accounts can still log in.
 */
const buildAppUserFromSupabase = async (
  sbUser: SupabaseUser | null
): Promise<User | null> => {
  if (!sbUser) return null;

  const { data, error } = await supabase
    .from('hris_users')
    .select(
      'id, full_name, role, status, department, business_unit, position, date_hired, is_photo_enrolled, email'
    )
    .eq('auth_user_id', sbUser.id)
    .maybeSingle();

  if (error) {
    console.error('AuthProvider: failed to load HRIS profile', error);
    // still allow login with bare Supabase user
  }

  if (!data) {
    console.warn(
      'AuthProvider: no hris_users row found, falling back to bare Supabase user',
      sbUser.id
    );

    const fallback: User = {
      id: sbUser.id,
      name: sbUser.email ?? 'User',
      email: sbUser.email ?? '',
      role: Role.Employee,
      status: 'Active',
      department: '',
      businessUnit: '',
      position: '',
      dateHired: new Date(),
      isPhotoEnrolled: false,
    } as User;

    return mergeSupabaseWithLegacyMock(sbUser, fallback);
  }

  const mappedRole = mapRoleFromDb(data.role);

  const appUser: User = {
    id: data.id ?? sbUser.id,
    name: data.full_name ?? sbUser.email ?? 'User',
    email: data.email ?? (sbUser.email as string) ?? '',
    role: mappedRole ?? Role.Employee,
    status: data.status ?? 'Active',
    department: data.department ?? '',
    businessUnit: data.business_unit ?? '',
    position: data.position ?? '',
    dateHired: data.date_hired ? new Date(data.date_hired) : new Date(),
    isPhotoEnrolled: data.is_photo_enrolled ?? false,
  } as User;

  return mergeSupabaseWithLegacyMock(sbUser, appUser);
};

// --- provider -------------------------------------------------------

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On first load, get current Supabase session + HRIS profile
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoading(true);
      console.log('[Auth] init: calling supabase.auth.getUser()');
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        console.log('[Auth] init: no Supabase user, user=null');
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      console.log('[Auth] init: Supabase user found, hydrating app user');
      await hydrateSupabaseUser(data.user as SupabaseUser);
      if (mounted) {
        setLoading(false);
      }
    };

    init();

    // Keep auth state in sync if Supabase session changes
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] onAuthStateChange event:', event);
        if (!session?.user) {
          setUser(null);
          return;
        }
        hydrateSupabaseUser(session.user as SupabaseUser);
      }
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /**
   * Immediately set a minimal Supabase-backed user (merged with mock if present),
   * then hydrate from hris_users in the background to avoid blocking login UI.
   */
  const hydrateSupabaseUser = async (sbUser: SupabaseUser) => {
    const minimal: User = mergeSupabaseWithLegacyMock(sbUser, {
      id: sbUser.id,
      name: sbUser.email ?? 'User',
      email: sbUser.email ?? '',
      role: Role.Employee,
      status: 'Inactive',
      department: '',
      businessUnit: '',
      position: '',
      dateHired: new Date(),
      isPhotoEnrolled: false,
    } as User);

    setUser(minimal);

    try {
      const hydrated = await buildAppUserFromSupabase(sbUser);
      if (hydrated) {
        if (!isActiveStatus(hydrated.status)) {
          setHrPendingNotice();
          await supabase.auth.signOut().catch(() => {});
          setUser(null);
          return;
        }
        setUser(hydrated);
        return;
      }
      // No HRIS profile yet -> treat as pending HR approval
      setHrPendingNotice();
      await supabase.auth.signOut().catch(() => {});
      setUser(null);
    } catch (err) {
      console.error('[Auth] hydrateSupabaseUser failed to load HRIS profile', err);
      setHrPendingNotice();
      await supabase.auth.signOut().catch(() => {});
      setUser(null);
    }
  };

  const login = async (
    email: string,
    pass: string
  ): Promise<User | null> => {
    console.log('[Auth] login called with', email);
    setLoading(true);

    try {
      const normalizedEmail = email.trim();

      // -- 1) Try Supabase first ----------------------------------------------
      let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'] = {
        user: null,
        session: null,
      };
      let error: any = null;

      try {
        const result = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: pass,
        });
        data = result.data;
        error = result.error;
      } catch (err) {
        console.error('[Auth] Supabase signInWithPassword threw', err);
        error = err;
      }

      console.log('[Auth] AFTER signInWithPassword', { data, error });

      const supabaseErrorCode =
        (error as any)?.code || (error instanceof SupabaseAuthError ? error.code : undefined);
      const supabaseErrorMsg =
        error?.message ??
        (supabaseErrorCode === 'email_not_confirmed'
          ? 'Please verify your email before signing in.'
          : 'Login failed. Please check your credentials.');

      if (!error && data?.user) {
        console.log('[Auth] Supabase signInWithPassword succeeded');
        const sbUser = data.user as SupabaseUser;
        const profile = await buildAppUserFromSupabase(sbUser);
        if (!profile) {
          setHrPendingNotice();
          await supabase.auth.signOut().catch(() => {});
          throw new SupabaseAuthError(
            'Your account is pending HR approval.',
            'hr_pending'
          );
        }
        const userCandidate = profile;
        const statusLower = (userCandidate.status || '').toString().toLowerCase();
        const isActive = statusLower === 'active';
        if (!isActive) {
          setHrPendingNotice();
          await supabase.auth.signOut().catch(() => {});
          throw new SupabaseAuthError(
            'Your account is pending HR approval.',
            'hr_pending'
          );
        }

        setUser(userCandidate);
        return userCandidate;
      }

      console.warn(
        '[Auth] signInWithPassword failed, will try legacy mockUsers fallback',
        error
      );

      // 2) Legacy fallback – allow old mock users to still log in
      const legacyUser = findMockUserByEmail(normalizedEmail);
      if (legacyUser) {
        console.log('[Auth] legacy user found, attempting to mirror into Supabase');

        // Attempt to create a Supabase account for this mock user so future logins can be Supabase-first.
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: pass,
          options: { data: { full_name: legacyUser.name } },
        });

        if (signUpError && (signUpError as any)?.code !== 'user_already_exists') {
          console.warn('[Auth] Supabase signUp for legacy user failed', signUpError);
        }

        if (signUpData?.session?.user) {
          console.log('[Auth] legacy user mirrored into Supabase with active session');
          hydrateSupabaseUser(signUpData.session.user as SupabaseUser);
          return mergeSupabaseWithLegacyMock(signUpData.session.user as SupabaseUser, legacyUser);
        }

        console.log(
          '[Auth] using legacy mock user; Supabase account may need email confirmation before session starts'
        );
        setUser(legacyUser);
        return legacyUser;
      }

      console.warn(
        '[Auth] no Supabase user and no legacy mock user found for email',
        email
      );
      throw new SupabaseAuthError(supabaseErrorMsg, supabaseErrorCode);
    } finally {
      setLoading(false);
      console.log('[Auth] login finally, user =', user);
    }
  };

  // For now, forceLogin behaves the same as login (no device binding yet).
  const forceLogin = login;

  const loginWithGoogle = async (): Promise<User | null> => {
    alert('Google login is not wired to Supabase yet.');
    return null;
  };

  const logout = () => {
    supabase.auth
      .signOut()
      .catch((err) => console.error('AuthProvider.logout error', err))
      .finally(() => setUser(null));
  };

  const connectGoogle = () => {
    alert('Connect Google is not implemented in Supabase yet.');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
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
