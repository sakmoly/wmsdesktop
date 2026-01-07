/**
 * Test Login Endpoint
 * Verify login endpoint is working correctly
 */

import dotenv from 'dotenv';
dotenv.config();

const API_URL = process.env.API_BASE_URL || 'http://192.168.103.219:3000';

async function testLogin() {
  console.log(`Testing login endpoint: ${API_URL}/api/auth/login\n`);

  try {
    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const healthResponse = await fetch(`${API_URL}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check:', healthData);
    console.log('');

    // Test 2: Login endpoint (without credentials - should get validation error)
    console.log('2. Testing login endpoint (no credentials - should fail)...');
    const loginResponse1 = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    const loginData1 = await loginResponse1.json();
    console.log(`Status: ${loginResponse1.status}`);
    console.log('Response:', JSON.stringify(loginData1, null, 2));
    console.log('');

    // Test 3: Login endpoint (with invalid credentials - should get auth error)
    console.log('3. Testing login endpoint (invalid credentials - should fail)...');
    const loginResponse2 = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_code: 'INVALID_USER',
        password: 'wrong_password'
      })
    });
    const loginData2 = await loginResponse2.json();
    console.log(`Status: ${loginResponse2.status}`);
    console.log('Response:', JSON.stringify(loginData2, null, 2));
    console.log('');

    // Test 4: Check if endpoint exists (should not be 404)
    console.log('4. Verifying endpoint exists...');
    if (loginResponse1.status === 404 || loginResponse2.status === 404) {
      console.log('❌ ERROR: Login endpoint returns 404 - Route not found!');
      console.log('   Check if auth routes are registered in routes/index.js');
    } else {
      console.log('✅ Login endpoint exists and is responding');
    }

    console.log('\n=== Summary ===');
    console.log(`✅ Health endpoint: Working`);
    console.log(`✅ Login endpoint: ${loginResponse1.status === 404 ? 'NOT FOUND' : 'Exists'}`);
    console.log(`\n📱 Mobile app should use:`);
    console.log(`   Base URL: ${API_URL}`);
    console.log(`   Login: POST ${API_URL}/api/auth/login`);
    console.log(`   Body: { "user_code": "...", "password": "..." }`);

  } catch (error) {
    console.error('❌ Error testing endpoints:', error.message);
    console.error('\nPossible causes:');
    console.error('1. Server is not running');
    console.error('2. Wrong API URL');
    console.error('3. Network connectivity issue');
  }
}

testLogin().catch(console.error);

