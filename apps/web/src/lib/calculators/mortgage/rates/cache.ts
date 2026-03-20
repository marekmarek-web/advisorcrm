type CacheEntry<T> = {
  data: T;
  fetchedAtMs: number;
  expiresAtMs: number;
};

const cacheStore = new Map<string, CacheEntry<unknown>>();
const lastValidSnapshot = new Map<string, unknown>();

export async function getOrFetchWithCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const cached = cacheStore.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAtMs > now) {
    return cached.data;
  }

  try {
    const data = await fetcher();
    cacheStore.set(key, {
      data,
      fetchedAtMs: now,
      expiresAtMs: now + ttlMs,
    });
    lastValidSnapshot.set(key, data);
    return data;
  } catch (error) {
    const snapshot = lastValidSnapshot.get(key) as T | undefined;
    if (snapshot !== undefined) {
      return snapshot;
    }
    throw error;
  }
}
