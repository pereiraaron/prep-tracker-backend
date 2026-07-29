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
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndDelete: jest.fn(),
    findOneAndUpdate: jest.fn(),
    exists: jest.fn(),
    aggregate: jest.fn(),
    countDocuments: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

jest.mock("../../utils/cache", () => ({
  cache: {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    setMany: jest.fn(),
    del: jest.fn(),
    invalidate: jest.fn(),
    invalidateMany: jest.fn(),
  },
  userIndex: (userId: string) => `cacheidx:${userId}`,
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
  solutions: [{ content: "function twoSum() {}" }],
  status: QuestionStatus.Pending,
  starred: false,
  tags: [],
  solvedAt: undefined as Date | undefined,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const mockFindOneAndUpdateChain = (result: any) => ({
  lean: jest.fn().mockResolvedValue(result),
});

const mockFindOneChain = (result: any) => ({
  lean: jest.fn().mockResolvedValue(result),
});

/**
 * paginatedList uses find().select().sort().skip().limit().lean() alongside
 * countDocuments(), so the sort can be served from an index.
 */
const mockPaginatedList = (items: any[], total = items.length) => {
  const chain: any = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.sort = jest.fn().mockReturnValue(chain);
  chain.skip = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.lean = jest.fn().mockResolvedValue(items);
  (Question.find as jest.Mock).mockReturnValue(chain);
  (Question.countDocuments as jest.Mock).mockResolvedValue(total);
  return chain;
};

/** Filter passed to find() — the equivalent of the old pipeline[0].$match. */
const findFilter = () => (Question.find as jest.Mock).mock.calls[0][0];

beforeEach(() => jest.clearAllMocks());

// ---- createQuestion ----
describe("createQuestion", () => {
  it("creates a solved question with category", async () => {
    const question = mockQuestionDoc({ status: QuestionStatus.Solved });
    (Question.create as jest.Mock).mockResolvedValue({ ...question, toObject: () => question });

    const req = mockReq({
      body: {
        title: "Two Sum",
        solutions: [{ content: "function twoSum() {}" }],
        topics: ["arrays"],
        category: "dsa",
      },
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
        solutions: [{ content: "function twoSum() {}" }],
      })
    );
  });

  it("creates a solved question with multiple solutions", async () => {
    const question = mockQuestionDoc({ status: QuestionStatus.Solved });
    (Question.create as jest.Mock).mockResolvedValue({ ...question, toObject: () => question });

    const req = mockReq({
      body: {
        title: "Two Sum",
        solutions: [
          { label: "Brute Force", content: "function twoSumBrute() {}" },
          { label: "Optimal", content: "function twoSum() {}" },
        ],
        category: "dsa",
      },
    });
    const res = mockRes();

    await createQuestion(req, res);

    expect(Question.create).toHaveBeenCalledWith(
      expect.objectContaining({
        solutions: [
          { label: "Brute Force", content: "function twoSumBrute() {}" },
          { label: "Optimal", content: "function twoSum() {}" },
        ],
      })
    );
  });

  it("rejects multiple solutions for non-DSA categories", async () => {
    const req = mockReq({
      body: {
        title: "Design Twitter",
        solutions: [
          { content: "approach 1" },
          { content: "approach 2" },
        ],
        category: "system_design",
      },
    });
    const res = mockRes();

    await createQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Question.create).not.toHaveBeenCalled();
  });

  it("returns 500 on error", async () => {
    (Question.create as jest.Mock).mockRejectedValue(new Error("db error"));

    const req = mockReq({
      body: { title: "Test", solutions: [{ content: "sol" }], category: "dsa" },
    });
    const res = mockRes();

    await createQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---- getAllQuestions ----
describe("getAllQuestions", () => {
  it("returns paginated questions", async () => {
    const questions = [mockQuestionDoc()];
    mockPaginatedList(questions, 1);

    const req = mockReq();
    const res = mockRes();

    await getAllQuestions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.pagination).toEqual({ page: 1, limit: 50, total: 1, totalPages: 1 });
  });

  it("applies backlog filter", async () => {
    mockPaginatedList([], 0);

    const req = mockReq({ query: { backlog: "true", starred: "true" } });
    const res = mockRes();

    await getAllQuestions(req, res);

    expect(findFilter().status).toBe(QuestionStatus.Pending);
    expect(findFilter().starred).toBe(true);
  });

  it("excludes backlog by default", async () => {
    mockPaginatedList([], 0);

    const req = mockReq();
    const res = mockRes();

    await getAllQuestions(req, res);

    expect(findFilter().status).toBe(QuestionStatus.Solved);
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
    const question = mockQuestionDoc({ title: "Updated" });
    (Question.findOneAndUpdate as jest.Mock).mockReturnValue(mockFindOneAndUpdateChain(question));

    const req = mockReq({ params: { id: "q1" }, body: { title: "Updated" } });
    const res = mockRes();

    await updateQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    // Plain $set update — no pipeline, so no updatePipeline flag
    const [, update, options] = (Question.findOneAndUpdate as jest.Mock).mock.calls[0];
    expect(Array.isArray(update)).toBe(false);
    expect(options.updatePipeline).toBeUndefined();
  });

  it("uses a pipeline update to set solvedAt only when adding a solution", async () => {
    const question = mockQuestionDoc({ status: QuestionStatus.Solved });
    (Question.findOneAndUpdate as jest.Mock).mockReturnValue(mockFindOneAndUpdateChain(question));

    const req = mockReq({
      params: { id: "q1" },
      body: { solutions: [{ content: "function twoSum() {}" }] },
    });
    const res = mockRes();

    await updateQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const [, update, options] = (Question.findOneAndUpdate as jest.Mock).mock.calls[0];
    // solvedAt is preserved if already set, hence the pipeline
    expect(update).toEqual([
      { $set: expect.objectContaining({ solvedAt: { $ifNull: ["$solvedAt", expect.any(Date)] } }) },
    ]);
    // mongoose 9 rejects array updates without this
    expect(options.updatePipeline).toBe(true);
    expect(options.returnDocument).toBe("after");
  });

  it("returns 404 when not found", async () => {
    (Question.findOneAndUpdate as jest.Mock).mockReturnValue(mockFindOneAndUpdateChain(null));

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
    (Question.findOne as jest.Mock).mockReturnValue(mockFindOneChain(mockQuestionDoc()));
    (Question.findOneAndUpdate as jest.Mock).mockReturnValue(mockFindOneAndUpdateChain(question));

    const req = mockReq({
      params: { id: "q1" },
      body: { solutions: [{ content: "function twoSum() {}" }] },
    });
    const res = mockRes();

    await solveQuestion(req, res);

    expect(Question.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "q1", userId: "user1" },
      {
        $set: {
          status: QuestionStatus.Solved,
          solvedAt: expect.any(Date),
          solutions: [{ content: "function twoSum() {}" }],
        },
      },
      { returnDocument: "after", projection: expect.any(Object) }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 400 when already solved", async () => {
    (Question.findOne as jest.Mock).mockReturnValue(
      mockFindOneChain(mockQuestionDoc({ status: QuestionStatus.Solved }))
    );

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await solveQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when not found", async () => {
    (Question.findOne as jest.Mock).mockReturnValue(mockFindOneChain(null));

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
      { returnDocument: "after", projection: expect.any(Object) }
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

    // updatePipeline is required for the array update — mongoose 9 throws without it
    expect(Question.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "q1", userId: "user1" },
      [{ $set: { starred: { $not: "$starred" } } }],
      { returnDocument: "after", projection: expect.any(Object), updatePipeline: true }
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
  it("uses text index for word search", async () => {
    const chain = mockPaginatedList([], 0);

    const res = mockRes();
    await searchQuestions(mockReq({ query: { q: "Two Sum" } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(findFilter().$text).toEqual({ $search: "Two Sum" });
    expect(chain.sort).toHaveBeenCalledWith({
      score: { $meta: "textScore" },
      createdAt: -1,
    });
    // textScore must be projected to be sortable, but is stripped from responses
    expect(chain.select.mock.calls[0][0].score).toEqual({ $meta: "textScore" });
  });

  it("uses regex for short substring search", async () => {
    mockPaginatedList([], 0);

    const res = mockRes();
    await searchQuestions(mockReq({ query: { q: "us" } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(findFilter().$or).toEqual([
      { title: { $regex: "us", $options: "i" } },
      { topics: { $regex: "us", $options: "i" } },
      { tags: { $regex: "us", $options: "i" } },
      { companyTags: { $regex: "us", $options: "i" } },
    ]);
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
  it("creates with provided category", async () => {
    const question = mockQuestionDoc({ category: "dsa" });
    (Question.create as jest.Mock).mockResolvedValue({ ...question, toObject: () => question });

    const res = mockRes();
    await createBacklogQuestion(mockReq({ body: { title: "Backlog Q", category: "dsa", url: "https://example.com" } }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(Question.create).toHaveBeenCalledWith(expect.objectContaining({ category: "dsa" }));
  });
});

// ---- getBacklogQuestions ----
describe("getBacklogQuestions", () => {
  it("filters by pending status", async () => {
    mockPaginatedList([], 0);

    const res = mockRes();
    await getBacklogQuestions(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(findFilter().status).toBe(QuestionStatus.Pending);
  });
});
