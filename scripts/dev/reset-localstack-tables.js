#!/usr/bin/env node

/**
 * Reset LocalStack Tables Script
 * 
 * This script deletes all existing DynamoDB tables in LocalStack and recreates them
 * with the optimized GSI schema. Use this when the table structure needs to be updated.
 */

import { DynamoDBClient, ListTablesCommand, DeleteTableCommand } from "@aws-sdk/client-dynamodb";
import { execSync } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
const TABLE_PREFIX = process.env.DYNAMODB_TABLE_PREFIX || 'football_pickem_';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// AWS client configured for LocalStack
const dynamoClient = new DynamoDBClient({
  region: AWS_REGION,
  endpoint: LOCALSTACK_ENDPOINT,
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test'
  }
});

async function checkLocalStackConnection() {
  try {
    console.log('🔍 Checking LocalStack connection...');
    await dynamoClient.send(new ListTablesCommand({}));
    console.log('✅ LocalStack connection successful');
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to LocalStack:', error.message);
    console.error('💡 Make sure LocalStack is running: localstack start');
    return false;
  }
}

async function deleteAllTables() {
  console.log('\n🗑️  Deleting existing tables...');
  
  try {
    // List existing tables
    const existingTables = await dynamoClient.send(new ListTablesCommand({}));
    const tablesToDelete = (existingTables.TableNames || []).filter(name => 
      name.startsWith(TABLE_PREFIX)
    );
    
    if (tablesToDelete.length === 0) {
      console.log('ℹ️  No tables to delete');
      return;
    }
    
    console.log(`🎯 Found ${tablesToDelete.length} tables to delete:`, tablesToDelete);
    
    for (const tableName of tablesToDelete) {
      try {
        console.log(`🗑️  Deleting table: ${tableName}`);
        await dynamoClient.send(new DeleteTableCommand({ TableName: tableName }));
        console.log(`✅ Deleted table: ${tableName}`);
      } catch (error) {
        console.error(`❌ Failed to delete table ${tableName}:`, error.message);
      }
    }
    
    // Wait a bit for tables to be fully deleted
    console.log('⏳ Waiting for tables to be fully deleted...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error) {
    console.error('❌ Failed to delete tables:', error.message);
  }
}

async function recreateTables() {
  console.log('\n🔄 Recreating tables with optimized schema...');
  
  try {
    // Run the setup script to create tables
    console.log('🚀 Running setup-localstack.js...');
    execSync('node scripts/dev/setup-localstack.js', { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    console.log('✅ Tables recreated successfully');
  } catch (error) {
    console.error('❌ Failed to recreate tables:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🔄 Resetting LocalStack DynamoDB tables');
  console.log(`📍 LocalStack endpoint: ${LOCALSTACK_ENDPOINT}`);
  console.log(`🏷️  Table prefix: ${TABLE_PREFIX}`);
  console.log(`🌍 AWS region: ${AWS_REGION}`);
  
  // Check connection first
  const connected = await checkLocalStackConnection();
  if (!connected) {
    process.exit(1);
  }
  
  try {
    // Delete existing tables
    await deleteAllTables();
    
    // Recreate tables with optimized schema
    await recreateTables();
    
    console.log('\n🎉 Table reset complete!');
    console.log('\n📋 Next steps:');
    console.log('   1. Run your application with: npm run dev:local');
    console.log('   2. The standings should now work correctly');
    console.log('   3. Check the logs for GSI query success messages');
    
  } catch (error) {
    console.error('\n💥 Reset failed:', error.message);
    console.error('🔧 You may need to restart LocalStack and try again');
    process.exit(1);
  }
}

// Run the reset
main().catch(error => {
  console.error('💥 Reset failed:', error);
  process.exit(1);
});