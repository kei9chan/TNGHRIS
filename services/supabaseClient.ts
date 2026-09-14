import { recordRequestTiming } from './performanceTelemetry';
import { createClient } from '@supabase/supabase-js';
import { fetchWithAuthTimeout, withAuthDeadline } from './authDeadline';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: async (input, init) => {
    const started = performance.now();
    let response: Response;
    try { response = await fetchWithAuthTimeout(input, init); }
    catch (error) { recordRequestTiming(input, started, 0); throw error; }
    recordRequestTiming(input, started, response.status);
    if (!response.ok && typeof window !== 'undefined') {
      void response.clone().json().then(body => {
        if (body?.message === 'ACKNOWLEDGMENT_REQUIRED') window.dispatchEvent(new Event('acknowledgment-required'));
      }).catch(() => {});
    }
    return response;
  } },
});

type SupabaseReadResult = { error?: unknown };

const TRANSIENT_DELAYS_MS = [250, 800] as const;

export const isTransientNetworkError = (error: unknown): boolean => {
  if (!error) return false;
  const candidate = error as any;
  if (['authorization_timeout', 'network_unavailable'].includes(candidate?.code) || candidate?.isAcquireTimeout === true) return true;
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
  operation: () => PromiseLike<T>,
  signal?: AbortSignal,
): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    signal?.throwIfAborted();
    try {
      const result = await operation();
      if (!result.error || !isTransientNetworkError(result.error) || attempt >= TRANSIENT_DELAYS_MS.length) {
        return result;
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (!isTransientNetworkError(error)) throw error;
      if (attempt >= TRANSIENT_DELAYS_MS.length) return { error } as T;
    }

    await new Promise(resolve => window.setTimeout(resolve, TRANSIENT_DELAYS_MS[attempt]));
  }
};

/** One deadline across all attempts; abort the underlying read when it expires.
 * Only use for reads: a cancelled write can still have committed on the server.
 */
export const boundedAuthRead = async <T extends SupabaseReadResult>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
): Promise<T> => {
  const controller = new AbortController();
  try {
    return await withAuthDeadline(
      retryTransientSupabaseRead(() => operation(controller.signal), controller.signal),
    );
  } finally {
    controller.abort();
  }
};
