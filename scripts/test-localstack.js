#!/usr/bin/env node

/**
 * LocalStack Test Script for Football Pick'em
 * 
 * This script tests the LocalStack integration by:
 * 1. Checking connection to LocalStack
 * 2. Testing DynamoDB operations
 * 3. Testing Secrets Manager operations
 * 
 * Prerequisites:
 * - LocalStack running: `npm run localstack:start`
 * - Dependencies installed: `npm install`
 * - Environment configured: copy .env.local to .env
 */

import { DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { SecretsManagerClient, ListSecretsCommand } from "@aws-sdk/client-secrets-manager";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Test configuration
const testConfig = {
  endpoint: LOCALSTACK_ENDPOINT,
  region: AWS_REGION,
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test'
  }
};

async function testDynamoDBConnection() {
  console.log('\n🔍 Testing DynamoDB connection...');
  
  try {
    const dynamoClient = new DynamoDBClient(testConfig);
    const result = await dynamoClient.send(new ListTablesCommand({}));
    
    console.log('✅ DynamoDB connection successful');
    console.log(`📋 Found ${result.TableNames?.length || 0} tables:`);
    
    if (result.TableNames && result.TableNames.length > 0) {
      result.TableNames.forEach(tableName => {
        console.log(`   - ${tableName}`);
      });
    } else {
      console.log('   (No tables found - run npm run localstack:setup to create them)');
    }
    
    return true;
  } catch (error) {
    console.error('❌ DynamoDB connection failed:', error.message);
    return false;
  }
}

async function testSecretsManagerConnection() {
  console.log('\n🔐 Testing Secrets Manager connection...');
  
  try {
    const secretsClient = new SecretsManagerClient(testConfig);
    const result = await secretsClient.send(new ListSecretsCommand({}));
    
    console.log('✅ Secrets Manager connection successful');
    console.log(`🔑 Found ${result.SecretList?.length || 0} secrets:`);
    
    if (result.SecretList && result.SecretList.length > 0) {
      result.SecretList.forEach(secret => {
        console.log(`   - ${secret.Name}`);
      });
    } else {
      console.log('   (No secrets found - run npm run localstack:setup to create them)');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Secrets Manager connection failed:', error.message);
    return false;
  }
}

async function testApplicationConfig() {
  console.log('\n⚙️  Testing application configuration...');
  
  try {
    // Test environment variables
    const requiredEnvVars = [
      'USE_LOCALSTACK',
      'LOCALSTACK_ENDPOINT',
      'AWS_REGION',
      'DATABASE_TYPE'
    ];
    
    let allConfigured = true;
    
    requiredEnvVars.forEach(envVar => {
      const value = process.env[envVar];
      if (value) {
        console.log(`✅ ${envVar}: ${value}`);
      } else {
        console.log(`❌ ${envVar}: not set`);
        allConfigured = false;
      }
    });
    
    return allConfigured;
  } catch (error) {
    console.error('❌ Configuration test failed:', error.message);
    return false;
  }
}

async function checkLocalStackStatus() {
  console.log('🔍 Checking LocalStack status...');
  
  try {
    const response = await fetch(`${LOCALSTACK_ENDPOINT}/_localstack/health`);
    if (response.ok) {
      const health = await response.json();
      console.log('✅ LocalStack is running');
      console.log('📊 Service status:');
      
      Object.entries(health.services || {}).forEach(([service, status]) => {
        const statusIcon = status === 'running' ? '✅' : '❌';
        console.log(`   ${statusIcon} ${service}: ${status}`);
      });
      
      return true;
    } else {
      console.error('❌ LocalStack health check failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Cannot connect to LocalStack:', error.message);
    console.log('💡 Make sure LocalStack is running: npm run localstack:start');
    return false;
  }
}

async function main() {
  console.log('🧪 LocalStack Integration Test');
  console.log('===============================');
  console.log(`🎯 Target endpoint: ${LOCALSTACK_ENDPOINT}`);
  console.log(`🌍 AWS region: ${AWS_REGION}`);
  
  const tests = [
    { name: 'LocalStack Status', fn: checkLocalStackStatus },
    { name: 'Application Config', fn: testApplicationConfig },
    { name: 'DynamoDB Connection', fn: testDynamoDBConnection },
    { name: 'Secrets Manager Connection', fn: testSecretsManagerConnection }
  ];
  
  let allPassed = true;
  
  for (const test of tests) {
    const passed = await test.fn();
    if (!passed) {
      allPassed = false;
    }
  }
  
  console.log('\n📊 Test Summary');
  console.log('================');
  
  if (allPassed) {
    console.log('🎉 All tests passed! LocalStack integration is working correctly.');
    console.log('\n📋 Next steps:');
    console.log('   1. If tables/secrets are missing, run: npm run localstack:setup');
    console.log('   2. Start the application: npm run dev:local');
  } else {
    console.log('❌ Some tests failed. Please check the errors above.');
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Make sure LocalStack is running: npm run localstack:start');
    console.log('   2. Check your .env file has LocalStack configuration');
    console.log('   3. Install dependencies: npm install');
    console.log('   4. Setup resources: npm run localstack:setup');
  }
  
  process.exit(allPassed ? 0 : 1);
}

// Run the test
main().catch(error => {
  console.error('💥 Test failed:', error);
  process.exit(1);
});