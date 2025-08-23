import DatabaseProviderFactory from '../../providers/DatabaseProviderFactory.js';

// SQLite implementations
import SQLiteGameService from './sqlite/SQLiteGameService.js';
import SQLitePickService from './sqlite/SQLitePickService.js';
import SQLiteSeasonService from './sqlite/SQLiteSeasonService.js';

// DynamoDB implementations
import DynamoDBGameService from './dynamodb/DynamoDBGameService.js';
import DynamoDBPickService from './dynamodb/DynamoDBPickService.js';
import DynamoDBSeasonService from './dynamodb/DynamoDBSeasonService.js';

/**
 * Database Service Factory
 * Creates appropriate service instances based on the database type
 */
export default class DatabaseServiceFactory {
  static _services = new Map();

  /**
   * Get Game Service for current database type
   * @returns {IGameService} Database-specific game service
   */
  static getGameService() {
    const cacheKey = 'gameService';
    if (!this._services.has(cacheKey)) {
      const dbType = DatabaseProviderFactory.getProviderType();
      let service;
      
      switch (dbType) {
        case 'dynamodb':
          service = new DynamoDBGameService();
          break;
        case 'sqlite':
        default:
          service = new SQLiteGameService();
          break;
      }
      
      this._services.set(cacheKey, service);
    }
    
    return this._services.get(cacheKey);
  }

  /**
   * Get Pick Service for current database type
   * @returns {IPickService} Database-specific pick service
   */
  static getPickService() {
    const cacheKey = 'pickService';
    if (!this._services.has(cacheKey)) {
      const dbType = DatabaseProviderFactory.getProviderType();
      let service;
      
      switch (dbType) {
        case 'dynamodb':
          service = new DynamoDBPickService();
          break;
        case 'sqlite':
        default:
          service = new SQLitePickService();
          break;
      }
      
      this._services.set(cacheKey, service);
    }
    
    return this._services.get(cacheKey);
  }

  /**
   * Get Season Service for current database type
   * @returns {ISeasonService} Database-specific season service
   */
  static getSeasonService() {
    const cacheKey = 'seasonService';
    if (!this._services.has(cacheKey)) {
      const dbType = DatabaseProviderFactory.getProviderType();
      let service;
      
      switch (dbType) {
        case 'dynamodb':
          service = new DynamoDBSeasonService();
          break;
        case 'sqlite':
        default:
          service = new SQLiteSeasonService();
          break;
      }
      
      this._services.set(cacheKey, service);
    }
    
    return this._services.get(cacheKey);
  }

  /**
   * Clear service cache (useful for testing or database switching)
   */
  static clearCache() {
    this._services.clear();
  }

  /**
   * Get current database type
   * @returns {string} Database type (sqlite, dynamodb)
   */
  static getDatabaseType() {
    return DatabaseProviderFactory.getProviderType();
  }
}