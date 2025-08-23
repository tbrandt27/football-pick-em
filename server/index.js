import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import { readFileSync } from "fs";

// Import routes
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import gameRoutes from "./routes/games_refactored.js";
import teamRoutes from "./routes/teams.js";
import pickRoutes from "./routes/picks.js";
import seasonRoutes from "./routes/seasons.js";
import adminRoutes from "./routes/admin.js";
import healthRoutes from "./routes/health.js";
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
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
    },
  },
}));
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:4321",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static client files from the dist/client directory (for SSR builds)
const clientPath = join(__dirname, "../dist/client");
if (existsSync(clientPath)) {
  app.use(express.static(clientPath));
}

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/picks", pickRoutes);
app.use("/api/seasons", seasonRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/health", healthRoutes);
// app.use("/api/admin/database", databaseAdminRoutes);

// Serve static logo files with graceful fallback for missing files
app.get("/logos/:filename", (req, res) => {
  const { filename } = req.params;
  
  // Check for explicit environment variable first
  const explicitLogosPath = process.env.LOGOS_PATH;
  
  // Always try multiple paths for better reliability in different deployment environments
  const possibleLogoPaths = [
    // Try explicit path first if set
    ...(explicitLogosPath ? [join(explicitLogosPath, filename)] : []),
    // Standard relative path from current working directory
    join(process.cwd(), "public/logos", filename),
    // Path relative to server directory structure
    join(__dirname, "../public/logos", filename),
    join(__dirname, "../../public/logos", filename),
    // Path relative to project root in different deployment scenarios
    join(process.env.APP_ROOT || process.cwd(), "public/logos", filename),
    `/app/public/logos/${filename}`, // Common Docker path
    `/var/app/current/public/logos/${filename}`, // AWS App Runner path
    // Additional AWS App Runner paths
    join(process.cwd(), "../public/logos", filename),
    join(process.cwd(), "dist/client/logos", filename),
    join(__dirname, "../../dist/client/logos", filename),
    // Try relative to the built client directory
    join(process.cwd(), "dist/public/logos", filename),
    join(__dirname, "../dist/public/logos", filename),
  ];

  let logoPath = null;
  for (const testPath of possibleLogoPaths) {
    if (existsSync(testPath)) {
      logoPath = testPath;
      break;
    }
  }

  if (logoPath) {
    res.sendFile(logoPath);
  } else {
    // Log which paths were tried for debugging
    console.warn(`Missing logo file: ${filename}`);
    console.warn(`Tried paths:`, possibleLogoPaths);
    console.warn(`Current working directory:`, process.cwd());
    
    // Return a placeholder SVG for missing logos
    res.setHeader("Content-Type", "image/svg+xml");
    res.status(200).send(`
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="20" height="20" fill="#f3f4f6" stroke="#d1d5db"/>
        <text x="12" y="14" font-family="sans-serif" font-size="8" fill="#6b7280" text-anchor="middle">Missing</text>
      </svg>
    `);
  }
});

// Basic health check endpoint (keep for backward compatibility)
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Import Astro SSR handler
let astroHandler;
const serverPath = join(__dirname, "../dist/server/entry.mjs");

if (existsSync(serverPath)) {
  const astroModule = await import(serverPath);
  astroHandler = astroModule.handler;
}

// Handle all non-API routes with Astro SSR
app.get("*", async (req, res) => {
  // Skip API routes - they're already handled above
  if (req.path.startsWith('/api/') || req.path.startsWith('/logos/')) {
    return res.status(404).json({ error: "Route not found" });
  }
  
  if (astroHandler) {
    try {
      // Use Astro handler for SSR
      await astroHandler(req, res);
    } catch (error) {
      console.error("Error handling Astro request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  } else {
    res.status(404).json({ error: "Application not built. Run 'npm run build' first." });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // Start automatic scheduler
  console.log("🕐 Starting automatic scheduler...");
  scheduler.start();
});
