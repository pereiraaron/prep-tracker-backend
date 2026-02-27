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
  it("returns overview with counts by status, category, and difficulty", async () => {
    (Question.aggregate as jest.Mock)
      .mockResolvedValueOnce([
        { _id: QuestionStatus.Pending, count: 5 },
        { _id: QuestionStatus.Solved, count: 3 },
      ])
      .mockResolvedValueOnce([
        { _id: PrepCategory.DSA, count: 4 },
        { _id: PrepCategory.SystemDesign, count: 2 },
      ])
      .mockResolvedValueOnce([
        { _id: Difficulty.Easy, count: 2 },
        { _id: Difficulty.Hard, count: 1 },
      ]);

    (Question.countDocuments as jest.Mock).mockResolvedValueOnce(8).mockResolvedValueOnce(2);

    const res = mockRes();
    await getOverview(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data.total).toBe(8);
    expect(body.data.backlogCount).toBe(2);
    expect(body.data.byStatus.pending).toBe(5);
    expect(body.data.byStatus.solved).toBe(3);
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
  it("returns per-category breakdown with completion rates", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: { category: PrepCategory.DSA, status: QuestionStatus.Solved }, count: 3 },
      { _id: { category: PrepCategory.DSA, status: QuestionStatus.Pending }, count: 7 },
    ]);

    const res = mockRes();
    await getCategoryBreakdown(mockReq(), res);

    const body = res.json.mock.calls[0][0].data;
    const dsa = body.find((c: any) => c.category === PrepCategory.DSA);
    expect(dsa.total).toBe(10);
    expect(dsa.completionRate).toBe(30);
  });
});

// ---- getDifficultyBreakdown ----
describe("getDifficultyBreakdown", () => {
  it("returns per-difficulty breakdown with completion rates", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: { difficulty: Difficulty.Easy, status: QuestionStatus.Solved }, count: 5 },
      { _id: { difficulty: Difficulty.Easy, status: QuestionStatus.Pending }, count: 5 },
    ]);

    const res = mockRes();
    await getDifficultyBreakdown(mockReq(), res);

    const body = res.json.mock.calls[0][0].data;
    const easy = body.find((d: any) => d.difficulty === Difficulty.Easy);
    expect(easy.total).toBe(10);
    expect(easy.completionRate).toBe(50);
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
  it("returns per-source breakdown with completion rates", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: { source: QuestionSource.Leetcode, status: QuestionStatus.Solved }, count: 10 },
      { _id: { source: QuestionSource.Leetcode, status: QuestionStatus.Pending }, count: 5 },
    ]);

    const res = mockRes();
    await getSourceBreakdown(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0].data;
    const leetcode = body.find((s: any) => s.source === "leetcode");
    expect(leetcode.total).toBe(15);
    expect(leetcode.solved).toBe(10);
    expect(leetcode.completionRate).toBe(67);
  });
});

// ---- getCompanyTagBreakdown ----
describe("getCompanyTagBreakdown", () => {
  it("returns per-company breakdown sorted by total", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: { companyTag: "Google", status: QuestionStatus.Solved }, count: 5 },
      { _id: { companyTag: "Google", status: QuestionStatus.Pending }, count: 2 },
      { _id: { companyTag: "Meta", status: QuestionStatus.Solved }, count: 3 },
    ]);

    const res = mockRes();
    await getCompanyTagBreakdown(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0].data;
    expect(body[0].companyTag).toBe("Google");
    expect(body[0].total).toBe(7);
    expect(body[1].companyTag).toBe("Meta");
    expect(body[1].total).toBe(3);
  });
});

// ---- getTagBreakdown ----
describe("getTagBreakdown", () => {
  it("returns per-tag breakdown sorted by total", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: { tag: "dp", status: QuestionStatus.Solved }, count: 8 },
      { _id: { tag: "greedy", status: QuestionStatus.Solved }, count: 3 },
    ]);

    const res = mockRes();
    await getTagBreakdown(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0].data;
    expect(body[0].tag).toBe("dp");
    expect(body[0].total).toBe(8);
    expect(body[0].solved).toBe(8);
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
    (Question.countDocuments as jest.Mock).mockResolvedValue(10); // prior count
    (Question.aggregate as jest.Mock).mockResolvedValue([]);

    const res = mockRes();
    await getCumulativeProgress(mockReq({ query: { days: "7" } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0].data;
    expect(body.length).toBeGreaterThanOrEqual(7);
    expect(body[0]).toHaveProperty("date");
    expect(body[0].total).toBe(10); // starts from prior count
    expect(body[body.length - 1].total).toBe(10); // no new solves
  });

  it("accumulates daily solves", async () => {
    const d1 = new Date();
    d1.setDate(d1.getDate() - 2);
    const d1Str = d1.toISOString().split("T")[0];

    (Question.countDocuments as jest.Mock).mockResolvedValue(5);
    (Question.aggregate as jest.Mock).mockResolvedValue([{ _id: d1Str, count: 3 }]);

    const res = mockRes();
    await getCumulativeProgress(mockReq({ query: { days: "7" } }), res);

    const body = res.json.mock.calls[0][0].data;
    const entry = body.find((d: any) => d.date === d1Str);
    expect(entry).toBeDefined();
    // Total should be >= 8 (5 prior + 3 on that day)
    expect(entry.total).toBeGreaterThanOrEqual(8);
  });
});

// ---- getDifficultyByCategory ----
describe("getDifficultyByCategory", () => {
  it("returns difficulty x category cross-tabulation", async () => {
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
