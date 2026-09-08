// Both providers are loaded with dynamic import, deliberately.
//
// A static import is hoisted and evaluated when this module's graph is
// built, so `import SQLiteProvider` pulled in sqlite3's native binding on
// every boot -- including production, which uses DynamoDB and never touches
// SQLite. App Runner's Node 22 image ships a glibc older than the 2.38 that
// sqlite3 6.0.1's prebuilt binary requires, so the process died at startup
// with ERR_DLOPEN_FAILED before the switch below ever chose a provider:
//
//   /lib64/libm.so.6: version `GLIBC_2.38' not found
//     (required by node_modules/sqlite3/build/Release/node_sqlite3.node)
//
// The Dockerfile's node:22-alpine base has the same hazard from the other
// direction: musl rather than glibc, and no build toolchain to compile from
// source. Loading each provider only when it is selected avoids both, and
// keeps local development from pulling in the AWS SDK.

export default class DatabaseProviderFactory {
  /**
   * Create a database provider based on environment configuration
   * @returns {Promise<BaseDatabaseProvider>}
   */
  static async createProvider() {
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
      case 'dynamodb': {
        const { default: DynamoDBProvider } = await import('./DynamoDBProvider.js');
        return new DynamoDBProvider();
      }
      case 'sqlite':
      default: {
        const { default: SQLiteProvider } = await import('./SQLiteProvider.js');
        return new SQLiteProvider();
      }
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