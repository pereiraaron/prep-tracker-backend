const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Prep Tracker API",
    description: "Software engineer interview preparation tracker",
    version: "1.0.0",
  },
  servers: [
    { url: "/", description: "Current server" },
  ],
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
      EntryStatus: {
        type: "string" as const,
        enum: ["pending", "in_progress", "completed"],
      },
      Difficulty: {
        type: "string" as const,
        enum: ["easy", "medium", "hard"],
      },
      RecurrenceFrequency: {
        type: "string" as const,
        enum: ["daily", "weekly", "custom"],
      },
      CategoryInfo: {
        type: "object" as const,
        properties: {
          value: { $ref: "#/components/schemas/PrepCategory" },
          label: { type: "string" as const },
          description: { type: "string" as const },
        },
      },
      Entry: {
        type: "object" as const,
        properties: {
          _id: { type: "string" as const },
          title: { type: "string" as const },
          notes: { type: "string" as const },
          solution: { type: "string" as const },
          status: { $ref: "#/components/schemas/EntryStatus" },
          category: { $ref: "#/components/schemas/PrepCategory" },
          topic: { type: "string" as const },
          difficulty: { $ref: "#/components/schemas/Difficulty" },
          source: { type: "string" as const },
          url: { type: "string" as const },
          tags: { type: "array" as const, items: { type: "string" as const } },
          userId: { type: "string" as const },
          deadline: { type: "string" as const, format: "date-time" },
          isRecurring: { type: "boolean" as const },
          recurrence: {
            type: "object" as const,
            properties: {
              frequency: { $ref: "#/components/schemas/RecurrenceFrequency" },
              daysOfWeek: { type: "array" as const, items: { type: "integer" as const }, description: "0=Sun, 1=Mon, ..., 6=Sat" },
            },
          },
          recurringEndDate: { type: "string" as const, format: "date-time" },
          createdAt: { type: "string" as const, format: "date-time" },
          updatedAt: { type: "string" as const, format: "date-time" },
        },
      },
      EntryInput: {
        type: "object" as const,
        required: ["title", "category", "deadline"],
        properties: {
          title: { type: "string" as const },
          notes: { type: "string" as const },
          solution: { type: "string" as const },
          status: { $ref: "#/components/schemas/EntryStatus" },
          category: { $ref: "#/components/schemas/PrepCategory" },
          topic: { type: "string" as const },
          difficulty: { $ref: "#/components/schemas/Difficulty" },
          source: { type: "string" as const },
          url: { type: "string" as const },
          tags: { type: "array" as const, items: { type: "string" as const } },
          deadline: { type: "string" as const, format: "date-time" },
          isRecurring: { type: "boolean" as const },
          recurrence: {
            type: "object" as const,
            properties: {
              frequency: { $ref: "#/components/schemas/RecurrenceFrequency" },
              daysOfWeek: { type: "array" as const, items: { type: "integer" as const } },
            },
          },
          recurringEndDate: { type: "string" as const, format: "date-time" },
        },
      },
      TaskCompletion: {
        type: "object" as const,
        properties: {
          _id: { type: "string" as const },
          entry: { type: "string" as const },
          userId: { type: "string" as const },
          date: { type: "string" as const, format: "date-time" },
          status: { $ref: "#/components/schemas/EntryStatus" },
          notes: { type: "string" as const },
          createdAt: { type: "string" as const, format: "date-time" },
          updatedAt: { type: "string" as const, format: "date-time" },
        },
      },
      Summary: {
        type: "object" as const,
        properties: {
          total: { type: "integer" as const },
          completed: { type: "integer" as const },
          in_progress: { type: "integer" as const },
          pending: { type: "integer" as const },
        },
      },
      DaySchedule: {
        type: "object" as const,
        properties: {
          date: { type: "string" as const, format: "date" },
          summary: { $ref: "#/components/schemas/Summary" },
          groups: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                category: { type: "string" as const },
                summary: { $ref: "#/components/schemas/Summary" },
                tasks: { type: "array" as const, items: { $ref: "#/components/schemas/Entry" } },
              },
            },
          },
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
            content: { "application/json": { schema: { type: "object" as const, properties: { message: { type: "string" as const } } } } },
          },
        },
      },
    },

    // ---- Categories ----
    "/api/categories": {
      get: {
        tags: ["Categories"],
        summary: "List all prep categories",
        security: [],
        responses: {
          "200": {
            description: "Array of category info",
            content: { "application/json": { schema: { type: "array" as const, items: { $ref: "#/components/schemas/CategoryInfo" } } } },
          },
        },
      },
    },

    // ---- Entries ----
    "/api/entries": {
      get: {
        tags: ["Entries"],
        summary: "List entries with filters and pagination",
        parameters: [
          { name: "category", in: "query", schema: { $ref: "#/components/schemas/PrepCategory" } },
          { name: "topic", in: "query", schema: { type: "string" as const } },
          { name: "difficulty", in: "query", schema: { $ref: "#/components/schemas/Difficulty" } },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/EntryStatus" } },
          { name: "source", in: "query", schema: { type: "string" as const } },
          { name: "tag", in: "query", schema: { type: "string" as const }, description: "Filter by a single tag" },
          { name: "date", in: "query", schema: { type: "string" as const, format: "date" }, description: "Filter one-off tasks by exact date" },
          { name: "from", in: "query", schema: { type: "string" as const, format: "date" }, description: "Filter one-off tasks from this date" },
          { name: "to", in: "query", schema: { type: "string" as const, format: "date" }, description: "Filter one-off tasks up to this date" },
          { name: "page", in: "query", schema: { type: "integer" as const, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer" as const, default: 50, maximum: 100 } },
        ],
        responses: {
          "200": {
            description: "Paginated list of entries",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    entries: { type: "array" as const, items: { $ref: "#/components/schemas/Entry" } },
                    pagination: {
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
              },
            },
          },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      post: {
        tags: ["Entries"],
        summary: "Create a new entry",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/EntryInput" } } },
        },
        responses: {
          "201": { description: "Created entry", content: { "application/json": { schema: { $ref: "#/components/schemas/Entry" } } } },
          "401": { description: "Unauthorized" },
          "500": { description: "Server error" },
        },
      },
    },
    "/api/entries/{id}": {
      get: {
        tags: ["Entries"],
        summary: "Get entry by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" as const } }],
        responses: {
          "200": { description: "Entry object", content: { "application/json": { schema: { $ref: "#/components/schemas/Entry" } } } },
          "404": { description: "Not found" },
        },
      },
      put: {
        tags: ["Entries"],
        summary: "Update an entry",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" as const } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/EntryInput" } } },
        },
        responses: {
          "200": { description: "Updated entry", content: { "application/json": { schema: { $ref: "#/components/schemas/Entry" } } } },
          "404": { description: "Not found" },
        },
      },
      delete: {
        tags: ["Entries"],
        summary: "Delete an entry and its completions",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" as const } }],
        responses: {
          "200": { description: "Deletion confirmation", content: { "application/json": { schema: { type: "object" as const, properties: { message: { type: "string" as const } } } } } },
          "404": { description: "Not found" },
        },
      },
    },

    // ---- Search ----
    "/api/entries/search": {
      get: {
        tags: ["Entries"],
        summary: "Search entries by text",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string" as const }, description: "Search query (matches title, notes, solution, topic, source, tags)" },
        ],
        responses: {
          "200": { description: "Matching entries", content: { "application/json": { schema: { type: "array" as const, items: { $ref: "#/components/schemas/Entry" } } } } },
          "400": { description: "Missing search query" },
        },
      },
    },

    // ---- Tags / Topics / Sources ----
    "/api/entries/tags": {
      get: {
        tags: ["Entries"],
        summary: "List all tags with counts",
        responses: {
          "200": {
            description: "Array of tags",
            content: {
              "application/json": {
                schema: {
                  type: "array" as const,
                  items: {
                    type: "object" as const,
                    properties: { tag: { type: "string" as const }, count: { type: "integer" as const } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/entries/topics": {
      get: {
        tags: ["Entries"],
        summary: "List all topics with counts",
        parameters: [
          { name: "category", in: "query", schema: { $ref: "#/components/schemas/PrepCategory" }, description: "Filter topics by category" },
        ],
        responses: {
          "200": {
            description: "Array of topics",
            content: {
              "application/json": {
                schema: {
                  type: "array" as const,
                  items: {
                    type: "object" as const,
                    properties: { topic: { type: "string" as const }, count: { type: "integer" as const } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/entries/sources": {
      get: {
        tags: ["Entries"],
        summary: "List all sources with counts",
        responses: {
          "200": {
            description: "Array of sources",
            content: {
              "application/json": {
                schema: {
                  type: "array" as const,
                  items: {
                    type: "object" as const,
                    properties: { source: { type: "string" as const }, count: { type: "integer" as const } },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ---- Bulk Operations ----
    "/api/entries/bulk-delete": {
      post: {
        tags: ["Entries"],
        summary: "Bulk delete entries",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["ids"],
                properties: {
                  ids: { type: "array" as const, items: { type: "string" as const }, description: "Array of entry IDs to delete" },
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

    // ---- Scheduling ----
    "/api/entries/today": {
      get: {
        tags: ["Scheduling"],
        summary: "Get today's tasks grouped by category",
        responses: {
          "200": { description: "Today's schedule", content: { "application/json": { schema: { $ref: "#/components/schemas/DaySchedule" } } } },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/entries/history": {
      get: {
        tags: ["Scheduling"],
        summary: "Get task history for a date or date range",
        parameters: [
          { name: "date", in: "query", schema: { type: "string" as const, format: "date" }, description: "Single date lookup" },
          { name: "from", in: "query", schema: { type: "string" as const, format: "date" }, description: "Range start (use with 'to')" },
          { name: "to", in: "query", schema: { type: "string" as const, format: "date" }, description: "Range end (use with 'from')" },
        ],
        responses: {
          "200": {
            description: "Single day or array of days",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/DaySchedule" },
                    {
                      type: "object" as const,
                      properties: {
                        from: { type: "string" as const, format: "date" },
                        to: { type: "string" as const, format: "date" },
                        days: { type: "array" as const, items: { $ref: "#/components/schemas/DaySchedule" } },
                      },
                    },
                  ],
                },
              },
            },
          },
          "400": { description: "Missing date parameters" },
          "401": { description: "Unauthorized" },
        },
      },
    },

    // ---- Task Status ----
    "/api/entries/status": {
      post: {
        tags: ["Scheduling"],
        summary: "Update task completion status for a date",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["entry", "date", "status"],
                properties: {
                  entry: { type: "string" as const, description: "Entry ID" },
                  date: { type: "string" as const, format: "date" },
                  status: { $ref: "#/components/schemas/EntryStatus" },
                  notes: { type: "string" as const },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Task completion record", content: { "application/json": { schema: { $ref: "#/components/schemas/TaskCompletion" } } } },
          "400": { description: "Missing required fields" },
          "404": { description: "Entry not found" },
        },
      },
    },

    // ---- Stats ----
    "/api/stats/overview": {
      get: {
        tags: ["Stats"],
        summary: "Get overview stats (total, by status, category, difficulty)",
        responses: {
          "200": {
            description: "Overview statistics",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    total: { type: "integer" as const },
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
                      completed: { type: "integer" as const },
                      in_progress: { type: "integer" as const },
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
                      completed: { type: "integer" as const },
                      in_progress: { type: "integer" as const },
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
    "/api/stats/streaks": {
      get: {
        tags: ["Stats"],
        summary: "Get current and longest completion streaks",
        responses: {
          "200": {
            description: "Streak stats",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    currentStreak: { type: "integer" as const },
                    longestStreak: { type: "integer" as const },
                    totalActiveDays: { type: "integer" as const },
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
        summary: "Get daily completion counts over a period",
        parameters: [
          { name: "days", in: "query", schema: { type: "integer" as const, default: 30 }, description: "Number of past days to include" },
        ],
        responses: {
          "200": {
            description: "Daily completion data",
            content: {
              "application/json": {
                schema: {
                  type: "array" as const,
                  items: {
                    type: "object" as const,
                    properties: {
                      date: { type: "string" as const, format: "date" },
                      completed: { type: "integer" as const },
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
    { name: "Categories", description: "Prep category definitions" },
    { name: "Entries", description: "CRUD, search, tags, topics, sources" },
    { name: "Scheduling", description: "Daily tasks, history, and task completion" },
    { name: "Stats", description: "Analytics and progress tracking" },
  ],
};

export default swaggerSpec;
