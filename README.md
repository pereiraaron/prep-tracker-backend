# Prep Tracker Backend

REST API for tracking software engineering interview preparation. Built with Express, TypeScript, and MongoDB.

## Architecture

Three core models:

- **Task** - Named, optionally recurring containers (e.g. "DSA Daily Practice")
- **TaskInstance** - Per-day snapshots of a task, created lazily on dashboard load
- **Question** - Individual questions added and solved within an instance, or saved to a backlog for later

Recurring tasks use lazy materialization -- instances are created on demand when `GET /api/tasks/today` is called, not via CRON. This makes it compatible with serverless deployments (Vercel).

Questions can also exist in a **backlog** (not tied to any task). Backlog questions can be moved into an active task instance when the user is ready to solve them. Moving from backlog to task is one-way -- questions cannot be moved back to backlog.

## Tech Stack

- Node.js + Express 5
- TypeScript
- MongoDB + Mongoose
- JWT authentication
- Deployed on Vercel

## Setup

```bash
npm install
```

Create a `.env` file:

```
CONNECTION_STRING=mongodb+srv://...
JWT_SECRET=your-secret-key
PORT=7002
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |
| `npm test` | Run tests |
| `npm run setup-db` | Create collections and indexes |
| `npm run migrate` | Migrate from old Entry/TaskCompletion schema |

## API Endpoints

All endpoints except health require a `Bearer` JWT token.

### Public

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health check |

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tasks` | Create a task |
| GET | `/api/tasks` | List tasks (filters: category, status, isRecurring) |
| GET | `/api/tasks/today` | Get today's instances (materializes recurring tasks) |
| GET | `/api/tasks/history` | Get past instances (query: date, from, to) |
| GET | `/api/tasks/:id` | Get a task |
| PUT | `/api/tasks/:id` | Update a task (future instances only) |
| DELETE | `/api/tasks/:id` | Delete task + all instances + questions |
| GET | `/api/tasks/instances/:id` | Get an instance with its questions |

### Questions

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/questions` | Add a question to an instance |
| GET | `/api/questions` | List questions (filters: backlog, task, instance, status, difficulty, topic, source, tag) |
| POST | `/api/questions/backlog` | Create a backlog question (not tied to any task) |
| GET | `/api/questions/backlog` | List backlog questions |
| GET | `/api/questions/search` | Search by text (query: q, status, difficulty) |
| GET | `/api/questions/tags` | All tags with counts |
| GET | `/api/questions/topics` | All topics with counts |
| GET | `/api/questions/sources` | All sources with counts |
| GET | `/api/questions/:id` | Get a question |
| PUT | `/api/questions/:id` | Update a question |
| PATCH | `/api/questions/:id/solve` | Mark as solved |
| PATCH | `/api/questions/:id/move` | Move a backlog question to a task instance |
| DELETE | `/api/questions/:id` | Delete a question |
| POST | `/api/questions/bulk-delete` | Bulk delete questions |
| POST | `/api/questions/bulk-move` | Bulk move backlog questions to a task instance |

### Stats

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stats/overview` | Totals by status, category, difficulty |
| GET | `/api/stats/categories` | Per-category breakdown with completion rates |
| GET | `/api/stats/difficulties` | Per-difficulty breakdown with completion rates |
| GET | `/api/stats/streaks` | Current and longest completion streaks |
| GET | `/api/stats/progress` | Daily solved counts (query: days, default 30) |

## Data Models

### Task

```
name                 String, required
category             "dsa" | "system_design" | "behavioral" | "machine_coding" | "language_framework"
targetQuestionCount  Number, min 1
isRecurring          Boolean
recurrence           { frequency, daysOfWeek[], interval, startDate }
endDate              Date, optional
status               "active" | "completed"
```

Recurrence frequencies: `daily`, `weekly`, `biweekly`, `monthly`, `custom`

### TaskInstance

```
task                  ref Task
date                  Date (normalized to midnight)
taskName              String (snapshot)
category              String (snapshot)
targetQuestionCount   Number (snapshot)
addedQuestionCount    Number (denormalized counter)
solvedQuestionCount   Number (denormalized counter)
status                "pending" | "incomplete" | "in_progress" | "completed"
```

Status transitions:
- **pending** -- no questions added yet
- **incomplete** -- added < target
- **in_progress** -- has questions, not all solved
- **completed** -- all questions solved AND added >= target

### Question

```
taskInstance   ref TaskInstance (null for backlog questions)
task           ref Task (null for backlog questions)
title          String, required
notes          String
solution       String
status         "pending" | "in_progress" | "solved"
difficulty     "easy" | "medium" | "hard"
topic          String
source         "leetcode" | "greatfrontend" | "other"
url            String
tags           [String]
solvedAt       Date
```

## Swagger Docs

Interactive API docs available at `/api-docs` when the server is running.

## License

MIT
