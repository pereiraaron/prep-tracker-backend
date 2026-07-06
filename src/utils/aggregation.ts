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
const LIST_FIELDS = {
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

export const paginatedList = async <T>(
  model: AggregateModel,
  filter: Record<string, unknown>,
  sort: Record<string, 1 | -1>,
  skip: number,
  limit: number
) => {
  const [result] = await model.aggregate([
    { $match: filter },
    LIST_PROJECT,
    {
      $facet: {
        data: [{ $sort: sort }, { $skip: skip }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    },
  ]);

  return {
    items: result.data as T[],
    total: result.total[0]?.count ?? 0,
  };
};
