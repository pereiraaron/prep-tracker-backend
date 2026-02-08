import express, { Express } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectToDB } from "./db/connect";
import typeRoutes from "./routes/type";
import subtypeRoutes from "./routes/subtype";
import entryRoutes from "./routes/entry";

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

const app: Express = express();
const PORT = process.env.PORT || 7002;

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/types", typeRoutes);
app.use("/api/subtypes", subtypeRoutes);
app.use("/api/entries", entryRoutes);

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
