#!/usr/bin/env node

/**
 * AppRunner YAML Validation Script
 * Validates apprunner.yaml configuration for common issues
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function validateAppRunnerYAML() {
  console.log('🔍 Validating AppRunner configuration...\n');

  // Check if apprunner.yaml exists
  const yamlPath = './apprunner.yaml';
  if (!existsSync(yamlPath)) {
    console.error('❌ apprunner.yaml not found');
    process.exit(1);
  }

  try {
    const yamlContent = readFileSync(yamlPath, 'utf8');
    console.log('✅ apprunner.yaml file exists and is readable\n');

    // Basic structure validation
    const validationResults = [];

    // Check for required sections
    if (yamlContent.includes('version:')) {
      validationResults.push('✅ Version specified');
    } else {
      validationResults.push('❌ Missing version field');
    }

    if (yamlContent.includes('build:')) {
      validationResults.push('✅ Build section found');
      if (yamlContent.includes('commands:')) {
        validationResults.push('✅ Build commands specified');
      } else {
        validationResults.push('⚠️  Build section exists but no commands specified');
      }
    } else {
      validationResults.push('⚠️  No build section (may be handled by Dockerfile)');
    }

    if (yamlContent.includes('run:')) {
      validationResults.push('✅ Run section found');
      
      if (yamlContent.includes('command:')) {
        validationResults.push('✅ Run command specified');
      } else {
        validationResults.push('❌ Missing run command');
      }

      if (yamlContent.includes('runtime-version:')) {
        validationResults.push('✅ Runtime version specified');
      } else {
        validationResults.push('⚠️  No runtime version specified (will use default)');
      }

      if (yamlContent.includes('network:')) {
        validationResults.push('✅ Network configuration found');
        if (yamlContent.includes('port: 8080')) {
          validationResults.push('✅ Port 8080 configured correctly');
        } else {
          validationResults.push('⚠️  Port configuration may need review');
        }
      } else {
        validationResults.push('❌ Missing network configuration');
      }
    } else {
      validationResults.push('❌ Missing run section');
    }

    // Print validation results
    console.log('📋 Validation Results:');
    validationResults.forEach(result => console.log(`   ${result}`));

    // Check for common issues
    console.log('\n🔧 Common Issues Check:');
    
    if (yamlContent.includes('/app/')) {
      console.log('   ⚠️  Contains absolute paths (/app/) - consider using relative paths');
    } else {
      console.log('   ✅ Using relative paths (recommended for AppRunner)');
    }

    if (yamlContent.includes('chmod +x')) {
      console.log('   ✅ Setting execute permissions for scripts');
    } else {
      console.log('   ⚠️  Consider adding chmod +x for shell scripts in build commands');
    }

    // Check if start script exists
    if (existsSync('./scripts/start.sh')) {
      console.log('   ✅ Start script exists');
    } else {
      console.log('   ❌ Start script not found');
    }

    // Check package.json for required scripts
    if (existsSync('./package.json')) {
      const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
      if (packageJson.scripts && packageJson.scripts.build) {
        console.log('   ✅ Build script exists in package.json');
      } else {
        console.log('   ❌ Missing build script in package.json');
      }
    }

    console.log('\n🚀 AppRunner Deployment Checklist:');
    console.log('   [ ] apprunner.yaml is valid');
    console.log('   [ ] All required environment variables are set as secrets in AppRunner console');
    console.log('   [ ] JWT_SECRET is configured');
    console.log('   [ ] Database path is appropriate for AppRunner environment');
    console.log('   [ ] Health check endpoint (/api/health) is accessible');
    console.log('   [ ] All dependencies are listed in package.json');

  } catch (error) {
    console.error('❌ Error reading apprunner.yaml:', error.message);
    process.exit(1);
  }
}

// Run validation
validateAppRunnerYAML();