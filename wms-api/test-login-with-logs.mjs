// Test login and check if API server logs appear
// This will help us see if the login function is being called

import http from 'http';

const testData = JSON.stringify({
  user_code: 'sysadmin',
  password: '123456'
});

console.log('\n🧪 Testing Login Endpoint...');
console.log('='.repeat(70));
console.log('POST http://localhost:3000/api/auth/login');
console.log(`Body: ${testData}`);
console.log('\n⚠️  IMPORTANT: Check your API server console!');
console.log('   You should see: "========== LOGIN FUNCTION CALLED (VERSION 2.0) =========="');
console.log('   If you DON\'T see this, the API server is using old code!\n');
console.log('='.repeat(70) + '\n');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(testData)
  }
};

const req = http.request(options, (res) => {
  console.log(`📥 Response Status: ${res.statusCode} ${res.statusMessage}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`📥 Response Body:\n${data}\n`);
    
    try {
      const parsed = JSON.parse(data);
      
      // Check response format
      if (parsed.error?.code === 'AUTH_FAILED') {
        console.log('❌ PROBLEM DETECTED:');
        console.log('   The API is returning "AUTH_FAILED" instead of "AUTH_INVALID"');
        console.log('   This means the API server is using OLD/CACHED code!\n');
        console.log('🔧 SOLUTION:');
        console.log('   1. Stop the API server (Ctrl+C)');
        console.log('   2. Restart it: npm start');
        console.log('   3. Wait for: "🚀 WMS API Server Started"');
        console.log('   4. Run this test again\n');
      } else if (parsed.error?.code === 'AUTH_INVALID') {
        console.log('✅ Good: API is using latest code (returns AUTH_INVALID)');
        console.log('   But login is still failing. Check debug info above.\n');
      }
      
      if (parsed.success || parsed.ok) {
        console.log('✅✅✅ LOGIN SUCCESSFUL! ✅✅✅\n');
        if (parsed.data?.access_token) {
          console.log(`Token: ${parsed.data.access_token.substring(0, 30)}...`);
        }
      } else {
        console.log('❌ Login failed');
        if (parsed.error) {
          console.log(`   Code: ${parsed.error.code}`);
          console.log(`   Message: ${parsed.error.message}`);
          if (parsed.error.debug || parsed.debug) {
            console.log('\n📊 Debug Info:');
            console.log(JSON.stringify(parsed.error.debug || parsed.debug, null, 2));
          }
        }
      }
    } catch (e) {
      console.log('(Response is not valid JSON)');
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ Test completed');
    console.log('='.repeat(70) + '\n');
  });
});

req.on('error', (error) => {
  console.error('\n❌ Request failed:', error.message);
  if (error.code === 'ECONNREFUSED') {
    console.error('⚠️  API server is not running!');
    console.error('   Start it with: cd wms-api && npm start');
  }
});

req.write(testData);
req.end();

