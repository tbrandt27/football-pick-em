#!/usr/bin/env node

/**
 * DynamoDB Debug Script for App Runner Deployment
 * 
 * This script helps debug DynamoDB connectivity issues when deployed to AWS App Runner.
 * It performs comprehensive tests and provides detailed diagnostic information.
 * 
 * Usage:
 *   node scripts/debug-dynamodb.js
 *   
 * Environment Variables:
 *   DATABASE_TYPE=dynamodb (to force DynamoDB testing)
 *   AWS_REGION=us-east-1 (or your preferred region)
 *   DYNAMODB_TABLE_PREFIX=football_pickem_
 */

import dotenv from "dotenv";
import { DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import DynamoDBHealthCheck from "../server/utils/dynamoDbHealthCheck.js";
import DatabaseProviderFactory from "../server/providers/DatabaseProviderFactory.js";

// Load environment variables
dotenv.config();

class DynamoDBDebugger {
  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.tablePrefix = process.env.DYNAMODB_TABLE_PREFIX || 'football_pickem_';
    this.verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      'info': '✅',
      'warn': '⚠️',
      'error': '❌',
      'debug': '🔍'
    }[level] || 'ℹ️';
    
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async checkEnvironment() {
    this.log('=== Environment Check ===');
    
    const env = {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_TYPE: process.env.DATABASE_TYPE,
      AWS_REGION: process.env.AWS_REGION,
      DYNAMODB_TABLE_PREFIX: process.env.DYNAMODB_TABLE_PREFIX,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? '✅ Set' : '❌ Not Set',
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? '✅ Set' : '❌ Not Set',
      AWS_PROFILE: process.env.AWS_PROFILE || 'Not Set',
      AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION || 'Not Set'
    };

    Object.entries(env).forEach(([key, value]) => {
      this.log(`${key}: ${value}`);
    });

    // Check what database provider would be selected
    const providerType = DatabaseProviderFactory.getProviderType();
    this.log(`Selected Provider: ${providerType}`, providerType === 'dynamodb' ? 'info' : 'warn');

    return env;
  }

  async testAWSCredentials() {
    this.log('\n=== AWS Credentials Test ===');
    
    try {
      const client = new DynamoDBClient({
        region: this.region,
        ...(process.env.AWS_ACCESS_KEY_ID && {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
          }
        })
      });

      // Test with a simple operation
      const command = new ListTablesCommand({});
      const response = await client.send(command);
      
      this.log('AWS Credentials: ✅ Valid');
      this.log(`Found ${response.TableNames?.length || 0} DynamoDB tables`);
      
      if (this.verbose && response.TableNames?.length > 0) {
        this.log('Available tables:');
        response.TableNames.forEach(table => {
          const isOurTable = table.startsWith(this.tablePrefix);
          this.log(`  - ${table} ${isOurTable ? '✅' : ''}`, isOurTable ? 'info' : 'debug');
        });
      }

      client.destroy();
      return true;
    } catch (error) {
      this.log(`AWS Credentials: ❌ Invalid - ${error.message}`, 'error');
      
      if (error.name === 'CredentialsProviderError') {
        this.log('Credential provider error. Check IAM roles or access keys.', 'error');
      } else if (error.name === 'UnrecognizedClientException') {
        this.log('Invalid access key ID or secret access key.', 'error');
      } else if (error.name === 'AccessDeniedException') {
        this.log('Access denied. Check IAM permissions for DynamoDB.', 'error');
      }
      
      return false;
    }
  }

  async testDynamoDBConnection() {
    this.log('\n=== DynamoDB Connection Test ===');
    
    const healthCheck = new DynamoDBHealthCheck();
    
    try {
      const connectionResult = await healthCheck.testConnection();
      
      if (connectionResult.success) {
        this.log('DynamoDB Connection: ✅ Successful');
        this.log(`Region: ${connectionResult.region}`);
        this.log(`Total Tables: ${connectionResult.totalTables}`);
      } else {
        this.log('DynamoDB Connection: ❌ Failed', 'error');
        if (connectionResult.error) {
          this.log(`Error: ${connectionResult.error.message}`, 'error');
          this.log(`Code: ${connectionResult.error.code}`, 'error');
        }
      }
      
      return connectionResult.success;
    } finally {
      healthCheck.close();
    }
  }

  async testTableVerification() {
    this.log('\n=== Table Verification Test ===');
    
    const healthCheck = new DynamoDBHealthCheck();
    
    try {
      const tablesResult = await healthCheck.verifyTables();
      
      if (tablesResult.success) {
        this.log('All Required Tables: ✅ Present');
      } else {
        this.log(`Missing Tables: ❌ ${tablesResult.missingTables.length} tables missing`, 'error');
        tablesResult.missingTables.forEach(table => {
          this.log(`  - Missing: ${table}`, 'error');
        });
      }

      if (this.verbose) {
        this.log('Table Status:');
        Object.entries(tablesResult.tables).forEach(([key, info]) => {
          const status = info.exists ? '✅' : '❌';
          this.log(`  - ${key} (${info.fullName}): ${status}`);
        });
      }
      
      return tablesResult.success;
    } finally {
      healthCheck.close();
    }
  }

  async testTableOperations() {
    this.log('\n=== Table Operations Test ===');
    
    const healthCheck = new DynamoDBHealthCheck();
    
    try {
      const operationsResult = await healthCheck.testTableOperations('system_settings');
      
      if (operationsResult.success) {
        this.log('Table Operations: ✅ Successful');
        if (operationsResult.operations.scan) {
          this.log(`Scan Operation: ${operationsResult.operations.scan.success ? '✅' : '❌'}`);
          this.log(`Items Found: ${operationsResult.operations.scan.itemCount || 0}`);
        }
      } else {
        this.log('Table Operations: ❌ Failed', 'error');
        if (operationsResult.error) {
          this.log(`Error: ${operationsResult.error.message}`, 'error');
        }
      }
      
      return operationsResult.success;
    } finally {
      healthCheck.close();
    }
  }

  async testAppRunnerSpecific() {
    this.log('\n=== App Runner Specific Tests ===');
    
    // Check for App Runner environment indicators
    const isAppRunner = process.env.AWS_EXECUTION_ENV?.includes('AppRunner') || 
                       process.env.AWS_APPRUNNER_SERVICE_URL;
    
    this.log(`Running in App Runner: ${isAppRunner ? '✅ Yes' : '❌ No'}`);
    
    if (isAppRunner) {
      this.log(`Service URL: ${process.env.AWS_APPRUNNER_SERVICE_URL || 'Not Set'}`);
      this.log(`Execution Env: ${process.env.AWS_EXECUTION_ENV || 'Not Set'}`);
    }

    // Test IAM role-based access (App Runner default)
    if (!process.env.AWS_ACCESS_KEY_ID && isAppRunner) {
      this.log('Using IAM Role: ✅ (No explicit credentials found)');
    } else if (process.env.AWS_ACCESS_KEY_ID) {
      this.log('Using Access Keys: ⚠️ (Consider using IAM roles in production)', 'warn');
    }

    // Test network connectivity
    try {
      const startTime = Date.now();
      const client = new DynamoDBClient({ region: this.region });
      const command = new ListTablesCommand({});
      await client.send(command);
      const latency = Date.now() - startTime;
      
      this.log(`Network Latency: ${latency}ms ${latency > 1000 ? '⚠️' : '✅'}`);
      client.destroy();
    } catch (error) {
      this.log(`Network Test: ❌ Failed - ${error.message}`, 'error');
    }
  }

  async generateReport() {
    this.log('\n=== Full DynamoDB Connectivity Report ===');
    
    const healthCheck = new DynamoDBHealthCheck();
    
    try {
      const fullReport = await healthCheck.fullHealthCheck();
      
      this.log(`Overall Status: ${fullReport.overall.success ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
      this.log(`Test Duration: ${fullReport.overall.duration}ms`);
      this.log(`Timestamp: ${fullReport.overall.timestamp}`);
      
      if (this.verbose) {
        this.log('\nDetailed Report:');
        console.log(JSON.stringify(fullReport, null, 2));
      }
      
      return fullReport;
    } finally {
      healthCheck.close();
    }
  }

  async run() {
    console.log('🔍 DynamoDB Debug Tool for App Runner\n');
    
    try {
      await this.checkEnvironment();
      const credentialsOk = await this.testAWSCredentials();
      
      if (!credentialsOk) {
        this.log('\n❌ Cannot proceed without valid AWS credentials', 'error');
        process.exit(1);
      }
      
      await this.testDynamoDBConnection();
      await this.testTableVerification();
      await this.testTableOperations();
      await this.testAppRunnerSpecific();
      
      const report = await this.generateReport();
      
      this.log('\n=== Summary ===');
      if (report.overall.success) {
        this.log('🎉 DynamoDB is fully operational!');
        this.log('Your App Runner deployment should work correctly with DynamoDB.');
      } else {
        this.log('💥 DynamoDB connectivity issues detected!', 'error');
        this.log('Review the errors above and check your configuration.', 'error');
      }
      
    } catch (error) {
      this.log(`Unexpected error: ${error.message}`, 'error');
      if (this.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }
}

// Run the debugger if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const dbDebugger = new DynamoDBDebugger();
  dbDebugger.run().catch(console.error);
}

export default DynamoDBDebugger;