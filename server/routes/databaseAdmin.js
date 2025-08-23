import express from "express";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import databaseSwitcher from "../utils/databaseSwitcher.js";
import db from "../models/database.js";

const router = express.Router();

// Middleware to only allow database admin routes in development
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Database admin routes are not available in production' });
  }
  next();
});

// Get current database mode and info
router.get("/status", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const info = databaseSwitcher.getDatabaseInfo();
    res.json({
      success: true,
      data: info,
    });
  } catch (error) {
    console.error("Get database status error:", error);
    res.status(500).json({ error: "Failed to get database status" });
  }
});

// Switch database mode
router.post("/switch", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { mode } = req.body;

    if (!mode || !["production", "test"].includes(mode)) {
      return res
        .status(400)
        .json({ error: 'Invalid mode. Must be "production" or "test"' });
    }

    const result = await databaseSwitcher.switchToMode(mode);

    if (result.success) {
      // Reinitialize database connection to use the new database
      await db.reinitialize();

      res.json({
        success: true,
        message: result.message,
        currentMode: result.currentMode,
        previousMode: result.previousMode,
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error("Switch database error:", error);
    res.status(500).json({ error: "Failed to switch database" });
  }
});

// Create test database
router.post(
  "/create-test",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const result = await databaseSwitcher.createTestDatabase();

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
        });
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error) {
      console.error("Create test database error:", error);
      res.status(500).json({ error: "Failed to create test database" });
    }
  }
);

// Reset test database (copy from production)
router.post(
  "/reset-test",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const result = await databaseSwitcher.resetTestDatabase();

      if (result.success) {
        // If we're currently in test mode, reinitialize the connection
        const currentMode = databaseSwitcher.getCurrentMode();
        if (currentMode === "test") {
          await db.reinitialize();
        }

        res.json({
          success: true,
          message: result.message,
        });
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error) {
      console.error("Reset test database error:", error);
      res.status(500).json({ error: "Failed to reset test database" });
    }
  }
);

// Populate test database with test data
router.post(
  "/populate-test",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const currentMode = databaseSwitcher.getCurrentMode();

      if (currentMode !== "test") {
        return res.status(400).json({
          error:
            "Can only populate test data when in test mode. Switch to test mode first.",
        });
      }

      // Test data population functionality has been removed
      // The test-schedule script and related test data files have been cleaned up
      res.status(501).json({
        error: "Test data population is not currently available",
        message: "The test data generation scripts have been removed as part of cleanup. Consider implementing a new test data seeding mechanism if needed.",
      });
    } catch (error) {
      console.error("Populate test database error:", error);
      res.status(500).json({ error: "Failed to populate test database" });
    }
  }
);

export default router;
