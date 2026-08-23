import { createClient } from '@supabase/supabase-js';

const getEnv = (key: string) => {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : null;
};

const recruitmentRoles = new Set(['HR Manager', 'HR Staff', 'Board of Director']);

export const getBearerToken = (req: any) => {
  const header = req?.headers?.authorization || req?.headers?.Authorization || '';
  return typeof header === 'string' && header.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : null;
};

/**
 * Server-side guard for recruitment actions. The browser permission checks are
 * useful for UX, but calendar and email side effects must also be protected at
 * the API boundary.
 */
export const authorizeRecruitmentRequest = async (req: any) => {
  const token = getBearerToken(req);
  const url = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
  const anonKey = getEnv('SUPABASE_ANON_KEY') || getEnv('VITE_SUPABASE_ANON_KEY');
  if (!token || !url || !anonKey) {
    throw Object.assign(new Error('Authentication is required for this recruitment action.'), { statusCode: 401 });
  }

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user) {
    throw Object.assign(new Error('Your session has expired. Please sign in again.'), { statusCode: 401 });
  }

  let { data: profile, error: profileError } = await client
    .from('hris_users')
    .select('id,role,full_name,email')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (!profile && !profileError && authData.user.email) {
    const fallback = await client
      .from('hris_users')
      .select('id,role,full_name,email')
      .eq('email', authData.user.email)
      .maybeSingle();
    profile = fallback.data;
    profileError = fallback.error;
  }

  if (profileError || !profile || !recruitmentRoles.has(String(profile.role))) {
    throw Object.assign(new Error('You do not have permission to perform this recruitment action.'), { statusCode: 403 });
  }

  return { token, authUser: authData.user, profile };
};

export const sendApiError = (res: any, error: any, fallback = 'Request failed') => {
  const status = Number(error?.statusCode) || (error?.message?.includes('required') ? 400 : 500);
  res.status(status).json({ error: error?.message || fallback });
};
