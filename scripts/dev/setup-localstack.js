#!/usr/bin/env node

/**
 * LocalStack Setup Script for Football Pick'em
 * 
 * This script sets up the necessary AWS resources in LocalStack for local development:
 * - DynamoDB tables
 * - Secrets Manager secrets
 * 
 * Prerequisites:
 * - LocalStack running globally (e.g., via `localstack start`)
 * - LocalStack accessible at http://localhost:4566
 */

import { DynamoDBClient, CreateTableCommand, ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { SecretsManagerClient, CreateSecretCommand, ListSecretsCommand } from "@aws-sdk/client-secrets-manager";
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

const secretsClient = new SecretsManagerClient({
  region: AWS_REGION,
  endpoint: LOCALSTACK_ENDPOINT,
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test'
  }
});

// Table definitions
const tableDefs = [
  {
    TableName: `${TABLE_PREFIX}users`,
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'email-index',
        KeySchema: [
          { AttributeName: 'email', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: `${TABLE_PREFIX}football_teams`,
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'abbreviation', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'abbreviation-index',
        KeySchema: [
          { AttributeName: 'abbreviation', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: `${TABLE_PREFIX}pickem_games`,
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'commissioner_id', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'commissioner-index',
        KeySchema: [
          { AttributeName: 'commissioner_id', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: `${TABLE_PREFIX}game_participants`,
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'game_id', AttributeType: 'S' },
      { AttributeName: 'user_id', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'game_id-index',
        KeySchema: [
          { AttributeName: 'game_id', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      },
      {
        IndexName: 'user_id-index',
        KeySchema: [
          { AttributeName: 'user_id', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      },
      {
        IndexName: 'game_id-user_id-index',
        KeySchema: [
          { AttributeName: 'game_id', KeyType: 'HASH' },
          { AttributeName: 'user_id', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: `${TABLE_PREFIX}seasons`,
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'year', AttributeType: 'N' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'year-index',
        KeySchema: [
          { AttributeName: 'year', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: `${TABLE_PREFIX}football_games`,
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'season_id', AttributeType: 'S' },
      { AttributeName: 'week', AttributeType: 'N' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'season-week-index',
        KeySchema: [
          { AttributeName: 'season_id', KeyType: 'HASH' },
          { AttributeName: 'week', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: `${TABLE_PREFIX}system_settings`,
    KeySchema: [
      { AttributeName: 'key', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'key', AttributeType: 'S' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: `${TABLE_PREFIX}picks`,
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'user_id', AttributeType: 'S' },
      { AttributeName: 'game_id', AttributeType: 'S' },
      { AttributeName: 'season_id_week', AttributeType: 'S' },
      { AttributeName: 'user_game_football', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'user_id-index',
        KeySchema: [
          { AttributeName: 'user_id', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      },
      {
        IndexName: 'game_id-index',
        KeySchema: [
          { AttributeName: 'game_id', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      },
      {
        IndexName: 'season_id_week-index',
        KeySchema: [
          { AttributeName: 'season_id_week', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      },
      {
        IndexName: 'user_game_football-index',
        KeySchema: [
          { AttributeName: 'user_game_football', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: `${TABLE_PREFIX}weekly_standings`,
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'user_id', AttributeType: 'S' },
      { AttributeName: 'game_id', AttributeType: 'S' },
      { AttributeName: 'season_id_week', AttributeType: 'S' },
      { AttributeName: 'game_season_week', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'user_id-index',
        KeySchema: [
          { AttributeName: 'user_id', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      },
      {
        IndexName: 'game_id-index',
        KeySchema: [
          { AttributeName: 'game_id', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      },
      {
        IndexName: 'season_id_week-index',
        KeySchema: [
          { AttributeName: 'season_id_week', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      },
      {
        IndexName: 'game_season_week-index',
        KeySchema: [
          { AttributeName: 'game_season_week', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: `${TABLE_PREFIX}game_invitations`,
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'game_id', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'game-invitations-index',
        KeySchema: [
          { AttributeName: 'game_id', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      },
      {
        IndexName: 'email-invitations-index',
        KeySchema: [
          { AttributeName: 'email', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  }
];

// Secret definitions - single secret with all keys
const secretDefs = [
  {
    Name: 'football-pickem/dev/jwt-secret',
    SecretString: JSON.stringify({
      JWT_SECRET: 'local-development-jwt-secret-key-super-secure',
      SETTINGS_ENCRYPTION_KEY: 'local-development-encryption-key-32',
      ADMIN_EMAIL: 'admin@localhost',
      ADMIN_PASSWORD: 'admin123'
    }),
    Description: 'All application secrets for local development'
  }
];

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

async function createDynamoDBTables() {
  console.log('\n📦 Setting up DynamoDB tables...');
  
  try {
    // List existing tables
    const existingTables = await dynamoClient.send(new ListTablesCommand({}));
    const existingTableNames = existingTables.TableNames || [];
    
    for (const tableDef of tableDefs) {
      if (existingTableNames.includes(tableDef.TableName)) {
        console.log(`⏭️  Table ${tableDef.TableName} already exists, skipping...`);
        continue;
      }
      
      try {
        console.log(`🏗️  Creating table: ${tableDef.TableName}`);
        await dynamoClient.send(new CreateTableCommand(tableDef));
        console.log(`✅ Created table: ${tableDef.TableName}`);
      } catch (error) {
        console.error(`❌ Failed to create table ${tableDef.TableName}:`, error.message);
      }
    }
  } catch (error) {
    console.error('❌ Failed to setup DynamoDB tables:', error.message);
  }
}

async function createSecrets() {
  console.log('\n🔐 Setting up Secrets Manager secrets...');
  
  try {
    // List existing secrets
    const existingSecrets = await secretsClient.send(new ListSecretsCommand({}));
    const existingSecretNames = (existingSecrets.SecretList || []).map(s => s.Name);
    
    for (const secretDef of secretDefs) {
      if (existingSecretNames.includes(secretDef.Name)) {
        console.log(`⏭️  Secret ${secretDef.Name} already exists, skipping...`);
        continue;
      }
      
      try {
        console.log(`🔑 Creating secret: ${secretDef.Name}`);
        await secretsClient.send(new CreateSecretCommand(secretDef));
        console.log(`✅ Created secret: ${secretDef.Name}`);
      } catch (error) {
        console.error(`❌ Failed to create secret ${secretDef.Name}:`, error.message);
      }
    }
  } catch (error) {
    console.error('❌ Failed to setup secrets:', error.message);
  }
}

async function main() {
  console.log('🚀 Setting up LocalStack for Football Pick\'em');
  console.log(`📍 LocalStack endpoint: ${LOCALSTACK_ENDPOINT}`);
  console.log(`🏷️  Table prefix: ${TABLE_PREFIX}`);
  console.log(`🌍 AWS region: ${AWS_REGION}`);
  
  // Check connection first
  const connected = await checkLocalStackConnection();
  if (!connected) {
    process.exit(1);
  }
  
  // Create resources
  await createDynamoDBTables();
  await createSecrets();
  
  console.log('\n🎉 LocalStack setup complete!');
  console.log('\n📋 Next steps:');
  console.log('   1. Copy .env.local to .env');
  console.log('   2. Run: npm run dev:local');
  console.log('   3. Visit DynamoDB Admin UI: http://localhost:8001');
}

// Run the setup
main().catch(error => {
  console.error('💥 Setup failed:', error);
  process.exit(1);
});