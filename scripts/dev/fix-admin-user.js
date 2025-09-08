#!/usr/bin/env node

/**
 * Fix Admin User Script for Football Pick'em
 * 
 * This script fixes the admin user by removing the incorrect one
 * and recreating it with proper credentials from secrets
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
const TABLE_PREFIX = process.env.DYNAMODB_TABLE_PREFIX || 'football_pickem_';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// AWS clients configured for LocalStack
const dynamoClient = new DynamoDBClient({
  region: AWS_REGION,
  endpoint: LOCALSTACK_ENDPOINT,
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test'
  }
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

const secretsClient = new SecretsManagerClient({
  region: AWS_REGION,
  endpoint: LOCALSTACK_ENDPOINT,
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test'
  }
});

async function getSecretValues() {
  try {
    console.log('🔐 Retrieving admin credentials from secrets...');
    
    const response = await secretsClient.send(new GetSecretValueCommand({
      SecretId: 'football-pickem/dev/jwt-secret'
    }));
    
    const secretData = JSON.parse(response.SecretString);
    
    console.log('✅ Successfully retrieved secret values');
    console.log(`📧 Admin Email: ${secretData.ADMIN_EMAIL}`);
    console.log(`🔑 Admin Password: ${secretData.ADMIN_PASSWORD}`);
    
    return {
      email: secretData.ADMIN_EMAIL,
      password: secretData.ADMIN_PASSWORD
    };
  } catch (error) {
    console.error('❌ Failed to retrieve secrets:', error.message);
    throw error;
  }
}

async function findAndRemoveInvalidAdminUsers() {
  try {
    console.log('🔍 Scanning for invalid admin users...');
    
    const response = await docClient.send(new ScanCommand({
      TableName: `${TABLE_PREFIX}users`,
      FilterExpression: 'is_admin = :admin',
      ExpressionAttributeValues: {
        ':admin': true
      }
    }));
    
    const adminUsers = response.Items || [];
    console.log(`📊 Found ${adminUsers.length} admin users`);
    
    // Remove any admin users with invalid emails (containing ARNs)
    for (const user of adminUsers) {
      console.log(`👤 Checking admin user: ${user.email}`);
      
      if (user.email.includes('arn:aws:secretsmanager') || user.email.includes('football-pickem/dev/jwt-secret')) {
        console.log(`🗑️  Removing invalid admin user: ${user.email}`);
        
        await docClient.send(new DeleteCommand({
          TableName: `${TABLE_PREFIX}users`,
          Key: { id: user.id }
        }));
        
        console.log(`✅ Removed invalid admin user: ${user.id}`);
      } else {
        console.log(`✅ Valid admin user found: ${user.email}`);
      }
    }
  } catch (error) {
    console.error('❌ Failed to clean up admin users:', error.message);
    throw error;
  }
}

async function createCorrectAdminUser(credentials) {
  try {
    console.log('👤 Creating correct admin user...');
    
    // Check if correct admin already exists
    const existingResponse = await docClient.send(new ScanCommand({
      TableName: `${TABLE_PREFIX}users`,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': credentials.email.toLowerCase()
      }
    }));
    
    if (existingResponse.Items && existingResponse.Items.length > 0) {
      console.log(`ℹ️  Admin user with email ${credentials.email} already exists, skipping creation`);
      return;
    }
    
    // Create new admin user
    const hashedPassword = await bcrypt.hash(credentials.password, 12);
    const adminId = uuidv4();
    
    await docClient.send(new PutCommand({
      TableName: `${TABLE_PREFIX}users`,
      Item: {
        id: adminId,
        email: credentials.email.toLowerCase(),
        password: hashedPassword,
        first_name: "Admin",
        last_name: "User",
        is_admin: true,
        email_verified: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }));
    
    console.log('✅ Admin user created successfully');
    console.log(`   Email: ${credentials.email}`);
    console.log(`   Password: ${credentials.password}`);
    console.log(`   ID: ${adminId}`);
    
  } catch (error) {
    console.error('❌ Failed to create admin user:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🔧 Admin User Fix Tool for LocalStack');
  console.log(`📍 LocalStack endpoint: ${LOCALSTACK_ENDPOINT}`);
  console.log(`🌍 AWS region: ${AWS_REGION}`);
  
  try {
    // Get correct credentials from secrets
    const credentials = await getSecretValues();
    
    // Remove any invalid admin users
    await findAndRemoveInvalidAdminUsers();
    
    // Create correct admin user
    await createCorrectAdminUser(credentials);
    
    console.log('\n🎉 Admin user fix complete!');
    console.log(`\n🔑 Login credentials:`);
    console.log(`   Email: ${credentials.email}`);
    console.log(`   Password: ${credentials.password}`);
    
  } catch (error) {
    console.error('💥 Admin user fix failed:', error.message);
    process.exit(1);
  }
}

// Run the fix
main();