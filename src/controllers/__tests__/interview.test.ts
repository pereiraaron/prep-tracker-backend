import {
  createInterview,
  completeInterview,
  setInterviewOutcome,
  rescheduleInterview,
  createInterviewLoop,
} from "../interview";
import { Application } from "../../models/Application";
import { Interview } from "../../models/Interview";
import { Question } from "../../models/Question";
import { ApplicationStatus } from "../../types/application";
import { InterviewOutcome, InterviewStatus, InterviewType } from "../../types/interview";

jest.mock("../../models/Application", () => ({
  Application: {
    findOne: jest.fn(),
  },
}));

jest.mock("../../models/Interview", () => ({
  Interview: {
    create: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    deleteOne: jest.fn(),
  },
}));

jest.mock("../../models/Question", () => ({
  Question: {
    countDocuments: jest.fn(),
  },
}));

jest.mock("../../utils/cache", () => ({
  cache: {
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
    user: { id: "user1", timezone: "Asia/Kolkata" },
    params: {},
    query: {},
    body: {},
    ...overrides,
  }) as any;

const mockApp = (overrides: Record<string, any> = {}) => ({
  _id: "a1",
  id: "a1",
  userId: "user1",
  company: "Google",
  role: "SWE",
  status: ApplicationStatus.Applied,
  archivedAt: null as Date | null,
  closedAt: undefined as Date | undefined,
  offer: undefined as any,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const mockInterview = (overrides: Record<string, any> = {}) => ({
  _id: "i1",
  id: "i1",
  userId: "user1",
  applicationId: "a1",
  company: "Google",
  role: "SWE",
  round: 1,
  type: InterviewType.Technical,
  status: InterviewStatus.Scheduled,
  outcome: undefined as InterviewOutcome | undefined,
  completedAt: undefined as Date | undefined,
  rescheduledToId: undefined as string | undefined,
  interviewers: [],
  questionIds: [],
  save: jest.fn().mockResolvedValue(undefined),
  toObject: jest.fn(function (this: any) {
    const { save, toObject, ...rest } = this;
    return rest;
  }),
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe("createInterview", () => {
  it("creates interview, denormalizes company/role, promotes application", async () => {
    const app = mockApp();
    (Application.findOne as jest.Mock).mockResolvedValue(app);
    (Interview.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      }),
    });
    const created = mockInterview();
    (Interview.create as jest.Mock).mockResolvedValue(created);

    const req = mockReq({
      body: {
        applicationId: "a1",
        type: InterviewType.Technical,
        scheduledAt: new Date("2026-08-01T10:00:00Z"),
      },
    });
    const res = mockRes();
    await createInterview(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(Interview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        company: "Google",
        role: "SWE",
        round: 1,
        status: InterviewStatus.Scheduled,
        timezone: "Asia/Kolkata",
      })
    );
    expect(app.status).toBe(ApplicationStatus.Interviewing);
    expect(app.save).toHaveBeenCalled();
  });
});

describe("completeInterview + outcome cascade", () => {
  it("completes with awaiting by default", async () => {
    const interview = mockInterview();
    (Interview.findOne as jest.Mock).mockResolvedValue(interview);
    (Application.findOne as jest.Mock).mockResolvedValue(
      mockApp({ status: ApplicationStatus.Interviewing })
    );

    const res = mockRes();
    await completeInterview(
      mockReq({ params: { id: "i1" }, body: { outcome: InterviewOutcome.Awaiting } }),
      res
    );

    expect(interview.status).toBe(InterviewStatus.Completed);
    expect(interview.outcome).toBe(InterviewOutcome.Awaiting);
    expect(interview.completedAt).toEqual(expect.any(Date));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nextRound: null }),
      })
    );
  });

  it("cascades offer outcome and offer details to application", async () => {
    const interview = mockInterview({
      status: InterviewStatus.Completed,
      outcome: InterviewOutcome.Awaiting,
    });
    (Interview.findOne as jest.Mock).mockResolvedValue(interview);
    const app = mockApp({ status: ApplicationStatus.Interviewing, offer: undefined });
    (Application.findOne as jest.Mock).mockResolvedValue(app);

    const res = mockRes();
    await setInterviewOutcome(
      mockReq({
        params: { id: "i1" },
        body: {
          outcome: InterviewOutcome.Offer,
          offer: { baseComp: "180k", equity: "10k" },
        },
      }),
      res
    );

    expect(interview.outcome).toBe(InterviewOutcome.Offer);
    expect(app.status).toBe(ApplicationStatus.Offer);
    expect(app.closedAt).toEqual(expect.any(Date));
    expect(app.offer).toEqual(expect.objectContaining({ baseComp: "180k", equity: "10k" }));
  });

  it("creates next round when advanced with createNextRound", async () => {
    const interview = mockInterview({
      status: InterviewStatus.Completed,
      outcome: InterviewOutcome.Awaiting,
    });
    (Interview.findOne as jest.Mock)
      .mockResolvedValueOnce(interview)
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue({ round: 1 }),
          }),
        }),
      });
    (Application.findOne as jest.Mock).mockResolvedValue(
      mockApp({ status: ApplicationStatus.Interviewing })
    );
    const next = mockInterview({ _id: "i2", id: "i2", round: 2, type: InterviewType.SystemDesign });
    (Interview.create as jest.Mock).mockResolvedValue(next);

    const res = mockRes();
    await setInterviewOutcome(
      mockReq({
        params: { id: "i1" },
        body: {
          outcome: InterviewOutcome.Advanced,
          createNextRound: true,
          nextRoundType: InterviewType.SystemDesign,
        },
      }),
      res
    );

    expect(Interview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        round: 2,
        type: InterviewType.SystemDesign,
        status: InterviewStatus.Scheduled,
      })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextRound: expect.objectContaining({ round: 2 }),
        }),
      })
    );
  });

  it("blocks mutations when application is archived", async () => {
    (Interview.findOne as jest.Mock).mockResolvedValue(mockInterview());
    (Application.findOne as jest.Mock).mockResolvedValue(
      mockApp({ archivedAt: new Date() })
    );

    const res = mockRes();
    await completeInterview(
      mockReq({ params: { id: "i1" }, body: { outcome: InterviewOutcome.Awaiting } }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ message: "Application is archived" }),
      })
    );
  });

  it("rejects completing an already-completed interview", async () => {
    (Interview.findOne as jest.Mock).mockResolvedValue(
      mockInterview({ status: InterviewStatus.Completed, outcome: InterviewOutcome.Awaiting })
    );
    (Application.findOne as jest.Mock).mockResolvedValue(mockApp());

    const res = mockRes();
    await completeInterview(
      mockReq({
        params: { id: "i1" },
        body: { outcome: InterviewOutcome.Advanced, createNextRound: true },
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Interview.create).not.toHaveBeenCalled();
  });
});

describe("rescheduleInterview", () => {
  it("marks old as rescheduled and creates replacement", async () => {
    const existing = mockInterview();
    (Interview.findOne as jest.Mock).mockResolvedValue(existing);
    (Application.findOne as jest.Mock).mockResolvedValue(mockApp());
    const replacement = mockInterview({ _id: "i2", id: "i2" });
    (Interview.create as jest.Mock).mockResolvedValue(replacement);

    const res = mockRes();
    await rescheduleInterview(
      mockReq({
        params: { id: "i1" },
        body: { scheduledAt: new Date("2026-08-10T10:00:00Z") },
      }),
      res
    );

    expect(existing.status).toBe(InterviewStatus.Rescheduled);
    expect(existing.rescheduledToId).toBe("i2");
    expect(Interview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: InterviewStatus.Scheduled,
        round: 1,
        type: InterviewType.Technical,
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rolls back the replacement if saving the original fails", async () => {
    const existing = mockInterview({
      save: jest.fn().mockRejectedValue(new Error("save failed")),
    });
    (Interview.findOne as jest.Mock).mockResolvedValue(existing);
    (Application.findOne as jest.Mock).mockResolvedValue(mockApp());
    (Interview.create as jest.Mock).mockResolvedValue(mockInterview({ _id: "i2", id: "i2" }));
    (Interview.deleteOne as jest.Mock).mockResolvedValue({ deletedCount: 1 });

    const res = mockRes();
    await rescheduleInterview(
      mockReq({ params: { id: "i1" }, body: { scheduledAt: new Date("2026-08-10T10:00:00Z") } }),
      res
    );

    expect(Interview.deleteOne).toHaveBeenCalledWith({ _id: "i2", userId: "user1" });
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("createInterviewLoop", () => {
  it("creates multiple slots with shared loopId", async () => {
    const app = mockApp();
    (Application.findOne as jest.Mock).mockResolvedValue(app);
    (Interview.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      }),
    });
    (Interview.create as jest.Mock).mockImplementation(async (data: any) =>
      mockInterview({ ...data, _id: Math.random().toString(16).slice(2), id: "ix" })
    );

    const res = mockRes();
    await createInterviewLoop(
      mockReq({
        body: {
          applicationId: "a1",
          slots: [
            { type: InterviewType.Technical, scheduledAt: new Date("2026-08-01T10:00:00Z") },
            { type: InterviewType.Behavioral, scheduledAt: new Date("2026-08-01T11:00:00Z") },
          ],
        },
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(Interview.create).toHaveBeenCalledTimes(2);
    const loopIds = (Interview.create as jest.Mock).mock.calls.map((c) => c[0].loopId);
    expect(loopIds[0]).toBeTruthy();
    expect(loopIds[0]).toBe(loopIds[1]);
    expect(Question.countDocuments).not.toHaveBeenCalled();
  });
});
