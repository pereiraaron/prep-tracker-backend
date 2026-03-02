interface CacheEntry {
  data: any;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

export const cache = {
  get: (key: string): any | null => {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.data;
  },

  set: (key: string, data: any, ttlMs = 300000): void => {
    store.set(key, { data, expiresAt: Date.now() + ttlMs });
  },

  invalidate: (prefix: string): void => {
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  },
};
