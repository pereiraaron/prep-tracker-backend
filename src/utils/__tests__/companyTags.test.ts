import { normalizeCompanyTag, normalizeCompanyTags } from "../companyTags";

describe("normalizeCompanyTag", () => {
  it("applies canonical spelling", () => {
    expect(normalizeCompanyTag("linkedin")).toBe("LinkedIn");
    expect(normalizeCompanyTag("Tiktok")).toBe("TikTok");
  });

  it("preserves unknown companies", () => {
    expect(normalizeCompanyTag("Google")).toBe("Google");
  });
});

describe("normalizeCompanyTags", () => {
  it("dedupes case-insensitive variants", () => {
    expect(normalizeCompanyTags(["LinkedIn", "linkedin", "Google"])).toEqual([
      "LinkedIn",
      "Google",
    ]);
  });

  it("trims and skips empty strings", () => {
    expect(normalizeCompanyTags(["  Meta  ", "", "   "])).toEqual(["Meta"]);
  });
});
