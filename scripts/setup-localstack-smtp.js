#!/usr/bin/env node

/**
 * Setup LocalStack SMTP Settings in Database
 * 
 * This script updates the database SMTP settings to use LocalStack
 * instead of AWS SES for development testing.
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

async function setupLocalStackSmtp() {
  console.log('🔧 Setting up LocalStack SMTP in database...\n');
  
  try {
    const dbType = db.getType();
    console.log(`Database type: ${dbType}`);
    
    const localStackSettings = [
      { key: 'host', value: 'localhost', encrypted: false, description: 'LocalStack SMTP host' },
      { key: 'port', value: '1025', encrypted: false, description: 'LocalStack SMTP port' },
      { key: 'user', value: 'localstack', encrypted: false, description: 'LocalStack SMTP user (not used)' },
      { key: 'pass', value: 'localstack', encrypted: false, description: 'LocalStack SMTP password (not used)' },
      { key: 'from', value: 'nfl-pickem@localhost', encrypted: false, description: 'LocalStack sender email' }
    ];
    
    console.log('Setting LocalStack SMTP configuration in database:');
    
    for (const setting of localStackSettings) {
      const settingId = `smtp_${setting.key}`;
      
      console.log(`  - ${setting.key}: ${setting.value}`);
      
      if (dbType === 'dynamodb') {
        await db.provider._dynamoPut('system_settings', {
          id: settingId,
          category: 'smtp',
          key: setting.key,
          value: setting.value,
          encrypted: setting.encrypted,
          description: setting.description,
          updated_at: new Date().toISOString()
        });
      } else {
        await db.run(`
          INSERT OR REPLACE INTO system_settings (id, category, key, value, encrypted, description, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `, [
          settingId,
          'smtp',
          setting.key,
          setting.value,
          setting.encrypted ? 1 : 0,
          setting.description
        ]);
      }
    }
    
    console.log('\n✅ LocalStack SMTP settings configured successfully!');
    console.log('\n📧 Database now contains:');
    console.log('   Host: localhost');
    console.log('   Port: 1025');
    console.log('   Auth: Disabled for localhost');
    console.log('   From: nfl-pickem@localhost');
    
    console.log('\n🔄 Restart your server and try sending emails again.');
    console.log('   LocalStack SMTP should now work without authentication errors.');
    
  } catch (error) {
    console.error('❌ Error setting up LocalStack SMTP:', error);
  }
  
  process.exit(0);
}

setupLocalStackSmtp();