import DatabaseProviderFactory from '../../providers/DatabaseProviderFactory.js';

// SQLite implementations
import SQLiteGameService from './sqlite/SQLiteGameService.js';
import SQLiteSeasonService from './sqlite/SQLiteSeasonService.js';
import SQLiteUserService from './sqlite/SQLiteUserService.js';
import SQLiteInvitationService from './sqlite/SQLiteInvitationService.js';
import SQLitePickService from './sqlite/SQLitePickService.js';
import SQLiteNFLDataService from './sqlite/SQLiteNFLDataService.js';
import SQLiteSystemSettingsService from './sqlite/SQLiteSystemSettingsService.js';

// DynamoDB implementations
import DynamoDBGameService from './dynamodb/DynamoDBGameService.js';
import DynamoDBSeasonService from './dynamodb/DynamoDBSeasonService.js';
import DynamoDBUserService from './dynamodb/DynamoDBUserService.js';
import DynamoDBInvitationService from './dynamodb/DynamoDBInvitationService.js';
import DynamoDBPickService from './dynamodb/DynamoDBPickService.js';
import DynamoDBNFLDataService from './dynamodb/DynamoDBNFLDataService.js';
import DynamoDBSystemSettingsService from './dynamodb/DynamoDBSystemSettingsService.js';

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
   * Get Invitation Service for current database type
   * @returns {IInvitationService} Database-specific invitation service
   */
  static getInvitationService() {
    const cacheKey = 'invitationService';
    if (!this._services.has(cacheKey)) {
      const dbType = DatabaseProviderFactory.getProviderType();
      let service;
      
      switch (dbType) {
        case 'dynamodb':
          service = new DynamoDBInvitationService();
          break;
        case 'sqlite':
        default:
          service = new SQLiteInvitationService();
          break;
      }
      
      this._services.set(cacheKey, service);
    }
    
    return this._services.get(cacheKey);
  }

  /**
   * Get NFL Data Service for current database type
   * @returns {INFLDataService} Database-specific NFL data service
   */
  static getNFLDataService() {
    const cacheKey = 'nflDataService';
    if (!this._services.has(cacheKey)) {
      const dbType = DatabaseProviderFactory.getProviderType();
      let service;
      
      switch (dbType) {
        case 'dynamodb':
          service = new DynamoDBNFLDataService();
          break;
        case 'sqlite':
        default:
          service = new SQLiteNFLDataService();
          break;
      }
      
      this._services.set(cacheKey, service);
    }
    
    return this._services.get(cacheKey);
  }

  /**
   * Get System Settings Service for current database type
   * @returns {ISystemSettingsService} Database-specific system settings service
   */
  static getSystemSettingsService() {
    const cacheKey = 'systemSettingsService';
    if (!this._services.has(cacheKey)) {
      const dbType = DatabaseProviderFactory.getProviderType();
      let service;
      
      switch (dbType) {
        case 'dynamodb':
          service = new DynamoDBSystemSettingsService();
          break;
        case 'sqlite':
        default:
          service = new SQLiteSystemSettingsService();
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