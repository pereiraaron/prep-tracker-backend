import type { ClientRateLimitInfo, Options, Store } from "express-rate-limit";
import { redisRateLimit } from "./cache";

/**
 * Rate-limit counters backed by Upstash so all serverless instances share one
 * budget. With the default in-memory store each instance keeps its own counter,
 * making the effective limit `max × instanceCount`.
 *
 * Falls back to the library's MemoryStore when Upstash isn't configured — see
 * `createRateLimitStore`.
 */
class RedisRateLimitStore implements Store {
  /** Counters are shared across instances, so the library must not assume otherwise. */
  localKeys = false;

  private windowMs = 60_000;
  private keyPrefix = "ratelimit:";

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private redisKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const result = await redisRateLimit(this.redisKey(key), this.windowMs);

    // On a Redis failure, allow the request rather than locking everyone out.
    if (!result) return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };

    const { totalHits, ttlMs } = result;
    return {
      totalHits,
      resetTime: new Date(Date.now() + (ttlMs > 0 ? ttlMs : this.windowMs)),
    };
  }

  async decrement(key: string): Promise<void> {
    await redisRateLimit(this.redisKey(key), this.windowMs, -1);
  }

  async resetKey(key: string): Promise<void> {
    await redisRateLimit(this.redisKey(key), this.windowMs, 0);
  }
}

/** Returns a shared store when Upstash is configured, else undefined (library default). */
export const createRateLimitStore = (): Store | undefined => {
  const enabled = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
  return enabled ? new RedisRateLimitStore() : undefined;
};
