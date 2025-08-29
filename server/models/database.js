import dotenv from "dotenv";
import DatabaseProviderFactory from "../providers/DatabaseProviderFactory.js";
import DatabaseInitializer from "../services/databaseInitializer.js";

// Load environment variables conditionally
// When using LocalStack (USE_LOCALSTACK=true), .env.local is already loaded by dotenv-cli
// so we skip loading .env to avoid conflicts
if (process.env.USE_LOCALSTACK !== 'true') {
  dotenv.config({ override: false });
}

class Database {
  constructor() {
    this.provider = null;
    this.initialized = false;
    this.initializationPromise = null;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();
    await this.initializationPromise;
    this.initialized = true;
  }

  async _performInitialization() {
    try {
      this.provider = DatabaseProviderFactory.createProvider();
      await this.provider.initialize();
      console.log(`Database initialized with provider: ${this.provider.getType()}`);
      
      // Don't auto-seed during basic initialization - let the main server control this
      
    } catch (error) {
      console.error("Error initializing database:", error);
      throw error;
    }
  }

  // Separate method for database seeding/initialization
  async initializeData() {
    await this.initialize(); // Ensure database is ready
    const initializer = new DatabaseInitializer(this);
    await initializer.initialize();
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
    await this.initialize();
    if (!this.provider) {
      throw new Error("Database provider not initialized");
    }
    return await this.provider.run(sql, params);
  }

  // Helper method to get single row
  async get(sql, params = []) {
    await this.initialize();
    if (!this.provider) {
      throw new Error("Database provider not initialized");
    }
    return await this.provider.get(sql, params);
  }

  // Helper method to get all rows
  async all(sql, params = []) {
    await this.initialize();
    if (!this.provider) {
      throw new Error("Database provider not initialized");
    }
    return await this.provider.all(sql, params);
  }

  // Execute a transaction
  async transaction(callback) {
    await this.initialize();
    if (!this.provider) {
      throw new Error("Database provider not initialized");
    }
    return await this.provider.transaction(callback);
  }

  // Get database type
  getType() {
    return this.provider ? this.provider.getType() : 'unknown';
  }

  // Expose DynamoDB-specific methods when using DynamoDB provider
  async _dynamoScan(tableName, filters = {}) {
    await this.initialize();
    if (!this.provider || this.provider.getType() !== 'dynamodb') {
      throw new Error('_dynamoScan is only available with DynamoDB provider');
    }
    return await this.provider._dynamoScan(tableName, filters);
  }

  async _dynamoPut(tableName, item) {
    await this.initialize();
    if (!this.provider || this.provider.getType() !== 'dynamodb') {
      throw new Error('_dynamoPut is only available with DynamoDB provider');
    }
    return await this.provider._dynamoPut(tableName, item);
  }

  async _dynamoGet(tableName, key) {
    await this.initialize();
    if (!this.provider || this.provider.getType() !== 'dynamodb') {
      throw new Error('_dynamoGet is only available with DynamoDB provider');
    }
    return await this.provider._dynamoGet(tableName, key);
  }

  async _dynamoUpdate(tableName, key, updates) {
    await this.initialize();
    if (!this.provider || this.provider.getType() !== 'dynamodb') {
      throw new Error('_dynamoUpdate is only available with DynamoDB provider');
    }
    return await this.provider._dynamoUpdate(tableName, key, updates);
  }

  async _dynamoDelete(tableName, key) {
    await this.initialize();
    if (!this.provider || this.provider.getType() !== 'dynamodb') {
      throw new Error('_dynamoDelete is only available with DynamoDB provider');
    }
    return await this.provider._dynamoDelete(tableName, key);
  }

  async _dynamoQuery(tableName, conditions, indexName = null) {
    await this.initialize();
    if (!this.provider || this.provider.getType() !== 'dynamodb') {
      throw new Error('_dynamoQuery is only available with DynamoDB provider');
    }
    return await this.provider._dynamoQuery(tableName, conditions, indexName);
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
