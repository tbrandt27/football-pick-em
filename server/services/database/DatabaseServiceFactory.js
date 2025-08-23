import DatabaseProviderFactory from '../../providers/DatabaseProviderFactory.js';

// SQLite implementations
import SQLiteGameService from './sqlite/SQLiteGameService.js';
import SQLiteSeasonService from './sqlite/SQLiteSeasonService.js';
import SQLiteUserService from './sqlite/SQLiteUserService.js';

// DynamoDB implementations
import DynamoDBGameService from './dynamodb/DynamoDBGameService.js';
import DynamoDBSeasonService from './dynamodb/DynamoDBSeasonService.js';
import DynamoDBUserService from './dynamodb/DynamoDBUserService.js';

// TODO: Add Pick services when they exist
// import SQLitePickService from './sqlite/SQLitePickService.js';
// import DynamoDBPickService from './dynamodb/DynamoDBPickService.js';

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
    // TODO: Implement when SQLitePickService and DynamoDBPickService exist
    throw new Error('PickService not yet implemented - pick services need to be created');
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
   * Get User Service for current database type
   * @returns {IUserService} Database-specific user service
   */
  static getUserService() {
    const cacheKey = 'userService';
    if (!this._services.has(cacheKey)) {
      const dbType = DatabaseProviderFactory.getProviderType();
      let service;
      
      switch (dbType) {
        case 'dynamodb':
          service = new DynamoDBUserService();
          break;
        case 'sqlite':
        default:
          service = new SQLiteUserService();
          break;
      }
      
      this._services.set(cacheKey, service);
    }
    
    return this._services.get(cacheKey);
  }

  /**
   * Get current database type
   * @returns {string} Database type (sqlite, dynamodb)
   */
  static getDatabaseType() {
    return DatabaseProviderFactory.getProviderType();
  }
}