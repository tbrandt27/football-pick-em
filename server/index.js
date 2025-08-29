import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import { readFileSync } from "fs";
import { createServer } from "net";

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
import configService from "./services/configService.js";

// Load environment variables conditionally
// When using LocalStack (USE_LOCALSTACK=true), .env.local is already loaded by dotenv-cli
// so we skip loading .env to avoid conflicts
if (process.env.USE_LOCALSTACK !== 'true') {
  dotenv.config({ override: false });
}

// Global error handlers to prevent server crashes
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  
  // Log the error but don't exit immediately - let the app try to recover
  console.error('⚠️  Server continuing after uncaught exception...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  
  // Log the error but don't exit - let the app continue
  console.error('⚠️  Server continuing after unhandled rejection...');
});

// Handle process signals gracefully
let isShuttingDown = false;

const gracefulShutdown = (signal) => {
  if (isShuttingDown) {
    console.log(`⚠️  Force shutdown on ${signal}`);
    process.exit(1);
  }
  
  isShuttingDown = true;
  console.log(`🛑 Received ${signal}. Starting graceful shutdown...`);
  
  // Stop the scheduler first
  scheduler.stop();
  
  // Give some time for cleanup
  setTimeout(() => {
    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  }, 5000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

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

// Function to find an available port
const findAvailablePort = (startPort, maxAttempts = 10) => {
  return new Promise((resolve, reject) => {
    let currentPort = startPort;
    let attempts = 0;

    const tryPort = () => {
      if (attempts >= maxAttempts) {
        reject(new Error(`No available port found after ${maxAttempts} attempts starting from ${startPort}`));
        return;
      }

      const server = createServer();
      
      server.listen(currentPort, () => {
        server.once('close', () => {
          resolve(currentPort);
        });
        server.close();
      });
      
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`⚠️  Port ${currentPort} is in use, trying ${currentPort + 1}...`);
          currentPort++;
          attempts++;
          tryPort();
        } else {
          reject(err);
        }
      });
    };

    tryPort();
  });
};

// Start server with port detection
const startServer = async () => {
  try {
    // Initialize configuration service first - this must happen before any other service initialization
    console.log("🔧 Initializing configuration service...");
    await configService.initialize();
    
    // Validate that critical configuration is available in production
    if (process.env.NODE_ENV === 'production') {
      try {
        const jwtSecret = configService.getJwtSecret();
        const encryptionKey = configService.getSettingsEncryptionKey();
        if (!jwtSecret || !encryptionKey) {
          throw new Error('Critical configuration missing in production');
        }
        console.log("✅ Configuration service initialized and validated for production");
      } catch (configError) {
        console.error("❌ Production configuration validation failed:", configError.message);
        process.exit(1);
      }
    } else {
      console.log("✅ Configuration service initialized");
    }
    
    // Initialize database now that config service is ready
    const { default: db } = await import('./models/database.js');
    console.log("🔧 Initializing database...");
    await db.initialize();
    console.log("✅ Database initialized");
    
    // Initialize email service now that config service is ready
    const { default: emailService } = await import('./services/emailService.js');
    await emailService.refreshTransporter();
    console.log("📧 Email service initialized");

    let finalPort = PORT;
    
    // In development, try to find an available port if the default is in use
    if (process.env.NODE_ENV !== 'production') {
      try {
        finalPort = await findAvailablePort(PORT);
        if (finalPort !== PORT) {
          console.log(`🔄 Using port ${finalPort} instead of ${PORT}`);
          console.log(`⚠️  Update your Astro proxy configuration to point to port ${finalPort}`);
          console.log(`   or stop the process using port ${PORT} and restart`);
        }
      } catch (portError) {
        console.error('Failed to find available port:', portError.message);
        console.log('🔧 Try stopping other processes or use a different PORT environment variable');
        process.exit(1);
      }
    }

    const server = app.listen(finalPort, () => {
      console.log(`🚀 Server running on port ${finalPort}`);
      console.log(`🌐 Access your app at: http://localhost:${finalPort}`);

      // Start automatic scheduler
      console.log("🕐 Starting automatic scheduler...");
      scheduler.start();
    });

    // Handle server errors
    server.on('error', (error) => {
      console.error('🚨 Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${finalPort} is already in use`);
        if (process.env.NODE_ENV === 'production') {
          console.error('🔧 In production, ensure the PORT environment variable is set to an available port');
        } else {
          console.error('🔧 Try stopping other processes or restart the development server');
        }
        process.exit(1);
      }
    });

    return server;
  } catch (error) {
    console.error('🚨 Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer().catch(error => {
  console.error('🚨 Server startup failed:', error);
  process.exit(1);
});
