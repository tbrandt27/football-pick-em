import express from 'express';
import DynamoDBHealthCheck from '../utils/dynamoDbHealthCheck.js';
import DatabaseProviderFactory from '../providers/DatabaseProviderFactory.js';
import db from '../models/database.js';
import { requireHealthAccess, sanitizeHealthResponse } from '../middleware/healthAuth.js';
import scheduler from '../services/scheduler.js';
import espnService from '../services/espnApi.js';
import configService from '../services/configService.js';

const router = express.Router();

// Apply health authentication to all routes except basic health check
router.use('/', (req, res, next) => {
  // Skip auth for basic health endpoint
  if (req.path === '/' || req.path === '') {
    return next();
  }
  return requireHealthAccess(req, res, next);
});

/**
 * FAST health check endpoint for AppRunner TCP health checks
 * This is optimized for speed and minimal resource usage
 */
router.get('/', async (req, res) => {
  try {
    // Fast response for AppRunner health checks
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      pid: process.pid
    };

    // Only do basic checks that are fast
    const checks = [];

    // Quick database initialization check (no connectivity test)
    if (db.initialized) {
      checks.push({
        name: 'database',
        status: 'initialized',
        type: db.getType ? db.getType() : 'unknown'
      });
    } else {
      checks.push({
        name: 'database',
        status: 'initializing'
      });
      health.status = 'degraded';
    }

    // Configuration service quick check
    try {
      const configStatus = configService.getStatus();
      checks.push({
        name: 'configuration',
        status: configStatus.degradedMode ? 'degraded' : 'healthy',
        degradedMode: configStatus.degradedMode
      });
      
      if (configStatus.degradedMode) {
        health.status = 'degraded';
      }
    } catch (configError) {
      checks.push({
        name: 'configuration',
        status: 'error'
      });
      health.status = 'degraded';
    }

    health.checks = checks;
    
    // Always return 200 for AppRunner health checks unless there's a critical failure
    const statusCode = health.status === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json(health);

  } catch (error) {
    // Even on error, return 200 with error info to prevent restart loops
    res.status(200).json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      error: error.message,
      uptime: process.uptime()
    });
  }
});

/**
 * Enhanced health check endpoint with comprehensive system monitoring
 * Use /health/detailed for thorough health checks
 */
router.get('/detailed', async (req, res) => {
  const startTime = Date.now();
  let overallStatus = 'healthy';
  const checks = [];

  try {
    // Basic system info
    const health = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024)
      },
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        databaseType: process.env.DATABASE_TYPE
      }
    };

    // Database health check
    try {
      const dbCheckStart = Date.now();
      
      // Ensure database is initialized before checking
      if (!db.initialized) {
        checks.push({
          name: 'database',
          status: 'initializing',
          message: 'Database is still initializing',
          type: db.getType ? db.getType() : 'unknown',
          provider: DatabaseProviderFactory.getProviderType()
        });
        overallStatus = 'degraded';
      } else {
        // Use database-type-appropriate health check
        if (db.getType() === 'dynamodb') {
          // For DynamoDB, use the dedicated health check
          const healthCheck = new DynamoDBHealthCheck();
          const result = await healthCheck.testConnection();
          healthCheck.close();
          
          if (result.success) {
            checks.push({
              name: 'database',
              status: 'healthy',
              responseTime: Date.now() - dbCheckStart,
              type: db.getType(),
              provider: DatabaseProviderFactory.getProviderType()
            });
          } else {
            checks.push({
              name: 'database',
              status: 'unhealthy',
              error: result.error?.message || result.message || 'DynamoDB connection failed',
              type: db.getType(),
              provider: DatabaseProviderFactory.getProviderType()
            });
            overallStatus = 'degraded';
          }
        } else {
          // For SQLite, use the existing SQL query
          await db.get('SELECT 1 as test');
          checks.push({
            name: 'database',
            status: 'healthy',
            responseTime: Date.now() - dbCheckStart,
            type: db.getType(),
            provider: DatabaseProviderFactory.getProviderType()
          });
        }
      }
    } catch (dbError) {
      checks.push({
        name: 'database',
        status: 'unhealthy',
        error: dbError.message,
        type: db.getType ? db.getType() : 'unknown',
        provider: DatabaseProviderFactory.getProviderType()
      });
      overallStatus = 'degraded';
    }

    // Configuration service health check
    try {
      const configStatus = configService.getStatus();
      checks.push({
        name: 'configuration',
        status: configStatus.degradedMode ? 'degraded' : 'healthy',
        degradedMode: configStatus.degradedMode,
        configError: configStatus.configError,
        environment: configStatus.environment,
        configuredKeys: configStatus.configuredKeys.length
      });
      
      if (configStatus.degradedMode) {
        overallStatus = 'degraded';
      }
    } catch (configError) {
      checks.push({
        name: 'configuration',
        status: 'unhealthy',
        error: configError.message
      });
      overallStatus = 'degraded';
    }

    // Scheduler health check
    try {
      const schedulerStatus = await scheduler.getStatus();
      checks.push({
        name: 'scheduler',
        status: schedulerStatus.isRunning ? 'healthy' : 'stopped',
        isRunning: schedulerStatus.isRunning,
        isGameDay: schedulerStatus.isGameDay,
        isActiveGameTime: schedulerStatus.isActiveGameTime,
        activeTasks: schedulerStatus.activeTasks
      });
    } catch (schedulerError) {
      checks.push({
        name: 'scheduler',
        status: 'error',
        error: schedulerError.message
      });
      overallStatus = 'degraded';
    }

    // Memory health check
    const memoryUsagePercent = (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100;
    checks.push({
      name: 'memory',
      status: memoryUsagePercent > 90 ? 'warning' : 'healthy',
      usagePercent: Math.round(memoryUsagePercent * 100) / 100
    });

    // Check if any critical systems are failing
    const unhealthyChecks = checks.filter(check => check.status === 'unhealthy');
    if (unhealthyChecks.length > 0) {
      overallStatus = 'unhealthy';
    }

    health.status = overallStatus;
    health.checks = checks;
    health.responseTime = Date.now() - startTime;

    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json(health);

  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      responseTime: Date.now() - startTime
    });
  }
});

/**
 * Simple health check for load balancers (no auth required)
 */
router.get('/simple', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * Readiness probe - checks if the app is ready to receive traffic
 */
router.get('/ready', async (req, res) => {
  try {
    // Check if database is initialized first
    if (!db.initialized) {
      throw new Error('Database is still initializing');
    }

    // Quick database connectivity check
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, use the dedicated health check
      const healthCheck = new DynamoDBHealthCheck();
      const result = await healthCheck.testConnection();
      healthCheck.close();
      
      if (!result.success) {
        throw new Error(result.error?.message || result.message || 'DynamoDB connection failed');
      }
    } else {
      // For SQLite, use the existing SQL query
      await db.get('SELECT 1 as test');
    }
    
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Liveness probe - checks if the app is alive
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid
  });
});

/**
 * Database connectivity health check
 */
router.get('/database', async (req, res) => {
  try {
    const dbType = db.getType();
    
    if (dbType === 'dynamodb') {
      // Use DynamoDB health check
      const healthCheck = new DynamoDBHealthCheck();
      const result = await healthCheck.fullHealthCheck();
      healthCheck.close();
      
      const sanitizedResult = sanitizeHealthResponse(result, req);
      res.status(result.overall.success ? 200 : 503).json(sanitizedResult);
    } else {
      // Basic SQLite health check
      try {
        await db.get('SELECT 1 as test');
        const result = {
          overall: {
            success: true,
            timestamp: new Date().toISOString()
          },
          database: {
            type: 'sqlite',
            status: 'connected'
          }
        };
        res.json(sanitizeHealthResponse(result, req));
      } catch (dbError) {
        const result = {
          overall: {
            success: false,
            timestamp: new Date().toISOString()
          },
          database: {
            type: 'sqlite',
            status: 'error',
            error: dbError.message
          }
        };
        res.status(503).json(sanitizeHealthResponse(result, req));
      }
    }
  } catch (error) {
    const result = {
      overall: {
        success: false,
        timestamp: new Date().toISOString()
      },
      error: error.message
    };
    res.status(500).json(sanitizeHealthResponse(result, req));
  }
});

/**
 * DynamoDB specific health check (even if not currently using DynamoDB)
 */
router.get('/dynamodb', async (req, res) => {
  try {
    const healthCheck = new DynamoDBHealthCheck();
    const result = await healthCheck.fullHealthCheck();
    healthCheck.close();
    
    const sanitizedResult = sanitizeHealthResponse(result, req);
    res.status(result.overall.success ? 200 : 503).json(sanitizedResult);
  } catch (error) {
    const result = {
      overall: {
        success: false,
        timestamp: new Date().toISOString()
      },
      error: error.message
    };
    res.status(500).json(sanitizeHealthResponse(result, req));
  }
});

/**
 * DynamoDB connection test only
 */
router.get('/dynamodb/connection', async (req, res) => {
  try {
    const healthCheck = new DynamoDBHealthCheck();
    const result = await healthCheck.testConnection();
    healthCheck.close();
    
    const sanitizedResult = sanitizeHealthResponse(result, req);
    res.status(result.success ? 200 : 503).json(sanitizedResult);
  } catch (error) {
    const result = {
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message
    };
    res.status(500).json(sanitizeHealthResponse(result, req));
  }
});

/**
 * DynamoDB tables verification
 */
router.get('/dynamodb/tables', async (req, res) => {
  try {
    const healthCheck = new DynamoDBHealthCheck();
    const result = await healthCheck.verifyTables();
    healthCheck.close();
    
    const sanitizedResult = sanitizeHealthResponse(result, req);
    res.status(result.success ? 200 : 503).json(sanitizedResult);
  } catch (error) {
    const result = {
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message
    };
    res.status(500).json(sanitizeHealthResponse(result, req));
  }
});

/**
 * DynamoDB configuration info
 */
router.get('/dynamodb/config', async (req, res) => {
  try {
    const healthCheck = new DynamoDBHealthCheck();
    const config = healthCheck.getConfigInfo();
    
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      config: config
    };
    res.json(sanitizeHealthResponse(result, req));
  } catch (error) {
    const result = {
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message
    };
    res.status(500).json(sanitizeHealthResponse(result, req));
  }
});

/**
 * Test specific DynamoDB table operations
 */
router.get('/dynamodb/test/:tableName?', async (req, res) => {
  try {
    const tableName = req.params.tableName || 'system_settings';
    const healthCheck = new DynamoDBHealthCheck();
    const result = await healthCheck.testTableOperations(tableName);
    healthCheck.close();
    
    const sanitizedResult = sanitizeHealthResponse(result, req);
    res.status(result.success ? 200 : 503).json(sanitizedResult);
  } catch (error) {
    const result = {
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message
    };
    res.status(500).json(sanitizeHealthResponse(result, req));
  }
});

/**
 * Performance monitoring endpoint
 */
router.get('/performance', async (req, res) => {
  try {
    const performanceData = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024)
      },
      database: null,
      espn: null,
      scheduler: null
    };

    // Database performance stats
    if (db && db.provider && db.provider.getPerformanceStats) {
      performanceData.database = db.provider.getPerformanceStats();
    }

    // ESPN API cache stats
    if (espnService.getCacheStats) {
      performanceData.espn = espnService.getCacheStats();
    }

    // Scheduler status
    if (scheduler.getStatus) {
      performanceData.scheduler = await scheduler.getStatus();
    }

    const sanitizedResult = sanitizeHealthResponse(performanceData, req);
    res.json(sanitizedResult);
  } catch (error) {
    console.error('Performance monitoring error:', error);
    res.status(500).json({
      error: 'Failed to retrieve performance data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Clear performance metrics endpoint
 */
router.post('/performance/reset', async (req, res) => {
  try {
    const resetResults = {};

    // Reset database performance stats
    if (db && db.provider && db.provider.resetPerformanceStats) {
      db.provider.resetPerformanceStats();
      resetResults.database = 'reset';
    }

    // Clear ESPN cache
    if (espnService.clearExpiredCache) {
      const cleared = espnService.clearExpiredCache();
      resetResults.espn = `cleared ${cleared} expired entries`;
    }

    const result = {
      message: 'Performance metrics reset',
      timestamp: new Date().toISOString(),
      results: resetResults
    };

    res.json(sanitizeHealthResponse(result, req));
  } catch (error) {
    console.error('Performance reset error:', error);
    res.status(500).json({
      error: 'Failed to reset performance metrics',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;