export enum PrepCategory {
  DSA = "dsa",
  SystemDesign = "system_design",
  MachineCoding = "machine_coding",
  LanguageFramework = "language_framework",
  Theory = "theory",
}

export const SOLUTION_OPTIONAL_CATEGORIES: PrepCategory[] = [
  PrepCategory.SystemDesign,
  PrepCategory.Theory,
  PrepCategory.LanguageFramework,
];

export const CATEGORY_LABEL: Record<string, string> = {
  dsa: "DSA",
  system_design: "System Design",
  machine_coding: "Machine Coding",
  language_framework: "Language & Framework",
  theory: "Theory",
};
