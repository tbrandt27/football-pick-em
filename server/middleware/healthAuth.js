import { authenticateToken } from './auth.js';

/**
 * Authentication middleware for health endpoints
 * Checks for admin role or health check token
 */
export const requireHealthAccess = async (req, res, next) => {
  // Allow basic health check in all environments
  if (req.path === '/health' || req.path === '/health/') {
    return next();
  }

  // Check if detailed health checks are disabled in production
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DETAILED_HEALTH !== 'true') {
    return res.status(404).json({
      error: 'Endpoint not available',
      timestamp: new Date().toISOString()
    });
  }

  // Check for health check token (for monitoring systems)
  const healthToken = req.headers['x-health-token'] || req.query.token;
  if (healthToken && healthToken === process.env.HEALTH_CHECK_TOKEN) {
    return next();
  }

  // Check for admin authentication
  try {
    await authenticateToken(req, res, () => {
      if (req.user && req.user.is_admin) {
        return next();
      }
      
      return res.status(403).json({
        error: 'Admin access required for detailed health checks',
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    return res.status(401).json({
      error: 'Authentication required for detailed health checks',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Sanitize health check responses for production
 */
export const sanitizeHealthResponse = (data, req) => {
  // In production, limit information exposure unless explicitly enabled
  if (process.env.NODE_ENV === 'production' && process.env.EXPOSE_DETAILED_HEALTH !== 'true') {
    return sanitizeForProduction(data);
  }
  
  return data;
};

/**
 * Remove sensitive information from health check responses
 */
function sanitizeForProduction(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sanitized = { ...data };

  // Remove or redact sensitive fields
  if (sanitized.environment) {
    delete sanitized.environment.awsRegion;
    delete sanitized.environment.tablePrefix;
    delete sanitized.environment.hasAwsCredentials;
  }

  if (sanitized.config) {
    delete sanitized.config.region;
    delete sanitized.config.tablePrefix;
    delete sanitized.config.expectedTables;
    delete sanitized.config.environment;
  }

  // Remove detailed error information
  if (sanitized.error && typeof sanitized.error === 'object') {
    sanitized.error = {
      message: 'Internal system error',
      timestamp: sanitized.error.timestamp || new Date().toISOString()
    };
  }

  // Sanitize nested objects
  Object.keys(sanitized).forEach(key => {
    if (sanitized[key] && typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeForProduction(sanitized[key]);
    }
  });

  return sanitized;
}