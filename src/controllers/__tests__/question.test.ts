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
    find: jest.fn(),
    deleteMany: jest.fn(),
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
    expect(body.success).toBe(true);
    expect(body.pagination).toEqual({ page: 1, limit: 50, total: 1, totalPages: 1 });
  });

  it("applies backlog filter", async () => {
    (Question.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
      }),
    });
    (Question.countDocuments as jest.Mock).mockResolvedValue(0);

    const req = mockReq({ query: { backlog: "true", starred: "true" } });
    const res = mockRes();

    await getAllQuestions(req, res);

    const findFilter = (Question.find as jest.Mock).mock.calls[0][0];
    expect(findFilter.category).toBeNull();
    expect(findFilter.starred).toBe(true);
  });

  it("excludes backlog by default", async () => {
    (Question.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
      }),
    });
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
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await getQuestionById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
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
    const question = mockQuestionDoc({ status: QuestionStatus.Pending });
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await solveQuestion(req, res);

    expect(question.status).toBe(QuestionStatus.Solved);
    expect(question.solvedAt).toBeDefined();
    expect(question.save).toHaveBeenCalled();
  });

  it("returns 400 when already solved", async () => {
    (Question.findOne as jest.Mock).mockResolvedValue(mockQuestionDoc({ status: QuestionStatus.Solved }));

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await solveQuestion(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when not found", async () => {
    (Question.findOne as jest.Mock).mockResolvedValue(null);

    await solveQuestion(mockReq({ params: { id: "x" } }), mockRes());
  });
});

// ---- resetQuestion ----
describe("resetQuestion", () => {
  it("resets solved question", async () => {
    const question = mockQuestionDoc({ status: QuestionStatus.Solved, solvedAt: new Date() });
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    const req = mockReq({ params: { id: "q1" } });
    const res = mockRes();

    await resetQuestion(req, res);

    expect(question.status).toBe(QuestionStatus.Pending);
    expect(question.solvedAt).toBeUndefined();
  });

  it("returns 400 when not solved", async () => {
    (Question.findOne as jest.Mock).mockResolvedValue(mockQuestionDoc({ status: QuestionStatus.Pending }));

    const res = mockRes();
    await resetQuestion(mockReq({ params: { id: "q1" } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---- toggleStarred ----
describe("toggleStarred", () => {
  it("toggles starred", async () => {
    const question = mockQuestionDoc({ starred: false });
    (Question.findOne as jest.Mock).mockResolvedValue(question);

    await toggleStarred(mockReq({ params: { id: "q1" } }), mockRes());

    expect(question.starred).toBe(true);
    expect(question.save).toHaveBeenCalled();
  });

  it("returns 404 when not found", async () => {
    (Question.findOne as jest.Mock).mockResolvedValue(null);
    const res = mockRes();

    await toggleStarred(mockReq({ params: { id: "x" } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- searchQuestions ----
describe("searchQuestions", () => {
  it("searches questions", async () => {
    (Question.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
      }),
    });
    (Question.countDocuments as jest.Mock).mockResolvedValue(0);

    const res = mockRes();
    await searchQuestions(mockReq({ query: { q: "Two Sum" } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
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
    (Question.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
      }),
    });
    (Question.countDocuments as jest.Mock).mockResolvedValue(0);

    const res = mockRes();
    await getBacklogQuestions(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect((Question.find as jest.Mock).mock.calls[0][0].category).toBeNull();
  });
});
