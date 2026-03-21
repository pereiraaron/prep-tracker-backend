import { z } from "zod";

export const saveSubmissionSchema = z.object({
  files: z.record(z.string(), z.string().max(100000)).refine(
    (files) => Object.keys(files).length <= 50,
    "Cannot have more than 50 files"
  ),
});
