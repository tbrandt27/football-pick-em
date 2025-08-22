import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseSwitcher {
  constructor() {
    // Use the same path as the original database setup
    const originalDbPath =
      process.env.DATABASE_PATH ||
      path.join(__dirname, "../../database.sqlite");
    const dbDir = path.dirname(originalDbPath);
    const dbName = path.basename(originalDbPath, path.extname(originalDbPath));
    const dbExt = path.extname(originalDbPath);

    this.dbDir = dbDir;
    this.productionDb = originalDbPath;
    this.testDb = path.join(dbDir, `${dbName}_test${dbExt}`);
    this.currentDb = path.join(dbDir, `${dbName}_current${dbExt}`);
    this.configFile = path.join(dbDir, "db_config.json");

    // Ensure data directory exists
    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }

    this.initializeConfig();
  }

  initializeConfig() {
    // Create config file if it doesn't exist
    if (!fs.existsSync(this.configFile)) {
      const config = {
        currentMode: "production",
        lastSwitched: new Date().toISOString(),
        databases: {
          production: "football_pickem.db",
          test: "football_pickem_test.db",
        },
      };
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
    }

    // Ensure current database symlink points to the right file
    this.syncCurrentDatabase();
  }

  getCurrentMode() {
    try {
      const config = JSON.parse(fs.readFileSync(this.configFile, "utf8"));
      return config.currentMode || "production";
    } catch (error) {
      console.error("Error reading database config:", error);
      return "production";
    }
  }

  getConfig() {
    try {
      return JSON.parse(fs.readFileSync(this.configFile, "utf8"));
    } catch (error) {
      console.error("Error reading database config:", error);
      return {
        currentMode: "production",
        lastSwitched: new Date().toISOString(),
        databases: {
          production: "football_pickem.db",
          test: "football_pickem_test.db",
        },
      };
    }
  }

  syncCurrentDatabase() {
    const mode = this.getCurrentMode();
    const targetDb = mode === "test" ? this.testDb : this.productionDb;

    // Remove existing current database link/file
    if (fs.existsSync(this.currentDb)) {
      fs.unlinkSync(this.currentDb);
    }

    // Create symlink or copy based on platform
    try {
      // Try symlink first (works on Unix-like systems)
      fs.symlinkSync(path.basename(targetDb), this.currentDb);
    } catch (error) {
      // Fallback to copying file (works on Windows)
      if (fs.existsSync(targetDb)) {
        fs.copyFileSync(targetDb, this.currentDb);
      }
    }
  }

  async switchToMode(mode) {
    if (!["production", "test"].includes(mode)) {
      throw new Error('Invalid mode. Must be "production" or "test"');
    }

    const currentMode = this.getCurrentMode();
    if (currentMode === mode) {
      return {
        success: true,
        message: `Already in ${mode} mode`,
        currentMode: mode,
      };
    }

    try {
      // Update config
      const config = this.getConfig();
      config.currentMode = mode;
      config.lastSwitched = new Date().toISOString();
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));

      // Sync the current database
      this.syncCurrentDatabase();

      return {
        success: true,
        message: `Switched to ${mode} mode successfully`,
        currentMode: mode,
        previousMode: currentMode,
      };
    } catch (error) {
      console.error("Error switching database mode:", error);
      return {
        success: false,
        error: `Failed to switch to ${mode} mode: ${error.message}`,
      };
    }
  }

  getDatabaseInfo() {
    const config = this.getConfig();
    const stats = {};

    // Get file stats for each database
    ["production", "test"].forEach((mode) => {
      const dbPath = mode === "test" ? this.testDb : this.productionDb;
      if (fs.existsSync(dbPath)) {
        const stat = fs.statSync(dbPath);
        stats[mode] = {
          exists: true,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          path: dbPath,
        };
      } else {
        stats[mode] = {
          exists: false,
          size: 0,
          modified: null,
          path: dbPath,
        };
      }
    });

    return {
      currentMode: config.currentMode,
      lastSwitched: config.lastSwitched,
      databases: stats,
    };
  }

  async createTestDatabase() {
    try {
      // If test database doesn't exist, create it by copying production
      if (!fs.existsSync(this.testDb) && fs.existsSync(this.productionDb)) {
        fs.copyFileSync(this.productionDb, this.testDb);
      }

      return {
        success: true,
        message: "Test database created successfully",
      };
    } catch (error) {
      console.error("Error creating test database:", error);
      return {
        success: false,
        error: `Failed to create test database: ${error.message}`,
      };
    }
  }

  async resetTestDatabase() {
    try {
      // Remove test database if it exists
      if (fs.existsSync(this.testDb)) {
        fs.unlinkSync(this.testDb);
      }

      // Copy production database to test
      if (fs.existsSync(this.productionDb)) {
        fs.copyFileSync(this.productionDb, this.testDb);
      }

      // If we're currently in test mode, sync the current database
      if (this.getCurrentMode() === "test") {
        this.syncCurrentDatabase();
      }

      return {
        success: true,
        message: "Test database reset successfully",
      };
    } catch (error) {
      console.error("Error resetting test database:", error);
      return {
        success: false,
        error: `Failed to reset test database: ${error.message}`,
      };
    }
  }

  getCurrentDatabasePath() {
    const mode = this.getCurrentMode();
    return mode === "test" ? this.testDb : this.productionDb;
  }
}

export default new DatabaseSwitcher();
