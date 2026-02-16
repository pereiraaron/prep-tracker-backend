import {
  getOverview,
  getCategoryBreakdown,
  getDifficultyBreakdown,
  getStreaks,
  getProgress,
} from "../stats";
import { Question } from "../../models/Question";
import { DailyTask } from "../../models/DailyTask";
import { QuestionStatus, Difficulty } from "../../types/question";
import { DailyTaskStatus } from "../../types/dailyTask";
import { PrepCategory } from "../../types/category";

jest.mock("../../models/Question", () => ({
  Question: {
    aggregate: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

jest.mock("../../models/DailyTask", () => ({
  DailyTask: {
    aggregate: jest.fn(),
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
      ]) // byStatus
      .mockResolvedValueOnce([
        { _id: Difficulty.Easy, count: 2 },
        { _id: Difficulty.Hard, count: 1 },
      ]); // byDifficulty

    (DailyTask.aggregate as jest.Mock).mockResolvedValueOnce([
      { _id: PrepCategory.DSA, count: 4 },
      { _id: PrepCategory.SystemDesign, count: 2 },
    ]); // byCategory

    (Question.countDocuments as jest.Mock).mockResolvedValue(8);

    const req = mockReq();
    const res = mockRes();

    await getOverview(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];

    expect(body.total).toBe(8);
    expect(body.byStatus.pending).toBe(5);
    expect(body.byStatus.solved).toBe(3);
    expect(body.byStatus.in_progress).toBe(0);
    expect(body.byCategory.dsa).toBe(4);
    expect(body.byCategory.system_design).toBe(2);
    expect(body.byCategory.behavioral).toBe(0);
    expect(body.byDifficulty.easy).toBe(2);
    expect(body.byDifficulty.hard).toBe(1);
    expect(body.byDifficulty.medium).toBe(0);
  });

  it("returns 500 on error", async () => {
    (Question.aggregate as jest.Mock).mockRejectedValue(new Error("db error"));

    const req = mockReq();
    const res = mockRes();

    await getOverview(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---- getCategoryBreakdown ----
describe("getCategoryBreakdown", () => {
  it("returns per-category breakdown with completion rates", async () => {
    (DailyTask.aggregate as jest.Mock).mockResolvedValue([
      { _id: { category: PrepCategory.DSA, status: QuestionStatus.Solved }, count: 3 },
      { _id: { category: PrepCategory.DSA, status: QuestionStatus.Pending }, count: 7 },
      { _id: { category: PrepCategory.Behavioral, status: QuestionStatus.Solved }, count: 1 },
    ]);

    const req = mockReq();
    const res = mockRes();

    await getCategoryBreakdown(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];

    const dsa = body.find((c: any) => c.category === PrepCategory.DSA);
    expect(dsa.total).toBe(10);
    expect(dsa.solved).toBe(3);
    expect(dsa.pending).toBe(7);
    expect(dsa.completionRate).toBe(30);

    const behavioral = body.find((c: any) => c.category === PrepCategory.Behavioral);
    expect(behavioral.total).toBe(1);
    expect(behavioral.solved).toBe(1);
    expect(behavioral.completionRate).toBe(100);

    const systemDesign = body.find((c: any) => c.category === PrepCategory.SystemDesign);
    expect(systemDesign.total).toBe(0);
    expect(systemDesign.completionRate).toBe(0);
  });
});

// ---- getDifficultyBreakdown ----
describe("getDifficultyBreakdown", () => {
  it("returns per-difficulty breakdown with completion rates", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: { difficulty: Difficulty.Easy, status: QuestionStatus.Solved }, count: 5 },
      { _id: { difficulty: Difficulty.Easy, status: QuestionStatus.Pending }, count: 5 },
      { _id: { difficulty: Difficulty.Hard, status: QuestionStatus.InProgress }, count: 2 },
    ]);

    const req = mockReq();
    const res = mockRes();

    await getDifficultyBreakdown(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];

    const easy = body.find((d: any) => d.difficulty === Difficulty.Easy);
    expect(easy.total).toBe(10);
    expect(easy.completionRate).toBe(50);

    const hard = body.find((d: any) => d.difficulty === Difficulty.Hard);
    expect(hard.total).toBe(2);
    expect(hard.in_progress).toBe(2);
    expect(hard.completionRate).toBe(0);
  });
});

// ---- getStreaks ----
describe("getStreaks", () => {
  it("returns zero streaks when no completions exist", async () => {
    (DailyTask.aggregate as jest.Mock).mockResolvedValue([]);

    const req = mockReq();
    const res = mockRes();

    await getStreaks(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      currentStreak: 0,
      longestStreak: 0,
      totalActiveDays: 0,
    });
  });

  it("calculates longest streak and total active days from completion dates", async () => {
    const dates = ["2025-01-10", "2025-01-11", "2025-01-12"];

    (DailyTask.aggregate as jest.Mock).mockResolvedValue(
      dates.map((d) => ({ _id: d }))
    );

    const req = mockReq();
    const res = mockRes();

    await getStreaks(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.totalActiveDays).toBe(3);
    expect(body.longestStreak).toBe(3);
    expect(body.currentStreak).toBe(0);
  });

  it("breaks current streak when gap is more than 1 day", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    (DailyTask.aggregate as jest.Mock).mockResolvedValue([
      { _id: threeDaysAgo.toISOString().split("T")[0] },
    ]);

    const req = mockReq();
    const res = mockRes();

    await getStreaks(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.currentStreak).toBe(0);
  });
});

// ---- getProgress ----
describe("getProgress", () => {
  it("returns daily solved counts with defaults (30 days)", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([]);

    const req = mockReq();
    const res = mockRes();

    await getProgress(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.length).toBeGreaterThanOrEqual(30);
    expect(body[0]).toHaveProperty("date");
    expect(body[0]).toHaveProperty("solved", 0);
  });

  it("fills in solved counts from aggregation data", async () => {
    const target = new Date();
    target.setDate(target.getDate() - 3);
    target.setHours(0, 0, 0, 0);
    const dateStr = target.toISOString().split("T")[0];

    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: dateStr, count: 5 },
    ]);

    const req = mockReq({ query: { days: "7" } });
    const res = mockRes();

    await getProgress(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    const targetEntry = body.find((d: any) => d.date === dateStr);
    expect(targetEntry).toBeDefined();
    expect(targetEntry.solved).toBe(5);
  });

  it("returns 500 on error", async () => {
    (Question.aggregate as jest.Mock).mockRejectedValue(
      new Error("db error")
    );

    const req = mockReq();
    const res = mockRes();

    await getProgress(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
