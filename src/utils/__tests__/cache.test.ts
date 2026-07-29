/**
 * Exercises the Upstash REST wire format with a stubbed fetch, since the Redis
 * tier is inactive unless UPSTASH_* is configured.
 */

const UPSTASH_URL = "https://fake.upstash.io";

type Call = { path: string; body: any };

let calls: Call[] = [];
let responses: any[] = [];

const fetchMock = jest.fn(async (url: string, init: any) => {
  calls.push({ path: url.replace(UPSTASH_URL, ""), body: JSON.parse(init.body) });
  const next = responses.shift();
  return {
    ok: true,
    json: async () => next,
  } as any;
});

/** Upstash returns one {result} object per command for /pipeline requests. */
const pipelineReply = (...results: unknown[]) => results.map((result) => ({ result }));

let cache: typeof import("../cache").cache;
let userIndex: typeof import("../cache").userIndex;
let redisRateLimit: typeof import("../cache").redisRateLimit;

beforeEach(() => {
  jest.resetModules();
  calls = [];
  responses = [];
  fetchMock.mockClear();
  global.fetch = fetchMock as any;

  process.env.UPSTASH_REDIS_REST_URL = UPSTASH_URL;
  process.env.UPSTASH_REDIS_REST_TOKEN = "token";

  const mod = require("../cache");
  cache = mod.cache;
  userIndex = mod.userIndex;
  redisRateLimit = mod.redisRateLimit;
});

afterEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe("cache.set", () => {
  it("writes value and registry membership in one pipelined request", async () => {
    responses.push(pipelineReply("OK", 1, 1));

    await cache.set("stats:u1:overview", { total: 3 }, 600_000, userIndex("u1"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0].path).toBe("/pipeline");
    expect(calls[0].body).toEqual([
      ["SET", "stats:u1:overview", JSON.stringify({ total: 3 }), "EX", 600],
      ["SADD", "cacheidx:u1", "stats:u1:overview"],
      ["EXPIRE", "cacheidx:u1", 86400],
    ]);
  });

  it("omits registry commands when no index is given", async () => {
    responses.push(pipelineReply("OK"));

    await cache.set("plain", 1, 1000);

    expect(calls[0].body).toEqual([["SET", "plain", "1", "EX", 1]]);
  });
});

describe("cache.setMany", () => {
  it("batches every entry into a single request", async () => {
    responses.push(pipelineReply("OK", "OK", "OK", 2, 1));

    await cache.setMany(
      [
        { key: "stats:u1:a", data: 1, ttlMs: 600_000 },
        { key: "stats:u1:b", data: 2, ttlMs: 600_000 },
        { key: "stats:u1:c", data: 3, ttlMs: 600_000 },
      ],
      userIndex("u1")
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const commands = calls[0].body;
    expect(commands.filter((c: string[]) => c[0] === "SET")).toHaveLength(3);
    expect(commands.find((c: string[]) => c[0] === "SADD")).toEqual([
      "SADD",
      "cacheidx:u1",
      "stats:u1:a",
      "stats:u1:b",
      "stats:u1:c",
    ]);
  });

  it("makes no request for an empty batch", async () => {
    await cache.setMany([], userIndex("u1"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("cache.get", () => {
  it("fetches value and remaining TTL together", async () => {
    responses.push(pipelineReply(JSON.stringify({ total: 7 }), 550_000));

    const value = await cache.get("stats:u1:overview");

    expect(value).toEqual({ total: 7 });
    expect(calls[0].path).toBe("/pipeline");
    expect(calls[0].body).toEqual([
      ["GET", "stats:u1:overview"],
      ["PTTL", "stats:u1:overview"],
    ]);
  });

  it("serves the second read from L1 without hitting Redis", async () => {
    responses.push(pipelineReply(JSON.stringify({ total: 7 }), 550_000));

    await cache.get("k1");
    await cache.get("k1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caps the L1 rehydration window so a stale instance recovers", async () => {
    // L2 has ~9 minutes left, but L1 must not hold it for more than 60s
    responses.push(pipelineReply(JSON.stringify("v"), 550_000));
    await cache.get("k1");

    jest.spyOn(Date, "now").mockReturnValue(Date.now() + 61_000);
    responses.push(pipelineReply(JSON.stringify("v2"), 490_000));

    expect(await cache.get("k1")).toBe("v2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    jest.restoreAllMocks();
  });

  it("returns null on a miss", async () => {
    responses.push(pipelineReply(null, -2));
    expect(await cache.get("missing")).toBeNull();
  });
});

describe("cache.invalidateMany", () => {
  it("uses the registry: one lookup then one delete, regardless of prefix count", async () => {
    responses.push({
      result: ["stats:u1:overview", "stats:u1:topics:all", "suggestions:v3:u1", "stats:u1:keepme"],
    });
    responses.push(pipelineReply(3, 3));

    await cache.invalidateMany(
      ["stats:u1:overview", "stats:u1:topics", "suggestions:v3:u1"],
      userIndex("u1")
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calls[0].body).toEqual(["SMEMBERS", "cacheidx:u1"]);
    expect(calls[1].body).toEqual([
      ["DEL", "stats:u1:overview", "stats:u1:topics:all", "suggestions:v3:u1"],
      ["SREM", "cacheidx:u1", "stats:u1:overview", "stats:u1:topics:all", "suggestions:v3:u1"],
    ]);
  });

  it("skips the delete when nothing matches", async () => {
    responses.push({ result: ["stats:u2:overview"] });

    await cache.invalidateMany(["stats:u1:"], userIndex("u1"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops matching L1 entries even when the registry is empty", async () => {
    responses.push(pipelineReply("OK", 1, 1));
    await cache.set("stats:u1:overview", "cached", 600_000, userIndex("u1"));

    responses.push({ result: [] });
    await cache.invalidateMany(["stats:u1:"], userIndex("u1"));

    // A follow-up read must go back to Redis rather than serving the stale L1 value
    responses.push(pipelineReply(null, -2));
    expect(await cache.get("stats:u1:overview")).toBeNull();
  });

  it("falls back to SCAN when no index is supplied", async () => {
    responses.push({ result: ["0", ["stats:u1:overview"]] });
    responses.push({ result: 1 });

    await cache.invalidateMany(["stats:u1:"]);

    expect(calls[0].body).toEqual(["SCAN", "0", "MATCH", "stats:u1:*", "COUNT", 100]);
    expect(calls[1].body).toEqual(["DEL", "stats:u1:overview"]);
  });
});

describe("cache.del", () => {
  it("removes the key and its registry entry", async () => {
    responses.push(pipelineReply(1, 1));

    await cache.del("suggestions:v3:u1", userIndex("u1"));

    expect(calls[0].body).toEqual([
      ["DEL", "suggestions:v3:u1"],
      ["SREM", "cacheidx:u1", "suggestions:v3:u1"],
    ]);
  });
});

describe("redisRateLimit", () => {
  it("starts the window on the first hit", async () => {
    responses.push(pipelineReply(1, -1)); // no TTL yet
    responses.push({ result: 1 }); // PEXPIRE

    const result = await redisRateLimit("ratelimit:ip", 900_000);

    expect(result).toEqual({ totalHits: 1, ttlMs: 900_000 });
    expect(calls[0].body).toEqual([
      ["INCRBY", "ratelimit:ip", 1],
      ["PTTL", "ratelimit:ip"],
    ]);
    expect(calls[1].body).toEqual(["PEXPIRE", "ratelimit:ip", 900_000]);
  });

  it("does not extend the window on later hits", async () => {
    responses.push(pipelineReply(42, 300_000));

    const result = await redisRateLimit("ratelimit:ip", 900_000);

    expect(result).toEqual({ totalHits: 42, ttlMs: 300_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears the counter for delta 0", async () => {
    responses.push({ result: 1 });

    await redisRateLimit("ratelimit:ip", 900_000, 0);

    expect(calls[0].body).toEqual(["DEL", "ratelimit:ip"]);
  });

  it("returns null when Redis fails so callers can fail open", async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new Error("network down");
    });

    expect(await redisRateLimit("ratelimit:ip", 900_000)).toBeNull();
  });
});

describe("without Upstash configured", () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    fetchMock.mockClear();
    cache = require("../cache").cache;
  });

  it("uses memory only and never calls fetch", async () => {
    await cache.set("k", { a: 1 }, 30_000);
    expect(await cache.get("k")).toEqual({ a: 1 });

    await cache.invalidateMany(["k"]);
    expect(await cache.get("k")).toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
