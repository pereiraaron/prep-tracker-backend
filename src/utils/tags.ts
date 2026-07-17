/** Known canonical spellings for tags (key = lowercase). */
const CANONICAL_TAGS: Record<string, string> = {
  // React hooks / APIs — preserve camelCase / API names
  usestate: "useState",
  useeffect: "useEffect",
  usecallback: "useCallback",
  usememo: "useMemo",
  useref: "useRef",
  useid: "useId",
  intersectionobserver: "IntersectionObserver",
  "intersection observer": "IntersectionObserver",
};

export const normalizeTag = (tag: string): string => {
  const trimmed = tag.trim();
  if (!trimmed) return trimmed;
  return CANONICAL_TAGS[trimmed.toLowerCase()] ?? trimmed.toLowerCase();
};

/** Trim, lowercase (or apply canonical spelling), and dedupe case-insensitively. */
export const normalizeTags = (tags: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
  }

  return result;
};
