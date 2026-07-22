import {
  applyStatusSideEffects,
  assertApplicationActive,
  cascadeApplicationFromOutcome,
  normalizeInterviewOutcomeFields,
} from "../applicationPipeline";
import { Application } from "../../models/Application";
import { ApplicationStatus } from "../../types/application";
import { InterviewOutcome, InterviewStatus } from "../../types/interview";

jest.mock("../../models/Application", () => ({
  Application: {
    findOne: jest.fn(),
  },
}));

beforeEach(() => jest.clearAllMocks());

describe("applyStatusSideEffects", () => {
  it("sets appliedAt when moving to applied", () => {
    const patch = applyStatusSideEffects(ApplicationStatus.Applied, {});
    expect(patch.appliedAt).toEqual(expect.any(Date));
    expect(patch.closedAt).toBeNull();
  });

  it("sets closedAt on terminal statuses", () => {
    const patch = applyStatusSideEffects(ApplicationStatus.Rejected, {});
    expect(patch.closedAt).toEqual(expect.any(Date));
  });

  it("clears closedAt when reopening", () => {
    const patch = applyStatusSideEffects(ApplicationStatus.Interviewing, {
      closedAt: new Date(),
    });
    expect(patch.closedAt).toBeNull();
  });
});

describe("normalizeInterviewOutcomeFields", () => {
  it("defaults outcome to awaiting on complete", () => {
    const result = normalizeInterviewOutcomeFields({ status: InterviewStatus.Completed });
    expect(result.outcome).toBe(InterviewOutcome.Awaiting);
    expect(result.completedAt).toEqual(expect.any(Date));
  });

  it("clears outcome when not completed", () => {
    const result = normalizeInterviewOutcomeFields({
      status: InterviewStatus.Cancelled,
      outcome: InterviewOutcome.Offer,
    });
    expect(result.outcome).toBeNull();
  });
});

describe("assertApplicationActive", () => {
  it("returns archived error", async () => {
    (Application.findOne as jest.Mock).mockResolvedValue({ archivedAt: new Date() });
    await expect(assertApplicationActive("u1", "a1")).resolves.toBe("Application is archived");
  });

  it("returns null when active", async () => {
    (Application.findOne as jest.Mock).mockResolvedValue({ archivedAt: null });
    await expect(assertApplicationActive("u1", "a1")).resolves.toBeNull();
  });
});

describe("cascadeApplicationFromOutcome", () => {
  it("copies offer onto application when provided", async () => {
    const app = {
      status: ApplicationStatus.Interviewing,
      closedAt: null as Date | null,
      offer: undefined as any,
      save: jest.fn().mockResolvedValue(undefined),
    };
    (Application.findOne as jest.Mock).mockResolvedValue(app);

    const result = await cascadeApplicationFromOutcome("user1", "a1", InterviewOutcome.Offer, {
      offer: { baseComp: "200k" },
    });

    expect(result?.status).toBe(ApplicationStatus.Offer);
    expect(app.offer).toEqual({ baseComp: "200k" });
  });
});
