import {
  createQuestion,
  getAllQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  solveQuestion,
  resetQuestion,
  toggleStarred,
  searchQuestions,
  bulkDeleteQuestions,
  createBacklogQuestion,
  getBacklogQuestions,
} from "../question";
import { Question } from "../../models/Question";
import { QuestionStatus } from "../../types/question";

jest.mock("../../models/Question", () => ({
  Question: {
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndDelete: jest.fn(),
    findOneAndUpdate: jest.fn(),
    exists: jest.fn(),
    find: jest.fn(),
    deleteMany: jest.fn(),
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

const mockQuestionDoc = (overrides: Record<string, any> = {}) => ({
  _id: "q1",
  category: "dsa",
  userId: "user1",
  title: "Two Sum",
  notes: "use hashmap",
  solution: "function twoSum() {}",
  status: QuestionStatus.Pending,
  starred: false,
  tags: [],
  solvedAt: undefined as Date | undefined,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const mockFindChain = (result: any) => ({
  sort: jest.fn().mockReturnValue({
    skip: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(result),
      }),
    }),
  }),
});

const mockFindWithProjectionChain = (result: any) => ({
  sort: jest.fn().mockReturnValue({
    skip: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(result),
      }),
    }),
  }),
});

const mockFindOneAndUpdateChain = (result: any) => ({
  lean: jest.fn().mockResolvedValue(result),
});

const mockFindOneChain = (result: any) => ({
  lean: jest.fn().mockResolvedValue(result),
});

beforeEach(() => jest.clearAllMocks());

// ---- createQuestion ----
describe("createQuestion", () => {
  it("creates a solved question with category", async () => {
    const question = mockQuestionDoc({ status: QuestionStatus.Solved });
    (Question.create as jest.Mock).mockResolvedValue(question);

    const req = mockReq({
      body: { title: "Two Sum", solution: "function twoSum() {}", topic: "arrays", category: "dsa" },
    });
    const res = mockRes();

    await createQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(Question.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user1",
        category: "dsa",
        status: QuestionStatus.Solved,
        solvedAt: expect.any(Date),
      })
    );
  });

  it("returns 500 on error", async () => {
    (Question.create as jest.Mock).mockRejectedValue(new Error("db error"));

    const req = mockReq({ body: { title: "Test", solution: "sol", category: "dsa" } });
    const res = mockRes();

    await createQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---- getAllQuestions ----
describe("getAllQuestions", () => {
  it("returns paginated questions", async () => {
    const questions = [mockQuestionDoc()];
    (Question.find as jest.Mock).mockReturnValue(mockFindChain(questions));
    (Question.countDocuments as jest.Mock).mockResolvedValue(1);

    const req = mockReq();
    const res = mockRes();

    await getAllQuestions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.pagination).toEqual({ page: 1, limit: 50, total: 1, totalPages: 1 });
  });

  it("applies backlog filter", async () => {
    (Question.find as jest.Mock).mockReturnValue(mockFindChain([]));
    (Question.countDocuments as jest.Mock).mockResolvedValue(0);

    const req = mockReq({ query: { backlog: "true", starred: "true" } });
    const res = mockRes();

    await getAllQuestions(req, res);

    const findFilter = (Question.find as jest.Mock).mock.calls[0][0];
    expect(findFilter.category).toBeNull();
    expect(findFilter.starred).toBe(true);
  });

  it("excludes backlog by default", async () => {
    (Question.find as jest.Mock).mockReturnValue(mockFindChain([]));
    (Question.countDocuments as jest.Mock).mockResolvedValue(0);

    const req = mockReq();
    const res = mockRes();

    await getAllQuestions(req, res);

    const findFilter = (Question.find as jest.Mock).mock.calls[0][0];
    expect(findFilter.category).toEqual({ $ne: null });
  });
});

// ---- getQuestionById ----
describe("getQuestionById", () => {
  it("returns the question", async () => {
    const question = mockQuestionDoc();
    (Question.findOne as jest.Mock).mockReturnValue(mockFindOneChain(question));

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await getQuestionById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 404 when not found", async () => {
    (Question.findOne as jest.Mock).mockReturnValue(mockFindOneChain(null));

    const req = mockReq({ params: { id: "invalid" } });
    const res = mockRes();

    await getQuestionById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- updateQuestion ----
describe("updateQuestion", () => {
  it("updates fields", async () => {
    const question = mockQuestionDoc();
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ params: { id: "q1" }, body: { title: "Updated" } });
    const res = mockRes();

    await updateQuestion(req, res);

    expect(question.title).toBe("Updated");
    expect(question.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
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
  it("hard-deletes question", async () => {
    (Question.findOneAndDelete as jest.Mock).mockResolvedValue(mockQuestionDoc());

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await deleteQuestion(req, res);

    expect(Question.findOneAndDelete).toHaveBeenCalledWith({ _id: "q1", userId: "user1" });
    expect(res.status).toHaveBeenCalledWith(200);
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
  it("solves question", async () => {
    const question = mockQuestionDoc({ status: QuestionStatus.Solved, solvedAt: new Date() });
    (Question.findOneAndUpdate as jest.Mock).mockReturnValue(mockFindOneAndUpdateChain(question));

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await solveQuestion(req, res);

    expect(Question.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "q1", userId: "user1", status: { $ne: QuestionStatus.Solved } },
      { $set: { status: QuestionStatus.Solved, solvedAt: expect.any(Date) } },
      { new: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 400 when already solved", async () => {
    (Question.findOneAndUpdate as jest.Mock).mockReturnValue(mockFindOneAndUpdateChain(null));
    (Question.exists as jest.Mock).mockResolvedValue({ _id: "q1" });

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await solveQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when not found", async () => {
    (Question.findOneAndUpdate as jest.Mock).mockReturnValue(mockFindOneAndUpdateChain(null));
    (Question.exists as jest.Mock).mockResolvedValue(null);

    const res = mockRes();
    await solveQuestion(mockReq({ params: { id: "x" } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- resetQuestion ----
describe("resetQuestion", () => {
  it("resets solved question", async () => {
    const question = mockQuestionDoc({ status: QuestionStatus.Pending, solvedAt: undefined });
    (Question.findOneAndUpdate as jest.Mock).mockReturnValue(mockFindOneAndUpdateChain(question));

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await resetQuestion(req, res);

    expect(Question.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "q1", userId: "user1", status: QuestionStatus.Solved },
      { $set: { status: QuestionStatus.Pending }, $unset: { solvedAt: 1 } },
      { new: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 400 when not solved", async () => {
    (Question.findOneAndUpdate as jest.Mock).mockReturnValue(mockFindOneAndUpdateChain(null));
    (Question.exists as jest.Mock).mockResolvedValue({ _id: "q1" });

    const res = mockRes();
    await resetQuestion(mockReq({ params: { id: "q1" } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---- toggleStarred ----
describe("toggleStarred", () => {
  it("toggles starred", async () => {
    const question = mockQuestionDoc({ starred: true });
    (Question.findOneAndUpdate as jest.Mock).mockReturnValue(mockFindOneAndUpdateChain(question));

    const res = mockRes();
    await toggleStarred(mockReq({ params: { id: "q1" } }), res);

    expect(Question.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "q1", userId: "user1" },
      [{ $set: { starred: { $not: "$starred" } } }],
      { new: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 404 when not found", async () => {
    (Question.findOneAndUpdate as jest.Mock).mockReturnValue(mockFindOneAndUpdateChain(null));
    const res = mockRes();

    await toggleStarred(mockReq({ params: { id: "x" } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- searchQuestions ----
describe("searchQuestions", () => {
  it("searches questions", async () => {
    (Question.find as jest.Mock).mockReturnValue(mockFindWithProjectionChain([]));
    (Question.countDocuments as jest.Mock).mockResolvedValue(0);

    const res = mockRes();
    await searchQuestions(mockReq({ query: { q: "Two Sum" } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const findFilter = (Question.find as jest.Mock).mock.calls[0][0];
    expect(findFilter.$text).toEqual({ $search: "Two Sum" });
  });

  it("returns 400 when query is missing", async () => {
    const res = mockRes();
    await searchQuestions(mockReq({ query: {} }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---- bulkDeleteQuestions ----
describe("bulkDeleteQuestions", () => {
  it("hard-deletes questions", async () => {
    (Question.deleteMany as jest.Mock).mockResolvedValue({ deletedCount: 3 });

    const res = mockRes();
    await bulkDeleteQuestions(mockReq({ body: { ids: ["q1", "q2", "q3"] } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.deletedCount).toBe(3);
  });

  it("returns 400 when ids is empty", async () => {
    const res = mockRes();
    await bulkDeleteQuestions(mockReq({ body: { ids: [] } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---- createBacklogQuestion ----
describe("createBacklogQuestion", () => {
  it("creates with null category", async () => {
    (Question.create as jest.Mock).mockResolvedValue(mockQuestionDoc({ category: null }));

    const res = mockRes();
    await createBacklogQuestion(mockReq({ body: { title: "Backlog Q" } }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(Question.create).toHaveBeenCalledWith(expect.objectContaining({ category: null }));
  });
});

// ---- getBacklogQuestions ----
describe("getBacklogQuestions", () => {
  it("filters by category null", async () => {
    (Question.find as jest.Mock).mockReturnValue(mockFindChain([]));
    (Question.countDocuments as jest.Mock).mockResolvedValue(0);

    const res = mockRes();
    await getBacklogQuestions(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect((Question.find as jest.Mock).mock.calls[0][0].category).toBeNull();
  });
});
