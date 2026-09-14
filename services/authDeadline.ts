export class AuthTimeoutError extends Error {
  readonly code = 'authorization_timeout';
  constructor() {
    super('HRIS is taking too long to verify access. Please retry.');
    this.name = 'AuthTimeoutError';
  }
}

// Includes time waiting for Supabase's session lock, not only network time.
export async function withAuthDeadline<T>(operation: PromiseLike<T>, ms = 12_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AuthTimeoutError()), ms); }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function fetchWithAuthTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!new URL(url).pathname.startsWith('/auth/v1/')) return fetch(input, init);
  const controller = new AbortController();
  const source = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort(source?.reason);
  if (source?.aborted) abort();
  else source?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new AuthTimeoutError()), 10_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    source?.removeEventListener('abort', abort);
  }
}
