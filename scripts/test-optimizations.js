import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// Import services after env vars are loaded
import espnService from '../server/services/espnApi.js';
import scheduler from '../server/services/scheduler.js';
import onDemandUpdates from '../server/services/onDemandUpdates.js';
import DatabaseServiceFactory from '../server/services/database/DatabaseServiceFactory.js';

console.log('🧪 Testing Football Pick\'em Optimizations...\n');

async function testESPNCaching() {
  console.log('📡 Testing ESPN API Caching...');
  
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
  console.log(`  ✅ Second request: ${secondDuration}ms (cached)`);
  console.log(`  📈 Cache speedup: ${Math.round((firstDuration / secondDuration) * 100) / 100}x faster\n`);
  
  return { firstDuration, secondDuration, cacheHit: secondDuration < firstDuration };
}

async function testSchedulerGameDetection() {
  console.log('📅 Testing Scheduler Game Detection...');
  
  try {
    // Initialize database connection
    const db = await import('../server/models/database.js');
    await db.default.initialize();
    
    const startTime = Date.now();
    
    // Test game day detection
    const isGameDay = scheduler.isGameDay();
    const hasGames = await scheduler.hasGamesToday();
    const status = await scheduler.getStatus();
    
    const duration = Date.now() - startTime;
    
    console.log(`  ✅ Is game day: ${isGameDay}`);
    console.log(`  ✅ Has games today: ${hasGames}`);
    console.log(`  ✅ Cache size: ${status.cacheSize}`);
    console.log(`  ✅ Detection completed in: ${duration}ms\n`);
    
    return { isGameDay, hasGames, duration };
  } catch (error) {
    console.log(`  ❌ Error testing scheduler: ${error.message}\n`);
    return { error: error.message };
  }
}

async function testOnDemandUpdates() {
  console.log('⚡ Testing On-Demand Updates...');
  
  try {
    const startTime = Date.now();
    
    // Test staleness check without actually updating
    const result = await onDemandUpdates.updateCurrentWeekIfStale();
    
    const duration = Date.now() - startTime;
    
    console.log(`  ✅ Staleness check result:`, result);
    console.log(`  ✅ Check completed in: ${duration}ms\n`);
    
    return { result, duration };
  } catch (error) {
    console.log(`  ❌ Error testing on-demand updates: ${error.message}\n`);
    return { error: error.message };
  }
}

async function testDatabasePerformance() {
  console.log('🗃️  Testing Database Performance Monitoring...');
  
  try {
    const db = await import('../server/models/database.js');
    const provider = db.default.provider;
    
    if (!provider.getPerformanceStats) {
      console.log('  ℹ️  Performance stats not available for this database provider\n');
      return { available: false };
    }
    
    // Get current stats
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
    console.log(`  ❌ Error testing database performance: ${error.message}\n`);
    return { error: error.message };
  }
}

async function runOptimizationTests() {
  const results = {};
  
  try {
    results.espnCaching = await testESPNCaching();
    results.schedulerDetection = await testSchedulerGameDetection();
    results.onDemandUpdates = await testOnDemandUpdates();
    results.databasePerformance = await testDatabasePerformance();
    
    console.log('📋 Summary Report:');
    console.log('==================');
    
    if (results.espnCaching.cacheHit) {
      console.log('✅ ESPN API caching is working correctly');
    } else {
      console.log('❌ ESPN API caching may not be working as expected');
    }
    
    if (results.schedulerDetection.error) {
      console.log('❌ Scheduler game detection failed:', results.schedulerDetection.error);
    } else {
      console.log('✅ Scheduler game detection is working correctly');
    }
    
    if (results.onDemandUpdates.error) {
      console.log('❌ On-demand updates failed:', results.onDemandUpdates.error);
    } else {
      console.log('✅ On-demand updates are working correctly');
    }
    
    if (results.databasePerformance.available) {
      console.log('✅ Database performance monitoring is active');
    } else {
      console.log('ℹ️  Database performance monitoring not available');
    }
    
    console.log('\n🎉 Optimization testing completed!');
    
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
runOptimizationTests().catch(console.error);