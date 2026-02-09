import { PrepCategory, PREP_CATEGORIES } from "../category";

describe("PrepCategory enum", () => {
  it("has exactly 5 categories", () => {
    expect(Object.values(PrepCategory)).toHaveLength(5);
  });

  it("contains the expected values", () => {
    expect(PrepCategory.DSA).toBe("dsa");
    expect(PrepCategory.SystemDesign).toBe("system_design");
    expect(PrepCategory.Behavioral).toBe("behavioral");
    expect(PrepCategory.MachineCoding).toBe("machine_coding");
    expect(PrepCategory.LanguageFramework).toBe("language_framework");
  });
});

describe("PREP_CATEGORIES", () => {
  it("has an entry for every PrepCategory enum value", () => {
    const values = PREP_CATEGORIES.map((c) => c.value);
    for (const cat of Object.values(PrepCategory)) {
      expect(values).toContain(cat);
    }
  });

  it("has the same length as the enum", () => {
    expect(PREP_CATEGORIES).toHaveLength(Object.values(PrepCategory).length);
  });

  it("each entry has value, label, and description", () => {
    for (const cat of PREP_CATEGORIES) {
      expect(cat).toHaveProperty("value");
      expect(cat).toHaveProperty("label");
      expect(cat).toHaveProperty("description");
      expect(typeof cat.value).toBe("string");
      expect(typeof cat.label).toBe("string");
      expect(typeof cat.description).toBe("string");
      expect(cat.label.length).toBeGreaterThan(0);
      expect(cat.description.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate values", () => {
    const values = PREP_CATEGORIES.map((c) => c.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
