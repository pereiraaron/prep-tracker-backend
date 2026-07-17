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

export const LIST_PROJECT: PipelineStage.Project = { $project: LIST_FIELDS };

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

type AggregateModel = {
  aggregate: (pipeline: PipelineStage[]) => Promise<Array<{ data: unknown[]; total: Array<{ count: number }> }>>;
};

type SortSpec = Record<string, 1 | -1 | { $meta: "textScore" }>;

export const paginatedList = async <T>(
  model: AggregateModel,
  filter: Record<string, unknown>,
  sort: SortSpec,
  skip: number,
  limit: number
) => {
  // Project only the page of docs (after sort/skip/limit), not the full match set
  const [result] = await model.aggregate([
    { $match: filter },
    {
      $facet: {
        data: [{ $sort: sort as PipelineStage.Sort["$sort"] }, { $skip: skip }, { $limit: limit }, LIST_PROJECT],
        total: [{ $count: "count" }],
      },
    },
  ]);

  return {
    items: result.data as T[],
    total: result.total[0]?.count ?? 0,
  };
};
