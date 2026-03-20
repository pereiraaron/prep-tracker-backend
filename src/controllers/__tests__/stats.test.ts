import {
  getOverview,
  getCategoryBreakdown,
  getDifficultyBreakdown,
  getProgress,
  getSourceBreakdown,
  getCompanyTagBreakdown,
  getTagBreakdown,
  getHeatmap,
  getWeeklyProgress,
  getCumulativeProgress,
  getDifficultyByCategory,
  getInsights,
} from "../stats";
import { Question } from "../../models/Question";
import { QuestionStatus, Difficulty, QuestionSource } from "../../types/question";
import { PrepCategory } from "../../types/category";

jest.mock("../../models/Question", () => ({
  Question: {
    aggregate: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

jest.mock("../../utils/cache", () => ({
  cache: {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
}));

const mockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockReq = (overrides: Record<string, any> = {}) =>
  ({
    user: { id: "user1" },
    params: {},
    query: {},
    body: {},
    ...overrides,
  }) as any;

beforeEach(() => jest.clearAllMocks());

// ---- getOverview ----
describe("getOverview", () => {
  it("returns solved-based overview with backlog count", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValueOnce([
      {
        byCategory: [
          { _id: PrepCategory.DSA, count: 4 },
          { _id: PrepCategory.SystemDesign, count: 2 },
        ],
        byDifficulty: [
          { _id: Difficulty.Easy, count: 2 },
          { _id: Difficulty.Hard, count: 1 },
        ],
        totalSolved: [{ count: 6 }],
        backlog: [{ count: 10 }],
      },
    ]);

    const res = mockRes();
    await getOverview(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data.totalSolved).toBe(6);
    expect(body.data.backlogCount).toBe(10);
    expect(body.data.byCategory.dsa).toBe(4);
    expect(body.data.byDifficulty.easy).toBe(2);
  });

  it("returns 500 on error", async () => {
    (Question.aggregate as jest.Mock).mockRejectedValue(new Error("db error"));

    const res = mockRes();
    await getOverview(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---- getCategoryBreakdown ----
describe("getCategoryBreakdown", () => {
  it("returns solved counts per category", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: PrepCategory.DSA, count: 3 },
    ]);

    const res = mockRes();
    await getCategoryBreakdown(mockReq(), res);

    const body = res.json.mock.calls[0][0].data;
    const dsa = body.find((c: any) => c.category === PrepCategory.DSA);
    expect(dsa.count).toBe(3);
  });
});

// ---- getDifficultyBreakdown ----
describe("getDifficultyBreakdown", () => {
  it("returns solved counts per difficulty", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: Difficulty.Easy, count: 5 },
    ]);

    const res = mockRes();
    await getDifficultyBreakdown(mockReq(), res);

    const body = res.json.mock.calls[0][0].data;
    const easy = body.find((d: any) => d.difficulty === Difficulty.Easy);
    expect(easy.count).toBe(5);
  });
});

// ---- getProgress ----
describe("getProgress", () => {
  it("returns daily solved counts with defaults (30 days)", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([]);

    const res = mockRes();
    await getProgress(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0].data;
    expect(body.length).toBeGreaterThanOrEqual(30);
    expect(body[0]).toHaveProperty("date");
    expect(body[0]).toHaveProperty("solved", 0);
  });

  it("returns 500 on error", async () => {
    (Question.aggregate as jest.Mock).mockRejectedValue(new Error("db error"));

    const res = mockRes();
    await getProgress(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---- getSourceBreakdown ----
describe("getSourceBreakdown", () => {
  it("returns solved counts per source", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: QuestionSource.Leetcode, count: 10 },
    ]);

    const res = mockRes();
    await getSourceBreakdown(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0].data;
    const leetcode = body.find((s: any) => s.source === "leetcode");
    expect(leetcode.count).toBe(10);
  });
});

// ---- getCompanyTagBreakdown ----
describe("getCompanyTagBreakdown", () => {
  it("returns solved counts per company sorted by count", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: "Google", count: 5 },
      { _id: "Meta", count: 3 },
    ]);

    const res = mockRes();
    await getCompanyTagBreakdown(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0].data;
    expect(body[0].companyTag).toBe("Google");
    expect(body[0].count).toBe(5);
    expect(body[1].companyTag).toBe("Meta");
    expect(body[1].count).toBe(3);
  });
});

// ---- getTagBreakdown ----
describe("getTagBreakdown", () => {
  it("returns solved counts per tag sorted by count", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: "dp", count: 8 },
      { _id: "greedy", count: 3 },
    ]);

    const res = mockRes();
    await getTagBreakdown(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0].data;
    expect(body[0].tag).toBe("dp");
    expect(body[0].count).toBe(8);
  });
});

// ---- getHeatmap ----
describe("getHeatmap", () => {
  it("returns heatmap with all dates in the year", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([{ _id: "2026-01-15", count: 3 }]);

    const res = mockRes();
    await getHeatmap(mockReq({ query: { year: "2026" } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0].data;
    expect(body["2026-01-15"]).toBe(3);
    expect(body["2026-01-01"]).toBe(0);
    expect(body["2026-12-31"]).toBe(0);
    expect(Object.keys(body).length).toBe(365);
  });
});

// ---- getWeeklyProgress ----
describe("getWeeklyProgress", () => {
  it("returns weekly progress data", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([]);

    const res = mockRes();
    await getWeeklyProgress(mockReq({ query: { weeks: "4" } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0].data;
    expect(body.length).toBeGreaterThanOrEqual(4);
    expect(body[0]).toHaveProperty("week");
    expect(body[0]).toHaveProperty("startDate");
    expect(body[0]).toHaveProperty("solved", 0);
  });
});

// ---- getCumulativeProgress ----
describe("getCumulativeProgress", () => {
  it("returns cumulative totals with prior count", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValueOnce([
      {
        priorCount: [{ count: 10 }],
        daily: [],
      },
    ]);

    const res = mockRes();
    await getCumulativeProgress(mockReq({ query: { days: "7" } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0].data;
    expect(body.length).toBeGreaterThanOrEqual(7);
    expect(body[0]).toHaveProperty("date");
    expect(body[0].total).toBe(10);
    expect(body[body.length - 1].total).toBe(10);
  });

  it("accumulates daily solves", async () => {
    const d1 = new Date();
    d1.setDate(d1.getDate() - 2);
    const d1Str = d1.toISOString().split("T")[0];

    (Question.aggregate as jest.Mock).mockResolvedValueOnce([
      {
        priorCount: [{ count: 5 }],
        daily: [{ _id: d1Str, count: 3 }],
      },
    ]);

    const res = mockRes();
    await getCumulativeProgress(mockReq({ query: { days: "7" } }), res);

    const body = res.json.mock.calls[0][0].data;
    const entry = body.find((d: any) => d.date === d1Str);
    expect(entry).toBeDefined();
    expect(entry.total).toBeGreaterThanOrEqual(8);
  });
});

// ---- getDifficultyByCategory ----
describe("getDifficultyByCategory", () => {
  it("returns difficulty x category cross-tabulation (solved only)", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: { category: PrepCategory.DSA, difficulty: Difficulty.Easy }, count: 5 },
      { _id: { category: PrepCategory.DSA, difficulty: Difficulty.Medium }, count: 10 },
      { _id: { category: PrepCategory.DSA, difficulty: Difficulty.Hard }, count: 3 },
      { _id: { category: PrepCategory.SystemDesign, difficulty: Difficulty.Medium }, count: 4 },
    ]);

    const res = mockRes();
    await getDifficultyByCategory(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0].data;

    const dsa = body.find((c: any) => c.category === PrepCategory.DSA);
    expect(dsa.easy).toBe(5);
    expect(dsa.medium).toBe(10);
    expect(dsa.hard).toBe(3);
    expect(dsa.total).toBe(18);

    const sd = body.find((c: any) => c.category === PrepCategory.SystemDesign);
    expect(sd.medium).toBe(4);
    expect(sd.easy).toBe(0);
    expect(sd.total).toBe(4);

    const behavioral = body.find((c: any) => c.category === PrepCategory.Behavioral);
    expect(behavioral.total).toBe(0);
  });
});

// ---- getInsights ----
describe("getInsights", () => {
  const mockInsightsFacet = (overrides: Record<string, any> = {}) => {
    (Question.aggregate as jest.Mock).mockResolvedValueOnce([
      {
        catRows: [],
        topicRows: [],
        diffRows: [],
        dailyRows: [],
        backlogCount: [],
        backlogOldest: [],
        totalSolved: [],
        ...overrides,
      },
    ]);
  };

  it("returns empty insights for user with no data", async () => {
    mockInsightsFacet();

    const res = mockRes();
    await getInsights(mockReq({ query: { refresh: "true" } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const { weakAreas, tips, milestones } = res.json.mock.calls[0][0].data;
    expect(weakAreas).toEqual([]);
    expect(tips).toEqual([]);
    expect(milestones.every((m: any) => !m.achieved)).toBe(true);
  });

  it("computes milestones from solved counts", async () => {
    mockInsightsFacet({
      catRows: [
        { _id: "dsa", count: 15, lastSolved: new Date() },
      ],
      diffRows: [
        { _id: "easy", count: 10, lastSolved: new Date() },
        { _id: "medium", count: 4, lastSolved: new Date() },
        { _id: "hard", count: 1, lastSolved: new Date() },
      ],
      totalSolved: [{ count: 15 }],
    });

    const res = mockRes();
    await getInsights(mockReq({ query: { refresh: "true" } }), res);

    const { milestones } = res.json.mock.calls[0][0].data;
    const firstQ = milestones.find((m: any) => m.name === "First Question");
    expect(firstQ.achieved).toBe(true);
    const getting = milestones.find((m: any) => m.name === "Getting Started");
    expect(getting.achieved).toBe(true);
    const century = milestones.find((m: any) => m.name === "Century");
    expect(century.achieved).toBe(false);
    expect(century.progress).toBe("15/100");
  });

  it("generates backlog tip when backlog is large", async () => {
    mockInsightsFacet({
      backlogCount: [{ count: 25 }],
      backlogOldest: [{ createdAt: new Date() }],
    });

    const res = mockRes();
    await getInsights(mockReq({ query: { refresh: "true" } }), res);

    const { tips } = res.json.mock.calls[0][0].data;
    expect(tips.some((t: any) => t.text.includes("backlog"))).toBe(true);
  });

  it("returns 500 on error", async () => {
    (Question.aggregate as jest.Mock).mockRejectedValue(new Error("db error"));

    const res = mockRes();
    await getInsights(mockReq({ query: { refresh: "true" } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
