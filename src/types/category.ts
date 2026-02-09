export enum PrepCategory {
  DSA = "dsa",
  SystemDesign = "system_design",
  Behavioral = "behavioral",
  MachineCoding = "machine_coding",
  LanguageFramework = "language_framework",
}

export const PREP_CATEGORIES = [
  {
    value: PrepCategory.DSA,
    label: "Data Structures & Algorithms",
    description: "Coding problems, algorithmic thinking, and data structure usage",
  },
  {
    value: PrepCategory.SystemDesign,
    label: "System Design",
    description: "Designing scalable systems, architecture, and trade-off analysis",
  },
  {
    value: PrepCategory.Behavioral,
    label: "Behavioral",
    description: "Behavioral and situational interview questions",
  },
  {
    value: PrepCategory.MachineCoding,
    label: "Machine Coding",
    description: "Live coding rounds building small applications or features",
  },
  {
    value: PrepCategory.LanguageFramework,
    label: "Language & Framework",
    description: "Language-specific and framework-specific knowledge",
  },
];
