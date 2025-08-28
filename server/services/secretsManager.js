import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

/**
 * AWS Secrets Manager Service
 * 
 * Handles retrieval of secrets from AWS Secrets Manager in production
 */
class SecretsManagerService {
  constructor() {
    this.client = null;
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.enabled = process.env.NODE_ENV === 'production' && process.env.AWS_REGION;
    
    if (this.enabled) {
      this.client = new SecretsManagerClient({
        region: process.env.AWS_REGION || 'us-east-1'
      });
    }
  }

  /**
   * Get secret value from AWS Secrets Manager
   * @param {string} secretName - Name of the secret
   * @param {string} key - Key within the secret (for JSON secrets)
   * @param {string} fallback - Fallback value if secret retrieval fails
   * @returns {Promise<string>} Secret value or fallback
   */
  async getSecret(secretName, key = null, fallback = null) {
    if (!this.enabled) {
      console.log(`🔐 Secrets Manager disabled, using fallback for ${secretName}${key ? `.${key}` : ''}`);
      return fallback;
    }

    const cacheKey = `${secretName}${key ? `.${key}` : ''}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.value;
      }
      this.cache.delete(cacheKey);
    }

    try {
      console.log(`🔐 Retrieving secret: ${secretName}${key ? `.${key}` : ''}`);
      
      const command = new GetSecretValueCommand({
        SecretId: secretName
      });
      
      const response = await this.client.send(command);
      let secretValue = response.SecretString;
      
      if (!secretValue) {
        throw new Error('Secret value is empty');
      }
      
      // If key is specified, parse as JSON and extract the key
      if (key) {
        try {
          const parsedSecret = JSON.parse(secretValue);
          secretValue = parsedSecret[key];
          if (secretValue === undefined) {
            throw new Error(`Key '${key}' not found in secret`);
          }
        } catch (parseError) {
          throw new Error(`Failed to parse secret as JSON: ${parseError.message}`);
        }
      }
      
      // Cache the result
      this.cache.set(cacheKey, {
        value: secretValue,
        timestamp: Date.now()
      });
      
      console.log(`✅ Successfully retrieved secret: ${secretName}${key ? `.${key}` : ''}`);
      return secretValue;
      
    } catch (error) {
      console.error(`❌ Failed to retrieve secret ${secretName}${key ? `.${key}` : ''}: ${error.message}`);
      
      // Return fallback value
      if (fallback !== null) {
        console.log(`🔄 Using fallback value for ${secretName}${key ? `.${key}` : ''}`);
        return fallback;
      }
      
      throw error;
    }
  }

  /**
   * Get multiple secrets from the same secret object
   * @param {string} secretName - Name of the secret
   * @param {Object} keyMap - Map of keys to retrieve with their fallbacks
   * @returns {Promise<Object>} Object with retrieved secret values
   */
  async getSecrets(secretName, keyMap) {
    const results = {};
    
    for (const [key, fallback] of Object.entries(keyMap)) {
      try {
        results[key] = await this.getSecret(secretName, key, fallback);
      } catch (error) {
        console.error(`Failed to get secret ${secretName}.${key}, using fallback`);
        results[key] = fallback;
      }
    }
    
    return results;
  }

  /**
   * Clear the cache (useful for testing or forcing refresh)
   */
  clearCache() {
    this.cache.clear();
    console.log('🔐 Secrets cache cleared');
  }
}

// Export singleton instance
export default new SecretsManagerService();