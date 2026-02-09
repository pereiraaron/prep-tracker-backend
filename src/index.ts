import express, { Express } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectToDB } from "./db/connect";
import swaggerSpec from "./swagger";
import categoryRoutes from "./routes/category";
import entryRoutes from "./routes/entry";
import statsRoutes from "./routes/stats";

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

const app: Express = express();
const PORT = process.env.PORT || 7002;

app.use(cors());
app.use(express.json());

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
app.use("/api/categories", categoryRoutes);
app.use("/api/entries", entryRoutes);
app.use("/api/stats", statsRoutes);

// Health check route
app.get("/", (_, res) => {
  res.status(200).json({ message: "Prep Tracker API is running" });
});

connectToDB();

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Prep Tracker is running on port ${PORT}`);
  });
}

export default app;
