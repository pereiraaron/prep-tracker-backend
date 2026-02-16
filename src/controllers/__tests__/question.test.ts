import {
  createQuestion,
  getAllQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  solveQuestion,
  resetQuestion,
  toggleStarred,
  reviewQuestion,
  getDueForReview,
  getRevisions,
  searchQuestions,
  getAllTags,
  getAllTopics,
  getAllSources,
  bulkDeleteQuestions,
  deduplicateQuestions,
  createBacklogQuestion,
  getBacklogQuestions,
  moveToDailyTask,
  bulkMoveToDailyTask,
} from "../question";
import { Question } from "../../models/Question";
import { DailyTask } from "../../models/DailyTask";
import { QuestionStatus } from "../../types/question";
import { DailyTaskStatus } from "../../types/dailyTask";

jest.mock("../../models/Question", () => ({
  Question: {
    create: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findOneAndDelete: jest.fn(),
    aggregate: jest.fn(),
    deleteMany: jest.fn(),
    countDocuments: jest.fn(),
    updateMany: jest.fn(),
  },
}));

jest.mock("../../models/DailyTask", () => ({
  DailyTask: {
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    find: jest.fn(),
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

const mockDailyTaskDoc = (overrides: Record<string, any> = {}) => ({
  _id: "dt1",
  task: "task1",
  userId: "user1",
  addedQuestionCount: 5,
  solvedQuestionCount: 3,
  targetQuestionCount: 5,
  status: DailyTaskStatus.InProgress,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const mockQuestionDoc = (overrides: Record<string, any> = {}) => ({
  _id: "q1",
  dailyTask: "dt1",
  task: "task1",
  userId: "user1",
  title: "Two Sum",
  notes: "use hashmap",
  solution: "function twoSum() {}",
  status: QuestionStatus.Pending,
  starred: false,
  revisions: [] as any[],
  reviewCount: 0,
  tags: [],
  solvedAt: undefined as Date | undefined,
  nextReviewAt: undefined as Date | undefined,
  lastReviewedAt: undefined as Date | undefined,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

// Helper: set up DailyTask.findById for recomputeDailyTaskStatus
const setupRecompute = (overrides: Record<string, any> = {}) => {
  const dt = mockDailyTaskDoc(overrides);
  (DailyTask.findById as jest.Mock).mockResolvedValue(dt);
  return dt;
};

beforeEach(() => jest.clearAllMocks());

// ---- createQuestion ----
describe("createQuestion", () => {
  it("creates a question and updates daily task counter", async () => {
    const dailyTask = mockDailyTaskDoc();
    const question = mockQuestionDoc();

    (DailyTask.findOne as jest.Mock).mockResolvedValue(dailyTask);
    (Question.create as jest.Mock).mockResolvedValue(question);
    (DailyTask.findByIdAndUpdate as jest.Mock).mockResolvedValue(dailyTask);
    setupRecompute({ addedQuestionCount: 6, solvedQuestionCount: 3, targetQuestionCount: 5 });

    const req = mockReq({
      body: { dailyTaskId: "dt1", title: "Two Sum", topic: "arrays" },
    });
    const res = mockRes();

    await createQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(question);
    expect(DailyTask.findByIdAndUpdate).toHaveBeenCalledWith("dt1", {
      $inc: { addedQuestionCount: 1 },
    });
  });

  it("returns 404 when daily task not found", async () => {
    (DailyTask.findOne as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ body: { dailyTaskId: "invalid" } });
    const res = mockRes();

    await createQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(Question.create).not.toHaveBeenCalled();
  });

  it("returns 500 on error", async () => {
    (DailyTask.findOne as jest.Mock).mockRejectedValue(new Error("db error"));

    const req = mockReq({ body: { dailyTaskId: "dt1" } });
    const res = mockRes();

    await createQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---- getAllQuestions ----
describe("getAllQuestions", () => {
  it("returns paginated questions", async () => {
    const questions = [mockQuestionDoc()];
    (Question.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(questions),
        }),
      }),
    });
    (Question.countDocuments as jest.Mock).mockResolvedValue(1);

    const req = mockReq();
    const res = mockRes();

    await getAllQuestions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.questions).toEqual(questions);
    expect(body.pagination).toEqual({ page: 1, limit: 50, total: 1, totalPages: 1 });
  });

  it("applies backlog and starred filters", async () => {
    (Question.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
    (Question.countDocuments as jest.Mock).mockResolvedValue(0);

    const req = mockReq({ query: { backlog: "true", starred: "true" } });
    const res = mockRes();

    await getAllQuestions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const findFilter = (Question.find as jest.Mock).mock.calls[0][0];
    expect(findFilter.dailyTask).toBeNull();
    expect(findFilter.starred).toBe(true);
  });

  it("excludes backlog by default", async () => {
    (Question.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
    (Question.countDocuments as jest.Mock).mockResolvedValue(0);

    const req = mockReq();
    const res = mockRes();

    await getAllQuestions(req, res);

    const findFilter = (Question.find as jest.Mock).mock.calls[0][0];
    expect(findFilter.dailyTask).toEqual({ $ne: null });
  });
});

// ---- getQuestionById ----
describe("getQuestionById", () => {
  it("returns the question", async () => {
    const question = mockQuestionDoc();
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await getQuestionById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(question);
  });

  it("returns 404 when not found", async () => {
    (Question.findOne as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "invalid" } });
    const res = mockRes();

    await getQuestionById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- updateQuestion ----
describe("updateQuestion", () => {
  it("snapshots old notes/solution when they change", async () => {
    const question = mockQuestionDoc({
      notes: "old notes",
      solution: "old solution",
      revisions: [],
    });
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({
      params: { id: "q1" },
      body: { notes: "new notes", solution: "new solution" },
    });
    const res = mockRes();

    await updateQuestion(req, res);

    expect(question.revisions.length).toBe(1);
    expect(question.revisions[0].notes).toBe("old notes");
    expect(question.revisions[0].solution).toBe("old solution");
    expect(question.notes).toBe("new notes");
    expect(question.solution).toBe("new solution");
    expect(question.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("does not snapshot when notes/solution unchanged", async () => {
    const question = mockQuestionDoc({ notes: "same", solution: "same" });
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({
      params: { id: "q1" },
      body: { notes: "same", title: "Updated Title" },
    });
    const res = mockRes();

    await updateQuestion(req, res);

    expect(question.revisions.length).toBe(0);
    expect(question.title).toBe("Updated Title");
    expect(question.save).toHaveBeenCalled();
  });

  it("does not snapshot when question has no existing notes/solution", async () => {
    const question = mockQuestionDoc({ notes: undefined, solution: undefined });
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({
      params: { id: "q1" },
      body: { notes: "first notes" },
    });
    const res = mockRes();

    await updateQuestion(req, res);

    expect(question.revisions.length).toBe(0);
    expect(question.notes).toBe("first notes");
  });

  it("returns 404 when not found", async () => {
    (Question.findOne as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "invalid" }, body: { title: "x" } });
    const res = mockRes();

    await updateQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- deleteQuestion ----
describe("deleteQuestion", () => {
  it("deletes question and updates daily task counters for solved question", async () => {
    const question = mockQuestionDoc({ status: QuestionStatus.Solved, dailyTask: "dt1" });
    (Question.findOneAndDelete as jest.Mock).mockResolvedValue(question);
    (DailyTask.findByIdAndUpdate as jest.Mock).mockResolvedValue({});
    setupRecompute();

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await deleteQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(DailyTask.findByIdAndUpdate).toHaveBeenCalledWith("dt1", {
      $inc: { addedQuestionCount: -1, solvedQuestionCount: -1 },
    });
  });

  it("deletes backlog question without touching daily task", async () => {
    const question = mockQuestionDoc({ dailyTask: null });
    (Question.findOneAndDelete as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await deleteQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(DailyTask.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when not found", async () => {
    (Question.findOneAndDelete as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "invalid" } });
    const res = mockRes();

    await deleteQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- solveQuestion ----
describe("solveQuestion", () => {
  it("solves question and schedules first review", async () => {
    const question = mockQuestionDoc({
      dailyTask: "dt1",
      status: QuestionStatus.Pending,
      reviewCount: 0,
    });
    (Question.findOne as jest.Mock).mockResolvedValue(question);
    (DailyTask.findByIdAndUpdate as jest.Mock).mockResolvedValue({});
    setupRecompute();

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await solveQuestion(req, res);

    expect(question.status).toBe(QuestionStatus.Solved);
    expect(question.solvedAt).toBeDefined();
    expect(question.nextReviewAt).toBeDefined();
    expect(question.save).toHaveBeenCalled();
    expect(DailyTask.findByIdAndUpdate).toHaveBeenCalledWith("dt1", {
      $inc: { solvedQuestionCount: 1 },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("does not reschedule review if already reviewed", async () => {
    const existingReviewDate = new Date("2025-12-01");
    const question = mockQuestionDoc({
      dailyTask: "dt1",
      status: QuestionStatus.Pending,
      reviewCount: 2,
      nextReviewAt: existingReviewDate,
    });
    (Question.findOne as jest.Mock).mockResolvedValue(question);
    (DailyTask.findByIdAndUpdate as jest.Mock).mockResolvedValue({});
    setupRecompute();

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await solveQuestion(req, res);

    expect(question.nextReviewAt).toBe(existingReviewDate);
  });

  it("returns 400 for backlog question", async () => {
    const question = mockQuestionDoc({ dailyTask: null });
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await solveQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(question.save).not.toHaveBeenCalled();
  });

  it("returns 400 when already solved", async () => {
    const question = mockQuestionDoc({
      dailyTask: "dt1",
      status: QuestionStatus.Solved,
    });
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await solveQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when not found", async () => {
    (Question.findOne as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "invalid" } });
    const res = mockRes();

    await solveQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- resetQuestion ----
describe("resetQuestion", () => {
  it("resets solved question and clears review fields", async () => {
    const question = mockQuestionDoc({
      dailyTask: "dt1",
      status: QuestionStatus.Solved,
      solvedAt: new Date(),
      reviewCount: 3,
      nextReviewAt: new Date(),
      lastReviewedAt: new Date(),
    });
    (Question.findOne as jest.Mock).mockResolvedValue(question);
    (DailyTask.findByIdAndUpdate as jest.Mock).mockResolvedValue({});
    setupRecompute();

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await resetQuestion(req, res);

    expect(question.status).toBe(QuestionStatus.Pending);
    expect(question.solvedAt).toBeUndefined();
    expect(question.reviewCount).toBe(0);
    expect(question.nextReviewAt).toBeUndefined();
    expect(question.lastReviewedAt).toBeUndefined();
    expect(question.save).toHaveBeenCalled();
    expect(DailyTask.findByIdAndUpdate).toHaveBeenCalledWith("dt1", {
      $inc: { solvedQuestionCount: -1 },
    });
  });

  it("returns 400 when question is not solved", async () => {
    const question = mockQuestionDoc({ status: QuestionStatus.Pending });
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await resetQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(question.save).not.toHaveBeenCalled();
  });

  it("returns 404 when not found", async () => {
    (Question.findOne as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "invalid" } });
    const res = mockRes();

    await resetQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- toggleStarred ----
describe("toggleStarred", () => {
  it("toggles starred from false to true", async () => {
    const question = mockQuestionDoc({ starred: false });
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await toggleStarred(req, res);

    expect(question.starred).toBe(true);
    expect(question.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("toggles starred from true to false", async () => {
    const question = mockQuestionDoc({ starred: true });
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await toggleStarred(req, res);

    expect(question.starred).toBe(false);
  });

  it("returns 404 when not found", async () => {
    (Question.findOne as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "invalid" } });
    const res = mockRes();

    await toggleStarred(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- reviewQuestion ----
describe("reviewQuestion", () => {
  it("increments review count and schedules next review", async () => {
    const question = mockQuestionDoc({
      status: QuestionStatus.Solved,
      reviewCount: 0,
    });
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await reviewQuestion(req, res);

    expect(question.reviewCount).toBe(1);
    expect(question.lastReviewedAt).toBeDefined();
    expect(question.nextReviewAt).toBeDefined();
    expect(question.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("caps interval index at REVIEW_INTERVALS length", async () => {
    const question = mockQuestionDoc({
      status: QuestionStatus.Solved,
      reviewCount: 100, // Way beyond the intervals array
    });
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await reviewQuestion(req, res);

    expect(question.reviewCount).toBe(101);
    expect(question.nextReviewAt).toBeDefined();
  });

  it("returns 400 when question is not solved", async () => {
    const question = mockQuestionDoc({ status: QuestionStatus.Pending });
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await reviewQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(question.save).not.toHaveBeenCalled();
  });

  it("returns 404 when not found", async () => {
    (Question.findOne as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "invalid" } });
    const res = mockRes();

    await reviewQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- getDueForReview ----
describe("getDueForReview", () => {
  it("returns questions due for review", async () => {
    const questions = [mockQuestionDoc({ status: QuestionStatus.Solved })];
    (Question.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue(questions),
    });

    const req = mockReq();
    const res = mockRes();

    await getDueForReview(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(questions);
  });

  it("applies topic and difficulty filters", async () => {
    (Question.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });

    const req = mockReq({ query: { topic: "arrays", difficulty: "easy" } });
    const res = mockRes();

    await getDueForReview(req, res);

    const filter = (Question.find as jest.Mock).mock.calls[0][0];
    expect(filter.topic).toBe("arrays");
    expect(filter.difficulty).toBe("easy");
  });
});

// ---- getRevisions ----
describe("getRevisions", () => {
  it("returns current and revisions", async () => {
    const question = mockQuestionDoc({
      notes: "current notes",
      solution: "current solution",
      revisions: [{ notes: "old", solution: "old sol", editedAt: new Date() }],
    });
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await getRevisions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.current.notes).toBe("current notes");
    expect(body.revisions.length).toBe(1);
  });

  it("returns 404 when not found", async () => {
    (Question.findOne as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "invalid" } });
    const res = mockRes();

    await getRevisions(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- searchQuestions ----
describe("searchQuestions", () => {
  it("searches questions by query", async () => {
    const questions = [mockQuestionDoc()];
    (Question.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue(questions),
    });

    const req = mockReq({ query: { q: "Two Sum" } });
    const res = mockRes();

    await searchQuestions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(questions);
  });

  it("escapes regex special characters", async () => {
    (Question.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });

    const req = mockReq({ query: { q: "test[0]" } });
    const res = mockRes();

    await searchQuestions(req, res);

    // Should not throw - regex metacharacters are escaped
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 400 when query is empty", async () => {
    const req = mockReq({ query: { q: "  " } });
    const res = mockRes();

    await searchQuestions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when query is missing", async () => {
    const req = mockReq({ query: {} });
    const res = mockRes();

    await searchQuestions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---- getAllTags ----
describe("getAllTags", () => {
  it("returns tags with counts", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: "dp", count: 5 },
      { _id: "greedy", count: 3 },
    ]);

    const req = mockReq();
    const res = mockRes();

    await getAllTags(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual([
      { tag: "dp", count: 5 },
      { tag: "greedy", count: 3 },
    ]);
  });
});

// ---- getAllTopics ----
describe("getAllTopics", () => {
  it("returns topics with counts", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: "arrays", count: 10 },
      { _id: "trees", count: 5 },
    ]);

    const req = mockReq();
    const res = mockRes();

    await getAllTopics(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual([
      { topic: "arrays", count: 10 },
      { topic: "trees", count: 5 },
    ]);
  });

  it("filters by category via DailyTask lookup", async () => {
    (DailyTask.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue([{ _id: "dt1" }, { _id: "dt2" }]),
    });
    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: "arrays", count: 3 },
    ]);

    const req = mockReq({ query: { category: "dsa" } });
    const res = mockRes();

    await getAllTopics(req, res);

    expect(DailyTask.find).toHaveBeenCalledWith({
      userId: "user1",
      category: "dsa",
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ---- getAllSources ----
describe("getAllSources", () => {
  it("returns sources with counts", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([
      { _id: "leetcode", count: 20 },
    ]);

    const req = mockReq();
    const res = mockRes();

    await getAllSources(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toEqual([
      { source: "leetcode", count: 20 },
    ]);
  });
});

// ---- bulkDeleteQuestions ----
describe("bulkDeleteQuestions", () => {
  it("deletes questions and updates daily task counters", async () => {
    const questions = [
      mockQuestionDoc({ _id: "q1", dailyTask: "dt1", status: QuestionStatus.Solved }),
      mockQuestionDoc({ _id: "q2", dailyTask: "dt1", status: QuestionStatus.Pending }),
      mockQuestionDoc({ _id: "q3", dailyTask: null, status: QuestionStatus.Pending }),
    ];
    (Question.find as jest.Mock).mockResolvedValue(questions);
    (Question.deleteMany as jest.Mock).mockResolvedValue({ deletedCount: 3 });
    (DailyTask.findByIdAndUpdate as jest.Mock).mockResolvedValue({});
    setupRecompute();

    const req = mockReq({ body: { ids: ["q1", "q2", "q3"] } });
    const res = mockRes();

    await bulkDeleteQuestions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.deletedCount).toBe(3);
    expect(DailyTask.findByIdAndUpdate).toHaveBeenCalledWith("dt1", {
      $inc: { addedQuestionCount: -2, solvedQuestionCount: -1 },
    });
  });

  it("returns 400 when ids is not a non-empty array", async () => {
    const req = mockReq({ body: { ids: [] } });
    const res = mockRes();

    await bulkDeleteQuestions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when ids is not an array", async () => {
    const req = mockReq({ body: { ids: "not-array" } });
    const res = mockRes();

    await bulkDeleteQuestions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---- deduplicateQuestions ----
describe("deduplicateQuestions", () => {
  it("finds and removes duplicates, keeping best version", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([
      {
        _id: "two sum",
        count: 2,
        docs: [
          { _id: "q1", title: "Two Sum", status: QuestionStatus.Solved, dailyTask: "dt1", createdAt: new Date("2025-01-01") },
          { _id: "q2", title: "two sum", status: QuestionStatus.Pending, dailyTask: "dt1", createdAt: new Date("2025-01-02") },
        ],
      },
    ]);
    (Question.find as jest.Mock).mockResolvedValue([
      mockQuestionDoc({ _id: "q2", dailyTask: "dt1", status: QuestionStatus.Pending }),
    ]);
    (Question.deleteMany as jest.Mock).mockResolvedValue({ deletedCount: 1 });
    (DailyTask.findByIdAndUpdate as jest.Mock).mockResolvedValue({});
    setupRecompute();

    const req = mockReq();
    const res = mockRes();

    await deduplicateQuestions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.deleted).toBe(1);
    expect(body.groups[0].kept).toBe("q1"); // Solved one is kept
    expect(body.groups[0].deleted).toEqual(["q2"]);
  });

  it("returns message when no duplicates found", async () => {
    (Question.aggregate as jest.Mock).mockResolvedValue([]);

    const req = mockReq();
    const res = mockRes();

    await deduplicateQuestions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.deleted).toBe(0);
    expect(body.groups).toEqual([]);
  });
});

// ---- createBacklogQuestion ----
describe("createBacklogQuestion", () => {
  it("creates a backlog question with null dailyTask and task", async () => {
    const question = mockQuestionDoc({ dailyTask: null, task: null });
    (Question.create as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ body: { title: "Backlog Q", topic: "trees" } });
    const res = mockRes();

    await createBacklogQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(Question.create).toHaveBeenCalledWith(
      expect.objectContaining({ dailyTask: null, task: null, userId: "user1" })
    );
  });
});

// ---- getBacklogQuestions ----
describe("getBacklogQuestions", () => {
  it("returns paginated backlog questions", async () => {
    const questions = [mockQuestionDoc({ dailyTask: null })];
    (Question.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(questions),
        }),
      }),
    });
    (Question.countDocuments as jest.Mock).mockResolvedValue(1);

    const req = mockReq();
    const res = mockRes();

    await getBacklogQuestions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const filter = (Question.find as jest.Mock).mock.calls[0][0];
    expect(filter.dailyTask).toBeNull();
  });

  it("applies starred filter", async () => {
    (Question.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
    (Question.countDocuments as jest.Mock).mockResolvedValue(0);

    const req = mockReq({ query: { starred: "true" } });
    const res = mockRes();

    await getBacklogQuestions(req, res);

    const filter = (Question.find as jest.Mock).mock.calls[0][0];
    expect(filter.starred).toBe(true);
  });
});

// ---- moveToDailyTask ----
describe("moveToDailyTask", () => {
  it("moves backlog question to daily task", async () => {
    const question = mockQuestionDoc({ dailyTask: null, task: null });
    const dailyTask = mockDailyTaskDoc();

    (Question.findOne as jest.Mock).mockResolvedValue(question);
    (DailyTask.findOne as jest.Mock).mockResolvedValue(dailyTask);
    (DailyTask.findByIdAndUpdate as jest.Mock).mockResolvedValue({});
    setupRecompute();

    const req = mockReq({ params: { id: "q1" }, body: { dailyTaskId: "dt1" } });
    const res = mockRes();

    await moveToDailyTask(req, res);

    expect(question.dailyTask).toBe("dt1");
    expect(question.task).toBe("task1");
    expect(question.save).toHaveBeenCalled();
    expect(DailyTask.findByIdAndUpdate).toHaveBeenCalledWith("dt1", {
      $inc: { addedQuestionCount: 1 },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 400 when question already assigned", async () => {
    const question = mockQuestionDoc({ dailyTask: "dt1" });
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ params: { id: "q1" }, body: { dailyTaskId: "dt2" } });
    const res = mockRes();

    await moveToDailyTask(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when question not found", async () => {
    (Question.findOne as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "invalid" }, body: { dailyTaskId: "dt1" } });
    const res = mockRes();

    await moveToDailyTask(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 404 when daily task not found", async () => {
    const question = mockQuestionDoc({ dailyTask: null });
    (Question.findOne as jest.Mock).mockResolvedValue(question);
    (DailyTask.findOne as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "q1" }, body: { dailyTaskId: "invalid" } });
    const res = mockRes();

    await moveToDailyTask(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- bulkMoveToDailyTask ----
describe("bulkMoveToDailyTask", () => {
  it("moves backlog questions to daily task", async () => {
    const dailyTask = mockDailyTaskDoc();
    const backlogQuestions = [
      mockQuestionDoc({ _id: "q1", dailyTask: null }),
      mockQuestionDoc({ _id: "q2", dailyTask: null }),
    ];

    (DailyTask.findOne as jest.Mock).mockResolvedValue(dailyTask);
    (Question.find as jest.Mock).mockResolvedValue(backlogQuestions);
    (Question.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 2 });
    (DailyTask.findByIdAndUpdate as jest.Mock).mockResolvedValue({});
    setupRecompute();

    const req = mockReq({
      body: { questionIds: ["q1", "q2"], dailyTaskId: "dt1" },
    });
    const res = mockRes();

    await bulkMoveToDailyTask(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.movedCount).toBe(2);
    expect(DailyTask.findByIdAndUpdate).toHaveBeenCalledWith("dt1", {
      $inc: { addedQuestionCount: 2 },
    });
  });

  it("returns 400 when questionIds is not a non-empty array", async () => {
    const req = mockReq({ body: { questionIds: [], dailyTaskId: "dt1" } });
    const res = mockRes();

    await bulkMoveToDailyTask(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when daily task not found", async () => {
    (DailyTask.findOne as jest.Mock).mockResolvedValue(null);

    const req = mockReq({
      body: { questionIds: ["q1"], dailyTaskId: "invalid" },
    });
    const res = mockRes();

    await bulkMoveToDailyTask(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("reports skipped count for non-backlog questions", async () => {
    const dailyTask = mockDailyTaskDoc();
    (DailyTask.findOne as jest.Mock).mockResolvedValue(dailyTask);
    (Question.find as jest.Mock).mockResolvedValue([]); // No backlog questions found

    const req = mockReq({
      body: { questionIds: ["q1", "q2"], dailyTaskId: "dt1" },
    });
    const res = mockRes();

    await bulkMoveToDailyTask(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.movedCount).toBe(0);
    expect(body.skippedCount).toBe(2);
  });
});
