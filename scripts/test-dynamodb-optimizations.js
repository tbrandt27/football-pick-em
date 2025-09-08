#!/usr/bin/env node

/**
 * DynamoDB Optimization Test Script
 * 
 * This script validates that the DynamoDB optimizations are working correctly
 * by testing key operations and measuring performance improvements.
 */

import { performance } from 'perf_hooks';
import DatabaseProviderFactory from '../server/providers/DatabaseProviderFactory.js';

class DynamoDBOptimizationTester {
  constructor() {
    this.db = null;
    this.testResults = [];
  }

  async initialize() {
    console.log('🔧 Initializing DynamoDB connection for testing...');
    
    // Initialize database provider
    this.db = DatabaseProviderFactory.createProvider('dynamodb');
    await this.db.initialize();
    
    console.log('✅ Database connection established');
  }

  async runPerformanceTest(testName, operation) {
    console.log(`\n🧪 Testing: ${testName}`);
    
    const startTime = performance.now();
    
    try {
      const result = await operation();
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      const testResult = {
        name: testName,
        success: true,
        duration: Math.round(duration * 100) / 100,
        resultCount: Array.isArray(result) ? result.length : (result ? 1 : 0),
        result: result
      };
      
      this.testResults.push(testResult);
      
      console.log(`✅ ${testName}: ${duration.toFixed(2)}ms (${testResult.resultCount} results)`);
      
      return result;
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      const testResult = {
        name: testName,
        success: false,
        duration: Math.round(duration * 100) / 100,
        error: error.message,
        resultCount: 0
      };
      
      this.testResults.push(testResult);
      
      console.log(`❌ ${testName}: FAILED after ${duration.toFixed(2)}ms - ${error.message}`);
      
      return null;
    }
  }

  async testUserOperations() {
    console.log('\n📊 === USER OPERATIONS TESTS ===');
    
    // Test 1: Get user by email (should use GSI)
    await this.runPerformanceTest('Get User by Email (GSI)', async () => {
      const allUsers = await this.db._dynamoScan('users');
      if (!allUsers.Items || allUsers.Items.length === 0) {
        throw new Error('No users found for testing');
      }
      
      const testEmail = allUsers.Items[0].email;
      return await this.db._getByEmailGSI('users', testEmail);
    });
  }

  async testGameOperations() {
    console.log('\n🎮 === GAME OPERATIONS TESTS ===');
    
    // Test 1: Get game participants by game_id (should use GSI)
    await this.runPerformanceTest('Get Game Participants (GSI)', async () => {
      const allGames = await this.db._dynamoScan('pickem_games');
      if (!allGames.Items || allGames.Items.length === 0) {
        throw new Error('No games found for testing');
      }
      
      const testGameId = allGames.Items[0].id;
      return await this.db._getByGameIdGSI('game_participants', testGameId);
    });
    
    // Test 2: Get user games by user_id (should use GSI)
    await this.runPerformanceTest('Get User Games (GSI)', async () => {
      const allUsers = await this.db._dynamoScan('users');
      if (!allUsers.Items || allUsers.Items.length === 0) {
        throw new Error('No users found for testing');
      }
      
      const testUserId = allUsers.Items[0].id;
      return await this.db._getByUserIdGSI('game_participants', testUserId);
    });
  }

  async testTeamOperations() {
    console.log('\n🏈 === TEAM OPERATIONS TESTS ===');
    
    // Test 1: Get team by code (should use GSI)
    await this.runPerformanceTest('Get Team by Code (GSI)', async () => {
      const allTeams = await this.db._dynamoScan('football_teams');
      if (!allTeams.Items || allTeams.Items.length === 0) {
        throw new Error('No teams found for testing');
      }
      
      const testTeamCode = allTeams.Items[0].team_code;
      return await this.db._getByTeamCodeGSI('football_teams', testTeamCode);
    });
  }

  generatePerformanceReport() {
    console.log('\n📈 === PERFORMANCE REPORT ===');
    
    const successfulTests = this.testResults.filter(t => t.success);
    const failedTests = this.testResults.filter(t => !t.success);
    
    console.log(`\n✅ Successful Tests: ${successfulTests.length}`);
    console.log(`❌ Failed Tests: ${failedTests.length}`);
    console.log(`📊 Total Tests: ${this.testResults.length}`);
    
    if (successfulTests.length > 0) {
      console.log('\n⚡ Performance Summary:');
      
      const totalDuration = successfulTests.reduce((sum, test) => sum + test.duration, 0);
      const avgDuration = totalDuration / successfulTests.length;
      const fastestTest = successfulTests.reduce((min, test) => test.duration < min.duration ? test : min);
      const slowestTest = successfulTests.reduce((max, test) => test.duration > max.duration ? test : max);
      
      console.log(`   • Average Query Time: ${avgDuration.toFixed(2)}ms`);
      console.log(`   • Fastest Query: ${fastestTest.name} (${fastestTest.duration}ms)`);
      console.log(`   • Slowest Query: ${slowestTest.name} (${slowestTest.duration}ms)`);
      
      if (avgDuration < 50) {
        console.log('\n🎉 EXCELLENT: Average query time is under 50ms!');
      } else if (avgDuration < 100) {
        console.log('\n✅ GOOD: Average query time is acceptable');
      } else {
        console.log('\n⚠️ NEEDS IMPROVEMENT: Queries are slower than expected');
      }
    }
    
    if (failedTests.length > 0) {
      console.log('\n❌ Failed Tests Details:');
      failedTests.forEach(test => {
        console.log(`   • ${test.name}: ${test.error}`);
      });
      
      console.log('\n💡 Note: GSI-related failures indicate missing Global Secondary Indexes.');
      console.log('   Deploy the optimized table structure to resolve these issues.');
    }
    
    return {
      successCount: successfulTests.length,
      failedCount: failedTests.length,
      avgDuration: successfulTests.length > 0 ? totalDuration / successfulTests.length : 0
    };
  }

  async runAllTests() {
    try {
      await this.initialize();
      
      await this.testUserOperations();
      await this.testGameOperations();
      await this.testTeamOperations();
      
      const report = this.generatePerformanceReport();
      
      console.log('\n🎯 === OPTIMIZATION STATUS ===');
      
      if (report.failedCount === 0) {
        console.log('✅ All DynamoDB optimizations are working correctly!');
        console.log('✅ All GSI queries are functioning as expected');
        console.log('🚀 Performance optimizations are fully operational');
      } else if (report.successCount > 0) {
        console.log('⚡ DynamoDB optimizations are partially working');
        console.log(`✅ ${report.successCount} operations optimized successfully`);
        console.log(`⚠️ ${report.failedCount} operations need GSI deployment`);
        console.log('📋 Next step: Deploy optimized table structure with GSIs');
      } else {
        console.log('❌ GSI optimizations not yet deployed');
        console.log('📋 Action required: Deploy optimized DynamoDB table structure');
      }
      
      if (report.avgDuration > 0) {
        console.log(`\n📊 Current Performance: ${report.avgDuration.toFixed(2)}ms average query time`);
        
        if (report.avgDuration < 20) {
          console.log('🏆 Performance Grade: A+ (Excellent)');
        } else if (report.avgDuration < 50) {
          console.log('🥈 Performance Grade: A (Very Good)');
        } else if (report.avgDuration < 100) {
          console.log('🥉 Performance Grade: B (Good)');
        } else {
          console.log('📈 Performance Grade: C (Needs Improvement)');
        }
      }
      
      return report;
    } catch (error) {
      console.error('\n❌ Test execution failed:', error.message);
      return { successCount: 0, failedCount: 1, avgDuration: 0 };
    } finally {
      if (this.db) {
        await this.db.close();
      }
    }
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new DynamoDBOptimizationTester();
  const report = await tester.runAllTests();
  process.exit(report.failedCount === 0 ? 0 : 1);
}

export default DynamoDBOptimizationTester;