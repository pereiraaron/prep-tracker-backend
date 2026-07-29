interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const redisEnabled = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

/**
 * L1 (in-process) entries are capped well below the L2 TTL. `invalidate` can only
 * clear the memory of the instance that handled the write, so this bounds how long
 * a different warm instance can serve a stale value after a mutation.
 */
const L1_MAX_TTL_MS = 60_000;

/** TTL for the per-user key registry — longer than any cache entry it tracks. */
const INDEX_TTL_SECONDS = 86_400;

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

type Command = Array<string | number>;

const redisFetch = async <T>(path: string, body: unknown): Promise<T | null> => {
  if (!redisEnabled) return null;
  try {
    const res = await fetch(`${UPSTASH_URL!.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

const redisCommand = async <T>(...parts: Command): Promise<T | null> => {
  const json = await redisFetch<{ result: T }>("", parts);
  return json ? json.result : null;
};

/** Run several commands in one HTTP round trip. Returns one result per command. */
const redisPipeline = async <T>(commands: Command[]): Promise<T[] | null> => {
  if (!commands.length) return [];
  const json = await redisFetch<Array<{ result: T; error?: string }>>("/pipeline", commands);
  if (!Array.isArray(json)) return null;
  return json.map((r) => r.result);
};

/**
 * Atomically bump a counter with a fixed window, in one round trip.
 * `delta` of 0 clears the key. Returns null when Redis is unavailable.
 */
export const redisRateLimit = async (
  key: string,
  windowMs: number,
  delta = 1
): Promise<{ totalHits: number; ttlMs: number } | null> => {
  if (!redisEnabled) return null;

  if (delta === 0) {
    await redisCommand("DEL", key);
    return { totalHits: 0, ttlMs: windowMs };
  }

  const results = await redisPipeline<unknown>([
    ["INCRBY", key, delta],
    ["PTTL", key],
  ]);
  if (!results) return null;

  const totalHits = typeof results[0] === "number" ? results[0] : 0;
  let ttlMs = typeof results[1] === "number" ? results[1] : -1;

  // Start the window on the first hit. Deliberately not PEXPIRE..NX (Redis 7+):
  // if that flag were rejected the key would keep no TTL at all and the counter
  // would never reset, locking clients out. Racing first hits both set the same
  // window, which is harmless.
  if (ttlMs < 0) {
    await redisCommand("PEXPIRE", key, windowMs);
    ttlMs = windowMs;
  }

  return { totalHits, ttlMs };
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
  store.set(key, { data, expiresAt: Date.now() + Math.min(ttlMs, L1_MAX_TTL_MS) });
};

const memoryInvalidate = (prefixes: string[]): void => {
  for (const key of store.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) store.delete(key);
  }
};

/** Registry of live cache keys for one user, so invalidation never scans the keyspace. */
export const userIndex = (userId: string) => `cacheidx:${userId}`;

export type CacheEntryInput = { key: string; data: unknown; ttlMs?: number };

const setCommands = (entries: CacheEntryInput[], index?: string): Command[] => {
  const commands: Command[] = [];
  for (const { key, data, ttlMs = 300000 } of entries) {
    commands.push(["SET", key, JSON.stringify(data), "EX", Math.max(1, Math.ceil(ttlMs / 1000))]);
  }
  if (index && entries.length) {
    commands.push(["SADD", index, ...entries.map((e) => e.key)]);
    commands.push(["EXPIRE", index, INDEX_TTL_SECONDS]);
  }
  return commands;
};

export const cache = {
  get: async (key: string): Promise<any | null> => {
    const local = memoryGet(key);
    if (local !== null) return local;

    if (!redisEnabled) return null;

    // Fetch value and remaining TTL together so L1 never outlives L2.
    const results = await redisPipeline<unknown>([
      ["GET", key],
      ["PTTL", key],
    ]);
    if (!results) return null;

    const raw = results[0] as string | null;
    if (raw == null) return null;

    const pttl = typeof results[1] === "number" ? results[1] : -1;

    try {
      const parsed = JSON.parse(raw);
      memorySet(key, parsed, pttl > 0 ? pttl : L1_MAX_TTL_MS);
      return parsed;
    } catch {
      return null;
    }
  },

  set: async (key: string, data: any, ttlMs = 300000, index?: string): Promise<void> => {
    memorySet(key, data, ttlMs);
    if (!redisEnabled) return;

    await redisPipeline(setCommands([{ key, data, ttlMs }], index));
  },

  /** Write many entries in a single round trip (used to warm caches after a batch fetch). */
  setMany: async (entries: CacheEntryInput[], index?: string): Promise<void> => {
    for (const { key, data, ttlMs = 300000 } of entries) memorySet(key, data, ttlMs);
    if (!redisEnabled || !entries.length) return;

    await redisPipeline(setCommands(entries, index));
  },

  /** Drop a single exact key. */
  del: async (key: string, index?: string): Promise<void> => {
    store.delete(key);
    if (!redisEnabled) return;

    const commands: Command[] = [["DEL", key]];
    if (index) commands.push(["SREM", index, key]);
    await redisPipeline(commands);
  },

  invalidate: async (prefix: string, index?: string): Promise<void> =>
    cache.invalidateMany([prefix], index),

  /**
   * Drop every key matching any of `prefixes`. With an index this is 2 round trips
   * total regardless of prefix count; without one it falls back to SCAN, whose cost
   * is proportional to the whole keyspace.
   */
  invalidateMany: async (prefixes: string[], index?: string): Promise<void> => {
    memoryInvalidate(prefixes);

    if (!redisEnabled || !prefixes.length) return;

    if (index) {
      const tracked = await redisCommand<string[]>("SMEMBERS", index);
      if (!tracked?.length) return;

      const stale = tracked.filter((key) => prefixes.some((prefix) => key.startsWith(prefix)));
      if (!stale.length) return;

      await redisPipeline([
        ["DEL", ...stale],
        ["SREM", index, ...stale],
      ]);
      return;
    }

    for (const prefix of prefixes) {
      let cursor = "0";
      do {
        const scanned = await redisCommand<[string, string[]]>("SCAN", cursor, "MATCH", `${prefix}*`, "COUNT", 100);
        if (!scanned) break;
        const [next, keys] = scanned;
        cursor = next;
        if (keys.length) await redisCommand("DEL", ...keys);
      } while (cursor !== "0");
    }
  },
};
