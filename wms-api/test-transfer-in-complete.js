/**
 * Complete Transfer IN Procedure Test
 * This script tests the entire transfer IN workflow from creation to receiving items
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import crypto from 'crypto'; // For password hashing

// Load environment variables
dotenv.config();

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms_desktop',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
let AUTH_TOKEN = ''; // Will be set after login

// Test configuration
const TEST_CONFIG = {
  fromShowroom: 'SHOWROOM-001',
  toWarehouse: 'WH-MAIN',
  itemCode: 'SKU-HAT-301-BLU-OS', // Real item for testing
  cartonId: `CTN-TI-TEST-${Date.now()}`,
  qty: 10
};

let connection;
let testTransferInTitle;
let testResults = [];

/**
 * Helper function to make API requests
 */
async function apiRequest(method, endpoint, body = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    }
  };

  if (AUTH_TOKEN) {
    options.headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    return { status: 0, error: error.message };
  }
}

/**
 * Log test result
 */
function logTest(testName, passed, message) {
  const result = { testName, passed, message, timestamp: new Date().toISOString() };
  testResults.push(result);
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${testName}: ${message}`);
  return passed;
}

/**
 * Test 0a: Ensure test user exists
 */
async function testEnsureTestUserExists() {
  console.log('\n👤 Test 0a: Ensuring test user exists...');
  const testUserCode = process.env.TEST_USER_CODE || 'sysadmin';
  const testPassword = process.env.TEST_PASSWORD || '123456';
  const hashedPassword = crypto.createHash('sha256').update(testPassword).digest('hex');

  try {
    const [rows] = await connection.execute(
      'SELECT user_code FROM tabUser WHERE user_code = ?',
      [testUserCode]
    );

    if (rows.length === 0) {
      await connection.execute(
        `INSERT INTO tabUser (user_code, name, email, password_hash, role, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [testUserCode, 'System Admin', 'sysadmin@example.com', hashedPassword, 'Admin', 1]
      );
      return logTest('Ensure Test User', true, `Created test user: ${testUserCode}`);
    } else {
      await connection.execute(
        `UPDATE tabUser SET password_hash = ?, updated_at = NOW() WHERE user_code = ?`,
        [hashedPassword, testUserCode]
      );
      return logTest('Ensure Test User', true, `Found existing user: ${testUserCode}, password updated`);
    }
  } catch (error) {
    return logTest('Ensure Test User', false, `Error: ${error.message}`);
  }
}

/**
 * Test 0: Login to get authentication token
 */
async function testLogin() {
  console.log('\n🔐 Test 0: Logging in to get authentication token...');
  const loginData = {
    user_code: process.env.TEST_USER_CODE || 'sysadmin',
    password: process.env.TEST_PASSWORD || '123456'
  };

  console.log(`   Attempting login with user_code: ${loginData.user_code}`);
  const result = await apiRequest('POST', '/api/auth/login', loginData);
  
  if (result.status === 200 && result.data?.data?.access_token) {
    AUTH_TOKEN = result.data.data.access_token;
    return logTest('Login', true, `Authentication successful, token obtained`);
  } else if (result.status === 200 && result.data?.access_token) {
    AUTH_TOKEN = result.data.access_token;
    return logTest('Login', true, `Authentication successful, token obtained (alternative format)`);
  } else {
    console.error('❌ Login failed. Cannot proceed with API tests.');
    return logTest('Login', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 1: Create Transfer IN
 */
async function testCreateTransferIn() {
  console.log('\n📋 Test 1: Creating Transfer IN...');
  
  // Generate unique Transfer IN title
  const timestamp = Date.now();
  testTransferInTitle = `TI-TEST-${timestamp}`;
  
  const transferInData = {
    title: testTransferInTitle,
    from_showroom: TEST_CONFIG.fromShowroom,
    to_warehouse: TEST_CONFIG.toWarehouse,
    transfer_date: new Date().toISOString().split('T')[0],
    expected_arrival_date: new Date().toISOString().split('T')[0],
    prepared_by: 'TEST-USER',
    items: [
      {
        item_code: TEST_CONFIG.itemCode,
        qty: TEST_CONFIG.qty,
        carton_id: TEST_CONFIG.cartonId
      }
    ]
  };

  const result = await apiRequest('POST', '/api/transfer-in', transferInData);
  
  if (result.status === 200 || result.status === 201) {
    return logTest('Create Transfer IN', true, `Transfer IN created: ${testTransferInTitle}`);
  } else {
    return logTest('Create Transfer IN', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 2: Submit Transfer IN
 */
async function testSubmitTransferIn() {
  console.log('\n📤 Test 2: Submitting Transfer IN...');
  
  if (!testTransferInTitle) {
    return logTest('Submit Transfer IN', false, 'No Transfer IN title available');
  }

  const submitData = {
    submitted_by: 'TEST-USER'
  };

  const result = await apiRequest('POST', `/api/transfer-in/${testTransferInTitle}/submit`, submitData);
  
  if (result.status === 200) {
    return logTest('Submit Transfer IN', true, `Transfer IN submitted successfully`);
  } else {
    return logTest('Submit Transfer IN', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 3: Receive Transfer IN Line (by carton ID)
 */
async function testReceiveTransferInLine() {
  console.log('\n📥 Test 3: Receiving Transfer IN Line...');
  
  if (!testTransferInTitle) {
    return logTest('Receive Transfer IN Line', false, 'No Transfer IN title available');
  }

  const receiveData = {
    carton_id: TEST_CONFIG.cartonId,
    received_by: 'TEST-USER'
  };

  const result = await apiRequest('POST', `/api/transfer-in/${testTransferInTitle}/receive-line`, receiveData);
  
  if (result.status === 200) {
    return logTest('Receive Transfer IN Line', true, `Items received successfully`);
  } else {
    return logTest('Receive Transfer IN Line', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 4: Get Transfer IN
 */
async function testGetTransferIn() {
  console.log('\n📋 Test 4: Getting Transfer IN...');
  
  if (!testTransferInTitle) {
    return logTest('Get Transfer IN', false, 'No Transfer IN title available');
  }

  const result = await apiRequest('GET', `/api/transfer-in/${testTransferInTitle}`);
  
  if (result.status === 200) {
    const transferIn = result.data;
    return logTest('Get Transfer IN', true, `Transfer IN retrieved: ${transferIn.title || testTransferInTitle}`);
  } else {
    return logTest('Get Transfer IN', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 5: Verify Transfer IN in Database
 */
async function testVerifyTransferIn() {
  console.log('\n🔍 Test 5: Verifying Transfer IN in Database...');
  
  try {
    const [transferIns] = await connection.execute(
      `SELECT title, status, total_qty 
       FROM tabTransferIn 
       WHERE title = ?`,
      [testTransferInTitle]
    );

    if (transferIns.length > 0) {
      const transferIn = transferIns[0];
      console.log(`   Transfer IN: ${transferIn.title}`);
      console.log(`   Status: ${transferIn.status}`);
      console.log(`   Total Qty: ${transferIn.total_qty}`);
      
      // Check items
      const [items] = await connection.execute(
        `SELECT item_code, qty, received_qty 
         FROM tabTransferInItem 
         WHERE parent_title = ?`,
        [testTransferInTitle]
      );
      
      console.log(`   Items: ${items.length}`);
      items.forEach(item => {
        console.log(`     - ${item.item_code}: ${item.received_qty}/${item.qty} received`);
      });
      
      return logTest('Verify Transfer IN', true, `Transfer IN found with status: ${transferIn.status}`);
    } else {
      return logTest('Verify Transfer IN', false, 'Transfer IN not found in database');
    }
  } catch (error) {
    return logTest('Verify Transfer IN', false, `Error: ${error.message}`);
  }
}

/**
 * Test 6: Cleanup test data
 */
async function testCleanup() {
  console.log('\n🧹 Test 6: Cleaning up test data...');
  
  try {
    if (testTransferInTitle) {
      await connection.execute(
        'DELETE FROM tabTransferInItem WHERE parent_title = ?',
        [testTransferInTitle]
      );
      await connection.execute(
        'DELETE FROM tabTransferIn WHERE title = ?',
        [testTransferInTitle]
      );
      console.log(`   Deleted Transfer IN: ${testTransferInTitle}`);
    }

    return logTest('Cleanup', true, 'Test data cleaned up');
  } catch (error) {
    return logTest('Cleanup', false, `Error: ${error.message}`);
  }
}

/**
 * Main test function
 */
async function runCompleteTest() {
  console.log('🚀 Starting Complete Transfer IN Procedure Test\n');
  console.log('='.repeat(60));
  console.log(`Test Configuration:`);
  console.log(`  From Showroom: ${TEST_CONFIG.fromShowroom}`);
  console.log(`  To Warehouse: ${TEST_CONFIG.toWarehouse}`);
  console.log(`  Item Code: ${TEST_CONFIG.itemCode}`);
  console.log(`  Carton ID: ${TEST_CONFIG.cartonId}`);
  console.log(`  Quantity: ${TEST_CONFIG.qty}`);
  console.log('='.repeat(60));

  try {
    // Connect to database
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✅ Database connected\n');

    // Run all tests
    await testEnsureTestUserExists();
    await testLogin();

    if (!AUTH_TOKEN) {
      console.log('❌ Login failed. Cannot proceed with API tests.');
      process.exit(1);
    }

    await testCreateTransferIn();
    await testSubmitTransferIn();
    await testReceiveTransferInLine();
    await testGetTransferIn();
    await testVerifyTransferIn();

    // Cleanup
    await testCleanup();

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    
    const passed = testResults.filter(r => r.passed).length;
    const failed = testResults.filter(r => !r.passed).length;
    const total = testResults.length;

    testResults.forEach(result => {
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${result.testName}: ${result.message}`);
    });

    console.log('='.repeat(60));
    console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
    console.log('='.repeat(60));

    if (failed === 0) {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log('\n❌ Some tests failed. Please review the errors above.');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n✅ Database connection closed');
    }
  }
}

// Run the test
runCompleteTest();
