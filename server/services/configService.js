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
      if (process.env.NODE_ENV === 'production' && process.env.USE_SECRETS_MANAGER === 'true') {
        console.log('🔐 Loading secrets from AWS Secrets Manager...');
        
        const secretName = process.env.SECRETS_SECRET_NAME || 'football-pickem/jwt-secret';
        
        // Load all secrets at once
        const secrets = await secretsManager.getSecrets(secretName, {
          jwt_secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
          settings_encryption_key: process.env.SETTINGS_ENCRYPTION_KEY || 'football-pickem-default-key-32-chars!',
          admin_email: process.env.ADMIN_EMAIL || 'admin@nflpickem.com',
          admin_password: process.env.ADMIN_PASSWORD || 'admin123'
        });

        // Cache the secrets
        this.cache.set('JWT_SECRET', secrets.jwt_secret);
        this.cache.set('SETTINGS_ENCRYPTION_KEY', secrets.settings_encryption_key);
        this.cache.set('ADMIN_EMAIL', secrets.admin_email);
        this.cache.set('ADMIN_PASSWORD', secrets.admin_password);

        console.log('✅ Configuration loaded from AWS Secrets Manager');
      } else {
        console.log('🔧 Loading configuration from environment variables');
        
        // Development mode or Secrets Manager disabled - use environment variables
        this.cache.set('JWT_SECRET', process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production');
        this.cache.set('SETTINGS_ENCRYPTION_KEY', process.env.SETTINGS_ENCRYPTION_KEY || 'football-pickem-default-key-32-chars!');
        this.cache.set('ADMIN_EMAIL', process.env.ADMIN_EMAIL || 'admin@nflpickem.com');
        this.cache.set('ADMIN_PASSWORD', process.env.ADMIN_PASSWORD || 'admin123');

        console.log('✅ Configuration loaded from environment variables');
      }
    } catch (error) {
      console.error('❌ Failed to initialize configuration service:', error);
      
      // Fallback to environment variables even in production
      console.log('🔄 Falling back to environment variables...');
      this.cache.set('JWT_SECRET', process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production');
      this.cache.set('SETTINGS_ENCRYPTION_KEY', process.env.SETTINGS_ENCRYPTION_KEY || 'football-pickem-default-key-32-chars!');
      this.cache.set('ADMIN_EMAIL', process.env.ADMIN_EMAIL || 'admin@nflpickem.com');
      this.cache.set('ADMIN_PASSWORD', process.env.ADMIN_PASSWORD || 'admin123');
      
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
      return process.env[key] || fallback;
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
      secretsManagerEnabled: process.env.NODE_ENV === 'production' && process.env.USE_SECRETS_MANAGER === 'true',
      configuredKeys: Array.from(this.cache.keys()),
      environment: process.env.NODE_ENV || 'development'
    };
  }
}

// Export singleton instance
export default new ConfigService();