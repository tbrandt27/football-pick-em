#!/usr/bin/env node

/**
 * Clear Database SMTP Settings
 * 
 * This script clears SMTP settings from the database so the system
 * falls back to environment variables (LocalStack).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
import dotenv from 'dotenv';
if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
} else if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
}

import db from '../server/models/database.js';

async function clearSmtpSettings() {
  console.log('🧹 Clearing database SMTP settings...\n');
  
  try {
    const dbType = db.getType();
    console.log(`Database type: ${dbType}`);
    
    if (dbType === 'dynamodb') {
      console.log('Scanning DynamoDB for SMTP settings...');
      const result = await db.provider._dynamoScan('system_settings', { category: 'smtp' });
      const smtpSettings = result.Items || [];
      
      console.log(`Found ${smtpSettings.length} SMTP settings to delete:`);
      
      for (const setting of smtpSettings) {
        console.log(`  - Deleting: ${setting.key} = ${setting.value.substring(0, 20)}...`);
        await db.provider._dynamoDelete('system_settings', { id: setting.id });
      }
      
    } else {
      console.log('Checking SQLite for SMTP settings...');
      const smtpSettings = await db.all(
        "SELECT id, key, value FROM system_settings WHERE category = 'smtp'"
      );
      
      console.log(`Found ${smtpSettings.length} SMTP settings to delete:`);
      
      for (const setting of smtpSettings) {
        console.log(`  - Deleting: ${setting.key} = ${setting.value.substring(0, 20)}...`);
        await db.run("DELETE FROM system_settings WHERE id = ?", [setting.id]);
      }
    }
    
    console.log('\n✅ Database SMTP settings cleared successfully!');
    console.log('\n🔧 System will now use environment variables:');
    console.log(`   SMTP_HOST: ${process.env.SMTP_HOST}`);
    console.log(`   SMTP_PORT: ${process.env.SMTP_PORT}`);
    console.log(`   SMTP_USER: ${process.env.SMTP_USER}`);
    console.log(`   SMTP_PASS: ${!!process.env.SMTP_PASS}`);
    
    console.log('\n📧 Restart your server and try sending emails again.');
    console.log('   LocalStack SMTP should now work at localhost:1025');
    
  } catch (error) {
    console.error('❌ Error clearing SMTP settings:', error);
  }
  
  process.exit(0);
}

clearSmtpSettings();