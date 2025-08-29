#!/usr/bin/env node

// Script to check available environment variables in App Runner
console.log("=== Environment Variables Check ===");
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("PORT:", process.env.PORT);
console.log("AWS_REGION:", process.env.AWS_REGION);

// Check for potential App Runner service URL variables
console.log("\n=== Potential App Runner Service URL Variables ===");
const potentialVars = [
  'AWS_APPRUNNER_SERVICE_URL',
  'APPRUNNER_SERVICE_URL', 
  '_AWS_APPRUNNER_SERVICE_URL',
  'SERVICE_URL',
  'AWS_SERVICE_URL',
  'APPRUNNER_URL'
];

potentialVars.forEach(varName => {
  const value = process.env[varName];
  console.log(`${varName}:`, value || 'NOT SET');
});

// Check all environment variables that might contain 'app' or 'runner' or 'service'
console.log("\n=== All Environment Variables (filtered) ===");
Object.keys(process.env)
  .filter(key => 
    key.toLowerCase().includes('app') || 
    key.toLowerCase().includes('runner') || 
    key.toLowerCase().includes('service') ||
    key.toLowerCase().includes('url')
  )
  .sort()
  .forEach(key => {
    console.log(`${key}:`, process.env[key]);
  });

console.log("\n=== All AWS Environment Variables ===");
Object.keys(process.env)
  .filter(key => key.startsWith('AWS_'))
  .sort()
  .forEach(key => {
    console.log(`${key}:`, process.env[key]);
  });