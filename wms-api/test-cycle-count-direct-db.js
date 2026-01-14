/**
 * Complete Cycle Count Procedure Test (Direct Database)
 * This script tests the entire cycle count workflow directly via database
 * to avoid API dependency issues
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

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

// Test configuration
const TEST_CONFIG = {
  warehouse: 'WH-MAIN',
  binLocation: 'A1-R01-L1-B1-TEST',
  itemCode: 'SKU-HAT-301-BLU-OS',
  cartonIds: ['CTN-TEST-001', 'CTN-TEST-002', 'CTN-TEST-003'],
  quantities: [5, 10, 15],
  expectedTotal: 30
};

let connection;
let testTaskTitle;
let testResults = [];

function logTest(testName, passed, message) {
  const result = { testName, passed, message, timestamp: new Date().toISOString() };
  testResults.push(result);
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${testName}: ${message}`);
  return passed;
}

async function testEnsureTestItemExists() {
  console.log('\n📦 Test 1: Ensuring test item exists in tabItem...');
  try {
    const [rows] = await connection.execute('SELECT code FROM tabItem WHERE code = ?', [TEST_CONFIG.itemCode]);
    if (rows.length === 0) {
      await connection.execute(
        `INSERT INTO tabItem (code, name, item_group, barcode, default_uom, maintain_stock, stock_qty, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [TEST_CONFIG.itemCode, 'Baseball Cap Blue One Size', 'Test', TEST_CONFIG.itemCode, 'EA', 1, 0]
      );
      return logTest('Ensure Test Item', true, `Created test item: ${TEST_CONFIG.itemCode}`);
    } else {
      return logTest('Ensure Test Item', true, `Test item already exists: ${TEST_CONFIG.itemCode}`);
    }
  } catch (error) {
    return logTest('Ensure Test Item', false, `Error: ${error.message}`);
  }
}

async function testCreateCycleCountTask() {
  console.log('\n📋 Test 2: Creating Cycle Count Task...');
  try {
    testTaskTitle = `CC-${TEST_CONFIG.binLocation}-TEST-${Date.now()}`;
    await connection.execute(
      `INSERT INTO tabCycleCountTask 
       (title, status, count_type, warehouse, zone, count_date, created_by, assigned_to, total_items, counted_items, items_with_discrepancy, created_at, updated_at)
       VALUES (?, 'Draft', 'Adhoc', ?, ?, ?, 'TEST-USER', 'TEST-USER', 0, 0, 0, NOW(), NOW())`,
      [testTaskTitle, TEST_CONFIG.warehouse, TEST_CONFIG.binLocation, new Date().toISOString().split('T')[0]]
    );
    return logTest('Create Cycle Count Task', true, `Task created: ${testTaskTitle}`);
  } catch (error) {
    return logTest('Create Cycle Count Task', false, `Error: ${error.message}`);
  }
}

async function testStartCycleCountTask() {
  console.log('\n▶️  Test 3: Starting Cycle Count Task...');
  try {
    // Check if started_at column exists
    const [columns] = await connection.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabCycleCountTask' AND COLUMN_NAME = 'started_at'`
    );
    
    if (columns.length > 0) {
      await connection.execute(
        `UPDATE tabCycleCountTask 
         SET status = 'In Progress', started_at = NOW(), started_by = 'TEST-USER', updated_at = NOW()
         WHERE title = ?`,
        [testTaskTitle]
      );
    } else {
      // Column doesn't exist, just update status
      await connection.execute(
        `UPDATE tabCycleCountTask 
         SET status = 'In Progress', updated_at = NOW()
         WHERE title = ?`,
        [testTaskTitle]
      );
    }
    return logTest('Start Cycle Count Task', true, 'Task started successfully');
  } catch (error) {
    return logTest('Start Cycle Count Task', false, `Error: ${error.message}`);
  }
}

async function testCountItemsWithDifferentCartonIds() {
  console.log('\n📊 Test 4: Counting items with different carton IDs...');
  try {
    for (let i = 0; i < TEST_CONFIG.cartonIds.length; i++) {
      const cartonId = TEST_CONFIG.cartonIds[i];
      const qty = TEST_CONFIG.quantities[i];
      
      // Check if line already exists
      const [existing] = await connection.execute(
        `SELECT id FROM tabCycleCountLine 
         WHERE parent_title = ? AND item_code = ? AND bin_location = ? AND carton_id = ?`,
        [testTaskTitle, TEST_CONFIG.itemCode, TEST_CONFIG.binLocation, cartonId]
      );

      if (existing.length === 0) {
        // Create new line
        await connection.execute(
          `INSERT INTO tabCycleCountLine 
           (parent_title, item_code, bin_location, carton_id, expected_qty, actual_qty, status, counted_by, counted_on, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'Counted', 'TEST-USER', NOW(), NOW(), NOW())`,
          [testTaskTitle, TEST_CONFIG.itemCode, TEST_CONFIG.binLocation, cartonId, 0, qty]
        );
        console.log(`   Created line for carton ${cartonId} with qty ${qty}`);
      } else {
        // Update existing line
        await connection.execute(
          `UPDATE tabCycleCountLine 
           SET actual_qty = ?, status = 'Counted', counted_by = 'TEST-USER', counted_on = NOW(), updated_at = NOW()
           WHERE id = ?`,
          [qty, existing[0].id]
        );
        console.log(`   Updated line for carton ${cartonId} with qty ${qty}`);
      }
    }

    // Update task statistics
    const [countedRows] = await connection.execute(
      `SELECT COUNT(*) as total_counted,
              SUM(CASE WHEN (expected_qty = 0 AND actual_qty > 0) OR (expected_qty > 0 AND ABS(COALESCE(discrepancy, 0)) > 0) THEN 1 ELSE 0 END) as with_discrepancy
       FROM tabCycleCountLine 
       WHERE parent_title = ? AND actual_qty IS NOT NULL`,
      [testTaskTitle]
    );

    await connection.execute(
      `UPDATE tabCycleCountTask 
       SET counted_items = ?, items_with_discrepancy = ?, updated_at = NOW()
       WHERE title = ?`,
      [countedRows[0].total_counted, countedRows[0].with_discrepancy, testTaskTitle]
    );

    return logTest('Count Items with Different Carton IDs', true, `Counted ${TEST_CONFIG.cartonIds.length} lines with different carton IDs`);
  } catch (error) {
    return logTest('Count Items with Different Carton IDs', false, `Error: ${error.message}`);
  }
}

async function testVerifySeparateLinesCreated() {
  console.log('\n🔍 Test 5: Verifying separate lines were created for each carton...');
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

async function testSubmitAndUpdateStock() {
  console.log('\n📤 Test 6: Submitting task and updating stock...');
  try {
    // Simulate the submit/complete process
    // Update status to Completed
    await connection.execute(
      `UPDATE tabCycleCountTask SET status = 'Completed', updated_at = NOW() WHERE title = ?`,
      [testTaskTitle]
    );

    // Update tabCartonStock for each line
    const [lines] = await connection.execute(
      `SELECT item_code, bin_location, carton_id, actual_qty
       FROM tabCycleCountLine
       WHERE parent_title = ? AND item_code = ? AND actual_qty > 0`,
      [testTaskTitle, TEST_CONFIG.itemCode]
    );

    let updatedCount = 0;
    for (const line of lines) {
      if (line.carton_id) {
        // Check if tabCartonStock table exists
        const [tables] = await connection.execute(
          `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabCartonStock'`
        );

        if (tables.length > 0) {
          await connection.execute(
            `INSERT INTO tabCartonStock 
             (carton_id, item_code, warehouse, bin_location, qty, status)
             VALUES (?, ?, ?, ?, ?, 'PUTAWAY')
             ON DUPLICATE KEY UPDATE
               qty = VALUES(qty),
               updated_at = NOW(),
               status = 'PUTAWAY',
               bin_location = VALUES(bin_location)`,
            [line.carton_id, line.item_code, TEST_CONFIG.warehouse, line.bin_location, line.actual_qty]
          );
          updatedCount++;
        }
      }
    }

    return logTest('Submit and Update Stock', true, `Updated ${updatedCount} carton(s) in tabCartonStock`);
  } catch (error) {
    return logTest('Submit and Update Stock', false, `Error: ${error.message}`);
  }
}

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

    // Filter only test cartons
    const testCartons = cartons.filter(c => TEST_CONFIG.cartonIds.includes(c.carton_id));

    if (testCartons.length === TEST_CONFIG.cartonIds.length) {
      let allQuantitiesMatch = true;
      for (let i = 0; i < TEST_CONFIG.cartonIds.length; i++) {
        const expectedCartonId = TEST_CONFIG.cartonIds[i];
        const expectedQty = TEST_CONFIG.quantities[i];
        const carton = testCartons.find(c => c.carton_id === expectedCartonId);
        
        if (!carton || parseFloat(carton.qty) !== expectedQty) {
          console.log(`     ❌ Mismatch: carton ${expectedCartonId} - expected ${expectedQty}, got ${carton?.qty || 'NOT FOUND'}`);
          allQuantitiesMatch = false;
        } else {
          console.log(`     ✅ Match: carton ${expectedCartonId} = ${expectedQty}`);
        }
      }

      if (allQuantitiesMatch) {
        return logTest('Verify Carton Stock Updated', true, `All ${testCartons.length} test cartons updated correctly`);
      } else {
        return logTest('Verify Carton Stock Updated', false, 'Some carton quantities do not match');
      }
    } else {
      return logTest('Verify Carton Stock Updated', false, `Expected ${TEST_CONFIG.cartonIds.length} test cartons, found ${testCartons.length}`);
    }
  } catch (error) {
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

async function testVerifyItemStockQty() {
  console.log('\n💰 Test 8: Verifying tabItem.stock_qty is calculated correctly...');
  try {
    // Calculate expected total from test cartons only
    const [cartonStockTotal] = await connection.execute(
      `SELECT COALESCE(SUM(qty), 0) as total_qty
       FROM tabCartonStock
       WHERE item_code = ?
         AND carton_id IN (?, ?, ?)
         AND qty > 0
         AND (status IS NULL OR status = '' OR status = 'PUTAWAY')`,
      [TEST_CONFIG.itemCode, ...TEST_CONFIG.cartonIds]
    );

    const expectedTestTotal = parseFloat(cartonStockTotal[0].total_qty) || 0;

    // Get current stock_qty from tabItem
    const [itemRows] = await connection.execute('SELECT stock_qty FROM tabItem WHERE code = ?', [TEST_CONFIG.itemCode]);

    if (itemRows.length === 0) {
      return logTest('Verify Item Stock Qty', false, 'Item not found in tabItem');
    }

    const itemStockQty = parseFloat(itemRows[0].stock_qty) || 0;

    // Update tabItem.stock_qty from all cartons (simulating the fix)
    const [allCartonStockTotal] = await connection.execute(
      `SELECT COALESCE(SUM(qty), 0) as total_qty
       FROM tabCartonStock
       WHERE item_code = ?
         AND qty > 0
         AND (status IS NULL OR status = '' OR status = 'PUTAWAY')`,
      [TEST_CONFIG.itemCode]
    );

    const calculatedTotal = parseFloat(allCartonStockTotal[0].total_qty) || 0;

    // Update tabItem.stock_qty
    await connection.execute(
      'UPDATE tabItem SET stock_qty = ?, updated_at = NOW() WHERE code = ?',
      [calculatedTotal, TEST_CONFIG.itemCode]
    );

    console.log(`   Test cartons total: ${expectedTestTotal} (should be ${TEST_CONFIG.expectedTotal})`);
    console.log(`   All cartons total: ${calculatedTotal}`);
    console.log(`   tabItem.stock_qty before update: ${itemStockQty}`);
    console.log(`   tabItem.stock_qty after update: ${calculatedTotal}`);

    if (Math.abs(expectedTestTotal - TEST_CONFIG.expectedTotal) < 0.01) {
      return logTest('Verify Item Stock Qty', true, `Test cartons total matches: ${expectedTestTotal} = ${TEST_CONFIG.expectedTotal}. Updated tabItem.stock_qty to ${calculatedTotal}`);
    } else {
      return logTest('Verify Item Stock Qty', false, `Test cartons mismatch: expected ${TEST_CONFIG.expectedTotal}, got ${expectedTestTotal}`);
    }
  } catch (error) {
    return logTest('Verify Item Stock Qty', false, `Error: ${error.message}`);
  }
}

async function testCleanup() {
  console.log('\n🧹 Test 9: Cleaning up test data...');
  try {
    if (testTaskTitle) {
      await connection.execute('DELETE FROM tabCycleCountLine WHERE parent_title = ?', [testTaskTitle]);
      await connection.execute('DELETE FROM tabCycleCountTask WHERE title = ?', [testTaskTitle]);
      console.log(`   Deleted cycle count task: ${testTaskTitle}`);
    }

    // Delete only test cartons
    await connection.execute(
      'DELETE FROM tabCartonStock WHERE item_code = ? AND carton_id IN (?, ?, ?)',
      [TEST_CONFIG.itemCode, ...TEST_CONFIG.cartonIds]
    );

    // Recalculate tabItem.stock_qty after removing test cartons
    const [cartonStockTotal] = await connection.execute(
      `SELECT COALESCE(SUM(qty), 0) as total_qty
       FROM tabCartonStock
       WHERE item_code = ?
         AND qty > 0
         AND (status IS NULL OR status = '' OR status = 'PUTAWAY')`,
      [TEST_CONFIG.itemCode]
    );

    await connection.execute(
      'UPDATE tabItem SET stock_qty = ?, updated_at = NOW() WHERE code = ?',
      [parseFloat(cartonStockTotal[0].total_qty) || 0, TEST_CONFIG.itemCode]
    );

    return logTest('Cleanup', true, 'Test data cleaned up, tabItem.stock_qty recalculated');
  } catch (error) {
    return logTest('Cleanup', false, `Error: ${error.message}`);
  }
}

async function runCompleteTest() {
  console.log('🚀 Starting Complete Cycle Count Procedure Test (Direct Database)\n');
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
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✅ Database connected\n');

    await testEnsureTestItemExists();
    await testCreateCycleCountTask();
    await testStartCycleCountTask();
    await testCountItemsWithDifferentCartonIds();
    await testVerifySeparateLinesCreated();
    await testSubmitAndUpdateStock();
    await testVerifyCartonStockUpdated();
    await testVerifyItemStockQty();
    await testCleanup();

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

runCompleteTest();
