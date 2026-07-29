import { paginatedList, LIST_PROJECTION } from "../aggregation";

const mockModel = (items: any[], total: number) => {
  const chain: any = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.sort = jest.fn().mockReturnValue(chain);
  chain.skip = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.lean = jest.fn().mockResolvedValue(items);

  return {
    chain,
    model: {
      find: jest.fn().mockReturnValue(chain),
      countDocuments: jest.fn().mockResolvedValue(total),
    },
  };
};

describe("paginatedList", () => {
  it("sorts via find() so the sort can be served from an index", async () => {
    const { chain, model } = mockModel([{ _id: "q1" }], 1);

    const result = await paginatedList(model, { userId: "u1" }, { createdAt: -1 }, 100, 50);

    expect(model.find).toHaveBeenCalledWith({ userId: "u1" });
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(chain.skip).toHaveBeenCalledWith(100);
    expect(chain.limit).toHaveBeenCalledWith(50);
    expect(result).toEqual({ items: [{ _id: "q1" }], total: 1 });
  });

  it("projects list fields only, so solutions/notes are never loaded", async () => {
    const { chain, model } = mockModel([], 0);

    await paginatedList(model, {}, { createdAt: -1 }, 0, 50);

    const projection = chain.select.mock.calls[0][0];
    expect(projection).toEqual(LIST_PROJECTION);
    expect(projection.solutions).toBeUndefined();
    expect(projection.notes).toBeUndefined();
    expect(projection.templates).toBeUndefined();
  });

  it("counts with the same filter it queries", async () => {
    const filter = { userId: "u1", status: "solved" };
    const { model } = mockModel([], 7);

    const result = await paginatedList(model, filter, { title: 1 }, 0, 10);

    expect(model.countDocuments).toHaveBeenCalledWith(filter);
    expect(result.total).toBe(7);
  });

  it("projects textScore to sort by it, then strips it from the results", async () => {
    const { chain, model } = mockModel([{ _id: "q1", title: "Two Sum", score: 1.5 }], 1);

    const result = await paginatedList(
      model,
      { $text: { $search: "two sum" } },
      { score: { $meta: "textScore" }, createdAt: -1 },
      0,
      50
    );

    expect(chain.select.mock.calls[0][0].score).toEqual({ $meta: "textScore" });
    expect(chain.sort).toHaveBeenCalledWith({ score: { $meta: "textScore" }, createdAt: -1 });
    expect(result.items).toEqual([{ _id: "q1", title: "Two Sum" }]);
  });

  it("treats a missing count as zero", async () => {
    const { model } = mockModel([], undefined as any);

    const result = await paginatedList(model, {}, { createdAt: -1 }, 0, 50);

    expect(result.total).toBe(0);
  });
});
