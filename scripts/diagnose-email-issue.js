#!/usr/bin/env node

/**
 * Email Configuration Diagnostic Tool
 * 
 * This script helps diagnose and fix SMTP configuration issues
 * that cause "535 Authentication Credentials Invalid" errors.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the database and services
const projectRoot = path.join(__dirname, '..');
process.chdir(projectRoot);

// Load environment variables
import dotenv from 'dotenv';
if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
} else if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
}

import db from '../server/models/database.js';
import configService from '../server/services/configService.js';

const getEncryptionKey = () => configService.getSettingsEncryptionKey();

function decrypt(encryptedText) {
  try {
    if (!encryptedText || typeof encryptedText !== 'string') {
      return "";
    }

    // Handle both old and new encryption formats
    if (encryptedText.includes(':')) {
      // New format with IV: iv:encryptedData
      const [ivHex, encrypted] = encryptedText.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const key = crypto.scryptSync(getEncryptionKey(), 'salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } else {
      // Legacy format - try multiple decryption methods
      console.warn('Legacy encryption format detected. Trying fallback methods...');
      
      // Try method 1: Zero IV
      try {
        const key = crypto.scryptSync(getEncryptionKey(), 'salt', 32);
        const iv = Buffer.alloc(16, 0);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch (error) {
        console.log('  - Method 1 (zero IV) failed');
      }
      
      // Try method 2: SHA256 hash of key
      try {
        let key = crypto.createHash('sha256').update(getEncryptionKey()).digest();
        const iv = Buffer.alloc(16, 0);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch (error) {
        console.log('  - Method 2 (SHA256 key) failed');
      }
      
      console.error('All decryption methods failed');
      return "";
    }
  } catch (error) {
    console.error('Decryption error:', error.message);
    return "";
  }
}

async function diagnoseEmailConfig() {
  console.log('🔍 Football Pick\'em Email Configuration Diagnostic\n');
  
  try {
    // Initialize config service
    await configService.initialize();
    
    console.log('1. Checking environment configuration...');
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
    console.log(`   DATABASE_TYPE: ${process.env.DATABASE_TYPE || 'undefined'}`);
    console.log(`   Encryption key available: ${getEncryptionKey() ? 'Yes' : 'No'}`);
    
    // Check environment variable fallback
    console.log('\n2. Checking environment variable SMTP settings...');
    const envSmtp = {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS ? '***HIDDEN***' : undefined,
      from: process.env.FROM_EMAIL
    };
    
    console.log('   Environment SMTP settings:');
    Object.entries(envSmtp).forEach(([key, value]) => {
      console.log(`     ${key}: ${value || 'NOT SET'}`);
    });
    
    // Check database SMTP settings
    console.log('\n3. Checking database SMTP settings...');
    
    let dbSettings = [];
    const dbType = db.getType();
    console.log(`   Database type: ${dbType}`);
    
    if (dbType === 'dynamodb') {
      try {
        const result = await db.provider._dynamoScan('system_settings', { category: 'smtp' });
        dbSettings = result.Items || [];
        console.log(`   Found ${dbSettings.length} SMTP settings in DynamoDB`);
      } catch (error) {
        console.error(`   Error scanning DynamoDB: ${error.message}`);
      }
    } else {
      try {
        // Check if system_settings table exists
        const tableExists = await db.get(`
          SELECT name FROM sqlite_master
          WHERE type='table' AND name='system_settings'
        `);
        
        if (tableExists) {
          dbSettings = await db.all(`
            SELECT key, value, encrypted
            FROM system_settings
            WHERE category = 'smtp'
            ORDER BY key
          `);
          console.log(`   Found ${dbSettings.length} SMTP settings in SQLite`);
        } else {
          console.log('   system_settings table does not exist');
        }
      } catch (error) {
        console.error(`   Error querying SQLite: ${error.message}`);
      }
    }
    
    // Process database settings
    if (dbSettings.length > 0) {
      console.log('\n   Database SMTP settings:');
      const smtpConfig = {};
      
      for (const setting of dbSettings) {
        let displayValue = setting.value;
        let decryptionStatus = 'N/A';
        
        if (setting.encrypted) {
          if (setting.key.toLowerCase().includes('pass')) {
            // Try to decrypt password but don't show it
            const decrypted = decrypt(setting.value);
            displayValue = decrypted ? '***DECRYPTED***' : '***DECRYPTION FAILED***';
            decryptionStatus = decrypted ? 'SUCCESS' : 'FAILED';
            smtpConfig[setting.key] = decrypted;
          } else {
            // Decrypt other encrypted values
            const decrypted = decrypt(setting.value);
            displayValue = decrypted || '***DECRYPTION FAILED***';
            decryptionStatus = decrypted ? 'SUCCESS' : 'FAILED';
            smtpConfig[setting.key] = decrypted;
          }
        } else {
          smtpConfig[setting.key] = setting.value;
        }
        
        console.log(`     ${setting.key}: ${displayValue} ${setting.encrypted ? `(encrypted: ${decryptionStatus})` : ''}`);
      }
      
      // Check if we have all required settings
      console.log('\n   Configuration completeness check:');
      const requiredFields = ['host', 'port', 'user', 'pass'];
      const missingFields = requiredFields.filter(field => !smtpConfig[field]);
      
      if (missingFields.length === 0) {
        console.log('   ✅ All required SMTP fields are present in database');
        
        // Check if password decryption failed
        const passwordField = smtpConfig.pass || smtpConfig.password;
        if (!passwordField) {
          console.log('   ❌ Password field is empty or decryption failed');
          console.log('\n🔧 RECOMMENDATION: Clear and re-enter SMTP settings in admin panel');
        } else {
          console.log('   ✅ Password field appears valid');
        }
      } else {
        console.log(`   ❌ Missing required fields: ${missingFields.join(', ')}`);
        console.log('\n🔧 RECOMMENDATION: Configure SMTP settings in admin panel or use environment variables');
      }
    } else {
      console.log('   No SMTP settings found in database - will fall back to environment variables');
      
      // Check if environment variables are sufficient
      const envComplete = envSmtp.host && envSmtp.user && envSmtp.pass;
      if (envComplete) {
        console.log('   ✅ Environment variables provide complete SMTP configuration');
      } else {
        console.log('   ❌ Environment variables are incomplete');
        console.log('\n🔧 RECOMMENDATION: Set SMTP_HOST, SMTP_USER, SMTP_PASS environment variables');
      }
    }
    
    // Production-specific checks
    if (process.env.NODE_ENV === 'production') {
      console.log('\n4. Production environment checks...');
      
      // Check if we're using database settings in production
      if (dbSettings.length > 0) {
        console.log('   📧 Production is configured to use database SMTP settings');
        
        // Check for common production issues
        const passwordSetting = dbSettings.find(s => s.key.toLowerCase().includes('pass'));
        if (passwordSetting && passwordSetting.encrypted) {
          const decrypted = decrypt(passwordSetting.value);
          if (!decrypted) {
            console.log('   ❌ CRITICAL: Password decryption failing in production');
            console.log('   🔧 SOLUTION: Clear encrypted SMTP settings and re-enter them');
          }
        }
      } else {
        console.log('   📧 Production is configured to use environment variable SMTP settings');
        console.log('   🔧 Ensure production environment has SMTP_HOST, SMTP_USER, SMTP_PASS set');
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY & RECOMMENDATIONS:');
    console.log('='.repeat(60));
    
    if (dbSettings.length > 0) {
      const hasDecryptionIssues = dbSettings.some(s => s.encrypted && !decrypt(s.value));
      if (hasDecryptionIssues) {
        console.log('❌ Database SMTP settings have decryption issues');
        console.log('🔧 To fix: Access admin panel → Settings → SMTP → Clear corrupted settings and re-enter');
      } else {
        console.log('✅ Database SMTP settings appear valid');
        console.log('🔧 If still getting 535 errors, verify credentials with email provider');
      }
    } else {
      console.log('ℹ️  No database SMTP settings - using environment variables');
      if (envSmtp.host && envSmtp.user && envSmtp.pass) {
        console.log('✅ Environment SMTP settings appear complete');
      } else {
        console.log('❌ Environment SMTP settings incomplete');
        console.log('🔧 Set SMTP_HOST, SMTP_USER, SMTP_PASS in environment');
      }
    }
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
    console.error(error.stack);
  }
}

// Auto-fix function
async function autoFix() {
  console.log('\n🔧 Attempting automatic fixes...\n');
  
  try {
    // Clear corrupted encrypted settings
    const dbType = db.getType();
    
    if (dbType === 'dynamodb') {
      console.log('1. Scanning for corrupted encrypted SMTP settings in DynamoDB...');
      const result = await db.provider._dynamoScan('system_settings', { category: 'smtp' });
      const encryptedSettings = (result.Items || []).filter(setting => setting.encrypted);
      
      if (encryptedSettings.length > 0) {
        console.log(`   Found ${encryptedSettings.length} encrypted settings to check`);
        
        for (const setting of encryptedSettings) {
          const decrypted = decrypt(setting.value);
          if (!decrypted) {
            console.log(`   Deleting corrupted setting: ${setting.key}`);
            await db.provider._dynamoDelete('system_settings', { id: setting.id });
          }
        }
      }
    } else {
      console.log('1. Checking for corrupted encrypted SMTP settings in SQLite...');
      const encryptedSettings = await db.all(
        "SELECT id, key, value FROM system_settings WHERE category = 'smtp' AND encrypted = 1"
      );
      
      if (encryptedSettings.length > 0) {
        console.log(`   Found ${encryptedSettings.length} encrypted settings to check`);
        
        for (const setting of encryptedSettings) {
          const decrypted = decrypt(setting.value);
          if (!decrypted) {
            console.log(`   Deleting corrupted setting: ${setting.key}`);
            await db.run("DELETE FROM system_settings WHERE id = ?", [setting.id]);
          }
        }
      }
    }
    
    console.log('✅ Auto-fix completed');
    console.log('\n🔧 Next steps:');
    console.log('   1. Access the admin panel');
    console.log('   2. Go to Settings → SMTP');
    console.log('   3. Re-enter your SMTP credentials');
    console.log('   4. Test the connection');
    
  } catch (error) {
    console.error('❌ Auto-fix failed:', error);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--fix')) {
    await autoFix();
  } else {
    await diagnoseEmailConfig();
    
    console.log('\n💡 To attempt automatic fixes, run:');
    console.log('   node scripts/diagnose-email-issue.js --fix');
  }
  
  process.exit(0);
}

main().catch(console.error);