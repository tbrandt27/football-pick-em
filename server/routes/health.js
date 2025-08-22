import express from 'express';
import DynamoDBHealthCheck from '../utils/dynamoDbHealthCheck.js';
import DatabaseProviderFactory from '../providers/DatabaseProviderFactory.js';
import db from '../models/database.js';

const router = express.Router();

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
      
      res.status(result.overall.success ? 200 : 503).json(result);
    } else {
      // Basic SQLite health check
      try {
        await db.get('SELECT 1 as test');
        res.json({
          overall: {
            success: true,
            timestamp: new Date().toISOString()
          },
          database: {
            type: 'sqlite',
            status: 'connected'
          }
        });
      } catch (dbError) {
        res.status(503).json({
          overall: {
            success: false,
            timestamp: new Date().toISOString()
          },
          database: {
            type: 'sqlite',
            status: 'error',
            error: dbError.message
          }
        });
      }
    }
  } catch (error) {
    res.status(500).json({
      overall: {
        success: false,
        timestamp: new Date().toISOString()
      },
      error: error.message
    });
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
    
    res.status(result.overall.success ? 200 : 503).json(result);
  } catch (error) {
    res.status(500).json({
      overall: {
        success: false,
        timestamp: new Date().toISOString()
      },
      error: error.message
    });
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
    
    res.status(result.success ? 200 : 503).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message
    });
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
    
    res.status(result.success ? 200 : 503).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * DynamoDB configuration info
 */
router.get('/dynamodb/config', async (req, res) => {
  try {
    const healthCheck = new DynamoDBHealthCheck();
    const config = healthCheck.getConfigInfo();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      config: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message
    });
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
    
    res.status(result.success ? 200 : 503).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

export default router;