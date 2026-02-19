import express, { Express } from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectToDB } from "./db/connect";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";
import swaggerSpec from "./swagger";
import taskRoutes from "./routes/task";
import questionRoutes from "./routes/question";
import statsRoutes from "./routes/stats";

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

const app: Express = express();
const PORT = process.env.PORT || 7002;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(requestLogger);

// Swagger docs
app.get("/api-docs/spec.json", (_, res) => {
  res.status(200).json(swaggerSpec);
});
app.get("/api-docs", (_, res) => {
  res.status(200).send(`<!DOCTYPE html>
<html><head>
<title>Prep Tracker API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head><body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({url:"/api-docs/spec.json",dom_id:"#swagger-ui"})</script>
</body></html>`);
});

// Routes
app.use("/api/tasks", taskRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/stats", statsRoutes);

// Health check route
app.get("/", async (_, res) => {
  const dbOk = mongoose.connection.readyState === 1;
  const status = dbOk ? 200 : 503;
  res.status(status).json({
    success: true,
    data: {
      status: dbOk ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      db: dbOk ? "connected" : "disconnected",
    },
  });
});

// Centralized error handler (must be after routes)
app.use(errorHandler);

connectToDB();

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Prep Tracker is running on port ${PORT}`);
  });
}

export default app;
