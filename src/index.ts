import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectToDB } from "./db/connect";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";
import { logger } from "./utils/logger";
import swaggerSpec from "./swagger";
import questionRoutes from "./routes/question";
import statsRoutes from "./routes/stats";

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ["JWT_SECRET", "CONNECTION_STRING"] as const;
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`${envVar} environment variable is required`);
  }
}

const app: Express = express();
app.set("trust proxy", 1); // trust first proxy (Vercel / load balancer)

const PORT = process.env.PORT || 7002;
const isProd = process.env.NODE_ENV === "production";

// Security
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Rate limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProd ? 100 : 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { message: "Too many requests, please try again later" } },
  })
);

// Body parsing & compression
app.use(compression());
app.use(express.json({ limit: "1mb" }));

// Logging
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
app.use("/api/questions", questionRoutes);
app.use("/api/stats", statsRoutes);

// Health check
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
    logger.info(`Prep Tracker is running on port ${PORT}`);
  });
}

export default app;
