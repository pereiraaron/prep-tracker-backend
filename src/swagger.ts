const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Prep Tracker API",
    description: "Software engineer interview preparation tracker",
    version: "2.0.0",
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
      TaskStatus: {
        type: "string" as const,
        enum: ["active", "completed"],
      },
      DailyTaskStatus: {
        type: "string" as const,
        enum: ["pending", "incomplete", "in_progress", "completed"],
      },
      QuestionStatus: {
        type: "string" as const,
        enum: ["pending", "in_progress", "solved"],
      },
      Difficulty: {
        type: "string" as const,
        enum: ["easy", "medium", "hard"],
      },
      QuestionSource: {
        type: "string" as const,
        enum: ["leetcode", "greatfrontend", "other"],
      },
      RecurrenceFrequency: {
        type: "string" as const,
        enum: ["daily", "weekly", "biweekly", "monthly", "custom"],
      },
      Task: {
        type: "object" as const,
        properties: {
          _id: { type: "string" as const },
          name: { type: "string" as const },
          userId: { type: "string" as const },
          category: { $ref: "#/components/schemas/PrepCategory" },
          targetQuestionCount: { type: "integer" as const, minimum: 1 },
          isRecurring: { type: "boolean" as const },
          recurrence: {
            type: "object" as const,
            properties: {
              frequency: { $ref: "#/components/schemas/RecurrenceFrequency" },
              daysOfWeek: { type: "array" as const, items: { type: "integer" as const }, description: "0=Sun, 1=Mon, ..., 6=Sat" },
              interval: { type: "integer" as const, description: "For custom frequency - every N days" },
              startDate: { type: "string" as const, format: "date-time" },
            },
          },
          endDate: { type: "string" as const, format: "date-time" },
          status: { $ref: "#/components/schemas/TaskStatus" },
          createdAt: { type: "string" as const, format: "date-time" },
          updatedAt: { type: "string" as const, format: "date-time" },
        },
      },
      TaskInput: {
        type: "object" as const,
        required: ["name", "category", "targetQuestionCount"],
        properties: {
          name: { type: "string" as const },
          category: { $ref: "#/components/schemas/PrepCategory" },
          targetQuestionCount: { type: "integer" as const, minimum: 1 },
          isRecurring: { type: "boolean" as const },
          recurrence: {
            type: "object" as const,
            properties: {
              frequency: { $ref: "#/components/schemas/RecurrenceFrequency" },
              daysOfWeek: { type: "array" as const, items: { type: "integer" as const } },
              interval: { type: "integer" as const },
              startDate: { type: "string" as const, format: "date-time" },
            },
          },
          endDate: { type: "string" as const, format: "date-time" },
        },
      },
      DailyTask: {
        type: "object" as const,
        properties: {
          _id: { type: "string" as const },
          task: { type: "string" as const },
          userId: { type: "string" as const },
          date: { type: "string" as const, format: "date-time" },
          taskName: { type: "string" as const },
          category: { type: "string" as const },
          targetQuestionCount: { type: "integer" as const },
          addedQuestionCount: { type: "integer" as const },
          solvedQuestionCount: { type: "integer" as const },
          status: { $ref: "#/components/schemas/DailyTaskStatus" },
          questions: { type: "array" as const, items: { $ref: "#/components/schemas/Question" } },
          createdAt: { type: "string" as const, format: "date-time" },
          updatedAt: { type: "string" as const, format: "date-time" },
        },
      },
      Question: {
        type: "object" as const,
        properties: {
          _id: { type: "string" as const },
          dailyTask: { type: "string" as const, nullable: true, description: "null for backlog questions" },
          task: { type: "string" as const, nullable: true, description: "null for backlog questions" },
          userId: { type: "string" as const },
          title: { type: "string" as const },
          notes: { type: "string" as const },
          solution: { type: "string" as const },
          status: { $ref: "#/components/schemas/QuestionStatus" },
          difficulty: { $ref: "#/components/schemas/Difficulty" },
          topic: { type: "string" as const },
          source: { $ref: "#/components/schemas/QuestionSource" },
          url: { type: "string" as const },
          tags: { type: "array" as const, items: { type: "string" as const } },
          solvedAt: { type: "string" as const, format: "date-time" },
          createdAt: { type: "string" as const, format: "date-time" },
          updatedAt: { type: "string" as const, format: "date-time" },
        },
      },
      QuestionInput: {
        type: "object" as const,
        required: ["dailyTaskId", "title"],
        properties: {
          dailyTaskId: { type: "string" as const, description: "ID of the daily task to add question to" },
          title: { type: "string" as const },
          notes: { type: "string" as const },
          solution: { type: "string" as const },
          difficulty: { $ref: "#/components/schemas/Difficulty" },
          topic: { type: "string" as const },
          source: { $ref: "#/components/schemas/QuestionSource" },
          url: { type: "string" as const },
          tags: { type: "array" as const, items: { type: "string" as const } },
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
        },
      },
      MoveInput: {
        type: "object" as const,
        required: ["dailyTaskId"],
        properties: {
          dailyTaskId: { type: "string" as const, description: "Target daily task ID" },
        },
      },
      BulkMoveInput: {
        type: "object" as const,
        required: ["questionIds", "dailyTaskId"],
        properties: {
          questionIds: { type: "array" as const, items: { type: "string" as const }, description: "Array of backlog question IDs to move" },
          dailyTaskId: { type: "string" as const, description: "Target daily task ID" },
        },
      },
      Summary: {
        type: "object" as const,
        properties: {
          total: { type: "integer" as const },
          completed: { type: "integer" as const },
          incomplete: { type: "integer" as const },
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
                dailyTasks: { type: "array" as const, items: { $ref: "#/components/schemas/DailyTask" } },
              },
            },
          },
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
            content: { "application/json": { schema: { type: "object" as const, properties: { message: { type: "string" as const } } } } },
          },
        },
      },
    },

    // ---- Tasks ----
    "/api/tasks": {
      get: {
        tags: ["Tasks"],
        summary: "List tasks with filters and pagination",
        parameters: [
          { name: "category", in: "query", schema: { $ref: "#/components/schemas/PrepCategory" } },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/TaskStatus" } },
          { name: "isRecurring", in: "query", schema: { type: "boolean" as const } },
          { name: "page", in: "query", schema: { type: "integer" as const, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer" as const, default: 50, maximum: 100 } },
        ],
        responses: {
          "200": {
            description: "Paginated list of tasks",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    tasks: { type: "array" as const, items: { $ref: "#/components/schemas/Task" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Tasks"],
        summary: "Create a new task",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/TaskInput" } } },
        },
        responses: {
          "201": { description: "Created task", content: { "application/json": { schema: { $ref: "#/components/schemas/Task" } } } },
          "500": { description: "Server error" },
        },
      },
    },
    "/api/tasks/today": {
      get: {
        tags: ["Tasks"],
        summary: "Get today's daily tasks (materializes recurring tasks)",
        responses: {
          "200": { description: "Today's schedule", content: { "application/json": { schema: { $ref: "#/components/schemas/DaySchedule" } } } },
        },
      },
    },
    "/api/tasks/history": {
      get: {
        tags: ["Tasks"],
        summary: "Get daily task history for a date or date range",
        parameters: [
          { name: "date", in: "query", schema: { type: "string" as const, format: "date" }, description: "Single date lookup" },
          { name: "from", in: "query", schema: { type: "string" as const, format: "date" }, description: "Range start" },
          { name: "to", in: "query", schema: { type: "string" as const, format: "date" }, description: "Range end" },
        ],
        responses: {
          "200": { description: "Schedule data", content: { "application/json": { schema: { $ref: "#/components/schemas/DaySchedule" } } } },
          "400": { description: "Missing date parameters" },
        },
      },
    },
    "/api/tasks/daily/{id}": {
      get: {
        tags: ["Tasks"],
        summary: "Get a daily task with its questions",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" as const } }],
        responses: {
          "200": { description: "Daily task with questions", content: { "application/json": { schema: { $ref: "#/components/schemas/DailyTask" } } } },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/tasks/{id}": {
      get: {
        tags: ["Tasks"],
        summary: "Get task by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" as const } }],
        responses: {
          "200": { description: "Task object", content: { "application/json": { schema: { $ref: "#/components/schemas/Task" } } } },
          "404": { description: "Not found" },
        },
      },
      put: {
        tags: ["Tasks"],
        summary: "Update a task (changes apply to future daily tasks only)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" as const } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/TaskInput" } } },
        },
        responses: {
          "200": { description: "Updated task", content: { "application/json": { schema: { $ref: "#/components/schemas/Task" } } } },
          "404": { description: "Not found" },
        },
      },
      delete: {
        tags: ["Tasks"],
        summary: "Delete a task and all its daily tasks and questions",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" as const } }],
        responses: {
          "200": { description: "Deletion confirmation" },
          "404": { description: "Not found" },
        },
      },
    },

    // ---- Questions ----
    "/api/questions": {
      get: {
        tags: ["Questions"],
        summary: "List questions with filters and pagination",
        parameters: [
          { name: "backlog", in: "query", schema: { type: "string" as const, enum: ["true", "all"] }, description: "true=backlog only, all=include backlog, omit=exclude backlog" },
          { name: "task", in: "query", schema: { type: "string" as const }, description: "Filter by task ID" },
          { name: "dailyTask", in: "query", schema: { type: "string" as const }, description: "Filter by daily task ID" },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/QuestionStatus" } },
          { name: "difficulty", in: "query", schema: { $ref: "#/components/schemas/Difficulty" } },
          { name: "topic", in: "query", schema: { type: "string" as const } },
          { name: "source", in: "query", schema: { type: "string" as const } },
          { name: "tag", in: "query", schema: { type: "string" as const } },
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
        summary: "Add a question to a daily task",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/QuestionInput" } } },
        },
        responses: {
          "201": { description: "Created question", content: { "application/json": { schema: { $ref: "#/components/schemas/Question" } } } },
          "404": { description: "Daily task not found" },
        },
      },
    },
    "/api/questions/backlog": {
      get: {
        tags: ["Questions"],
        summary: "List backlog questions (not assigned to any task)",
        parameters: [
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/QuestionStatus" } },
          { name: "difficulty", in: "query", schema: { $ref: "#/components/schemas/Difficulty" } },
          { name: "topic", in: "query", schema: { type: "string" as const } },
          { name: "source", in: "query", schema: { type: "string" as const } },
          { name: "tag", in: "query", schema: { type: "string" as const } },
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
          "201": { description: "Created backlog question", content: { "application/json": { schema: { $ref: "#/components/schemas/Question" } } } },
          "500": { description: "Server error" },
        },
      },
    },
    "/api/questions/bulk-move": {
      post: {
        tags: ["Questions"],
        summary: "Move multiple backlog questions to a daily task",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/BulkMoveInput" } } },
        },
        responses: {
          "200": {
            description: "Move result",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    movedCount: { type: "integer" as const },
                    skippedCount: { type: "integer" as const },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid input" },
          "404": { description: "Daily task not found" },
        },
      },
    },
    "/api/questions/search": {
      get: {
        tags: ["Questions"],
        summary: "Search questions by text",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string" as const }, description: "Search query (matches title, notes, solution, topic, source, tags)" },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/QuestionStatus" } },
          { name: "difficulty", in: "query", schema: { $ref: "#/components/schemas/Difficulty" } },
        ],
        responses: {
          "200": { description: "Matching questions", content: { "application/json": { schema: { type: "array" as const, items: { $ref: "#/components/schemas/Question" } } } } },
          "400": { description: "Missing search query" },
        },
      },
    },
    "/api/questions/tags": {
      get: {
        tags: ["Questions"],
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
    "/api/questions/topics": {
      get: {
        tags: ["Questions"],
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
    "/api/questions/sources": {
      get: {
        tags: ["Questions"],
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
                  ids: { type: "array" as const, items: { type: "string" as const }, description: "Array of question IDs to delete" },
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
          "200": { description: "Question object", content: { "application/json": { schema: { $ref: "#/components/schemas/Question" } } } },
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
          "200": { description: "Updated question", content: { "application/json": { schema: { $ref: "#/components/schemas/Question" } } } },
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
          "200": { description: "Solved question", content: { "application/json": { schema: { $ref: "#/components/schemas/Question" } } } },
          "400": { description: "Already solved or is a backlog question" },
          "404": { description: "Not found" },
        },
      },
    },
    "/api/questions/{id}/move": {
      patch: {
        tags: ["Questions"],
        summary: "Move a backlog question to a daily task",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" as const } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/MoveInput" } } },
        },
        responses: {
          "200": { description: "Moved question", content: { "application/json": { schema: { $ref: "#/components/schemas/Question" } } } },
          "400": { description: "Question is already assigned to a daily task" },
          "404": { description: "Question or daily task not found" },
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
                      solved: { type: "integer" as const },
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
        summary: "Get daily solved question counts over a period",
        parameters: [
          { name: "days", in: "query", schema: { type: "integer" as const, default: 30 }, description: "Number of past days to include" },
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
  },
  tags: [
    { name: "Health", description: "Health check" },
    { name: "Tasks", description: "Task CRUD, scheduling, and daily tasks" },
    { name: "Questions", description: "Question CRUD, search, solve, tags, topics, sources" },
    { name: "Stats", description: "Analytics and progress tracking" },
  ],
};

export default swaggerSpec;
