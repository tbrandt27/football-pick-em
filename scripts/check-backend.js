#!/usr/bin/env node

import http from 'http';

const checkPort = (port) => {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: port,
      path: '/api/health/live',
      method: 'GET',
      timeout: 2000
    }, (res) => {
      resolve({ port, status: 'running', httpStatus: res.statusCode });
    });

    req.on('error', (err) => {
      resolve({ port, status: 'not running', error: err.code });
    });

    req.on('timeout', () => {
      resolve({ port, status: 'timeout' });
      req.destroy();
    });

    req.end();
  });
};

const main = async () => {
  console.log('🔍 Checking backend server status...\n');
  
  const ports = [3001, 3002, 3003, 8080];
  const results = await Promise.all(ports.map(checkPort));
  
  console.log('Port Status:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  let runningPort = null;
  results.forEach(result => {
    const status = result.status === 'running' ? '✅ Running' : '❌ Not running';
    const extra = result.httpStatus ? ` (HTTP ${result.httpStatus})` : result.error ? ` (${result.error})` : '';
    console.log(`Port ${result.port}: ${status}${extra}`);
    
    if (result.status === 'running') {
      runningPort = result.port;
    }
  });
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (runningPort) {
    console.log(`✅ Backend server is running on port ${runningPort}`);
    console.log(`🌐 Health check: http://localhost:${runningPort}/api/health/live`);
    console.log(`📡 API base: http://localhost:${runningPort}/api/`);
  } else {
    console.log('❌ No backend server found running');
    console.log('💡 Try running: npm run dev:backend');
  }
  
  // Check environment variables
  console.log('\n🔧 Environment Variables:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  console.log(`PORT: ${process.env.PORT || 'not set (default: 3001)'}`);
  console.log(`BACKEND_PORT: ${process.env.BACKEND_PORT || 'not set'}`);
  console.log(`DATABASE_TYPE: ${process.env.DATABASE_TYPE || 'not set (auto)'}`);
};

main().catch(console.error);