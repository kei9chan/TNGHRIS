// The installed Auth SDK waits forever for browser locks. Bound acquisition
// and recover an abandoned lock as newer Supabase Auth releases do. Keep the
// same cross-tab lock name so healthy sessions still coordinate token refresh.
const SESSION_LOCK_WAIT_MS = 5_000;

class SessionLockTimeoutError extends Error {
  readonly isAcquireTimeout = true;
  constructor() {
    super('The browser session lock is unavailable. Please retry.');
    this.name = 'SessionLockTimeoutError';
  }
}

export async function authSessionLock<T>(name: string, requestedWait: number, operation: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) return operation();
  const locks = navigator.locks;
  if (requestedWait === 0) {
    // Background refresh must skip a busy lock, never interrupt another tab.
    try {
      return await locks.request(name, { mode: 'exclusive', ifAvailable: true }, lock => {
        if (!lock) throw new SessionLockTimeoutError();
        return operation();
      });
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw new SessionLockTimeoutError();
      throw error;
    }
  }

  const controller = new AbortController();
  let acquired = false;
  const timer = setTimeout(() => controller.abort(), Math.min(requestedWait > 0 ? requestedWait : SESSION_LOCK_WAIT_MS, SESSION_LOCK_WAIT_MS));
  try {
    return await locks.request(name, { mode: 'exclusive', signal: controller.signal }, lock => {
      clearTimeout(timer);
      if (!lock) throw new SessionLockTimeoutError();
      acquired = true;
      return operation();
    });
  } catch (error) {
    // Recover only our cancelled WAIT. A stolen holder's callback may still be
    // running: never rerun it or start a steal-back loop between open tabs.
    if (!acquired && controller.signal.aborted && (error as Error)?.name === 'AbortError') {
      try {
        return await locks.request(name, { mode: 'exclusive', steal: true }, lock => {
          if (!lock) throw new SessionLockTimeoutError();
          return operation();
        });
      } catch (recoveryError) {
        if ((recoveryError as Error)?.name === 'AbortError') throw new SessionLockTimeoutError();
        throw recoveryError;
      }
    }
    if ((error as Error)?.name === 'AbortError') throw new SessionLockTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
