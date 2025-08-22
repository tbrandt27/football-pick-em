import express from 'express';
import DynamoDBHealthCheck from '../utils/dynamoDbHealthCheck.js';
import DatabaseProviderFactory from '../providers/DatabaseProviderFactory.js';
import db from '../models/database.js';
import { requireHealthAccess, sanitizeHealthResponse } from '../middleware/healthAuth.js';

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
 * Simple health check endpoint
 */
router.get('/', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        type: db.getType(),
        provider: DatabaseProviderFactory.getProviderType()
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        databaseType: process.env.DATABASE_TYPE
      }
    };

    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
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

export default router;