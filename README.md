# Prep Tracker Backend

REST API for tracking software engineering interview preparation. Built with Express 5, TypeScript, MongoDB, and Zod.

## Quick Start

```bash
cp .env.example .env    # Fill in your values
npm install
npm run dev             # http://localhost:7002
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CONNECTION_STRING` | Yes | MongoDB connection URI |
| `JWT_SECRET` | Yes | Secret for JWT verification |
| `PORT` | No | Server port (default: 7002) |
| `NODE_ENV` | No | `development` or `production` |
| `CORS_ORIGIN` | No | Allowed origin (default: `*`) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm test` | Run tests |
| `npm run lint` | Lint with ESLint |
| `npm run format` | Format with Prettier |
| `npm run setup-db` | Create collections and indexes |

## API Endpoints

API docs available at `/api-docs` when server is running.

### Questions (`/api/questions`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Create a solved question (requires `title`, `solution`, `category`) |
| GET | `/` | List questions with filters, sorting, pagination |
| GET | `/:id` | Get question by ID |
| PUT | `/:id` | Update question |
| DELETE | `/:id` | Delete question |
| PATCH | `/:id/solve` | Mark backlog question as solved |
| PATCH | `/:id/reset` | Reset solved question to pending |
| PATCH | `/:id/star` | Toggle starred |
| GET | `/search` | Full-text search (`?q=`) |
| POST | `/bulk-delete` | Delete multiple questions |
| GET | `/backlog` | List backlog questions (no category) |
| POST | `/backlog` | Create backlog question |

**Query filters:** `category`, `status`, `difficulty`, `topic`, `source`, `tag`, `companyTag`, `starred`, `backlog`, `solvedAfter`, `solvedBefore`, `createdAfter`, `createdBefore`, `sort`, `page`, `limit`

### Stats (`/api/stats`)

| Endpoint | Chart Type | Description |
|----------|------------|-------------|
| GET `/overview` | Dashboard cards | Totals by status, category, difficulty |
| GET `/categories` | Bar chart | Per-category completion rates |
| GET `/difficulties` | Bar chart | Per-difficulty completion rates |
| GET `/topics` | Bar chart | Per-topic breakdown (`?category`) |
| GET `/sources` | Pie chart | Per-source breakdown |
| GET `/company-tags` | Bar chart | Per-company breakdown |
| GET `/tags` | Bar chart | Per-tag breakdown |
| GET `/progress` | Line chart | Daily solved counts (`?days=30`) |
| GET `/weekly-progress` | Bar chart | Weekly solved counts (`?weeks=12`) |
| GET `/cumulative-progress` | Area chart | Running total over time (`?days=90`) |
| GET `/heatmap` | Calendar heatmap | GitHub-style yearly grid (`?year=2026`) |
| GET `/difficulty-by-category` | Stacked bar | Difficulty x category cross-tab |

## Data Model

Single entity: **Question**

| Field | Type | Description |
|-------|------|-------------|
| `category` | enum / null | dsa, system_design, behavioral, machine_coding, language_framework, theory, quiz. `null` = backlog |
| `title` | string | Question title |
| `notes` | string | Personal notes |
| `solution` | string | Solution code/text |
| `status` | enum | `pending` or `solved` |
| `difficulty` | enum | easy, medium, hard |
| `topic` | string | e.g. "Arrays", "Graph", "System Design" |
| `source` | enum | leetcode, greatfrontend, geeksforgeeks, linkedin, medium, other |
| `url` | string | Problem URL |
| `tags` | string[] | Custom tags (max 20) |
| `companyTags` | string[] | Company names (max 20) |
| `starred` | boolean | Bookmarked |
| `solvedAt` | Date | When marked solved |

## Tech Stack

- **Runtime:** Node.js + Express 5
- **Language:** TypeScript 5
- **Database:** MongoDB (Mongoose 8)
- **Validation:** Zod 4
- **Auth:** JWT
- **Security:** Helmet, CORS, rate limiting, compression
- **Deployment:** Vercel-ready

## License

MIT
