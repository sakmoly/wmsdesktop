/**
 * Complete Material Request Procedure Test
 * This script tests the entire material request workflow from creation to picking items
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
  fromWarehouse: 'WH-MAIN',
  toShowroom: 'SHOWROOM-001',
  itemCode: 'SKU-HAT-301-BLU-OS', // Real item for testing
  requestedQty: 10
};

let connection;
let testMaterialRequestTitle;
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
 * Test 1: Create Material Request
 */
async function testCreateMaterialRequest() {
  console.log('\n📋 Test 1: Creating Material Request...');
  
  // Generate unique Material Request title
  const timestamp = Date.now();
  testMaterialRequestTitle = `MR-TEST-${timestamp}`;
  
  const materialRequestData = {
    title: testMaterialRequestTitle,
    from_warehouse: TEST_CONFIG.fromWarehouse,
    to_showroom: TEST_CONFIG.toShowroom,
    request_date: new Date().toISOString().split('T')[0],
    required_date: new Date().toISOString().split('T')[0],
    requested_by: 'TEST-USER',
    items: [
      {
        item_code: TEST_CONFIG.itemCode,
        requested_qty: TEST_CONFIG.requestedQty
      }
    ]
  };

  const result = await apiRequest('POST', '/api/material-requests', materialRequestData);
  
  if (result.status === 200 || result.status === 201) {
    return logTest('Create Material Request', true, `Material Request created: ${testMaterialRequestTitle}`);
  } else {
    return logTest('Create Material Request', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 2: Update Material Request Status (Submit)
 */
async function testUpdateMaterialRequestStatus() {
  console.log('\n📤 Test 2: Updating Material Request Status to Submitted...');
  
  if (!testMaterialRequestTitle) {
    return logTest('Update Material Request Status', false, 'No Material Request title available');
  }

  const updateData = {
    status: 'Submitted'
  };

  const result = await apiRequest('POST', `/api/material-requests/${testMaterialRequestTitle}/update-status`, updateData);
  
  if (result.status === 200) {
    return logTest('Update Material Request Status', true, `Material Request status updated to Submitted`);
  } else {
    return logTest('Update Material Request Status', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 3: Pick Material Request Items
 */
async function testPickMaterialRequestItems() {
  console.log('\n📦 Test 3: Picking Material Request Items...');
  
  if (!testMaterialRequestTitle) {
    return logTest('Pick Material Request Items', false, 'No Material Request title available');
  }

  const pickData = {
    items: [
      {
        item_code: TEST_CONFIG.itemCode,
        picked_qty: TEST_CONFIG.requestedQty
      }
    ],
    warehouse: TEST_CONFIG.fromWarehouse
  };

  const result = await apiRequest('POST', `/api/material-requests/${testMaterialRequestTitle}/pick-items`, pickData);
  
  if (result.status === 200) {
    return logTest('Pick Material Request Items', true, `Items picked successfully`);
  } else {
    return logTest('Pick Material Request Items', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 4: Get Material Request
 */
async function testGetMaterialRequest() {
  console.log('\n📋 Test 4: Getting Material Request...');
  
  if (!testMaterialRequestTitle) {
    return logTest('Get Material Request', false, 'No Material Request title available');
  }

  const result = await apiRequest('GET', `/api/material-requests/${testMaterialRequestTitle}`);
  
  if (result.status === 200) {
    const materialRequest = result.data;
    return logTest('Get Material Request', true, `Material Request retrieved: ${materialRequest.title || testMaterialRequestTitle}`);
  } else {
    return logTest('Get Material Request', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 5: Verify Material Request in Database
 */
async function testVerifyMaterialRequest() {
  console.log('\n🔍 Test 5: Verifying Material Request in Database...');
  
  try {
    const [materialRequests] = await connection.execute(
      `SELECT title, status, total_requested_qty, total_picked_qty 
       FROM tabMaterialRequest 
       WHERE title = ?`,
      [testMaterialRequestTitle]
    );

    if (materialRequests.length > 0) {
      const materialRequest = materialRequests[0];
      console.log(`   Material Request: ${materialRequest.title}`);
      console.log(`   Status: ${materialRequest.status}`);
      console.log(`   Requested Qty: ${materialRequest.total_requested_qty}`);
      console.log(`   Picked Qty: ${materialRequest.total_picked_qty}`);
      
      // Check items
      const [items] = await connection.execute(
        `SELECT item_code, requested_qty, picked_qty, status 
         FROM tabMaterialRequestItem 
         WHERE parent_title = ?`,
        [testMaterialRequestTitle]
      );
      
      console.log(`   Items: ${items.length}`);
      items.forEach(item => {
        console.log(`     - ${item.item_code}: ${item.picked_qty}/${item.requested_qty} picked (${item.status})`);
      });
      
      return logTest('Verify Material Request', true, `Material Request found with status: ${materialRequest.status}`);
    } else {
      return logTest('Verify Material Request', false, 'Material Request not found in database');
    }
  } catch (error) {
    return logTest('Verify Material Request', false, `Error: ${error.message}`);
  }
}

/**
 * Test 6: Cleanup test data
 */
async function testCleanup() {
  console.log('\n🧹 Test 6: Cleaning up test data...');
  
  try {
    if (testMaterialRequestTitle) {
      await connection.execute(
        'DELETE FROM tabMaterialRequestItem WHERE parent_title = ?',
        [testMaterialRequestTitle]
      );
      await connection.execute(
        'DELETE FROM tabMaterialRequest WHERE title = ?',
        [testMaterialRequestTitle]
      );
      console.log(`   Deleted Material Request: ${testMaterialRequestTitle}`);
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
  console.log('🚀 Starting Complete Material Request Procedure Test\n');
  console.log('='.repeat(60));
  console.log(`Test Configuration:`);
  console.log(`  From Warehouse: ${TEST_CONFIG.fromWarehouse}`);
  console.log(`  To Showroom: ${TEST_CONFIG.toShowroom}`);
  console.log(`  Item Code: ${TEST_CONFIG.itemCode}`);
  console.log(`  Requested Quantity: ${TEST_CONFIG.requestedQty}`);
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

    await testCreateMaterialRequest();
    await testUpdateMaterialRequestStatus();
    await testPickMaterialRequestItems();
    await testGetMaterialRequest();
    await testVerifyMaterialRequest();

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
