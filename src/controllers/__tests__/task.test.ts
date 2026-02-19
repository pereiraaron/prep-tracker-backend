import {
  createTask,
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
  getToday,
  getHistory,
  getDailyTaskById,
} from "../task";
import { Task } from "../../models/Task";
import { DailyTask } from "../../models/DailyTask";
import { Question } from "../../models/Question";
import { TaskStatus } from "../../types/task";
import { DailyTaskStatus } from "../../types/dailyTask";
import { isTaskOnDate, getDayRange, toISTDateString, toISTMidnight } from "../../utils/recurrence";

jest.mock("../../models/Task", () => ({
  Task: {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOneAndDelete: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

jest.mock("../../models/DailyTask", () => ({
  DailyTask: {
    create: jest.fn(),
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

jest.mock("../../models/Question", () => ({
  Question: {
    find: jest.fn(),
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
  },
}));

jest.mock("../../utils/recurrence", () => ({
  isTaskOnDate: jest.fn(),
  getDayRange: jest.fn().mockImplementation((date: Date) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    const start = new Date(d);
    const end = new Date(d);
    end.setUTCHours(23, 59, 59, 999);
    return { start, end };
  }),
  toISTDateString: jest.fn().mockImplementation((date: Date) => {
    return date.toISOString().split("T")[0];
  }),
  toISTMidnight: jest.fn().mockImplementation((date: Date) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }),
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

const mockTaskDoc = (overrides: Record<string, any> = {}) => ({
  _id: "task1",
  name: "DSA Practice",
  userId: "user1",
  category: "dsa",
  targetQuestionCount: 5,
  isRecurring: false,
  status: TaskStatus.Active,
  ...overrides,
});

const mockDailyTaskDoc = (overrides: Record<string, any> = {}) => {
  const base = {
    _id: "dt1",
    task: "task1",
    userId: "user1",
    date: new Date("2025-06-15"),
    taskName: "DSA Practice",
    category: "dsa",
    targetQuestionCount: 5,
    addedQuestionCount: 3,
    solvedQuestionCount: 1,
    status: DailyTaskStatus.InProgress,
    ...overrides,
  };
  return {
    ...base,
    toObject: () => ({ ...base }),
    toJSON: () => ({ ...base }),
  };
};

beforeEach(() => jest.clearAllMocks());

// ---- createTask ----
describe("createTask", () => {
  it("creates a non-recurring task and a DailyTask", async () => {
    const task = mockTaskDoc({ isRecurring: false });
    (Task.create as jest.Mock).mockResolvedValue(task);
    (DailyTask.create as jest.Mock).mockResolvedValue({});

    const req = mockReq({
      body: {
        name: "DSA Practice",
        category: "dsa",
        targetQuestionCount: 5,
        isRecurring: false,
      },
    });
    const res = mockRes();

    await createTask(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(Task.create).toHaveBeenCalled();
    expect(DailyTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "task1",
        userId: "user1",
        taskName: "DSA Practice",
        category: "dsa",
        targetQuestionCount: 5,
        addedQuestionCount: 0,
        solvedQuestionCount: 0,
        status: DailyTaskStatus.Pending,
      })
    );
  });

  it("creates a recurring task without creating a DailyTask", async () => {
    const task = mockTaskDoc({ isRecurring: true });
    (Task.create as jest.Mock).mockResolvedValue(task);

    const req = mockReq({
      body: {
        name: "Daily DSA",
        category: "dsa",
        targetQuestionCount: 3,
        isRecurring: true,
        recurrence: { frequency: "daily", startDate: "2025-06-15" },
      },
    });
    const res = mockRes();

    await createTask(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(DailyTask.create).not.toHaveBeenCalled();
  });

  it("uses recurrence.startDate for non-recurring task date when provided", async () => {
    const task = mockTaskDoc({ isRecurring: false });
    (Task.create as jest.Mock).mockResolvedValue(task);
    (DailyTask.create as jest.Mock).mockResolvedValue({});

    const req = mockReq({
      body: {
        name: "DSA Practice",
        category: "dsa",
        targetQuestionCount: 5,
        isRecurring: false,
        recurrence: { startDate: "2025-07-01" },
      },
    });
    const res = mockRes();

    await createTask(req, res);

    expect(DailyTask.create).toHaveBeenCalled();
    expect(toISTMidnight).toHaveBeenCalled();
  });

  it("returns 500 on error", async () => {
    (Task.create as jest.Mock).mockRejectedValue(new Error("db error"));

    const req = mockReq({ body: { name: "test" } });
    const res = mockRes();

    await createTask(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---- getAllTasks ----
describe("getAllTasks", () => {
  it("returns paginated tasks", async () => {
    const tasks = [mockTaskDoc()];
    (Task.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(tasks),
        }),
      }),
    });
    (Task.countDocuments as jest.Mock).mockResolvedValue(1);

    const req = mockReq();
    const res = mockRes();

    await getAllTasks(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toEqual(tasks);
    expect(body.pagination).toEqual({ page: 1, limit: 50, total: 1, totalPages: 1 });
  });

  it("applies category, status, and isRecurring filters", async () => {
    (Task.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
    (Task.countDocuments as jest.Mock).mockResolvedValue(0);

    const req = mockReq({
      query: { category: "dsa", status: "active", isRecurring: "true" },
    });
    const res = mockRes();

    await getAllTasks(req, res);

    const filter = (Task.find as jest.Mock).mock.calls[0][0];
    expect(filter.category).toBe("dsa");
    expect(filter.status).toBe("active");
    expect(filter.isRecurring).toBe(true);
  });

  it("converts isRecurring=false string to boolean", async () => {
    (Task.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
    (Task.countDocuments as jest.Mock).mockResolvedValue(0);

    const req = mockReq({ query: { isRecurring: "false" } });
    const res = mockRes();

    await getAllTasks(req, res);

    const filter = (Task.find as jest.Mock).mock.calls[0][0];
    expect(filter.isRecurring).toBe(false);
  });
});

// ---- getTaskById ----
describe("getTaskById", () => {
  it("returns the task", async () => {
    const task = mockTaskDoc();
    (Task.findOne as jest.Mock).mockResolvedValue(task);

    const req = mockReq({ params: { id: "task1" } });
    const res = mockRes();

    await getTaskById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: task });
  });

  it("returns 404 when not found", async () => {
    (Task.findOne as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "invalid" } });
    const res = mockRes();

    await getTaskById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- updateTask ----
describe("updateTask", () => {
  it("updates the task", async () => {
    const updatedTask = mockTaskDoc({ name: "Updated Name" });
    (Task.findOneAndUpdate as jest.Mock).mockResolvedValue(updatedTask);

    const req = mockReq({
      params: { id: "task1" },
      body: { name: "Updated Name" },
    });
    const res = mockRes();

    await updateTask(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(Task.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "task1", userId: "user1" },
      expect.objectContaining({ name: "Updated Name" }),
      { new: true, runValidators: true }
    );
  });

  it("returns 404 when not found", async () => {
    (Task.findOneAndUpdate as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "invalid" }, body: { name: "x" } });
    const res = mockRes();

    await updateTask(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ---- deleteTask ----
describe("deleteTask", () => {
  it("deletes task and cleans up daily tasks and questions", async () => {
    const task = mockTaskDoc();
    (Task.findOneAndDelete as jest.Mock).mockResolvedValue(task);
    (DailyTask.deleteMany as jest.Mock).mockResolvedValue({ deletedCount: 3 });
    (Question.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 10 });

    const req = mockReq({ params: { id: "task1" } });
    const res = mockRes();

    await deleteTask(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(DailyTask.deleteMany).toHaveBeenCalledWith({ task: "task1", userId: "user1" });
    expect(Question.updateMany).toHaveBeenCalled();
  });

  it("returns 404 when not found", async () => {
    (Task.findOneAndDelete as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "invalid" } });
    const res = mockRes();

    await deleteTask(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(DailyTask.deleteMany).not.toHaveBeenCalled();
  });
});

// ---- getToday ----
describe("getToday", () => {
  it("returns today's daily tasks with summary and groups", async () => {
    const dailyTask = mockDailyTaskDoc();

    // Step 1: existing daily tasks
    (DailyTask.find as jest.Mock).mockResolvedValue([dailyTask]);
    // Step 2: recurring tasks
    (Task.find as jest.Mock).mockResolvedValue([]);
    // Step 5: questions
    (Question.find as jest.Mock).mockResolvedValue([]);

    const req = mockReq();
    const res = mockRes();

    await getToday(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("date");
    expect(body.data).toHaveProperty("summary");
    expect(body.data.summary.total).toBe(1);
    expect(body.data).toHaveProperty("groups");
    expect(body.data.groups.length).toBe(1);
    expect(body.data.groups[0].category).toBe("dsa");
  });

  it("materializes recurring tasks", async () => {
    const recurringTask = mockTaskDoc({
      _id: "task2",
      isRecurring: true,
      recurrence: { frequency: "daily", startDate: new Date("2025-01-01") },
    });
    const newDailyTask = mockDailyTaskDoc({ _id: "dt2", task: "task2" });

    // Step 1: no existing daily tasks
    (DailyTask.find as jest.Mock).mockResolvedValue([]);
    // Step 2: one recurring task
    (Task.find as jest.Mock).mockResolvedValue([recurringTask]);
    // isTaskOnDate returns true
    (isTaskOnDate as jest.Mock).mockReturnValue(true);
    // Step 3: upsert new daily task
    (DailyTask.findOneAndUpdate as jest.Mock).mockResolvedValue(newDailyTask);
    // Step 5: no questions
    (Question.find as jest.Mock).mockResolvedValue([]);

    const req = mockReq();
    const res = mockRes();

    await getToday(req, res);

    expect(DailyTask.findOneAndUpdate).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data.summary.total).toBe(1);
  });

  it("skips materialization for tasks not on date", async () => {
    const recurringTask = mockTaskDoc({
      _id: "task2",
      isRecurring: true,
      recurrence: { frequency: "weekly", startDate: new Date("2025-01-01") },
    });

    (DailyTask.find as jest.Mock).mockResolvedValue([]);
    (Task.find as jest.Mock).mockResolvedValue([recurringTask]);
    (isTaskOnDate as jest.Mock).mockReturnValue(false);
    (Question.find as jest.Mock).mockResolvedValue([]);

    const req = mockReq();
    const res = mockRes();

    await getToday(req, res);

    expect(DailyTask.findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data.summary.total).toBe(0);
  });

  it("returns 401 when user is not authenticated", async () => {
    const req = mockReq({ user: undefined });
    const res = mockRes();

    await getToday(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("includes questions with daily tasks", async () => {
    const dailyTask = mockDailyTaskDoc({ _id: "dt1" });
    const question = { _id: "q1", dailyTask: "dt1", title: "Two Sum" };

    (DailyTask.find as jest.Mock).mockResolvedValue([dailyTask]);
    (Task.find as jest.Mock).mockResolvedValue([]);
    (Question.find as jest.Mock).mockResolvedValue([question]);

    const req = mockReq();
    const res = mockRes();

    await getToday(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    const group = body.data.groups[0];
    expect(group.dailyTasks[0].questions).toEqual([question]);
  });

  it("returns 500 on error", async () => {
    (DailyTask.find as jest.Mock).mockRejectedValue(new Error("db error"));

    const req = mockReq();
    const res = mockRes();

    await getToday(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
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

  it("returns daily tasks for a single date", async () => {
    const dailyTask = mockDailyTaskDoc();

    (DailyTask.find as jest.Mock).mockResolvedValue([dailyTask]);
    (Task.find as jest.Mock).mockResolvedValue([]);
    (Question.find as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ query: { date: "2025-06-15" } });
    const res = mockRes();

    await getHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data).toHaveProperty("date");
    expect(body.data).toHaveProperty("summary");
    expect(body.data).toHaveProperty("groups");
  });

  it("returns daily tasks for a date range", async () => {
    const dt1 = mockDailyTaskDoc({ _id: "dt1", date: new Date("2025-06-15") });
    const dt2 = mockDailyTaskDoc({ _id: "dt2", date: new Date("2025-06-16") });

    (DailyTask.find as jest.Mock).mockResolvedValue([dt1, dt2]);
    (Question.find as jest.Mock).mockResolvedValue([]);

    const req = mockReq({ query: { from: "2025-06-15", to: "2025-06-16" } });
    const res = mockRes();

    await getHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data).toHaveProperty("from");
    expect(body.data).toHaveProperty("to");
    expect(body.data).toHaveProperty("days");
    expect(body.data.days.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 400 when no query parameters provided", async () => {
    const req = mockReq({ query: {} });
    const res = mockRes();

    await getHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---- getDailyTaskById ----
describe("getDailyTaskById", () => {
  it("returns daily task with questions", async () => {
    const dailyTask = mockDailyTaskDoc();
    const questions = [{ _id: "q1", title: "Two Sum" }];

    (DailyTask.findOne as jest.Mock).mockResolvedValue(dailyTask);
    (Question.find as jest.Mock).mockResolvedValue(questions);

    const req = mockReq({ params: { id: "dt1" } });
    const res = mockRes();

    await getDailyTaskById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.data.questions).toEqual(questions);
  });

  it("returns 404 when not found", async () => {
    (DailyTask.findOne as jest.Mock).mockResolvedValue(null);

    const req = mockReq({ params: { id: "invalid" } });
    const res = mockRes();

    await getDailyTaskById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 500 on error", async () => {
    (DailyTask.findOne as jest.Mock).mockRejectedValue(new Error("db error"));

    const req = mockReq({ params: { id: "dt1" } });
    const res = mockRes();

    await getDailyTaskById(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
