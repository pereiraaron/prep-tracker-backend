const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Prep Tracker API",
    description: "Software engineer interview preparation tracker",
    version: "2.0.0",
  },
  servers: [{ url: "/", description: "Current server" }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http" as const,
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      Error: {
        type: "object" as const,
        properties: {
          message: { type: "string" as const },
        },
      },
      PrepCategory: {
        type: "string" as const,
        enum: ["dsa", "system_design", "behavioral", "machine_coding", "language_framework"],
      },
      QuestionStatus: {
        type: "string" as const,
        enum: ["pending", "solved"],
      },
      Difficulty: {
        type: "string" as const,
        enum: ["easy", "medium", "hard"],
      },
      QuestionSource: {
        type: "string" as const,
        enum: ["leetcode", "greatfrontend", "other"],
      },
      Question: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          userId: { type: "string" as const },
          category: {
            $ref: "#/components/schemas/PrepCategory",
            nullable: true,
            description: "null for backlog questions",
          },
          title: { type: "string" as const },
          notes: { type: "string" as const },
          solution: { type: "string" as const },
          status: { $ref: "#/components/schemas/QuestionStatus" },
          difficulty: { $ref: "#/components/schemas/Difficulty" },
          topic: { type: "string" as const },
          source: { $ref: "#/components/schemas/QuestionSource" },
          url: { type: "string" as const },
          tags: { type: "array" as const, items: { type: "string" as const } },
          companyTags: { type: "array" as const, items: { type: "string" as const } },
          starred: { type: "boolean" as const, default: false },
          solvedAt: { type: "string" as const, format: "date-time" },
          createdAt: { type: "string" as const, format: "date-time" },
          updatedAt: { type: "string" as const, format: "date-time" },
        },
      },
      QuestionInput: {
        type: "object" as const,
        required: ["title", "solution", "category"],
        properties: {
          title: { type: "string" as const },
          notes: { type: "string" as const },
          solution: { type: "string" as const },
          difficulty: { $ref: "#/components/schemas/Difficulty" },
          topic: { type: "string" as const },
          source: { $ref: "#/components/schemas/QuestionSource" },
          url: { type: "string" as const },
          tags: { type: "array" as const, items: { type: "string" as const } },
          companyTags: { type: "array" as const, items: { type: "string" as const } },
          category: { $ref: "#/components/schemas/PrepCategory" },
        },
      },
      BacklogQuestionInput: {
        type: "object" as const,
        required: ["title"],
        properties: {
          title: { type: "string" as const },
          notes: { type: "string" as const },
          solution: { type: "string" as const },
          difficulty: { $ref: "#/components/schemas/Difficulty" },
          topic: { type: "string" as const },
          source: { $ref: "#/components/schemas/QuestionSource" },
          url: { type: "string" as const },
          tags: { type: "array" as const, items: { type: "string" as const } },
          companyTags: { type: "array" as const, items: { type: "string" as const } },
        },
      },
      Pagination: {
        type: "object" as const,
        properties: {
          page: { type: "integer" as const },
          limit: { type: "integer" as const },
          total: { type: "integer" as const },
          totalPages: { type: "integer" as const },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
  paths: {
    "/": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        security: [],
        responses: {
          "200": {
            description: "API is running",
            content: {
              "application/json": {
                schema: { type: "object" as const, properties: { message: { type: "string" as const } } },
              },
            },
          },
        },
      },
    },

    // ---- Questions ----
    "/api/questions": {
      get: {
        tags: ["Questions"],
        summary: "List questions with filters and pagination",
        parameters: [
          {
            name: "backlog",
            in: "query",
            schema: { type: "string" as const, enum: ["true", "all"] },
            description: "true=backlog only, all=include backlog, omit=exclude backlog",
          },
          {
            name: "category",
            in: "query",
            schema: { $ref: "#/components/schemas/PrepCategory" },
            description: "Filter by category",
          },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/QuestionStatus" } },
          { name: "difficulty", in: "query", schema: { $ref: "#/components/schemas/Difficulty" } },
          { name: "topic", in: "query", schema: { type: "string" as const } },
          { name: "source", in: "query", schema: { type: "string" as const } },
          { name: "tag", in: "query", schema: { type: "string" as const } },
          {
            name: "companyTag",
            in: "query",
            schema: { type: "string" as const },
            description: "Filter by company tag",
          },
          {
            name: "starred",
            in: "query",
            schema: { type: "string" as const, enum: ["true"] },
            description: "Filter starred questions only",
          },
          {
            name: "solvedAfter",
            in: "query",
            schema: { type: "string" as const, format: "date-time" },
            description: "Filter solved after date",
          },
          {
            name: "solvedBefore",
            in: "query",
            schema: { type: "string" as const, format: "date-time" },
            description: "Filter solved before date",
          },
          {
            name: "createdAfter",
            in: "query",
            schema: { type: "string" as const, format: "date-time" },
            description: "Filter created after date",
          },
          {
            name: "createdBefore",
            in: "query",
            schema: { type: "string" as const, format: "date-time" },
            description: "Filter created before date",
          },
          {
            name: "sort",
            in: "query",
            schema: { type: "string" as const },
            description: "Sort field with optional - prefix for desc (e.g. -solvedAt, title, difficulty)",
          },
          { name: "page", in: "query", schema: { type: "integer" as const, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer" as const, default: 50, maximum: 100 } },
        ],
        responses: {
          "200": {
            description: "Paginated list of questions",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    questions: { type: "array" as const, items: { $ref: "#/components/schemas/Question" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Questions"],
        summary: "Create a new question",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/QuestionInput" } } },
        },
        responses: {
          "201": {
            description: "Created question",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Question" } } },
          },
          "500": { description: "Server error" },
        },
      },
    },
    "/api/questions/backlog": {
      get: {
        tags: ["Questions"],
        summary: "List backlog questions (no category assigned)",
        parameters: [
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/QuestionStatus" } },
          { name: "difficulty", in: "query", schema: { $ref: "#/components/schemas/Difficulty" } },
          { name: "topic", in: "query", schema: { type: "string" as const } },
          { name: "source", in: "query", schema: { type: "string" as const } },
          { name: "tag", in: "query", schema: { type: "string" as const } },
          {
            name: "starred",
            in: "query",
            schema: { type: "string" as const, enum: ["true"] },
            description: "Filter starred questions only",
          },
          { name: "page", in: "query", schema: { type: "integer" as const, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer" as const, default: 50, maximum: 100 } },
        ],
        responses: {
          "200": {
            description: "Paginated list of backlog questions",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    questions: { type: "array" as const, items: { $ref: "#/components/schemas/Question" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Questions"],
        summary: "Create a backlog question (not tied to any task)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/BacklogQuestionInput" } } },
        },
        responses: {
          "201": {
            description: "Created backlog question",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Question" } } },
          },
          "500": { description: "Server error" },
        },
      },
    },
    "/api/questions/search": {
      get: {
        tags: ["Questions"],
        summary: "Search questions by text",
        parameters: [
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string" as const },
            description: "Search query (matches title, notes, solution, topic, source, tags)",
          },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/QuestionStatus" } },
          { name: "difficulty", in: "query", schema: { $ref: "#/components/schemas/Difficulty" } },
        ],
        responses: {
          "200": {
            description: "Matching questions",
            content: {
              "application/json": {
                schema: { type: "array" as const, items: { $ref: "#/components/schemas/Question" } },
              },
            },
          },
          "400": { description: "Missing search query" },
        },
      },
    },
    "/api/questions/bulk-delete": {
      post: {
        tags: ["Questions"],
        summary: "Bulk delete questions",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["ids"],
                properties: {
                  ids: {
                    type: "array" as const,
                    items: { type: "string" as const },
                    description: "Array of question IDs to delete",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Deletion result",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    message: { type: "string" as const },
                    deletedCount: { type: "integer" as const },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid input" },
        },
      },
    },
    "/api/questions/{id}": {
      get: {
        tags: ["Questions"],
        summary: "Get question by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" as const } }],
        responses: {
          "200": {
            description: "Question object",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Question" } } },
          },
          "404": { description: "Not found" },
        },
      },
      put: {
        tags: ["Questions"],
        summary: "Update a question",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" as const } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  title: { type: "string" as const },
                  notes: { type: "string" as const },
                  solution: { type: "string" as const },
                  difficulty: { $ref: "#/components/schemas/Difficulty" },
                  topic: { type: "string" as const },
                  source: { type: "string" as const },
                  url: { type: "string" as const },
                  tags: { type: "array" as const, items: { type: "string" as const } },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated question",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Question" } } },
          },
          "404": { description: "Not found" },
        },
      },
      delete: {
        tags: ["Questions"],
        summary: "Delete a question",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" as const } }],
        responses: {
          "200": { description: "Deletion confirmation" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/questions/{id}/solve": {
      patch: {
        tags: ["Questions"],
        summary: "Mark a question as solved",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" as const } }],
        responses: {
          "200": {
            description: "Solved question",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Question" } } },
          },
          "400": { description: "Already solved" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/questions/{id}/reset": {
      patch: {
        tags: ["Questions"],
        summary: "Reset a solved question back to pending",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" as const } }],
        responses: {
          "200": {
            description: "Reset question",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Question" } } },
          },
          "400": { description: "Question is not solved" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/questions/{id}/star": {
      patch: {
        tags: ["Questions"],
        summary: "Toggle starred status on a question",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" as const } }],
        responses: {
          "200": {
            description: "Updated question",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Question" } } },
          },
          "404": { description: "Not found" },
        },
      },
    },
    // ---- Stats ----
    "/api/stats/overview": {
      get: {
        tags: ["Stats"],
        summary: "Get overview stats (total questions, by status, category, difficulty)",
        responses: {
          "200": {
            description: "Overview statistics",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    total: { type: "integer" as const },
                    backlogCount: { type: "integer" as const, description: "Number of questions in backlog" },
                    byStatus: { type: "object" as const, additionalProperties: { type: "integer" as const } },
                    byCategory: { type: "object" as const, additionalProperties: { type: "integer" as const } },
                    byDifficulty: { type: "object" as const, additionalProperties: { type: "integer" as const } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/stats/categories": {
      get: {
        tags: ["Stats"],
        summary: "Get per-category breakdown with completion rates",
        responses: {
          "200": {
            description: "Category breakdown",
            content: {
              "application/json": {
                schema: {
                  type: "array" as const,
                  items: {
                    type: "object" as const,
                    properties: {
                      category: { type: "string" as const },
                      total: { type: "integer" as const },
                      solved: { type: "integer" as const },

                      pending: { type: "integer" as const },
                      completionRate: { type: "integer" as const, description: "Percentage (0-100)" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/stats/difficulties": {
      get: {
        tags: ["Stats"],
        summary: "Get per-difficulty breakdown with completion rates",
        responses: {
          "200": {
            description: "Difficulty breakdown",
            content: {
              "application/json": {
                schema: {
                  type: "array" as const,
                  items: {
                    type: "object" as const,
                    properties: {
                      difficulty: { type: "string" as const },
                      total: { type: "integer" as const },
                      solved: { type: "integer" as const },

                      pending: { type: "integer" as const },
                      completionRate: { type: "integer" as const, description: "Percentage (0-100)" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/stats/topics": {
      get: {
        tags: ["Stats"],
        summary: "Get per-topic breakdown with completion rates",
        parameters: [
          {
            name: "category",
            in: "query",
            schema: { $ref: "#/components/schemas/PrepCategory" },
            description: "Filter by category",
          },
        ],
        responses: {
          "200": {
            description: "Topic breakdown",
            content: {
              "application/json": {
                schema: {
                  type: "array" as const,
                  items: {
                    type: "object" as const,
                    properties: {
                      topic: { type: "string" as const },
                      total: { type: "integer" as const },
                      solved: { type: "integer" as const },

                      pending: { type: "integer" as const },
                      completionRate: { type: "integer" as const, description: "Percentage (0-100)" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/stats/progress": {
      get: {
        tags: ["Stats"],
        summary: "Get daily solved question counts over a period (line/bar chart)",
        parameters: [
          {
            name: "days",
            in: "query",
            schema: { type: "integer" as const, default: 30 },
            description: "Number of past days to include",
          },
        ],
        responses: {
          "200": {
            description: "Daily solve data",
            content: {
              "application/json": {
                schema: {
                  type: "array" as const,
                  items: {
                    type: "object" as const,
                    properties: {
                      date: { type: "string" as const, format: "date" },
                      solved: { type: "integer" as const },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/stats/sources": {
      get: {
        tags: ["Stats"],
        summary: "Get per-source breakdown with completion rates (pie/bar chart)",
        responses: {
          "200": {
            description: "Source breakdown",
            content: {
              "application/json": {
                schema: {
                  type: "array" as const,
                  items: {
                    type: "object" as const,
                    properties: {
                      source: { type: "string" as const },
                      total: { type: "integer" as const },
                      solved: { type: "integer" as const },
                      pending: { type: "integer" as const },
                      completionRate: { type: "integer" as const },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/stats/company-tags": {
      get: {
        tags: ["Stats"],
        summary: "Get per-company breakdown with completion rates (bar chart)",
        responses: {
          "200": {
            description: "Company tag breakdown sorted by total desc",
            content: {
              "application/json": {
                schema: {
                  type: "array" as const,
                  items: {
                    type: "object" as const,
                    properties: {
                      companyTag: { type: "string" as const },
                      total: { type: "integer" as const },
                      solved: { type: "integer" as const },
                      pending: { type: "integer" as const },
                      completionRate: { type: "integer" as const },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/stats/tags": {
      get: {
        tags: ["Stats"],
        summary: "Get per-tag breakdown with completion rates (bar chart)",
        responses: {
          "200": {
            description: "Tag breakdown sorted by total desc",
            content: {
              "application/json": {
                schema: {
                  type: "array" as const,
                  items: {
                    type: "object" as const,
                    properties: {
                      tag: { type: "string" as const },
                      total: { type: "integer" as const },
                      solved: { type: "integer" as const },
                      pending: { type: "integer" as const },
                      completionRate: { type: "integer" as const },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/stats/heatmap": {
      get: {
        tags: ["Stats"],
        summary: "Get GitHub-style contribution heatmap for a year (calendar heatmap)",
        parameters: [
          {
            name: "year",
            in: "query",
            schema: { type: "integer" as const },
            description: "Year to get heatmap for (default: current year)",
          },
        ],
        responses: {
          "200": {
            description: "Object mapping each date to solved count",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  additionalProperties: { type: "integer" as const },
                  description: "Keys are YYYY-MM-DD date strings, values are solved counts",
                },
              },
            },
          },
        },
      },
    },
    "/api/stats/weekly-progress": {
      get: {
        tags: ["Stats"],
        summary: "Get weekly aggregated solved counts (bar chart)",
        parameters: [
          {
            name: "weeks",
            in: "query",
            schema: { type: "integer" as const, default: 12 },
            description: "Number of past weeks to include",
          },
        ],
        responses: {
          "200": {
            description: "Weekly solve data",
            content: {
              "application/json": {
                schema: {
                  type: "array" as const,
                  items: {
                    type: "object" as const,
                    properties: {
                      week: { type: "string" as const, description: "ISO week (e.g. 2026-W08)" },
                      startDate: { type: "string" as const, format: "date" },
                      solved: { type: "integer" as const },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/stats/cumulative-progress": {
      get: {
        tags: ["Stats"],
        summary: "Get running total of solved questions over time (area/line chart)",
        parameters: [
          {
            name: "days",
            in: "query",
            schema: { type: "integer" as const, default: 90 },
            description: "Number of past days to include",
          },
        ],
        responses: {
          "200": {
            description: "Cumulative solve data showing growth trajectory",
            content: {
              "application/json": {
                schema: {
                  type: "array" as const,
                  items: {
                    type: "object" as const,
                    properties: {
                      date: { type: "string" as const, format: "date" },
                      total: { type: "integer" as const, description: "Running total of solved questions" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/stats/difficulty-by-category": {
      get: {
        tags: ["Stats"],
        summary: "Get difficulty x category cross-tabulation (stacked bar / radar chart)",
        responses: {
          "200": {
            description: "Per-category difficulty distribution",
            content: {
              "application/json": {
                schema: {
                  type: "array" as const,
                  items: {
                    type: "object" as const,
                    properties: {
                      category: { type: "string" as const },
                      easy: { type: "integer" as const },
                      medium: { type: "integer" as const },
                      hard: { type: "integer" as const },
                      total: { type: "integer" as const },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  tags: [
    { name: "Health", description: "Health check" },
    { name: "Questions", description: "Question CRUD, search, solve, tags, topics, sources" },
    { name: "Stats", description: "Analytics and progress tracking" },
  ],
};

export default swaggerSpec;
