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
    this.degradedMode = false;
    this.configError = null;
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
              console.log(`🔐 ${key}: Using ARN: ${envValue}`);
              console.log(`🔐 ${key}: Extracting key: ${key}`);
              // For compound secrets, extract the specific key from the JSON
              // The secret keys match the environment variable names exactly
              const secretValue = await secretsManager.getSecret(envValue, key, fallback);
              console.log(`✅ ${key}: Successfully resolved from Secrets Manager`);
              console.log(`🔍 ${key}: Resolved value type: ${typeof secretValue}`);
              console.log(`🔍 ${key}: Resolved value preview: ${typeof secretValue === 'string' ? `"${secretValue.substring(0, 100)}${secretValue.length > 100 ? '...' : ''}"` : secretValue}`);
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
        } else if (envValue.startsWith('{') && envValue.includes(`"${key}"`)) {
          // Handle case where AWS auto-resolved the secret ARN to the full JSON
          try {
            console.log(`🔍 ${key}: Detected auto-resolved secret JSON, extracting key...`);
            const parsedSecret = JSON.parse(envValue);
            const extractedValue = parsedSecret[key];
            if (extractedValue !== undefined) {
              console.log(`✅ ${key}: Successfully extracted from auto-resolved secret`);
              return extractedValue;
            } else {
              console.warn(`⚠️ ${key}: Key not found in auto-resolved secret, using fallback`);
              return fallback;
            }
          } catch (parseError) {
            console.error(`❌ ${key}: Failed to parse auto-resolved secret JSON: ${parseError.message}`);
            console.log(`🔄 ${key}: Using fallback value`);
            return fallback;
          }
        } else {
          console.log(`� ${key}: Using direct environment value`);
          return envValue;
        }
      };
      
      // Load configuration values, resolving ARNs as needed
      // In production or LocalStack environments, no fallback values should be used for security
      const isProduction = process.env.NODE_ENV === 'production';
      const isLocalStack = process.env.USE_LOCALSTACK === 'true';
      const requireSecrets = isProduction || isLocalStack;
      
      const jwtFallback = requireSecrets ? null : 'your-super-secret-jwt-key-change-this-in-production';
      const encryptionFallback = requireSecrets ? null : 'football-pickem-default-key-32-chars!';
      const adminEmailFallback = requireSecrets ? null : 'admin@nflpickem.com';
      const adminPasswordFallback = requireSecrets ? null : 'admin123';
      
      this.cache.set('JWT_SECRET', await resolveValue('JWT_SECRET', jwtFallback));
      this.cache.set('SETTINGS_ENCRYPTION_KEY', await resolveValue('SETTINGS_ENCRYPTION_KEY', encryptionFallback));
      this.cache.set('ADMIN_EMAIL', await resolveValue('ADMIN_EMAIL', adminEmailFallback));
      this.cache.set('ADMIN_PASSWORD', await resolveValue('ADMIN_PASSWORD', adminPasswordFallback));

      console.log('✅ Configuration loaded successfully');
    } catch (error) {
      console.error('❌ Failed to initialize configuration service:', error);
      
      // In production or LocalStack environments, enable degraded mode instead of crashing
      const isProduction = process.env.NODE_ENV === 'production';
      const isLocalStack = process.env.USE_LOCALSTACK === 'true';
      const requireSecrets = isProduction || isLocalStack;
      
      if (requireSecrets) {
        const environment = isProduction ? 'production' : 'LocalStack';
        console.error(`❌ ${environment} environment configuration failed - enabling degraded mode`);
        console.warn('⚠️  Application will continue in degraded mode with limited functionality');
        
        // Set degraded mode flag
        this.degradedMode = true;
        this.configError = error.message;
        
        // Use emergency fallbacks to keep app running
        this.cache.set('JWT_SECRET', process.env.JWT_SECRET || 'emergency-fallback-jwt-secret-change-immediately');
        this.cache.set('SETTINGS_ENCRYPTION_KEY', process.env.SETTINGS_ENCRYPTION_KEY || 'emergency-fallback-32-char-key-now!');
        this.cache.set('ADMIN_EMAIL', process.env.ADMIN_EMAIL || 'admin@localhost');
        this.cache.set('ADMIN_PASSWORD', process.env.ADMIN_PASSWORD || 'admin123');
        
        console.log('🔄 Emergency configuration loaded - application running in degraded mode');
      } else {
        // Fallback to default values only in local development
        console.log('🔄 Using fallback configuration values for local development...');
        this.cache.set('JWT_SECRET', 'your-super-secret-jwt-key-change-this-in-production');
        this.cache.set('SETTINGS_ENCRYPTION_KEY', 'football-pickem-default-key-32-chars!');
        this.cache.set('ADMIN_EMAIL', 'admin@nflpickem.com');
        this.cache.set('ADMIN_PASSWORD', 'admin123');
        
        console.log('⚠️  Configuration loaded with fallback values (development only)');
      }
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
    const isProduction = process.env.NODE_ENV === 'production';
    const isLocalStack = process.env.USE_LOCALSTACK === 'true';
    const requireSecrets = isProduction || isLocalStack;
    const fallback = requireSecrets ? null : 'your-super-secret-jwt-key-change-this-in-production';
    const secret = this.get('JWT_SECRET', fallback);
    
    if (requireSecrets && !secret) {
      const environment = isProduction ? 'production' : 'LocalStack';
      throw new Error(`JWT_SECRET is required in ${environment} environment`);
    }
    
    return secret;
  }

  /**
   * Get settings encryption key
   */
  getSettingsEncryptionKey() {
    const isProduction = process.env.NODE_ENV === 'production';
    const isLocalStack = process.env.USE_LOCALSTACK === 'true';
    const requireSecrets = isProduction || isLocalStack;
    const fallback = requireSecrets ? null : 'football-pickem-default-key-32-chars!';
    const key = this.get('SETTINGS_ENCRYPTION_KEY', fallback);
    
    if (requireSecrets && !key) {
      const environment = isProduction ? 'production' : 'LocalStack';
      throw new Error(`SETTINGS_ENCRYPTION_KEY is required in ${environment} environment`);
    }
    
    return key;
  }

  /**
   * Get admin email
   */
  getAdminEmail() {
    const isProduction = process.env.NODE_ENV === 'production';
    const isLocalStack = process.env.USE_LOCALSTACK === 'true';
    const requireSecrets = isProduction || isLocalStack;
    const fallback = requireSecrets ? null : 'admin@nflpickem.com';
    const email = this.get('ADMIN_EMAIL', fallback);
    
    if (requireSecrets && !email) {
      const environment = isProduction ? 'production' : 'LocalStack';
      throw new Error(`ADMIN_EMAIL is required in ${environment} environment`);
    }
    
    return email;
  }

  /**
   * Get admin password
   */
  getAdminPassword() {
    const isProduction = process.env.NODE_ENV === 'production';
    const isLocalStack = process.env.USE_LOCALSTACK === 'true';
    const requireSecrets = isProduction || isLocalStack;
    const fallback = requireSecrets ? null : 'admin123';
    const password = this.get('ADMIN_PASSWORD', fallback);
    
    if (requireSecrets && !password) {
      const environment = isProduction ? 'production' : 'LocalStack';
      throw new Error(`ADMIN_PASSWORD is required in ${environment} environment`);
    }
    
    return password;
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
   * Check if running in degraded mode
   */
  isDegraded() {
    return this.degradedMode;
  }

  /**
   * Get degraded mode error
   */
  getDegradedError() {
    return this.configError;
  }

  /**
   * Get configuration status for health checks
   */
  getStatus() {
    return {
      initialized: this.initialized,
      degradedMode: this.degradedMode,
      configError: this.configError,
      secretsManagerEnabled: process.env.NODE_ENV === 'production' || process.env.USE_LOCALSTACK === 'true',
      configuredKeys: Array.from(this.cache.keys()),
      environment: process.env.NODE_ENV || 'development'
    };
  }
}

// Export singleton instance
export default new ConfigService();