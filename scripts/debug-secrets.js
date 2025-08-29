#!/usr/bin/env node

/**
 * Debug script to investigate LocalStack Secrets Manager issues
 */

import { SecretsManagerClient, ListSecretsCommand, CreateSecretCommand, GetSecretValueCommand, DeleteSecretCommand } from "@aws-sdk/client-secrets-manager";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const secretsClient = new SecretsManagerClient({
  region: AWS_REGION,
  endpoint: LOCALSTACK_ENDPOINT,
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test'
  }
});

async function testSecretsManager() {
  console.log('🔍 Testing LocalStack Secrets Manager...');
  console.log(`📍 Endpoint: ${LOCALSTACK_ENDPOINT}`);
  console.log(`🌍 Region: ${AWS_REGION}`);
  
  try {
    // Test 1: List existing secrets
    console.log('\n1️⃣ Listing existing secrets...');
    const listResult = await secretsClient.send(new ListSecretsCommand({}));
    console.log('Secrets found:', listResult.SecretList?.length || 0);
    
    if (listResult.SecretList && listResult.SecretList.length > 0) {
      listResult.SecretList.forEach(secret => {
        console.log(`   - ${secret.Name}`);
      });
    }
    
    // Test 2: Try to create a test secret
    console.log('\n2️⃣ Creating a test secret...');
    const testSecretName = 'test-secret-' + Date.now();
    
    try {
      await secretsClient.send(new CreateSecretCommand({
        Name: testSecretName,
        SecretString: JSON.stringify({ test: 'value' }),
        Description: 'Test secret for debugging'
      }));
      console.log(`✅ Created test secret: ${testSecretName}`);
    } catch (error) {
      console.error(`❌ Failed to create test secret:`, error.message);
      return;
    }
    
    // Test 3: List secrets again to see if it appears
    console.log('\n3️⃣ Listing secrets after creation...');
    const listResult2 = await secretsClient.send(new ListSecretsCommand({}));
    console.log('Secrets found:', listResult2.SecretList?.length || 0);
    
    if (listResult2.SecretList && listResult2.SecretList.length > 0) {
      listResult2.SecretList.forEach(secret => {
        console.log(`   - ${secret.Name}`);
      });
    }
    
    // Test 4: Try to retrieve the secret
    console.log('\n4️⃣ Retrieving test secret...');
    try {
      const getResult = await secretsClient.send(new GetSecretValueCommand({
        SecretId: testSecretName
      }));
      console.log(`✅ Retrieved secret: ${testSecretName}`);
      console.log(`   Value: ${getResult.SecretString}`);
    } catch (error) {
      console.error(`❌ Failed to retrieve secret:`, error.message);
    }
    
    // Test 5: Clean up by deleting test secret
    console.log('\n5️⃣ Cleaning up test secret...');
    try {
      await secretsClient.send(new DeleteSecretCommand({
        SecretId: testSecretName,
        ForceDeleteWithoutRecovery: true
      }));
      console.log(`✅ Deleted test secret: ${testSecretName}`);
    } catch (error) {
      console.error(`❌ Failed to delete test secret:`, error.message);
    }
    
    // Test 6: Try to create the actual secrets manually
    console.log('\n6️⃣ Testing creation of actual application secrets...');
    
    const appSecrets = [
      {
        Name: 'football-pickem/dev/jwt-secret',
        SecretString: JSON.stringify({
          JWT_SECRET: 'local-development-jwt-secret-key-super-secure'
        }),
        Description: 'JWT secret for local development'
      },
      {
        Name: 'football-pickem/dev/encryption-key',
        SecretString: JSON.stringify({
          SETTINGS_ENCRYPTION_KEY: 'local-development-encryption-key-32'
        }),
        Description: 'Settings encryption key for local development'
      },
      {
        Name: 'football-pickem/dev/admin-credentials',
        SecretString: JSON.stringify({
          ADMIN_EMAIL: 'admin@localhost',
          ADMIN_PASSWORD: 'admin123'
        }),
        Description: 'Admin credentials for local development'
      }
    ];
    
    for (const secret of appSecrets) {
      try {
        console.log(`🔑 Creating: ${secret.Name}`);
        await secretsClient.send(new CreateSecretCommand(secret));
        console.log(`✅ Created: ${secret.Name}`);
      } catch (error) {
        if (error.name === 'ResourceExistsException') {
          console.log(`⏭️  Already exists: ${secret.Name}`);
        } else {
          console.error(`❌ Failed to create ${secret.Name}:`, error.message);
        }
      }
    }
    
    // Test 7: Final list to verify
    console.log('\n7️⃣ Final secrets list...');
    const finalList = await secretsClient.send(new ListSecretsCommand({}));
    console.log('Total secrets:', finalList.SecretList?.length || 0);
    
    if (finalList.SecretList && finalList.SecretList.length > 0) {
      finalList.SecretList.forEach(secret => {
        console.log(`   - ${secret.Name}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testSecretsManager().catch(error => {
  console.error('💥 Debug failed:', error);
  process.exit(1);
});