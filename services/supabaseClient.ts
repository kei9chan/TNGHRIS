import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

type SupabaseReadResult = { error?: unknown };

const TRANSIENT_DELAYS_MS = [250, 800] as const;

export const isTransientNetworkError = (error: unknown): boolean => {
  if (!error) return false;
  const candidate = error as any;
  const status = Number(candidate?.status || candidate?.statusCode || 0);
  if ([408, 502, 503, 504, 520].includes(status)) return true;

  const message = [
    candidate?.name,
    candidate?.message,
    candidate?.details,
    candidate?.hint,
    candidate?.cause?.message,
    String(error),
  ].filter(Boolean).join(' ');

  return /failed to fetch|fetch failed|network(?:error| request failed)?|load failed|connection (?:reset|refused)|timed? ?out/i.test(message);
};

/** Retry only read-only Supabase calls that failed before a response arrived. */
export const retryTransientSupabaseRead = async <T extends SupabaseReadResult>(
  operation: () => Promise<T>
): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await operation();
      if (!result.error || !isTransientNetworkError(result.error) || attempt >= TRANSIENT_DELAYS_MS.length) {
        return result;
      }
    } catch (error) {
      if (!isTransientNetworkError(error)) throw error;
      if (attempt >= TRANSIENT_DELAYS_MS.length) return { error } as T;
    }

    await new Promise(resolve => window.setTimeout(resolve, TRANSIENT_DELAYS_MS[attempt]));
  }
};
