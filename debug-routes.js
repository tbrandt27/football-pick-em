#!/usr/bin/env node

/**
 * Quick script to test if the health routes are accessible
 * Run this to debug why the routes aren't found
 */

import express from 'express';

// Test if we can import the health routes
console.log('🔍 Testing health route imports...');

try {
  const healthRoutes = await import('./server/routes/health.js');
  console.log('✅ Health routes imported successfully');
  
  const DynamoDBHealthCheck = await import('./server/utils/dynamoDbHealthCheck.js');
  console.log('✅ DynamoDB health check imported successfully');
  
  // Test creating the app with routes
  const app = express();
  app.use('/api/health', healthRoutes.default);
  
  console.log('✅ Routes registered successfully');
  
  // Print all registered routes
  console.log('\n📋 Registered routes:');
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      console.log(`  ${Object.keys(middleware.route.methods)[0].toUpperCase()} ${middleware.route.path}`);
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          const method = Object.keys(handler.route.methods)[0].toUpperCase();
          const path = '/api/health' + handler.route.path;
          console.log(`  ${method} ${path}`);
        }
      });
    }
  });
  
} catch (error) {
  console.error('❌ Error importing health routes:', error.message);
  console.error('Stack trace:', error.stack);
}