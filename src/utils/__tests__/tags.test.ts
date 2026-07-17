import { normalizeTag, normalizeTags } from "../tags";

describe("normalizeTag", () => {
  it("lowercases ordinary tags", () => {
    expect(normalizeTag("React")).toBe("react");
    expect(normalizeTag("  CSS  ")).toBe("css");
  });

  it("preserves canonical React hook casing", () => {
    expect(normalizeTag("usestate")).toBe("useState");
    expect(normalizeTag("UseEffect")).toBe("useEffect");
  });

  it("merges Intersection Observer aliases", () => {
    expect(normalizeTag("Intersection Observer")).toBe("IntersectionObserver");
    expect(normalizeTag("intersectionobserver")).toBe("IntersectionObserver");
  });
});

describe("normalizeTags", () => {
  it("dedupes case-insensitively and applies canonical forms", () => {
    expect(normalizeTags(["React", "react", "useState", "usestate", "CSS"])).toEqual([
      "react",
      "useState",
      "css",
    ]);
  });

  it("drops empty/whitespace tags", () => {
    expect(normalizeTags(["  important  ", "", "   "])).toEqual(["important"]);
  });
});
