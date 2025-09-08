#!/usr/bin/env node

/**
 * LocalStack Secrets Update Script for Football Pick'em
 * 
 * This script helps update secrets in LocalStack Secrets Manager
 * with proper authentication and error handling
 */

import { SecretsManagerClient, UpdateSecretCommand, CreateSecretCommand, ListSecretsCommand } from "@aws-sdk/client-secrets-manager";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// AWS client configured for LocalStack
const secretsClient = new SecretsManagerClient({
  region: AWS_REGION,
  endpoint: LOCALSTACK_ENDPOINT,
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test'
  }
});

const SECRET_NAME = 'football-pickem/dev/jwt-secret';

async function listSecrets() {
  try {
    console.log('🔍 Listing existing secrets...');
    const response = await secretsClient.send(new ListSecretsCommand({}));
    const secrets = response.SecretList || [];
    
    console.log(`📋 Found ${secrets.length} secrets:`);
    secrets.forEach(secret => {
      console.log(`   - ${secret.Name}`);
    });
    
    return secrets;
  } catch (error) {
    console.error('❌ Failed to list secrets:', error.message);
    return [];
  }
}

async function updateSecret(secretData) {
  try {
    console.log(`🔄 Updating secret: ${SECRET_NAME}`);
    
    const response = await secretsClient.send(new UpdateSecretCommand({
      SecretId: SECRET_NAME,
      SecretString: JSON.stringify(secretData)
    }));
    
    console.log('✅ Secret updated successfully');
    console.log(`📝 Version ID: ${response.VersionId}`);
    return true;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.log('🔍 Secret not found, creating new one...');
      return await createSecret(secretData);
    } else {
      console.error('❌ Failed to update secret:', error.message);
      return false;
    }
  }
}

async function createSecret(secretData) {
  try {
    console.log(`🔑 Creating secret: ${SECRET_NAME}`);
    
    const response = await secretsClient.send(new CreateSecretCommand({
      Name: SECRET_NAME,
      SecretString: JSON.stringify(secretData),
      Description: 'All application secrets for local development'
    }));
    
    console.log('✅ Secret created successfully');
    console.log(`📝 ARN: ${response.ARN}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to create secret:', error.message);
    return false;
  }
}

async function main() {
  console.log('🔐 LocalStack Secrets Manager Update Tool');
  console.log(`📍 LocalStack endpoint: ${LOCALSTACK_ENDPOINT}`);
  console.log(`🌍 AWS region: ${AWS_REGION}`);
  
  // Get command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Default secret data
    const defaultSecretData = {
      JWT_SECRET: 'ee57f715bbe63996e58edeb81e2afb703291b77f0d8591ef3f47b0c7673b4ee7cbbb524d35c4333c9011e34b3935f066e8513e7153db53132fcbc46fb6da6eba',
      SETTINGS_ENCRYPTION_KEY: 'local-development-encryption-key-32',
      ADMIN_EMAIL: 'admin@nflpickem.com',
      ADMIN_PASSWORD: 'admin123'
    };
    
    console.log('\n📋 Using default secret values...');
    await listSecrets();
    await updateSecret(defaultSecretData);
    await listSecrets();
  } else if (args[0] === 'list') {
    await listSecrets();
  } else {
    console.log('❌ Unknown command. Usage:');
    console.log('   node scripts/dev/update-localstack-secrets.js        # Update with default values');
    console.log('   node scripts/dev/update-localstack-secrets.js list   # List existing secrets');
  }
}

// Run the script
main().catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});