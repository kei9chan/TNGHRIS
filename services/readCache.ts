type ReadCacheEntry<T> = {
  expiresAt: number;
  promise?: Promise<T>;
  value?: T;
};

const readCache = new Map<string, ReadCacheEntry<unknown>>();

/** Share identical, user-scoped reads across components without caching writes. */
export const dedupeRead = async <T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number,
  force = false,
): Promise<T> => {
  const cached = readCache.get(key) as ReadCacheEntry<T> | undefined;
  if (!force && cached) {
    if (cached.promise) return cached.promise;
    if (cached.expiresAt > Date.now()) return cached.value as T;
  }

  const promise = loader().then(
    value => {
      readCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    },
    error => {
      if ((readCache.get(key) as ReadCacheEntry<T> | undefined)?.promise === promise) {
        readCache.delete(key);
      }
      throw error;
    },
  );

  readCache.set(key, { promise, expiresAt: Number.POSITIVE_INFINITY });
  return promise;
};

