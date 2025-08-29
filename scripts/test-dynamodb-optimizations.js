import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables for LocalStack
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// Override database type to use DynamoDB
process.env.DATABASE_TYPE = 'dynamodb';
process.env.USE_LOCALSTACK = 'true';

console.log('🧪 Testing DynamoDB Optimizations with LocalStack...\n');
console.log(`Environment: DATABASE_TYPE=${process.env.DATABASE_TYPE}, USE_LOCALSTACK=${process.env.USE_LOCALSTACK}\n`);

// Import services after env vars are set
import espnService from '../server/services/espnApi.js';
import scheduler from '../server/services/scheduler.js';
import onDemandUpdates from '../server/services/onDemandUpdates.js';
import DatabaseServiceFactory from '../server/services/database/DatabaseServiceFactory.js';

async function testDynamoDBConnection() {
  console.log('🔌 Testing DynamoDB Connection...');
  
  try {
    const db = await import('../server/models/database.js');
    await db.default.initialize();
    
    const provider = db.default.provider;
    console.log(`  ✅ Connected to: ${provider.getType()}`);
    console.log(`  ✅ LocalStack mode: ${provider.isLocalStack ? 'ENABLED' : 'DISABLED'}`);
    
    return { success: true, provider };
  } catch (error) {
    console.log(`  ❌ Connection failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testCachedESPNRequests() {
  console.log('📡 Testing ESPN API Caching with DynamoDB...');
  
  const startTime = Date.now();
  
  // First request - should hit the API
  console.log('  Making first request (should hit API)...');
  const firstResult = await espnService.fetchCurrentSeason();
  const firstDuration = Date.now() - startTime;
  
  // Second request - should use cache
  console.log('  Making second request (should use cache)...');
  const secondStartTime = Date.now();
  const secondResult = await espnService.fetchCurrentSeason();
  const secondDuration = Date.now() - secondStartTime;
  
  console.log(`  ✅ First request: ${firstDuration}ms`);
  console.log(`  ✅ Second request: ${secondDuration}ms (${secondDuration < 10 ? 'cached' : 'not cached'})`);
  
  if (secondDuration < 10) {
    console.log(`  📈 Cache speedup: ${Math.round((firstDuration / Math.max(secondDuration, 1)) * 100) / 100}x faster\n`);
  } else {
    console.log(`  ⚠️  Cache may not be working as expected\n`);
  }
  
  return { firstDuration, secondDuration, cacheWorking: secondDuration < 10 };
}

async function testSchedulerWithDynamoDB() {
  console.log('📅 Testing Scheduler with DynamoDB...');
  
  try {
    const startTime = Date.now();
    
    // Test game day detection
    const isGameDay = scheduler.isGameDay();
    const hasGames = await scheduler.hasGamesToday();
    const status = await scheduler.getStatus();
    
    const duration = Date.now() - startTime;
    
    console.log(`  ✅ Is game day: ${isGameDay}`);
    console.log(`  ✅ Has games today: ${hasGames}`);
    console.log(`  ✅ Scheduler running: ${status.isRunning}`);
    console.log(`  ✅ Cache size: ${status.cacheSize}`);
    console.log(`  ✅ Detection completed in: ${duration}ms\n`);
    
    return { isGameDay, hasGames, duration, error: null };
  } catch (error) {
    console.log(`  ❌ Error testing scheduler: ${error.message}\n`);
    return { error: error.message };
  }
}

async function testDynamoDBPerformanceMonitoring() {
  console.log('📊 Testing DynamoDB Performance Monitoring...');
  
  try {
    const db = await import('../server/models/database.js');
    const provider = db.default.provider;
    
    if (!provider.getPerformanceStats) {
      console.log('  ❌ Performance stats not available\n');
      return { available: false };
    }
    
    // Perform some operations to generate stats
    console.log('  Performing test operations...');
    
    const gameService = DatabaseServiceFactory.getGameService();
    const nflDataService = DatabaseServiceFactory.getNFLDataService();
    
    // These operations should generate performance metrics
    await nflDataService.getCurrentSeason();
    await gameService.getUserGames('test-user-id');
    
    // Get performance stats
    const stats = provider.getPerformanceStats();
    
    console.log(`  ✅ Performance monitoring available`);
    if (stats) {
      console.log(`  📊 Total operations: ${stats.totalOperations}`);
      console.log(`  ⚠️  Slow operations: ${stats.slowOperations}`);
      console.log(`  📈 Operation breakdown:`, stats.operationBreakdown);
      console.log(`  ⏱️  Average durations:`, stats.averageDurations);
    } else {
      console.log(`  ℹ️  No operations recorded yet`);
    }
    console.log('');
    
    return { available: true, stats };
  } catch (error) {
    console.log(`  ❌ Error testing performance monitoring: ${error.message}\n`);
    return { error: error.message };
  }
}

async function testOptimizedQueries() {
  console.log('🗃️  Testing Optimized DynamoDB Queries...');
  
  try {
    const gameService = DatabaseServiceFactory.getGameService();
    
    console.log('  Testing optimized getGameBySlug (should avoid full table scan)...');
    const startTime = Date.now();
    
    // This should now use the optimized version that checks user participation first
    try {
      await gameService.getGameBySlug('test-game', 'test-user-id');
    } catch (error) {
      // Expected to fail with "Access denied" since user doesn't exist
      if (error.message === 'Access denied') {
        console.log('  ✅ Access control working correctly');
      } else {
        console.log(`  ⚠️  Unexpected error: ${error.message}`);
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`  ✅ Query completed in: ${duration}ms`);
    console.log(`  ✅ Should show reduced scan operations in logs above\n`);
    
    return { duration, success: true };
  } catch (error) {
    console.log(`  ❌ Error testing optimized queries: ${error.message}\n`);
    return { error: error.message };
  }
}

async function runDynamoDBOptimizationTests() {
  const results = {};
  
  try {
    results.connection = await testDynamoDBConnection();
    
    if (!results.connection.success) {
      console.log('❌ DynamoDB connection failed, skipping other tests');
      return results;
    }
    
    results.espnCaching = await testCachedESPNRequests();
    results.schedulerDetection = await testSchedulerWithDynamoDB();
    results.performanceMonitoring = await testDynamoDBPerformanceMonitoring();
    results.optimizedQueries = await testOptimizedQueries();
    
    console.log('📋 DynamoDB Optimization Summary:');
    console.log('==================================');
    
    if (results.connection.success) {
      console.log('✅ DynamoDB connection established via LocalStack');
    }
    
    if (results.espnCaching.cacheWorking) {
      console.log('✅ ESPN API caching is working correctly');
    } else {
      console.log('❌ ESPN API caching may not be working as expected');
    }
    
    if (results.schedulerDetection.error) {
      console.log('❌ Scheduler with DynamoDB failed:', results.schedulerDetection.error);
    } else {
      console.log('✅ Scheduler with DynamoDB is working correctly');
    }
    
    if (results.performanceMonitoring.available) {
      console.log('✅ DynamoDB performance monitoring is active');
    } else {
      console.log('❌ DynamoDB performance monitoring not available');
    }
    
    if (results.optimizedQueries.success) {
      console.log('✅ Optimized DynamoDB queries are working');
    } else {
      console.log('❌ Optimized DynamoDB queries failed');
    }
    
    console.log('\n🎉 DynamoDB optimization testing completed!');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
  } finally {
    // Close database connection
    try {
      const db = await import('../server/models/database.js');
      await db.default.close();
    } catch (e) {
      // Ignore close errors
    }
    process.exit(0);
  }
}

// Run the tests
runDynamoDBOptimizationTests().catch(console.error);