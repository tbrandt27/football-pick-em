import secretsManager from './secretsManager.js';

/**
 * Configuration Service
 * 
 * Centralized configuration management with AWS Secrets Manager integration
 */
class ConfigService {
  constructor() {
    this.cache = new Map();
    this.initialized = false;
    this.initializationPromise = null;
  }

  /**
   * Initialize the configuration service
   * This should be called once during application startup
   */
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
    console.log('🔧 Initializing configuration service...');

    try {
      console.log('🔧 Loading configuration from environment variables and secrets...');
      
      // Helper function to resolve potential ARNs
      const resolveValue = async (key, fallback) => {
        const envValue = process.env[key];
        if (!envValue) {
          console.log(`🔧 ${key}: Using fallback (no env var)`);
          return fallback;
        }
        
        // Check if it's an AWS Secrets Manager ARN
        if (envValue.startsWith('arn:aws:secretsmanager:')) {
          // Only try to resolve secrets in production runtime or LocalStack development mode
          if ((process.env.NODE_ENV === 'production' || process.env.USE_LOCALSTACK === 'true') && typeof window === 'undefined') {
            try {
              console.log(`🔐 ${key}: Resolving from Secrets Manager...`);
              // For compound secrets, extract the specific key from the JSON
              const secretValue = await secretsManager.getSecret(envValue, key, fallback);
              console.log(`✅ ${key}: Successfully resolved from Secrets Manager`);
              return secretValue;
            } catch (error) {
              console.error(`❌ ${key}: Failed to resolve from Secrets Manager: ${error.message}`);
              console.log(`🔄 ${key}: Using fallback value`);
              return fallback;
            }
          } else {
            console.log(`🔧 ${key}: Skipping Secrets Manager resolution (build time or development)`);
            return fallback;
          }
        } else {
          console.log(`🔧 ${key}: Using direct environment value`);
          return envValue;
        }
      };
      
      // Load configuration values, resolving ARNs as needed
      this.cache.set('JWT_SECRET', await resolveValue('JWT_SECRET', 'your-super-secret-jwt-key-change-this-in-production'));
      this.cache.set('SETTINGS_ENCRYPTION_KEY', await resolveValue('SETTINGS_ENCRYPTION_KEY', 'football-pickem-default-key-32-chars!'));
      this.cache.set('ADMIN_EMAIL', await resolveValue('ADMIN_EMAIL', 'admin@nflpickem.com'));
      this.cache.set('ADMIN_PASSWORD', await resolveValue('ADMIN_PASSWORD', 'admin123'));

      console.log('✅ Configuration loaded successfully');
    } catch (error) {
      console.error('❌ Failed to initialize configuration service:', error);
      
      // Fallback to default values
      console.log('🔄 Using fallback configuration values...');
      this.cache.set('JWT_SECRET', 'your-super-secret-jwt-key-change-this-in-production');
      this.cache.set('SETTINGS_ENCRYPTION_KEY', 'football-pickem-default-key-32-chars!');
      this.cache.set('ADMIN_EMAIL', 'admin@nflpickem.com');
      this.cache.set('ADMIN_PASSWORD', 'admin123');
      
      console.log('⚠️  Configuration loaded with fallback values');
    }
  }

  /**
   * Get a configuration value
   * @param {string} key - Configuration key
   * @param {string} fallback - Fallback value if not found
   * @returns {string} Configuration value
   */
  get(key, fallback = null) {
    if (!this.initialized) {
      console.warn(`⚠️  Configuration service not initialized, using fallback for ${key}`);
      return fallback;
    }

    const value = this.cache.get(key);
    if (value === undefined) {
      console.warn(`⚠️  Configuration key '${key}' not found, using fallback`);
      return process.env[key] || fallback;
    }

    return value;
  }

  /**
   * Get JWT secret
   */
  getJwtSecret() {
    return this.get('JWT_SECRET', 'your-super-secret-jwt-key-change-this-in-production');
  }

  /**
   * Get settings encryption key
   */
  getSettingsEncryptionKey() {
    return this.get('SETTINGS_ENCRYPTION_KEY', 'football-pickem-default-key-32-chars!');
  }

  /**
   * Get admin email
   */
  getAdminEmail() {
    return this.get('ADMIN_EMAIL', 'admin@nflpickem.com');
  }

  /**
   * Get admin password
   */
  getAdminPassword() {
    return this.get('ADMIN_PASSWORD', 'admin123');
  }

  /**
   * Refresh configuration (useful for development or config updates)
   */
  async refresh() {
    console.log('🔄 Refreshing configuration...');
    this.cache.clear();
    this.initialized = false;
    this.initializationPromise = null;
    await this.initialize();
  }

  /**
   * Check if configuration is properly initialized
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get configuration status for health checks
   */
  getStatus() {
    return {
      initialized: this.initialized,
      secretsManagerEnabled: false,
      configuredKeys: Array.from(this.cache.keys()),
      environment: process.env.NODE_ENV || 'development'
    };
  }
}

// Export singleton instance
export default new ConfigService();