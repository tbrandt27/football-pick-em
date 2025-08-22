import SQLiteProvider from './SQLiteProvider.js';
import DynamoDBProvider from './DynamoDBProvider.js';

export default class DatabaseProviderFactory {
  /**
   * Create a database provider based on environment configuration
   * @returns {BaseDatabaseProvider}
   */
  static createProvider() {
    const dbType = process.env.DATABASE_TYPE || 'sqlite';
    const nodeEnv = process.env.NODE_ENV || 'development';
    
    // Default to SQLite for development, DynamoDB for production
    // But allow override via DATABASE_TYPE environment variable
    let providerType = dbType;
    
    if (dbType === 'auto') {
      providerType = nodeEnv === 'production' ? 'dynamodb' : 'sqlite';
    }
    
    console.log(`Creating database provider: ${providerType} (NODE_ENV: ${nodeEnv})`);
    
    switch (providerType.toLowerCase()) {
      case 'dynamodb':
        return new DynamoDBProvider();
      case 'sqlite':
      default:
        return new SQLiteProvider();
    }
  }
  
  /**
   * Get the current provider type that would be created
   * @returns {string}
   */
  static getProviderType() {
    const dbType = process.env.DATABASE_TYPE || 'sqlite';
    const nodeEnv = process.env.NODE_ENV || 'development';
    
    if (dbType === 'auto') {
      return nodeEnv === 'production' ? 'dynamodb' : 'sqlite';
    }
    
    return dbType.toLowerCase();
  }
}