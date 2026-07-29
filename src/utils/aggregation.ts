import { PipelineStage } from "mongoose";

/** Fields needed for stats/suggestions aggregations — excludes solutions, notes, templates. */
export const STATS_FIELDS = {
  status: 1,
  category: 1,
  difficulty: 1,
  source: 1,
  topics: 1,
  tags: 1,
  companyTags: 1,
  solvedAt: 1,
  createdAt: 1,
} as const;

export const STATS_PROJECT: PipelineStage.Project = { $project: STATS_FIELDS };

/** List view fields — inclusion projection avoids loading large solution/notes blobs. */
export const LIST_FIELDS = {
  userId: 1,
  category: 1,
  title: 1,
  status: 1,
  difficulty: 1,
  topics: 1,
  source: 1,
  url: 1,
  tags: 1,
  companyTags: 1,
  starred: 1,
  solvedAt: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

/** Mongoose find/update projection (same fields as list responses). */
export const LIST_PROJECTION = { ...LIST_FIELDS };

/** Pick list-shaped fields from a full document (e.g. create response). */
export const toListQuestion = (doc: object) => {
  const source = doc as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (source._id !== undefined) out._id = source._id;
  for (const key of Object.keys(LIST_FIELDS) as Array<keyof typeof LIST_FIELDS>) {
    if (source[key as string] !== undefined) out[key as string] = source[key as string];
  }
  return out;
};

export const STATS_CACHE_TTL_MS = 600_000; // 10 minutes

export const userStatsStages = (
  userId: string,
  extraMatch: Record<string, unknown> = {}
): PipelineStage[] => [
  { $match: { userId, ...extraMatch } },
  STATS_PROJECT,
];

/** Loosely typed so Mongoose models satisfy it structurally. */
type PaginatedModel = {
  find: (filter: Record<string, unknown>) => any;
  countDocuments: (filter: Record<string, unknown>) => any;
};

type SortSpec = Record<string, 1 | -1 | { $meta: "textScore" }>;

const isTextScoreSort = (sort: SortSpec) =>
  Object.values(sort).some((v) => typeof v === "object" && v !== null && "$meta" in v);

export const paginatedList = async <T>(
  model: PaginatedModel,
  filter: Record<string, unknown>,
  sort: SortSpec,
  skip: number,
  limit: number
) => {
  // find().sort() can satisfy the sort from an index. A $sort inside a $facet
  // sub-pipeline cannot, which forces an in-memory sort of the entire match set
  // carrying the full solutions/notes blobs.
  const byTextScore = isTextScoreSort(sort);
  const projection: Record<string, unknown> = byTextScore
    ? { ...LIST_PROJECTION, score: { $meta: "textScore" } }
    : { ...LIST_PROJECTION };

  const [items, total] = await Promise.all([
    model.find(filter).select(projection).sort(sort).skip(skip).limit(limit).lean(),
    model.countDocuments(filter),
  ]);

  const list = (items ?? []) as Array<Record<string, unknown>>;
  // textScore has to be projected to be sortable on older servers; keep it internal.
  if (byTextScore) for (const item of list) delete item.score;

  return {
    items: list as T[],
    total: (total as number) ?? 0,
  };
};
