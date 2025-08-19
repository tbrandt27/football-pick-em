import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

// Import routes
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import gameRoutes from "./routes/games.js";
import teamRoutes from "./routes/teams.js";
import pickRoutes from "./routes/picks.js";
import seasonRoutes from "./routes/seasons.js";
import adminRoutes from "./routes/admin.js";
// import databaseAdminRoutes from "./routes/databaseAdmin.js";

// Import services
import scheduler from "./services/scheduler.js";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:4321",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/picks", pickRoutes);
app.use("/api/seasons", seasonRoutes);
app.use("/api/admin", adminRoutes);
// app.use("/api/admin/database", databaseAdminRoutes);

// Serve static logo files with graceful fallback for missing files
app.get("/logos/:filename", (req, res) => {
  const { filename } = req.params;
  const publicLogoPath = join(__dirname, "../public/logos", filename);

  // Try public folder
  if (existsSync(publicLogoPath)) {
    res.sendFile(publicLogoPath);
  } else {
    // Return a placeholder SVG for missing logos
    console.warn(`Missing logo file: ${filename}`);
    res.setHeader("Content-Type", "image/svg+xml");
    res.status(200).send(`
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="20" height="20" fill="#f3f4f6" stroke="#d1d5db"/>
        <text x="12" y="14" font-family="sans-serif" font-size="8" fill="#6b7280" text-anchor="middle">Missing</text>
      </svg>
    `);
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // Start automatic scheduler
  console.log("🕐 Starting automatic scheduler...");
  scheduler.start();
});
