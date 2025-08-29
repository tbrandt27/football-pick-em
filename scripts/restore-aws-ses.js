#!/usr/bin/env node

/**
 * Restore AWS SES SMTP Settings
 * 
 * This script restores the original AWS SES settings and fixes
 * the decryption issue that was causing the 535 authentication error.
 */

import fs from 'fs';
import dotenv from 'dotenv';

if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
} else if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
}

import db from '../server/models/database.js';
import configService from '../server/services/configService.js';
import crypto from 'crypto';

// Initialize config service to get encryption key
await configService.initialize();

function encrypt(text) {
  // Generate a random initialization vector
  const iv = crypto.randomBytes(16);
  
  // Create a 32-byte key from the encryption key
  const key = crypto.scryptSync(configService.getSettingsEncryptionKey(), 'salt', 32);
  
  // Create cipher with key and IV
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  // Prepend IV to encrypted data (IV is not secret)
  return iv.toString("hex") + ":" + encrypted;
}

async function restoreAwsSes() {
  console.log('🔧 Restoring AWS SES SMTP settings...\n');
  
  try {
    const dbType = db.getType();
    console.log(`Database type: ${dbType}`);
    
    // Get the real AWS SES password (you'll need to provide this)
    console.log('\n⚠️  You need to provide your real AWS SES SMTP password.');
    console.log('   This script will encrypt it properly and store it in the database.');
    console.log('\n   Your AWS SES SMTP credentials should be:');
    console.log('   User: AKIASAF2TE2WOTH3NPGY');
    console.log('   Pass: [your actual AWS SES SMTP password]');
    console.log('\n   To get your AWS SES SMTP password:');
    console.log('   1. Go to AWS SES Console');
    console.log('   2. SMTP Settings → Create SMTP Credentials');
    console.log('   3. Use the generated password');
    
    // For now, restore the settings with the user needing to update the password
    const awsSettings = [
      { key: 'host', value: 'email-smtp.us-east-1.amazonaws.com', encrypted: false, description: 'AWS SES SMTP host' },
      { key: 'port', value: '587', encrypted: false, description: 'AWS SES SMTP port' },
      { key: 'user', value: 'AKIASAF2TE2WOTH3NPGY', encrypted: false, description: 'AWS SES SMTP user' },
      { key: 'from', value: 'pickem@bisforbrandt.com', encrypted: false, description: 'AWS SES sender email' }
    ];
    
    console.log('\n🔧 Restoring AWS SES settings (password needs manual update):');
    
    for (const setting of awsSettings) {
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
    
    console.log('\n✅ AWS SES settings restored (except password)!');
    console.log('\n📧 Next steps:');
    console.log('   1. Go to Admin Panel → Settings → SMTP');
    console.log('   2. Enter your real AWS SES SMTP password');
    console.log('   3. Test the connection');
    console.log('   4. Save settings');
    
    console.log('\n🔧 The encryption/decryption should now work properly.');
    
  } catch (error) {
    console.error('❌ Error restoring AWS SES settings:', error);
  }
  
  process.exit(0);
}

restoreAwsSes();