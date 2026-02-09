import {
  createEntry,
  getAllEntries,
  getEntryById,
  updateEntry,
  deleteEntry,
  getToday,
  getHistory,
  searchEntries,
  getAllTags,
  getAllTopics,
  getAllSources,
  bulkDeleteEntries,
  updateTaskStatus,
} from "../entry";
import { Entry, TaskCompletion } from "../../models";
import { EntryStatus, PrepCategory } from "../../types";

// ---- Mock Mongoose models ----
jest.mock("../../models", () => ({
  Entry: {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOneAndDelete: jest.fn(),
    countDocuments: jest.fn(),
    deleteMany: jest.fn(),
    aggregate: jest.fn(),
  },
  TaskCompletion: {
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

// ---- Helpers ----
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

// ---- createEntry ----
describe("createEntry", () => {
  it("creates an entry and returns 201", async () => {
    const body = {
      title: "Two Sum",
      category: PrepCategory.DSA,
      deadline: "2025-02-01",
      status: EntryStatus.Pending,
    };
    const created = { _id: "e1", ...body, userId: "user1" };
    (Entry.create as jest.Mock).mockResolvedValue(created);

    const req = mockReq({ body });
    const res = mockRes();

    await createEntry(req, res);

    expect(Entry.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Two Sum", userId: "user1" })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(created);
  });

  it("returns 500 on error", async () => {
    (Entry.create as jest.Mock).mockRejectedValue(new Error("db error"));

    const req = mockReq({ body: { title: "X" } });
    const res = mockRes();

    await createEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Error creating entry" })
    );
  });
});

// ---- getAllEntries ----
describe("getAllEntries", () => {
  it("returns paginated entries with defaults", async () => {
    const entries = [{ _id: "e1", title: "A" }];
    const chainMock = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(entries),
    };
    (Entry.find as jest.Mock).mockReturnValue(chainMock);
    (Entry.countDocuments as jest.Mock).mockResolvedValue(1);

    const req = mockReq();
    const res = mockRes();

    await getAllEntries(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        entries,
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      })
    );
  });

  it("applies category filter from query", async () => {
    const chainMock = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };
    (Entry.find as jest.Mock).mockReturnValue(chainMock);
    (Entry.countDocuments as jest.Mock).mockResolvedValue(0);

    const req = mockReq({ query: { category: PrepCategory.DSA } });
    const res = mockRes();

    await getAllEntries(req, res);

    expect(Entry.find).toHaveBeenCalledWith(
      expect.objectContaining({ category: PrepCategory.DSA })
    );
  });

  it("applies pagination params", async () => {
    const chainMock = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };
    (Entry.find as jest.Mock).mockReturnValue(chainMock);
    (Entry.countDocuments as jest.Mock).mockResolvedValue(0);

    const req = mockReq({ query: { page: "2", limit: "10" } });
    const res = mockRes();

    await getAllEntries(req, res);

    expect(chainMock.skip).toHaveBeenCalledWith(10);
    expect(chainMock.limit).toHaveBeenCalledWith(10);
  });
});

// ---- getEntryById ----
describe("getEntryById", () => {
  it("returns the entry when found", async () => {
    const entry = { _id: "e1", title: "A" };
    (Entry.findOne as jest.Mock).mockResolvedValue(entry);

    const req = mockReq({ params: { id: "e1" } });
    const res = mockRes();

    await getEntryById(req, res);

    expect(Entry.findOne).toHaveBeenCalledWith({ _id: "e1", userId: "user1" });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(entry);
  });

  it("returns 404 when not found", async () => {
    (Entry.findOne as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "missing" } });
    const res = mockRes();

    await getEntryById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- updateEntry ----
describe("updateEntry", () => {
  it("updates and returns the entry", async () => {
    const updated = { _id: "e1", title: "Updated" };
    (Entry.findOneAndUpdate as jest.Mock).mockResolvedValue(updated);

    const req = mockReq({
      params: { id: "e1" },
      body: { title: "Updated" },
    });
    const res = mockRes();

    await updateEntry(req, res);

    expect(Entry.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "e1", userId: "user1" },
      expect.objectContaining({ title: "Updated" }),
      { new: true, runValidators: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  it("returns 404 when entry not found", async () => {
    (Entry.findOneAndUpdate as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "missing" }, body: {} });
    const res = mockRes();

    await updateEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- deleteEntry ----
describe("deleteEntry", () => {
  it("deletes the entry and associated completions", async () => {
    const entry = { _id: "e1", title: "A" };
    (Entry.findOneAndDelete as jest.Mock).mockResolvedValue(entry);
    (TaskCompletion.deleteMany as jest.Mock).mockResolvedValue({
      deletedCount: 2,
    });

    const req = mockReq({ params: { id: "e1" } });
    const res = mockRes();

    await deleteEntry(req, res);

    expect(Entry.findOneAndDelete).toHaveBeenCalledWith({
      _id: "e1",
      userId: "user1",
    });
    expect(TaskCompletion.deleteMany).toHaveBeenCalledWith({
      entry: "e1",
      userId: "user1",
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 404 when entry not found", async () => {
    (Entry.findOneAndDelete as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "missing" } });
    const res = mockRes();

    await deleteEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(TaskCompletion.deleteMany).not.toHaveBeenCalled();
  });
});

// ---- searchEntries ----
describe("searchEntries", () => {
  it("returns matching entries", async () => {
    const entries = [{ _id: "e1", title: "Binary Search" }];
    const chainMock = { sort: jest.fn().mockResolvedValue(entries) };
    (Entry.find as jest.Mock).mockReturnValue(chainMock);

    const req = mockReq({ query: { q: "binary" } });
    const res = mockRes();

    await searchEntries(req, res);

    expect(Entry.find).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user1",
        $or: expect.any(Array),
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(entries);
  });

  it("returns 400 when query is missing", async () => {
    const req = mockReq({ query: {} });
    const res = mockRes();

    await searchEntries(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when query is empty string", async () => {
    const req = mockReq({ query: { q: "   " } });
    const res = mockRes();

    await searchEntries(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---- getAllTags ----
describe("getAllTags", () => {
  it("returns aggregated tags", async () => {
    const aggregateResult = [
      { _id: "arrays", count: 5 },
      { _id: "dp", count: 3 },
    ];
    (Entry.aggregate as jest.Mock).mockResolvedValue(aggregateResult);

    const req = mockReq();
    const res = mockRes();

    await getAllTags(req, res);

    expect(Entry.aggregate).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([
      { tag: "arrays", count: 5 },
      { tag: "dp", count: 3 },
    ]);
  });
});

// ---- getAllTopics ----
describe("getAllTopics", () => {
  it("returns aggregated topics", async () => {
    const aggregateResult = [
      { _id: "Two Pointers", count: 4 },
      { _id: "Sliding Window", count: 2 },
    ];
    (Entry.aggregate as jest.Mock).mockResolvedValue(aggregateResult);

    const req = mockReq();
    const res = mockRes();

    await getAllTopics(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([
      { topic: "Two Pointers", count: 4 },
      { topic: "Sliding Window", count: 2 },
    ]);
  });

  it("applies category filter when provided", async () => {
    (Entry.aggregate as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ query: { category: PrepCategory.DSA } });
    const res = mockRes();

    await getAllTopics(req, res);

    const pipeline = (Entry.aggregate as jest.Mock).mock.calls[0][0];
    const matchStage = pipeline[0].$match;
    expect(matchStage.category).toBe(PrepCategory.DSA);
  });
});

// ---- getAllSources ----
describe("getAllSources", () => {
  it("returns aggregated sources", async () => {
    const aggregateResult = [
      { _id: "LeetCode", count: 10 },
      { _id: "NeetCode", count: 5 },
    ];
    (Entry.aggregate as jest.Mock).mockResolvedValue(aggregateResult);

    const req = mockReq();
    const res = mockRes();

    await getAllSources(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([
      { source: "LeetCode", count: 10 },
      { source: "NeetCode", count: 5 },
    ]);
  });
});

// ---- bulkDeleteEntries ----
describe("bulkDeleteEntries", () => {
  it("deletes entries and their completions", async () => {
    (Entry.deleteMany as jest.Mock).mockResolvedValue({ deletedCount: 3 });
    (TaskCompletion.deleteMany as jest.Mock).mockResolvedValue({
      deletedCount: 5,
    });

    const req = mockReq({ body: { ids: ["e1", "e2", "e3"] } });
    const res = mockRes();

    await bulkDeleteEntries(req, res);

    expect(Entry.deleteMany).toHaveBeenCalledWith({
      _id: { $in: ["e1", "e2", "e3"] },
      userId: "user1",
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ deletedCount: 3 })
    );
  });

  it("returns 400 when ids is not an array", async () => {
    const req = mockReq({ body: { ids: "not-an-array" } });
    const res = mockRes();

    await bulkDeleteEntries(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when ids is empty", async () => {
    const req = mockReq({ body: { ids: [] } });
    const res = mockRes();

    await bulkDeleteEntries(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---- updateTaskStatus ----
describe("updateTaskStatus", () => {
  it("upserts a task completion record", async () => {
    const existingEntry = { _id: "e1", userId: "user1" };
    (Entry.findOne as jest.Mock).mockResolvedValue(existingEntry);
    const completion = {
      _id: "c1",
      entry: "e1",
      userId: "user1",
      status: EntryStatus.Completed,
    };
    (TaskCompletion.findOneAndUpdate as jest.Mock).mockResolvedValue(
      completion
    );

    const req = mockReq({
      body: {
        entry: "e1",
        date: "2025-02-01",
        status: EntryStatus.Completed,
      },
    });
    const res = mockRes();

    await updateTaskStatus(req, res);

    expect(Entry.findOne).toHaveBeenCalledWith({ _id: "e1", userId: "user1" });
    expect(TaskCompletion.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ entry: "e1", userId: "user1" }),
      expect.objectContaining({ status: EntryStatus.Completed }),
      { upsert: true, new: true, runValidators: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(completion);
  });

  it("returns 400 when required fields are missing", async () => {
    const req = mockReq({ body: { entry: "e1" } });
    const res = mockRes();

    await updateTaskStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when entry not found", async () => {
    (Entry.findOne as jest.Mock).mockResolvedValue(null);

    const req = mockReq({
      body: {
        entry: "missing",
        date: "2025-02-01",
        status: EntryStatus.Completed,
      },
    });
    const res = mockRes();

    await updateTaskStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- getToday ----
describe("getToday", () => {
  it("returns 401 when user is not authenticated", async () => {
    const req = mockReq({ user: undefined });
    const res = mockRes();

    await getToday(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns today's tasks grouped by category", async () => {
    const entry = {
      _id: "e1",
      title: "Two Sum",
      category: PrepCategory.DSA,
      status: EntryStatus.Pending,
      isRecurring: false,
      deadline: new Date(),
      toObject: function () {
        return { ...this, toObject: undefined };
      },
    };

    (Entry.find as jest.Mock).mockResolvedValue([entry]);
    (TaskCompletion.find as jest.Mock).mockResolvedValue([]);

    const req = mockReq();
    const res = mockRes();

    await getToday(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response).toHaveProperty("date");
    expect(response).toHaveProperty("summary");
    expect(response).toHaveProperty("groups");
  });
});

// ---- getHistory ----
describe("getHistory", () => {
  it("returns 401 when user is not authenticated", async () => {
    const req = mockReq({ user: undefined });
    const res = mockRes();

    await getHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 400 when no date params provided", async () => {
    const req = mockReq();
    const res = mockRes();

    await getHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("handles single date query", async () => {
    (Entry.find as jest.Mock).mockResolvedValue([]);
    (TaskCompletion.find as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ query: { date: "2025-02-01" } });
    const res = mockRes();

    await getHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response).toHaveProperty("date", "2025-02-01");
    expect(response).toHaveProperty("summary");
  });

  it("handles date range query", async () => {
    (Entry.find as jest.Mock).mockResolvedValue([]);
    (TaskCompletion.find as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ query: { from: "2025-02-01", to: "2025-02-03" } });
    const res = mockRes();

    await getHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response).toHaveProperty("days");
    expect(response.days.length).toBe(3);
  });
});
