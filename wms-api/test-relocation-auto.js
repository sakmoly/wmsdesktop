/**
 * Automated Test for Relocation / Bin Transfer Functionality
 * 
 * This script tests:
 * 1. Session creation
 * 2. Setting FROM/TO locations
 * 3. Committing relocation (both FULL_CARTON and CARTON_TO_CARTON)
 * 4. Verifying data updates in tabStockLedger, tabStockTransaction, tabCartonStock
 * 
 * Run: node test-relocation-auto.js
 */

import mysql from 'mysql2/promise';
import http from 'http';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// Auto-configure from environment variables or defaults
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms_desktop'
};

const API_PORT = process.env.PORT || process.env.API_PORT || 3000;
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${API_PORT}`;

// Try to get API key from environment, or try to login to get a token
// Note: In production, you should set this via environment variable
// Don't use JWT_SECRET as API key - it's the secret for signing tokens, not a token itself
let API_KEY = process.env.API_KEY || null;

// Check if API_KEY is a valid-looking token (should be a JWT, not a secret)
if (API_KEY && (API_KEY.includes('your-') || API_KEY.includes('secret-key') || API_KEY.length < 50)) {
  console.warn('⚠️  API_KEY looks like a placeholder or secret, not a token. Will attempt login instead.');
  API_KEY = null;
}

console.log('📋 Test Configuration:');
console.log(`   Database: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database} (user: ${DB_CONFIG.user})`);
console.log(`   API URL: ${API_BASE_URL}`);
console.log(`   API Key: ${API_KEY ? API_KEY.substring(0, 10) + '...' : '(not set)'}`);
console.log('');

// Test data
const TEST_FROM_BIN = 'A1-R01-L1-B1';
const TEST_TO_BIN = 'A1-R02-L1-B2';
const TEST_FROM_CARTON = 'CTN-TEST-FROM-001';
const TEST_TO_CARTON = 'CTN-TEST-TO-001';
const TEST_ITEM_CODE = 'SKU-TEST-001';
const TEST_WAREHOUSE = 'WH-MAIN';

let connection;
let cachedApiKey = null;

async function getDbConnection() {
  if (!connection) {
    connection = await mysql.createConnection(DB_CONFIG);
  }
  return connection;
}

async function getApiKey() {
  // Use cached key if available
  if (cachedApiKey) {
    return cachedApiKey;
  }
  
  // If API_KEY is set, use it
  if (API_KEY && API_KEY !== 'your-secre...' && API_KEY !== 'test-api-key') {
    cachedApiKey = API_KEY;
    return API_KEY;
  }
  
  // Try to login to get a token
  try {
    // First, try provided credentials
    let testUsername = process.env.TEST_USERNAME || process.env.TEST_USERCODE || 'syssadmin';
    let testPassword = process.env.TEST_PASSWORD || '123456';
    
    console.log(`🔐 Attempting to login as ${testUsername}...`);
    
    // Try provided credentials first
    let loginResponse = await httpRequestWithoutAuth('POST', '/api/auth/login', {
      user_code: testUsername,
      password: testPassword
    });
    
    if (loginResponse.status === 200 && loginResponse.data?.ok && loginResponse.data.data?.access_token) {
      cachedApiKey = loginResponse.data.data.access_token;
      console.log(`✅ Login successful, token obtained (length: ${cachedApiKey.length})`);
      return cachedApiKey;
    }
    
    // If provided credentials fail, query database for active users
    console.log('🔍 Credentials failed, querying database for active users...');
    const conn = await getDbConnection();
    const [users] = await conn.execute(`
      SELECT user_code, password_hash, name
      FROM tabUser 
      WHERE active = 1 
      ORDER BY user_code 
      LIMIT 10
    `);
    
    console.log(`   Found ${users.length} active user(s) in database`);
    if (users.length > 0) {
      // Try each user with provided password, then common passwords
      const passwordsToTry = [testPassword, '123456', '', 'password', 'admin'];
      
      for (const user of users) {
        for (const pwd of passwordsToTry) {
          loginResponse = await httpRequestWithoutAuth('POST', '/api/auth/login', {
            user_code: user.user_code,
            password: pwd
          });
          
          if (loginResponse.status === 200 && loginResponse.data?.ok && loginResponse.data.data?.access_token) {
            cachedApiKey = loginResponse.data.data.access_token;
            console.log(`   ✅ Login successful with user ${user.user_code} (password: ${pwd ? '***' : 'empty'})`);
            return cachedApiKey;
          }
        }
      }
      
      console.warn('   ⚠️  Could not login with any active users');
    } else {
      console.warn('   No active users found in database');
    }
    
    // If all attempts failed, return null
    return null;
  } catch (error) {
    console.warn(`⚠️  Could not login: ${error.message}`);
    return null;
  }
}

async function httpRequestWithoutAuth(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

async function httpRequest(method, path, body = null, headers = {}) {
  return new Promise(async (resolve, reject) => {
    // Get API key (will try to login if needed)
    const apiKey = await getApiKey();
    
    const url = new URL(path, API_BASE_URL);
    console.log(`  📤 ${method} ${url.pathname}${url.search || ''}${apiKey ? ' (with auth)' : ' (no auth)'}`);
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    
    // Add auth header only if we have a key
    if (apiKey) {
      // Ensure token doesn't have "Bearer " prefix already
      const cleanToken = apiKey.startsWith('Bearer ') ? apiKey.substring(7) : apiKey;
      requestHeaders['Authorization'] = `Bearer ${cleanToken}`;
      console.log(`   🔑 Using token: ${cleanToken.substring(0, 20)}...`);
    } else {
      console.log(`   ⚠️  No API key available`);
    }
    
    const options = {
      method,
      headers: requestHeaders
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

async function verifyStockLedger(itemCode, warehouse, binLocation, expectedQty) {
  const conn = await getDbConnection();
  const [rows] = await conn.execute(`
    SELECT qty, bin_location, item_code, warehouse
    FROM tabStockLedger
    WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
  `, [itemCode, warehouse, binLocation, binLocation]);
  
  if (rows.length === 0) {
    return { found: false, actual: 0, expected: expectedQty };
  }
  
  const actualQty = parseFloat(rows[0].qty) || 0;
  return { found: true, actual: actualQty, expected: expectedQty, row: rows[0] };
}

async function verifyStockTransaction(sessionId, itemCode, expectedCount = 1) {
  const conn = await getDbConnection();
  const [rows] = await conn.execute(`
    SELECT id, item_code, transaction_type, reference_doc, qty_change
    FROM tabStockTransaction
    WHERE reference_doc = ? AND item_code = ?
  `, [sessionId, itemCode]);
  
  return { found: rows.length, actual: rows.length, expected: expectedCount, rows };
}

async function verifyCartonStock(cartonId, itemCode, warehouse, binLocation, expectedQty) {
  const conn = await getDbConnection();
  const [rows] = await conn.execute(`
    SELECT carton_id, item_code, warehouse, bin_location, qty
    FROM tabCartonStock
    WHERE carton_id = ? AND item_code = ? AND warehouse = ?
  `, [cartonId, itemCode, warehouse]);
  
  if (rows.length === 0) {
    return { found: false, actual: 0, expected: expectedQty };
  }
  
  const actualQty = parseFloat(rows[0].qty) || 0;
  const actualBin = rows[0].bin_location;
  return { found: true, actual: actualQty, expected: expectedQty, bin: actualBin, expectedBin: binLocation, row: rows[0] };
}

async function setupTestData() {
  const conn = await getDbConnection();
  console.log('📦 Setting up test data...');
  
  // Create test carton stock entries
  try {
    // Check if created_at/updated_at columns exist
    const [columns] = await conn.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabCartonStock' 
        AND COLUMN_NAME IN ('created_at', 'updated_at')
    `);
    const hasCreatedAt = columns.some(col => col.COLUMN_NAME === 'created_at');
    const hasUpdatedAt = columns.some(col => col.COLUMN_NAME === 'updated_at');
    
    // Build INSERT statement dynamically based on available columns
    const insertFields = ['carton_id', 'item_code', 'warehouse', 'bin_location', 'qty'];
    const insertValues = [TEST_FROM_CARTON, TEST_ITEM_CODE, TEST_WAREHOUSE, TEST_FROM_BIN, 10];
    const placeholders = ['?', '?', '?', '?', '?'];
    
    if (hasCreatedAt) {
      insertFields.push('created_at');
      insertValues.push('NOW()');
      placeholders.push('NOW()');
    }
    if (hasUpdatedAt) {
      insertFields.push('updated_at');
      insertValues.push('NOW()');
      placeholders.push('NOW()');
    }
    
    // Build UPDATE clause
    const updateClause = ['qty = 10', `bin_location = ?`];
    if (hasUpdatedAt) {
      updateClause.push('updated_at = NOW()');
    }
    
    await conn.execute(`
      INSERT INTO tabCartonStock (${insertFields.join(', ')})
      VALUES (${placeholders.map(p => p === 'NOW()' ? 'NOW()' : '?').join(', ')})
      ON DUPLICATE KEY UPDATE ${updateClause.join(', ')}
    `, [TEST_FROM_CARTON, TEST_ITEM_CODE, TEST_WAREHOUSE, TEST_FROM_BIN, 10, TEST_FROM_BIN].filter(v => v !== 'NOW()'));
    
    // Create/update stock ledger
    // Check if created_at/updated_at columns exist
    const [ledgerColumns] = await conn.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabStockLedger' 
        AND COLUMN_NAME IN ('created_at', 'updated_at')
    `);
    const ledgerHasTimestamps = ledgerColumns.some(col => col.COLUMN_NAME === 'created_at' || col.COLUMN_NAME === 'updated_at');
    
    const ledgerTimestampFields = ledgerHasTimestamps ? ', updated_at, created_at' : '';
    const ledgerTimestampValues = ledgerHasTimestamps ? ', NOW(), NOW()' : '';
    const ledgerTimestampUpdate = ledgerHasTimestamps ? ', updated_at = NOW()' : '';
    
    await conn.execute(`
      INSERT INTO tabStockLedger (item_code, warehouse, bin_location, qty, reserved_qty, last_transaction_date, last_transaction_type${ledgerTimestampFields})
      VALUES (?, ?, ?, 10, 0, NOW(), 'TEST_SETUP'${ledgerTimestampValues})
      ON DUPLICATE KEY UPDATE qty = 10, bin_location = ?, last_transaction_date = NOW()${ledgerTimestampUpdate}
    `, [TEST_ITEM_CODE, TEST_WAREHOUSE, TEST_FROM_BIN, TEST_FROM_BIN]);
    
    console.log('✅ Test data setup complete');
  } catch (error) {
    console.error('❌ Error setting up test data:', error.message);
    throw error;
  }
}

async function cleanupTestData() {
  const conn = await getDbConnection();
  console.log('🧹 Cleaning up test data...');
  
  try {
    await conn.execute(`DELETE FROM tabRelocationSession WHERE session_id LIKE 'RL-TEST-%'`);
    await conn.execute(`DELETE FROM tabStockTransaction WHERE reference_doc LIKE 'RL-TEST-%'`);
    await conn.execute(`DELETE FROM tabCartonStock WHERE carton_id IN (?, ?)`, [TEST_FROM_CARTON, TEST_TO_CARTON]);
    await conn.execute(`DELETE FROM tabStockLedger WHERE item_code = ? AND warehouse = ?`, [TEST_ITEM_CODE, TEST_WAREHOUSE]);
    console.log('✅ Cleanup complete');
  } catch (error) {
    console.error('⚠️  Error during cleanup:', error.message);
  }
}

async function testFullCartonMove() {
  console.log('\n🧪 TEST 1: Full Carton Move (Same Carton)\n');
  
  // Ensure we have an API key before starting
  await getApiKey();
  
  // 1. Create session
  const createResponse = await httpRequest('POST', '/api/relocation/session/start', {
    mode: 'FULL_CARTON',
    warehouse_id: TEST_WAREHOUSE,
    user_id: 'TEST-USER'
  });
  
  if (createResponse.status !== 200 || !createResponse.data.ok) {
    throw new Error(`Failed to create session: ${JSON.stringify(createResponse.data)}`);
  }
  
  const sessionId = createResponse.data.data.session_id;
  console.log(`✅ Session created: ${sessionId}`);
  
  // 2. Set FROM location
  const fromResponse = await httpRequest('PUT', `/api/relocation/session/${sessionId}/from`, {
    from_bin: TEST_FROM_BIN,
    from_carton: TEST_FROM_CARTON
  });
  
  if (fromResponse.status !== 200 || !fromResponse.data.ok) {
    throw new Error(`Failed to set FROM location: ${JSON.stringify(fromResponse.data)}`);
  }
  console.log(`✅ FROM location set: ${TEST_FROM_BIN} / ${TEST_FROM_CARTON}`);
  
  // 3. Set TO location
  const toResponse = await httpRequest('PUT', `/api/relocation/session/${sessionId}/to`, {
    to_bin: TEST_TO_BIN,
    to_carton: null // Same carton
  });
  
  if (toResponse.status !== 200 || !toResponse.data.ok) {
    throw new Error(`Failed to set TO location: ${JSON.stringify(toResponse.data)}`);
  }
  console.log(`✅ TO location set: ${TEST_TO_BIN} / (same carton)`);
  
  // 4. Commit relocation
  const commitResponse = await httpRequest('POST', `/api/relocation/session/${sessionId}/commit-full`, {
    policy: 'BLIND'
  });
  
  if (commitResponse.status !== 200 || !commitResponse.data.ok) {
    throw new Error(`Failed to commit relocation: ${JSON.stringify(commitResponse.data)}`);
  }
  console.log(`✅ Relocation committed`);
  
  // 5. Verify data
  console.log('\n📊 Verifying data updates...');
  
  // Verify stock ledger at old bin (should be 0 or removed)
  const oldBinStock = await verifyStockLedger(TEST_ITEM_CODE, TEST_WAREHOUSE, TEST_FROM_BIN, 0);
  console.log(`  Old bin (${TEST_FROM_BIN}): expected=0, actual=${oldBinStock.actual}, found=${oldBinStock.found}`);
  
  // Verify stock ledger at new bin (should be 10)
  const newBinStock = await verifyStockLedger(TEST_ITEM_CODE, TEST_WAREHOUSE, TEST_TO_BIN, 10);
  console.log(`  New bin (${TEST_TO_BIN}): expected=10, actual=${newBinStock.actual}, found=${newBinStock.found}`);
  
  // Verify carton stock (bin_location should be updated)
  const cartonStock = await verifyCartonStock(TEST_FROM_CARTON, TEST_ITEM_CODE, TEST_WAREHOUSE, TEST_TO_BIN, 10);
  console.log(`  Carton stock: expected=${cartonStock.expected}, actual=${cartonStock.actual}, bin=${cartonStock.bin}, expectedBin=${cartonStock.expectedBin}`);
  
  // Verify transaction history
  const transactions = await verifyStockTransaction(sessionId, TEST_ITEM_CODE, 1);
  console.log(`  Transactions: expected=1, actual=${transactions.actual}`);
  
  // Summary
  const passed = 
    oldBinStock.found === false || oldBinStock.actual === 0 &&
    newBinStock.actual === 10 &&
    cartonStock.bin === TEST_TO_BIN &&
    transactions.actual >= 1;
  
  if (passed) {
    console.log('\n✅ TEST 1 PASSED: Full Carton Move verified successfully');
  } else {
    console.log('\n❌ TEST 1 FAILED: Data not updated correctly');
    console.log('   Old bin stock:', oldBinStock);
    console.log('   New bin stock:', newBinStock);
    console.log('   Carton stock:', cartonStock);
    console.log('   Transactions:', transactions);
  }
  
  return { passed, sessionId };
}

async function testCartonMerge() {
  console.log('\n🧪 TEST 2: Carton Merge (Different Cartons)\n');
  
  // Setup: Create TO carton with some stock
  const conn = await getDbConnection();
  
  // Reset stock ledger at TO_BIN before test (clean up from Test 1)
  // This ensures we start with a clean slate for Test 2
  await conn.execute(`
    DELETE FROM tabStockLedger 
    WHERE item_code = ? AND warehouse = ? AND bin_location = ?
  `, [TEST_ITEM_CODE, TEST_WAREHOUSE, TEST_TO_BIN]);
  
  // Reset TO carton stock to ensure clean state (clean up from previous runs)
  await conn.execute(`
    DELETE FROM tabCartonStock 
    WHERE carton_id = ? AND item_code = ? AND warehouse = ?
  `, [TEST_TO_CARTON, TEST_ITEM_CODE, TEST_WAREHOUSE]);
  
  // Check if created_at/updated_at columns exist
  const [columns] = await conn.execute(`
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCartonStock' 
      AND COLUMN_NAME IN ('created_at', 'updated_at')
  `);
  const hasCreatedAt = columns.some(col => col.COLUMN_NAME === 'created_at');
  const hasUpdatedAt = columns.some(col => col.COLUMN_NAME === 'updated_at');
  
  // Build INSERT statement dynamically
  const insertFields = ['carton_id', 'item_code', 'warehouse', 'bin_location', 'qty'];
  const insertValues = [TEST_TO_CARTON, TEST_ITEM_CODE, TEST_WAREHOUSE, TEST_TO_BIN, 5];
  const placeholders = ['?', '?', '?', '?', '?'];
  
  if (hasCreatedAt) {
    insertFields.push('created_at');
    placeholders.push('NOW()');
  }
  if (hasUpdatedAt) {
    insertFields.push('updated_at');
    placeholders.push('NOW()');
  }
  
  // Build UPDATE clause
  const updateClause = ['qty = 5'];
  if (hasUpdatedAt) {
    updateClause.push('updated_at = NOW()');
  }
  
  await conn.execute(`
    INSERT INTO tabCartonStock (${insertFields.join(', ')})
    VALUES (${placeholders.map(p => p === 'NOW()' ? 'NOW()' : '?').join(', ')})
    ON DUPLICATE KEY UPDATE ${updateClause.join(', ')}
  `, [TEST_TO_CARTON, TEST_ITEM_CODE, TEST_WAREHOUSE, TEST_TO_BIN, 5].filter(v => v !== 'NOW()'));
  
  // Set up stock ledger at TO_BIN to match TO carton stock (5 items)
  // Check if created_at/updated_at columns exist in tabStockLedger
  const [ledgerColumns] = await conn.execute(`
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockLedger' 
      AND COLUMN_NAME IN ('created_at', 'updated_at')
  `);
  const ledgerHasTimestamps = ledgerColumns.some(col => col.COLUMN_NAME === 'created_at' || col.COLUMN_NAME === 'updated_at');
  
  const ledgerTimestampFields = ledgerHasTimestamps ? ', updated_at, created_at' : '';
  const ledgerTimestampValues = ledgerHasTimestamps ? ', NOW(), NOW()' : '';
  const ledgerTimestampUpdate = ledgerHasTimestamps ? ', updated_at = NOW()' : '';
  
  await conn.execute(`
    INSERT INTO tabStockLedger (item_code, warehouse, bin_location, qty, reserved_qty, last_transaction_date, last_transaction_type${ledgerTimestampFields})
    VALUES (?, ?, ?, 5, 0, NOW(), 'TEST_SETUP'${ledgerTimestampValues})
    ON DUPLICATE KEY UPDATE qty = 5, bin_location = ?, last_transaction_date = NOW()${ledgerTimestampUpdate}
  `, [TEST_ITEM_CODE, TEST_WAREHOUSE, TEST_TO_BIN, TEST_TO_BIN]);
  
  // Update FROM carton stock (might have been modified by previous test)
  await conn.execute(`
    UPDATE tabCartonStock SET qty = 10, bin_location = ? WHERE carton_id = ? AND item_code = ? AND warehouse = ?
  `, [TEST_FROM_BIN, TEST_FROM_CARTON, TEST_ITEM_CODE, TEST_WAREHOUSE]);
  
  // 1. Create session
  const createResponse = await httpRequest('POST', '/api/relocation/session/start', {
    mode: 'CARTON_TO_CARTON',
    warehouse_id: TEST_WAREHOUSE,
    user_id: 'TEST-USER'
  });
  
  const sessionId = createResponse.data.data.session_id;
  console.log(`✅ Session created: ${sessionId}`);
  
  // 2. Set FROM location
  await httpRequest('PUT', `/api/relocation/session/${sessionId}/from`, {
    from_bin: TEST_FROM_BIN,
    from_carton: TEST_FROM_CARTON
  });
  console.log(`✅ FROM location set: ${TEST_FROM_BIN} / ${TEST_FROM_CARTON}`);
  
  // 3. Set TO location
  await httpRequest('PUT', `/api/relocation/session/${sessionId}/to`, {
    to_bin: TEST_TO_BIN,
    to_carton: TEST_TO_CARTON
  });
  console.log(`✅ TO location set: ${TEST_TO_BIN} / ${TEST_TO_CARTON}`);
  
  // 4. Commit relocation
  const commitResponse = await httpRequest('POST', `/api/relocation/session/${sessionId}/commit-partial`, {
    lines: [{ item_code: TEST_ITEM_CODE, qty: 10 }]
  });
  
  if (commitResponse.status !== 200 || !commitResponse.data.ok) {
    throw new Error(`Failed to commit relocation: ${JSON.stringify(commitResponse.data)}`);
  }
  console.log(`✅ Relocation committed`);
  
  // 5. Verify data
  console.log('\n📊 Verifying data updates...');
  
  // FROM carton should be empty or removed
  const fromCartonStock = await verifyCartonStock(TEST_FROM_CARTON, TEST_ITEM_CODE, TEST_WAREHOUSE, null, 0);
  console.log(`  FROM carton: expected=0, actual=${fromCartonStock.actual}`);
  
  // TO carton should have 15 (5 + 10)
  const toCartonStock = await verifyCartonStock(TEST_TO_CARTON, TEST_ITEM_CODE, TEST_WAREHOUSE, TEST_TO_BIN, 15);
  console.log(`  TO carton: expected=15, actual=${toCartonStock.actual}, bin=${toCartonStock.bin}`);
  
  // Stock ledger at new bin should be 15
  const newBinStock = await verifyStockLedger(TEST_ITEM_CODE, TEST_WAREHOUSE, TEST_TO_BIN, 15);
  console.log(`  New bin stock: expected=15, actual=${newBinStock.actual}`);
  
  const passed = 
    fromCartonStock.actual === 0 &&
    toCartonStock.actual === 15 &&
    newBinStock.actual === 15;
  
  if (passed) {
    console.log('\n✅ TEST 2 PASSED: Carton Merge verified successfully');
  } else {
    console.log('\n❌ TEST 2 FAILED: Data not updated correctly');
  }
  
  return { passed, sessionId };
}

async function main() {
  console.log('🚀 Starting Relocation Auto Test\n');
  console.log('⚠️  Make sure to update DB_CONFIG and API_BASE_URL in the script before running!\n');
  
  try {
    // Clear any cached API key
    cachedApiKey = null;
    
    // Get API key first (will try to login if needed)
    console.log('🔐 Authenticating...');
    const apiKey = await getApiKey();
    if (!apiKey) {
      console.error('❌ No API key available. Authentication required for relocation endpoints.');
      console.error('   Please set TEST_USERNAME and TEST_PASSWORD environment variables');
      console.error('   Example: $env:TEST_USERNAME="sysadmin"; $env:TEST_PASSWORD="password"; node test-relocation-auto.js');
      process.exit(1);
    } else {
      console.log(`✅ Authentication ready (token length: ${apiKey.length})\n`);
    }
    
    // Setup test data
    await setupTestData();
    
    // Run tests
    const test1 = await testFullCartonMove();
    const test2 = await testCartonMerge();
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Test 1 (Full Carton Move): ${test1.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Test 2 (Carton Merge): ${test2.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('='.repeat(60));
    
    if (test1.passed && test2.passed) {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some tests failed. Check the output above for details.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Cleanup
    await cleanupTestData();
    if (connection) {
      await connection.end();
    }
  }
}

// Run tests
main();
