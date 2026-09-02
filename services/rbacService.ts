import { retryTransientSupabaseRead, supabase } from './supabaseClient';
import { dedupeRead } from './readCache';

const RBAC_CACHE_MS = 10_000;

export const fetchEffectiveRbacSnapshot = async (authUserId: string, force = false) => {
  try {
    const data = await dedupeRead(
      `effective-rbac:${authUserId}`,
      async () => {
        const result = await retryTransientSupabaseRead(() => supabase.rpc('get_my_effective_rbac'));
        if (result.error) throw result.error;
        return result.data;
      },
      RBAC_CACHE_MS,
      force,
    );
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

