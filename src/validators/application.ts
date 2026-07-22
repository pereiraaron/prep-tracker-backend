import { z } from "zod";
import { ApplicationSource, ApplicationStatus } from "../types/application";
import { normalizeCompanyTag } from "../utils/companyTags";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId");

const optionalUrl = z.url().max(2000).optional().or(z.literal(""));

const thirdPartySchema = z.object({
  company: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().email().max(320).optional().or(z.literal("")),
  contactPhone: z.string().trim().max(50).optional(),
  portalUrl: optionalUrl,
  notes: z.string().max(10000).optional(),
});

const offerSchema = z.object({
  baseComp: z.string().trim().max(100).optional(),
  equity: z.string().trim().max(100).optional(),
  bonus: z.string().trim().max(100).optional(),
  deadline: z.coerce.date().optional(),
  notes: z.string().max(10000).optional(),
});

const companyField = z
  .string()
  .trim()
  .min(1, "Company is required")
  .max(200)
  .transform(normalizeCompanyTag);

const baseApplicationFields = {
  company: companyField,
  role: z.string().trim().min(1, "Role is required").max(200),
  status: z.enum(ApplicationStatus).optional(),
  source: z.enum(ApplicationSource).optional(),
  thirdParty: thirdPartySchema.optional(),
  jobUrl: optionalUrl,
  location: z.string().trim().max(200).optional(),
  salaryRange: z.string().trim().max(100).optional(),
  notes: z.string().max(50000).optional(),
  appliedAt: z.coerce.date().optional(),
  starred: z.boolean().optional(),
  priority: z.number().int().min(0).max(10000).optional(),
  offer: offerSchema.optional(),
};

const thirdPartyRefine = <T extends { source?: ApplicationSource; thirdParty?: unknown }>(
  data: T
) => data.source !== ApplicationSource.ThirdParty || !!data.thirdParty;

export const createApplicationSchema = z
  .object(baseApplicationFields)
  .refine(thirdPartyRefine, {
    message: "thirdParty is required when source is third_party",
    path: ["thirdParty"],
  });

export const updateApplicationSchema = z
  .object({
    company: companyField.optional(),
    role: z.string().trim().min(1).max(200).optional(),
    status: z.enum(ApplicationStatus).optional(),
    source: z.enum(ApplicationSource).nullable().optional(),
    thirdParty: thirdPartySchema.nullable().optional(),
    jobUrl: optionalUrl.nullable(),
    location: z.string().trim().max(200).nullable().optional(),
    salaryRange: z.string().trim().max(100).nullable().optional(),
    notes: z.string().max(50000).nullable().optional(),
    appliedAt: z.coerce.date().nullable().optional(),
    starred: z.boolean().optional(),
    priority: z.number().int().min(0).max(10000).optional(),
    offer: offerSchema.nullable().optional(),
  })
  .refine(
    (data) => data.source !== ApplicationSource.ThirdParty || data.thirdParty !== undefined,
    {
      message: "thirdParty is required when source is third_party",
      path: ["thirdParty"],
    }
  );

export const updateApplicationStatusSchema = z.object({
  status: z.enum(ApplicationStatus),
  closedAt: z.coerce.date().optional(),
  offer: offerSchema.optional(),
});

export const reorderApplicationsSchema = z.object({
  ids: z.array(objectId).min(1).max(200),
});

export const bulkArchiveSchema = z.object({
  ids: z.array(objectId).min(1).max(100),
});

export { objectId as applicationObjectId };
