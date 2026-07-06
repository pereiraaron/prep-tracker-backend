/** Known canonical spellings for company tags (key = lowercase). */
const CANONICAL_COMPANY_TAGS: Record<string, string> = {
  bytedance: "ByteDance",
  linkedin: "LinkedIn",
  paypal: "PayPal",
  servicenow: "ServiceNow",
  sironamedical: "SironaMedical",
  thoughtspot: "ThoughtSpot",
  tiktok: "TikTok",
};

export const normalizeCompanyTag = (tag: string): string => {
  const trimmed = tag.trim();
  if (!trimmed) return trimmed;
  return CANONICAL_COMPANY_TAGS[trimmed.toLowerCase()] ?? trimmed;
};

/** Trim, dedupe case-insensitively, and apply canonical spellings. */
export const normalizeCompanyTags = (tags: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const normalized = normalizeCompanyTag(tag);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
  }

  return result;
};
