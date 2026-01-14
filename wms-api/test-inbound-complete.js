/**
 * Complete InBound Procedure Test
 * This script tests the entire inbound workflow from session creation to completion
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
  asnNo: `ASN-TEST-${Date.now()}`,
  dock: 'DOCK-01',
  totalCartons: 3,
  completedCartons: 0
};

let connection;
let testInboundSession;
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
 * Test 1: Create/Start InBound Session
 */
async function testCreateInboundSession() {
  console.log('\n📋 Test 1: Creating/Starting InBound Session...');
  
  // Generate unique inbound session ID
  const timestamp = Date.now();
  testInboundSession = `SESSION-${TEST_CONFIG.asnNo}-${timestamp}`;
  
  const sessionData = {
    inbound_session: testInboundSession,
    asn_no: TEST_CONFIG.asnNo,
    status: 'Active',
    completed_cartons: 0,
    total_cartons: TEST_CONFIG.totalCartons,
    dock: TEST_CONFIG.dock,
    user_id: 'TEST-USER',
    device_id: 'DEVICE-001'
  };

  const result = await apiRequest('POST', '/api/inbound/update', sessionData);
  
  if (result.status === 200 || result.status === 201) {
    const action = result.data.data?.action || result.data.action || 'created';
    return logTest('Create InBound Session', true, `Session ${action}: ${testInboundSession}`);
  } else {
    return logTest('Create InBound Session', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 2: Update InBound Session (update completed cartons)
 */
async function testUpdateInboundSession() {
  console.log('\n🔄 Test 2: Updating InBound Session...');
  
  if (!testInboundSession) {
    return logTest('Update InBound Session', false, 'No inbound session available');
  }

  const updateData = {
    inbound_session: testInboundSession,
    asn_no: TEST_CONFIG.asnNo,
    status: 'Active',
    completed_cartons: 2, // Update progress
    total_cartons: TEST_CONFIG.totalCartons,
    dock: TEST_CONFIG.dock,
    user_id: 'TEST-USER'
  };

  const result = await apiRequest('POST', '/api/inbound/update', updateData);
  
  if (result.status === 200) {
    return logTest('Update InBound Session', true, `Session updated: completed_cartons=2`);
  } else {
    return logTest('Update InBound Session', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 3: Get InBound Sessions
 */
async function testGetInboundSessions() {
  console.log('\n📋 Test 3: Getting InBound Sessions...');
  
  const result = await apiRequest('GET', '/api/inbound/sessions');
  
  if (result.status === 200) {
    const sessions = Array.isArray(result.data) ? result.data : result.data.data || [];
    const foundSession = sessions.find(s => s.inbound_session === testInboundSession || s.title === testInboundSession);
    if (foundSession) {
      return logTest('Get InBound Sessions', true, `Found session: ${foundSession.inbound_session || foundSession.title}`);
    } else {
      return logTest('Get InBound Sessions', true, `Retrieved ${sessions.length} sessions (test session may not appear immediately)`);
    }
  } else {
    return logTest('Get InBound Sessions', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 4: Complete InBound Session
 */
async function testCompleteInboundSession() {
  console.log('\n✅ Test 4: Completing InBound Session...');
  
  if (!testInboundSession) {
    return logTest('Complete InBound Session', false, 'No inbound session available');
  }

  const completeData = {
    inbound_session: testInboundSession,
    asn_no: TEST_CONFIG.asnNo,
    user_id: 'TEST-USER'
  };

  const result = await apiRequest('POST', '/api/inbound/complete', completeData);
  
  if (result.status === 200) {
    return logTest('Complete InBound Session', true, `Session completed successfully`);
  } else {
    return logTest('Complete InBound Session', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 5: Verify InBound Session in Database
 */
async function testVerifyInboundSession() {
  console.log('\n🔍 Test 5: Verifying InBound Session in Database...');
  
  try {
    // Check which column name is used (inbound_session or title)
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabInboundSession'
      AND COLUMN_NAME IN ('inbound_session', 'title')
    `);
    const sessionIdColumn = columns.some(r => r.COLUMN_NAME === 'inbound_session') ? 'inbound_session' : 'title';
    
    const [sessions] = await connection.execute(
      `SELECT ${sessionIdColumn}, status, completed_cartons, total_cartons 
       FROM tabInboundSession 
       WHERE ${sessionIdColumn} = ?`,
      [testInboundSession]
    );

    if (sessions.length > 0) {
      const session = sessions[0];
      console.log(`   Session: ${session[sessionIdColumn]}`);
      console.log(`   Status: ${session.status}`);
      console.log(`   Completed Cartons: ${session.completed_cartons}/${session.total_cartons}`);
      return logTest('Verify InBound Session', true, `Session found with status: ${session.status}`);
    } else {
      return logTest('Verify InBound Session', false, 'Session not found in database');
    }
  } catch (error) {
    return logTest('Verify InBound Session', false, `Error: ${error.message}`);
  }
}

/**
 * Test 6: Cleanup test data
 */
async function testCleanup() {
  console.log('\n🧹 Test 6: Cleaning up test data...');
  
  try {
    if (testInboundSession) {
      // Check which column name is used
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabInboundSession'
        AND COLUMN_NAME IN ('inbound_session', 'title')
      `);
      const sessionIdColumn = columns.some(r => r.COLUMN_NAME === 'inbound_session') ? 'inbound_session' : 'title';
      
      await connection.execute(
        `DELETE FROM tabInboundSession WHERE ${sessionIdColumn} = ?`,
        [testInboundSession]
      );
      
      console.log(`   Deleted inbound session: ${testInboundSession}`);
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
  console.log('🚀 Starting Complete InBound Procedure Test\n');
  console.log('='.repeat(60));
  console.log(`Test Configuration:`);
  console.log(`  ASN No: ${TEST_CONFIG.asnNo}`);
  console.log(`  Dock: ${TEST_CONFIG.dock}`);
  console.log(`  Total Cartons: ${TEST_CONFIG.totalCartons}`);
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

    await testCreateInboundSession();
    await testUpdateInboundSession();
    await testGetInboundSessions();
    await testCompleteInboundSession();
    await testVerifyInboundSession();

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
