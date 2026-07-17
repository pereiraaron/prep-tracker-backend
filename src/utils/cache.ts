interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const redisEnabled = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

/** Periodic sweep so expired memory entries don't accumulate on long-lived processes. */
const SWEEP_EVERY_MS = 60_000;
let lastSweep = Date.now();

const sweepMemory = () => {
  const now = Date.now();
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(key);
  }
};

const redisCommand = async <T>(...parts: Array<string | number>): Promise<T | null> => {
  if (!redisEnabled) return null;
  try {
    const res = await fetch(UPSTASH_URL!, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parts),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result: T };
    return json.result;
  } catch {
    return null;
  }
};

const memoryGet = (key: string): unknown | null => {
  sweepMemory();
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data;
};

const memorySet = (key: string, data: unknown, ttlMs: number): void => {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
};

const memoryInvalidate = (prefix: string): void => {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
};

export const cache = {
  get: async (key: string): Promise<any | null> => {
    const local = memoryGet(key);
    if (local !== null) return local;

    if (!redisEnabled) return null;

    const raw = await redisCommand<string | null>("GET", key);
    if (raw == null) return null;

    try {
      const parsed = JSON.parse(raw);
      // Rehydrate L1 with remaining TTL unknown — use a short positive TTL window
      memorySet(key, parsed, 60_000);
      return parsed;
    } catch {
      return null;
    }
  },

  set: async (key: string, data: any, ttlMs = 300000): Promise<void> => {
    memorySet(key, data, ttlMs);
    if (!redisEnabled) return;

    const seconds = Math.max(1, Math.ceil(ttlMs / 1000));
    await redisCommand("SET", key, JSON.stringify(data), "EX", seconds);
  },

  invalidate: async (prefix: string): Promise<void> => {
    memoryInvalidate(prefix);

    if (!redisEnabled) return;

    // SCAN + DEL so other serverless instances drop stale keys
    let cursor = "0";
    do {
      const scanned = await redisCommand<[string, string[]]>("SCAN", cursor, "MATCH", `${prefix}*`, "COUNT", 100);
      if (!scanned) break;
      const [next, keys] = scanned;
      cursor = next;
      if (keys.length) await redisCommand("DEL", ...keys);
    } while (cursor !== "0");
  },
};
