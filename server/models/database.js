import dotenv from "dotenv";
import DatabaseProviderFactory from "../providers/DatabaseProviderFactory.js";
import DatabaseInitializer from "../services/databaseInitializer.js";

dotenv.config();

class Database {
  constructor() {
    this.provider = null;
    this.initialize();
  }

  async initialize() {
    try {
      this.provider = DatabaseProviderFactory.createProvider();
      await this.provider.initialize();
      console.log(`Database initialized with provider: ${this.provider.getType()}`);
      
      // Auto-seed database if needed
      const initializer = new DatabaseInitializer(this);
      await initializer.initialize();
      
    } catch (error) {
      console.error("Error initializing database:", error);
      throw error;
    }
  }

  // Method to reinitialize database connection (used when switching databases)
  async reinitialize() {
    try {
      if (this.provider && typeof this.provider.reinitialize === 'function') {
        await this.provider.reinitialize();
      } else {
        // Fallback: close and recreate provider
        if (this.provider) {
          await this.provider.close();
        }
        await this.initialize();
      }
      console.log("Database reinitialized successfully");
    } catch (error) {
      console.error("Error reinitializing database:", error);
      throw error;
    }
  }

  // Helper method to run queries with promises
  async run(sql, params = []) {
    if (!this.provider) {
      throw new Error("Database provider not initialized");
    }
    return await this.provider.run(sql, params);
  }

  // Helper method to get single row
  async get(sql, params = []) {
    if (!this.provider) {
      throw new Error("Database provider not initialized");
    }
    return await this.provider.get(sql, params);
  }

  // Helper method to get all rows
  async all(sql, params = []) {
    if (!this.provider) {
      throw new Error("Database provider not initialized");
    }
    return await this.provider.all(sql, params);
  }

  // Execute a transaction
  async transaction(callback) {
    if (!this.provider) {
      throw new Error("Database provider not initialized");
    }
    return await this.provider.transaction(callback);
  }

  // Get database type
  getType() {
    return this.provider ? this.provider.getType() : 'unknown';
  }

  // Close database connection
  async close() {
    if (this.provider) {
      await this.provider.close();
      this.provider = null;
    }
  }
}

// Create singleton instance
const db = new Database();

export default db;
