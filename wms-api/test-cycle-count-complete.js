/**
 * Complete Cycle Count Procedure Test
 * This script tests the entire cycle count workflow from creation to completion
 * and verifies that stock quantities are updated correctly, especially for items
 * with multiple carton IDs.
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
  warehouse: 'WH-MAIN',
  binLocation: 'A1-R01-L1-B1-TEST',
  itemCode: 'SKU-HAT-301-BLU-OS', // Real item for testing
  cartonIds: ['CTN-TEST-001', 'CTN-TEST-002', 'CTN-TEST-003'],
  quantities: [5, 10, 15], // Different quantities for each carton
  expectedTotal: 30 // 5 + 10 + 15
};

let connection;
let testTaskTitle;
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
 * Test 2: Create Cycle Count Task
 */
async function testCreateCycleCountTask() {
  console.log('\n📋 Test 2: Creating Cycle Count Task...');
  
  // Generate unique title for test task
  const timestamp = Date.now();
  const testTitle = `CC-TEST-${timestamp}`;
  
  const taskData = {
    title: testTitle,
    count_type: 'Adhoc',
    warehouse: TEST_CONFIG.warehouse,
    zone: TEST_CONFIG.binLocation, // API uses 'zone', not 'bin_code'
    count_date: new Date().toISOString().split('T')[0],
    created_by: 'TEST-USER',
    assigned_to: 'TEST-USER'
  };

  const result = await apiRequest('POST', '/api/cycle-count', taskData);
  
  if (result.status === 200 || result.status === 201) {
    testTaskTitle = result.data.data?.title || result.data.title || testTitle;
    return logTest('Create Cycle Count Task', true, `Task created: ${testTaskTitle}`);
  } else {
    return logTest('Create Cycle Count Task', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 3: Start Cycle Count Task
 */
async function testStartCycleCountTask() {
  console.log('\n▶️  Test 3: Starting Cycle Count Task...');
  
  if (!testTaskTitle) {
    return logTest('Start Cycle Count Task', false, 'No task title available');
  }

  const result = await apiRequest('POST', `/api/cycle-count/${testTaskTitle}/start`, {
    started_by: 'TEST-USER'
  });

  if (result.status === 200) {
    return logTest('Start Cycle Count Task', true, 'Task started successfully');
  } else {
    return logTest('Start Cycle Count Task', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
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
      // Ensure password is correct if user exists
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
    console.error('💡 Tip: Set TEST_USER_CODE and TEST_PASSWORD in .env file or check API server is running.');
    return logTest('Login', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 1: Ensure test item exists in tabItem
 */
async function testEnsureTestItemExists() {
  console.log('\n📦 Test 1: Ensuring test item exists in tabItem...');
  
  try {
    // Check if item exists
    const [rows] = await connection.execute(
      'SELECT code FROM tabItem WHERE code = ?',
      [TEST_CONFIG.itemCode]
    );

    if (rows.length === 0) {
      // Create test item
      // Include barcode (use item_code as default if not provided)
      await connection.execute(
        `INSERT INTO tabItem (code, name, item_group, barcode, default_uom, maintain_stock, stock_qty, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [TEST_CONFIG.itemCode, 'Test Item for Cycle Count', 'Test', TEST_CONFIG.itemCode, 'EA', 1, 0]
      );
      return logTest('Ensure Test Item', true, `Created test item: ${TEST_CONFIG.itemCode}`);
    } else {
      return logTest('Ensure Test Item', true, `Test item already exists: ${TEST_CONFIG.itemCode}`);
    }
  } catch (error) {
    return logTest('Ensure Test Item', false, `Error: ${error.message}`);
  }
}

/**
 * Test 4: Count items with different carton IDs
 */
async function testCountItemsWithDifferentCartonIds() {
  console.log('\n📊 Test 4: Counting items with different carton IDs...');
  
  if (!testTaskTitle) {
    return logTest('Count Items', false, 'No task title available');
  }

  // Create lines array with different carton IDs
  const lines = TEST_CONFIG.cartonIds.map((cartonId, index) => ({
    item_code: TEST_CONFIG.itemCode,
    bin_location: TEST_CONFIG.binLocation,
    carton_id: cartonId,
    actual_qty: TEST_CONFIG.quantities[index],
    expected_qty: 0, // Opening stock
    counted_by: 'TEST-USER'
  }));

  const result = await apiRequest('POST', `/api/cycle-count/${testTaskTitle}/count`, {
    lines: lines,
    counted_by: 'TEST-USER'
  });

  if (result.status === 200) {
    const message = `Counted ${lines.length} lines with different carton IDs`;
    return logTest('Count Items with Different Carton IDs', true, message);
  } else {
    return logTest('Count Items with Different Carton IDs', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 5: Verify separate lines were created for each carton
 */
async function testVerifySeparateLinesCreated() {
  console.log('\n🔍 Test 5: Verifying separate lines were created for each carton...');
  
  if (!testTaskTitle) {
    return logTest('Verify Separate Lines', false, 'No task title available');
  }

  try {
    const [lines] = await connection.execute(
      `SELECT id, item_code, carton_id, actual_qty, bin_location
       FROM tabCycleCountLine
       WHERE parent_title = ? AND item_code = ?
       ORDER BY carton_id`,
      [testTaskTitle, TEST_CONFIG.itemCode]
    );

    console.log(`   Found ${lines.length} line(s) for item ${TEST_CONFIG.itemCode}:`);
    lines.forEach((line, idx) => {
      console.log(`     Line ${idx + 1}: carton_id=${line.carton_id || 'NULL'}, actual_qty=${line.actual_qty}`);
    });

    if (lines.length === TEST_CONFIG.cartonIds.length) {
      // Verify each carton has its own line
      const foundCartonIds = lines.map(l => l.carton_id).filter(Boolean).sort();
      const expectedCartonIds = [...TEST_CONFIG.cartonIds].sort();
      
      const allMatch = foundCartonIds.length === expectedCartonIds.length &&
        foundCartonIds.every((id, idx) => id === expectedCartonIds[idx]);

      if (allMatch) {
        return logTest('Verify Separate Lines', true, `All ${lines.length} cartons have separate lines`);
      } else {
        return logTest('Verify Separate Lines', false, `Carton ID mismatch. Found: ${foundCartonIds.join(', ')}, Expected: ${expectedCartonIds.join(', ')}`);
      }
    } else {
      return logTest('Verify Separate Lines', false, `Expected ${TEST_CONFIG.cartonIds.length} lines, found ${lines.length}`);
    }
  } catch (error) {
    return logTest('Verify Separate Lines', false, `Error: ${error.message}`);
  }
}

/**
 * Test 6: Submit Cycle Count Task
 */
async function testSubmitCycleCountTask() {
  console.log('\n📤 Test 6: Submitting Cycle Count Task...');
  
  if (!testTaskTitle) {
    return logTest('Submit Cycle Count Task', false, 'No task title available');
  }

  const result = await apiRequest('POST', `/api/cycle-count/${testTaskTitle}/submit`, {});

  if (result.status === 200) {
    const status = result.data.data?.status || 'Unknown';
    return logTest('Submit Cycle Count Task', true, `Task submitted. Status: ${status}`);
  } else {
    return logTest('Submit Cycle Count Task', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
  }
}

/**
 * Test 6a: Complete Cycle Count Task (if status is Review)
 */
async function testCompleteCycleCountTask() {
  console.log('\n✅ Test 6a: Completing Cycle Count Task...');
  
  if (!testTaskTitle) {
    return logTest('Complete Cycle Count Task', false, 'No task title available');
  }

  // Check current status first
  try {
    const [taskRows] = await connection.execute(
      'SELECT status FROM tabCycleCountTask WHERE title = ?',
      [testTaskTitle]
    );

    if (taskRows.length === 0) {
      return logTest('Complete Cycle Count Task', false, 'Task not found');
    }

    const currentStatus = taskRows[0].status;

    if (currentStatus === 'Completed') {
      return logTest('Complete Cycle Count Task', true, 'Task already completed');
    }

    if (currentStatus !== 'Review') {
      return logTest('Complete Cycle Count Task', false, `Cannot complete task in status: ${currentStatus}`);
    }

    // Complete the task
    const result = await apiRequest('POST', `/api/cycle-count/${testTaskTitle}/complete`, {});

    if (result.status === 200) {
      return logTest('Complete Cycle Count Task', true, `Task completed successfully. Stock updated: ${result.data.data?.stock_updated || false}`);
    } else {
      return logTest('Complete Cycle Count Task', false, `Failed: ${result.status} - ${JSON.stringify(result.data)}`);
    }
  } catch (error) {
    return logTest('Complete Cycle Count Task', false, `Error: ${error.message}`);
  }
}

/**
 * Test 7: Verify tabCartonStock was updated correctly
 */
async function testVerifyCartonStockUpdated() {
  console.log('\n📦 Test 7: Verifying tabCartonStock was updated correctly...');
  
  try {
    const [cartons] = await connection.execute(
      `SELECT carton_id, item_code, bin_location, qty, status
       FROM tabCartonStock
       WHERE item_code = ? AND bin_location = ?
       ORDER BY carton_id`,
      [TEST_CONFIG.itemCode, TEST_CONFIG.binLocation]
    );

    console.log(`   Found ${cartons.length} carton(s) in tabCartonStock:`);
    cartons.forEach((carton, idx) => {
      console.log(`     Carton ${idx + 1}: ${carton.carton_id} = ${carton.qty} (status: ${carton.status || 'NULL'})`);
    });

    if (cartons.length === TEST_CONFIG.cartonIds.length) {
      // Verify quantities match
      let allQuantitiesMatch = true;
      for (let i = 0; i < TEST_CONFIG.cartonIds.length; i++) {
        const expectedCartonId = TEST_CONFIG.cartonIds[i];
        const expectedQty = TEST_CONFIG.quantities[i];
        const carton = cartons.find(c => c.carton_id === expectedCartonId);
        
        if (!carton || parseFloat(carton.qty) !== expectedQty) {
          console.log(`     ❌ Mismatch: carton ${expectedCartonId} - expected ${expectedQty}, got ${carton?.qty || 'NOT FOUND'}`);
          allQuantitiesMatch = false;
        } else {
          console.log(`     ✅ Match: carton ${expectedCartonId} = ${expectedQty}`);
        }
      }

      if (allQuantitiesMatch) {
        return logTest('Verify Carton Stock Updated', true, `All ${cartons.length} cartons updated correctly`);
      } else {
        return logTest('Verify Carton Stock Updated', false, 'Some carton quantities do not match');
      }
    } else {
      return logTest('Verify Carton Stock Updated', false, `Expected ${TEST_CONFIG.cartonIds.length} cartons, found ${cartons.length}`);
    }
  } catch (error) {
    // Check if table exists
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabCartonStock'`
    );
    
    if (tables.length === 0) {
      return logTest('Verify Carton Stock Updated', false, 'tabCartonStock table does not exist');
    } else {
      return logTest('Verify Carton Stock Updated', false, `Error: ${error.message}`);
    }
  }
}

/**
 * Test 8: Verify tabItem.stock_qty is calculated correctly
 */
async function testVerifyItemStockQty() {
  console.log('\n💰 Test 8: Verifying tabItem.stock_qty is calculated correctly...');
  
  try {
    // Get current stock_qty from tabItem
    const [itemRows] = await connection.execute(
      'SELECT stock_qty FROM tabItem WHERE code = ?',
      [TEST_CONFIG.itemCode]
    );

    if (itemRows.length === 0) {
      return logTest('Verify Item Stock Qty', false, 'Item not found in tabItem');
    }

    const itemStockQty = parseFloat(itemRows[0].stock_qty) || 0;

    // Calculate expected total from tabCartonStock
    const [cartonStockTotal] = await connection.execute(
      `SELECT COALESCE(SUM(qty), 0) as total_qty
       FROM tabCartonStock
       WHERE item_code = ?
         AND qty > 0
         AND (status IS NULL OR status = '' OR status = 'PUTAWAY')`,
      [TEST_CONFIG.itemCode]
    );

    const expectedTotal = parseFloat(cartonStockTotal[0].total_qty) || 0;

    console.log(`   tabItem.stock_qty: ${itemStockQty}`);
    console.log(`   tabCartonStock SUM: ${expectedTotal}`);
    console.log(`   Expected total: ${TEST_CONFIG.expectedTotal}`);

    if (Math.abs(itemStockQty - expectedTotal) < 0.01) {
      return logTest('Verify Item Stock Qty', true, `Stock qty matches: ${itemStockQty} = ${expectedTotal}`);
    } else {
      return logTest('Verify Item Stock Qty', false, `Mismatch: tabItem.stock_qty=${itemStockQty}, tabCartonStock SUM=${expectedTotal}, Expected=${TEST_CONFIG.expectedTotal}`);
    }
  } catch (error) {
    return logTest('Verify Item Stock Qty', false, `Error: ${error.message}`);
  }
}

/**
 * Test 9: Cleanup test data
 */
async function testCleanup() {
  console.log('\n🧹 Test 9: Cleaning up test data...');
  
  try {
    // Delete cycle count lines
    if (testTaskTitle) {
      await connection.execute(
        'DELETE FROM tabCycleCountLine WHERE parent_title = ?',
        [testTaskTitle]
      );
      
      // Delete cycle count task
      await connection.execute(
        'DELETE FROM tabCycleCountTask WHERE title = ?',
        [testTaskTitle]
      );
      
      console.log(`   Deleted cycle count task: ${testTaskTitle}`);
    }

    // Delete carton stock
    await connection.execute(
      'DELETE FROM tabCartonStock WHERE item_code = ? AND bin_location = ?',
      [TEST_CONFIG.itemCode, TEST_CONFIG.binLocation]
    );

    // Reset item stock_qty to 0
    await connection.execute(
      'UPDATE tabItem SET stock_qty = 0 WHERE code = ?',
      [TEST_CONFIG.itemCode]
    );

    // Optionally delete test item
    // await connection.execute('DELETE FROM tabItem WHERE code = ?', [TEST_CONFIG.itemCode]);

    return logTest('Cleanup', true, 'Test data cleaned up');
  } catch (error) {
    return logTest('Cleanup', false, `Error: ${error.message}`);
  }
}

/**
 * Main test function
 */
async function runCompleteTest() {
  console.log('🚀 Starting Complete Cycle Count Procedure Test\n');
  console.log('='.repeat(60));
  console.log(`Test Configuration:`);
  console.log(`  Warehouse: ${TEST_CONFIG.warehouse}`);
  console.log(`  Bin Location: ${TEST_CONFIG.binLocation}`);
  console.log(`  Item Code: ${TEST_CONFIG.itemCode}`);
  console.log(`  Carton IDs: ${TEST_CONFIG.cartonIds.join(', ')}`);
  console.log(`  Quantities: ${TEST_CONFIG.quantities.join(', ')}`);
  console.log(`  Expected Total: ${TEST_CONFIG.expectedTotal}`);
  console.log('='.repeat(60));

  try {
    // Connect to database
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✅ Database connected\n');

    // Run all tests
    await testEnsureTestUserExists(); // Ensure user exists before login
    await testLogin(); // Login to get token

    if (!AUTH_TOKEN) {
      console.log('❌ Login failed. Cannot proceed with API tests.');
      process.exit(1);
    }

    await testEnsureTestItemExists();
    await testCreateCycleCountTask();
    await testStartCycleCountTask();
    await testCountItemsWithDifferentCartonIds();
    await testVerifySeparateLinesCreated();
    await testSubmitCycleCountTask();
    await testCompleteCycleCountTask(); // Complete if status is Review
    await testVerifyCartonStockUpdated();
    await testVerifyItemStockQty();

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
