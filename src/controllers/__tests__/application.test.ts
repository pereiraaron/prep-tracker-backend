import {
  createApplication,
  getApplicationById,
  updateApplicationStatus,
  archiveApplication,
  restoreApplication,
  deleteApplication,
  reorderApplications,
} from "../application";
import { Application } from "../../models/Application";
import { Interview } from "../../models/Interview";
import { ApplicationStatus } from "../../types/application";

jest.mock("../../models/Application", () => ({
  Application: {
    create: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findOneAndDelete: jest.fn(),
    countDocuments: jest.fn(),
    updateMany: jest.fn(),
    bulkWrite: jest.fn(),
  },
}));

jest.mock("../../models/Interview", () => ({
  Interview: {
    find: jest.fn(),
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
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

const mockApp = (overrides: Record<string, any> = {}) => ({
  _id: "a1",
  id: "a1",
  userId: "user1",
  company: "Google",
  role: "SWE",
  status: ApplicationStatus.Wishlist,
  starred: false,
  priority: 0,
  archivedAt: null as Date | null,
  closedAt: undefined as Date | undefined,
  offer: undefined as any,
  save: jest.fn().mockResolvedValue(undefined),
  toObject: jest.fn(function (this: any) {
    const { save, toObject, ...rest } = this;
    return rest;
  }),
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe("createApplication", () => {
  it("creates an application and appends priority", async () => {
    (Application.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ priority: 2 }),
        }),
      }),
    });
    const created = mockApp({ priority: 3, status: ApplicationStatus.Wishlist });
    (Application.create as jest.Mock).mockResolvedValue(created);

    const req = mockReq({
      body: {
        company: "Google",
        role: "SWE",
        source: "third_party",
        thirdParty: { company: "Acme Recruiting", contactName: "Sam" },
      },
    });
    const res = mockRes();

    await createApplication(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(Application.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user1",
        company: "Google",
        role: "SWE",
        priority: 3,
        source: "third_party",
        thirdParty: { company: "Acme Recruiting", contactName: "Sam" },
      })
    );
  });

  it("rejects third_party without thirdParty details", async () => {
    const req = mockReq({
      body: { company: "Google", role: "SWE", source: "third_party" },
    });
    const res = mockRes();

    await createApplication(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Application.create).not.toHaveBeenCalled();
  });
});

describe("getApplicationById", () => {
  it("returns application with interviews", async () => {
    (Application.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockApp()),
    });
    (Interview.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: "i1", round: 1 }]),
      }),
    });

    const req = mockReq({ params: { id: "a1" } });
    const res = mockRes();
    await getApplicationById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          interviews: [expect.objectContaining({ _id: "i1", round: 1 })],
        }),
      })
    );
  });
});

describe("updateApplicationStatus", () => {
  it("sets closedAt on terminal status", async () => {
    const app = mockApp();
    (Application.findOne as jest.Mock).mockResolvedValue(app);

    const req = mockReq({
      params: { id: "a1" },
      body: {
        status: ApplicationStatus.Offer,
        offer: { baseComp: "200k", deadline: new Date("2026-08-01") },
      },
    });
    const res = mockRes();
    await updateApplicationStatus(req, res);

    expect(app.status).toBe(ApplicationStatus.Offer);
    expect(app.closedAt).toEqual(expect.any(Date));
    expect(app.offer).toEqual(expect.objectContaining({ baseComp: "200k" }));
    expect(app.save).toHaveBeenCalled();
  });
});

describe("archive / restore / delete", () => {
  it("archives an application", async () => {
    const app = mockApp();
    (Application.findOne as jest.Mock).mockResolvedValue(app);
    const res = mockRes();
    await archiveApplication(mockReq({ params: { id: "a1" } }), res);
    expect(app.archivedAt).toEqual(expect.any(Date));
  });

  it("restores an archived application", async () => {
    const app = mockApp({ archivedAt: new Date() });
    (Application.findOne as jest.Mock).mockResolvedValue(app);
    const res = mockRes();
    await restoreApplication(mockReq({ params: { id: "a1" } }), res);
    expect(app.archivedAt).toBeNull();
  });

  it("soft-deletes by default", async () => {
    const app = mockApp();
    (Application.findOne as jest.Mock).mockResolvedValue(app);
    const res = mockRes();
    await deleteApplication(mockReq({ params: { id: "a1" }, query: {} }), res);
    expect(app.archivedAt).toEqual(expect.any(Date));
    expect(Interview.deleteMany).not.toHaveBeenCalled();
  });

  it("hard-deletes and cascades interviews", async () => {
    (Application.findOneAndDelete as jest.Mock).mockResolvedValue(mockApp());
    (Interview.deleteMany as jest.Mock).mockResolvedValue({ deletedCount: 2 });
    const res = mockRes();
    await deleteApplication(mockReq({ params: { id: "a1" }, query: { hard: "true" } }), res);
    expect(Interview.deleteMany).toHaveBeenCalledWith({ userId: "user1", applicationId: "a1" });
  });
});

describe("reorderApplications", () => {
  it("assigns priority by id order", async () => {
    (Application.find as jest.Mock)
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue([{ _id: "a1" }, { _id: "a2" }]),
      })
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      });
    (Application.bulkWrite as jest.Mock).mockResolvedValue({});

    const res = mockRes();
    await reorderApplications(
      mockReq({ body: { ids: ["a1", "a2"] } }),
      res
    );

    expect(Application.bulkWrite).toHaveBeenCalledWith([
      { updateOne: { filter: expect.objectContaining({ _id: "a1" }), update: { $set: { priority: 0 } } } },
      { updateOne: { filter: expect.objectContaining({ _id: "a2" }), update: { $set: { priority: 1 } } } },
    ]);
  });
});
