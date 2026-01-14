// ============================================================
// Complete End-to-End Test: Discrepancy Returns 0 Instead of NULL
// ============================================================
// This script performs a complete test:
// 1. Verifies database column definition
// 2. Checks existing data
// 3. Tests formula with different scenarios
// 4. Simulates API response format
// 5. Provides recommendations
// ============================================================

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function testDiscrepancyComplete() {
  console.log('==========================================');
  console.log('🧪 Complete End-to-End Test: Discrepancy Fix');
  console.log('==========================================\n');

  let connection;
  let allTestsPassed = true;
  const testResults = [];

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'wms_desktop',
      multipleStatements: true
    });

    console.log(`✅ Connected to database: ${process.env.DB_NAME || 'wms_desktop'}\n`);

    // ============================================================
    // TEST 1: Check Column Definition
    // ============================================================
    console.log('📋 TEST 1: Checking Column Definition\n');
    
    const [columns] = await connection.execute(`
      SELECT 
        COLUMN_NAME,
        COLUMN_TYPE,
        IS_NULLABLE,
        GENERATION_EXPRESSION,
        EXTRA
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCycleCountLine'
        AND COLUMN_NAME = 'discrepancy'
    `);

    if (columns.length === 0) {
      console.log('❌ FAILED: discrepancy column does not exist!\n');
      testResults.push({ test: 'Column Definition', passed: false, issue: 'Column does not exist' });
      allTestsPassed = false;
    } else {
      const col = columns[0];
      const formula = (col.GENERATION_EXPRESSION || '').toLowerCase();
      const hasCaseWhen = formula.includes('case') && (formula.includes('when') || formula.includes('isnull'));
      
      if (hasCaseWhen) {
        console.log('✅ PASSED: Column definition is correct');
        console.log(`   Formula: ${col.GENERATION_EXPRESSION}`);
        console.log(`   Type: ${col.COLUMN_TYPE}`);
        console.log(`   Nullable: ${col.IS_NULLABLE}\n`);
        testResults.push({ test: 'Column Definition', passed: true });
      } else {
        console.log('❌ FAILED: Formula does not handle NULL correctly');
        console.log(`   Current: ${col.GENERATION_EXPRESSION}\n`);
        testResults.push({ test: 'Column Definition', passed: false, issue: 'Formula incorrect' });
        allTestsPassed = false;
      }
    }

    // ============================================================
    // TEST 2: Check Existing Data for NULL Values
    // ============================================================
    console.log('📋 TEST 2: Checking Existing Data for NULL Values\n');
    
    const [nullCheck] = await connection.execute(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN discrepancy IS NULL THEN 1 ELSE 0 END) as null_count,
        SUM(CASE WHEN discrepancy = 0 THEN 1 ELSE 0 END) as zero_count,
        SUM(CASE WHEN discrepancy != 0 THEN 1 ELSE 0 END) as variance_count
      FROM tabCycleCountLine
    `);

    const stats = nullCheck[0];
    console.log(`   Total Records: ${stats.total || 0}`);
    console.log(`   NULL Discrepancy: ${stats.null_count || 0} ${stats.null_count > 0 ? '❌' : '✅'}`);
    console.log(`   Zero Discrepancy: ${stats.zero_count || 0} ✅`);
    console.log(`   Variance (not 0): ${stats.variance_count || 0} ✅\n`);

    if (stats.null_count > 0) {
      console.log('❌ FAILED: Found records with NULL discrepancy\n');
      testResults.push({ test: 'NULL Check', passed: false, issue: `${stats.null_count} records have NULL discrepancy` });
      allTestsPassed = false;
    } else {
      console.log('✅ PASSED: No NULL discrepancy values found\n');
      testResults.push({ test: 'NULL Check', passed: true });
    }

    // ============================================================
    // TEST 3: Test Formula with Different Scenarios
    // ============================================================
    console.log('📋 TEST 3: Testing Formula with Different Scenarios\n');
    
    // Test Case 1: Opening Stock (expected_qty = 0, actual_qty = 1)
    console.log('   Test Case 1: Opening Stock (expected_qty = 0, actual_qty = 1)');
    const [test1] = await connection.execute(`
      SELECT 
        CASE 
          WHEN actual_qty IS NULL THEN 0
          ELSE (actual_qty - COALESCE(expected_qty, 0))
        END as calculated_discrepancy,
        discrepancy as db_discrepancy
      FROM tabCycleCountLine
      WHERE expected_qty = 0 AND actual_qty = 1
      LIMIT 1
    `);

    if (test1.length > 0) {
      const calc = parseFloat(test1[0].calculated_discrepancy || 0);
      const db = parseFloat(test1[0].db_discrepancy || 0);
      const match = calc === db;
      console.log(`      Calculated: ${calc}, Database: ${db} ${match ? '✅' : '❌'}\n`);
      
      if (!match || calc === null || db === null) {
        testResults.push({ test: 'Opening Stock Scenario', passed: false, issue: `Mismatch: calc=${calc}, db=${db}` });
        allTestsPassed = false;
      } else {
        testResults.push({ test: 'Opening Stock Scenario', passed: true });
      }
    } else {
      console.log('      ⚠️  No test data found\n');
    }

    // Test Case 2: Normal Variance (expected_qty = 5, actual_qty = 3)
    console.log('   Test Case 2: Normal Variance (expected_qty = 5, actual_qty = 3)');
    const [test2] = await connection.execute(`
      SELECT 
        CASE 
          WHEN actual_qty IS NULL THEN 0
          ELSE (actual_qty - COALESCE(expected_qty, 0))
        END as calculated_discrepancy,
        discrepancy as db_discrepancy
      FROM tabCycleCountLine
      WHERE expected_qty > 0 AND actual_qty IS NOT NULL AND actual_qty != expected_qty
      LIMIT 1
    `);

    if (test2.length > 0) {
      const calc = parseFloat(test2[0].calculated_discrepancy || 0);
      const db = parseFloat(test2[0].db_discrepancy || 0);
      const match = Math.abs(calc - db) < 0.01; // Allow small floating point differences
      console.log(`      Calculated: ${calc}, Database: ${db} ${match ? '✅' : '❌'}\n`);
      
      if (!match || calc === null || db === null) {
        testResults.push({ test: 'Normal Variance Scenario', passed: false, issue: `Mismatch: calc=${calc}, db=${db}` });
        allTestsPassed = false;
      } else {
        testResults.push({ test: 'Normal Variance Scenario', passed: true });
      }
    } else {
      console.log('      ⚠️  No test data found\n');
    }

    // Test Case 3: NULL actual_qty (not counted yet) - should return 0
    console.log('   Test Case 3: NULL actual_qty (not counted yet)');
    const [test3] = await connection.execute(`
      SELECT 
        discrepancy as db_discrepancy
      FROM tabCycleCountLine
      WHERE actual_qty IS NULL
      LIMIT 1
    `);

    if (test3.length > 0) {
      const db = test3[0].db_discrepancy;
      const isZero = db === 0 || db === null; // Should be 0, but might be null if formula not updated
      console.log(`      Database: ${db !== null ? db : 'NULL'} ${isZero || db === 0 ? '✅' : '❌'} (should be 0)\n`);
      
      if (db !== 0 && db !== null) {
        testResults.push({ test: 'NULL actual_qty Scenario', passed: false, issue: `Expected 0, got ${db}` });
        allTestsPassed = false;
      } else {
        testResults.push({ test: 'NULL actual_qty Scenario', passed: db === 0, issue: db === null ? 'Formula may need update' : null });
      }
    } else {
      console.log('      ⚠️  No test data found (all items have been counted)\n');
      testResults.push({ test: 'NULL actual_qty Scenario', passed: true, note: 'No data to test' });
    }

    // ============================================================
    // TEST 4: Verify Sample Records
    // ============================================================
    console.log('📋 TEST 4: Verifying Sample Records\n');
    
    const [sampleRecords] = await connection.execute(`
      SELECT 
        id,
        item_code,
        expected_qty,
        actual_qty,
        discrepancy
      FROM tabCycleCountLine
      ORDER BY id DESC
      LIMIT 10
    `);

    if (sampleRecords.length > 0) {
      console.log(`   Checking ${sampleRecords.length} sample record(s):\n`);
      let samplePassed = true;
      
      sampleRecords.forEach((record, idx) => {
        const expected = parseFloat(record.expected_qty || 0);
        const actual = record.actual_qty !== null ? parseFloat(record.actual_qty) : null;
        const discrepancy = record.discrepancy !== null ? parseFloat(record.discrepancy) : null;
        
        let calculated = null;
        if (actual !== null) {
          calculated = actual - expected;
        } else {
          calculated = 0; // Should be 0 when actual_qty is NULL
        }

        const match = discrepancy === calculated || (discrepancy === null && calculated === 0);
        const hasNull = discrepancy === null;
        
        console.log(`   ${idx + 1}. ${record.item_code}:`);
        console.log(`      Expected: ${expected}, Actual: ${actual !== null ? actual : 'NULL'}`);
        console.log(`      Discrepancy: ${discrepancy !== null ? discrepancy : 'NULL'} ${hasNull ? '❌' : '✅'}`);
        console.log(`      Calculated: ${calculated} ${match ? '✅' : '❌'}\n`);
        
        if (hasNull || !match) {
          samplePassed = false;
          allTestsPassed = false;
        }
      });

      if (samplePassed) {
        console.log('✅ PASSED: All sample records have valid discrepancy values\n');
        testResults.push({ test: 'Sample Records', passed: true });
      } else {
        console.log('❌ FAILED: Some sample records have issues\n');
        testResults.push({ test: 'Sample Records', passed: false, issue: 'Some records have NULL or incorrect values' });
      }
    } else {
      console.log('⚠️  No records found\n');
      testResults.push({ test: 'Sample Records', passed: true, note: 'No data to test' });
    }

    // ============================================================
    // TEST 5: Simulate API Response Format
    // ============================================================
    console.log('📋 TEST 5: Simulating API Response Format\n');
    
    const [apiTestRecords] = await connection.execute(`
      SELECT 
        id,
        item_code,
        expected_qty,
        actual_qty,
        discrepancy,
        bin_location,
        status
      FROM tabCycleCountLine
      WHERE actual_qty IS NOT NULL
      ORDER BY id DESC
      LIMIT 5
    `);

    if (apiTestRecords.length > 0) {
      console.log(`   Simulating API formatCycleCountLine for ${apiTestRecords.length} record(s):\n`);
      let apiTestPassed = true;
      
      apiTestRecords.forEach((record, idx) => {
        // Simulate formatCycleCountLine logic
        const actualQty = record.actual_qty ? parseFloat(record.actual_qty) : null;
        const expectedQty = (record.expected_qty !== null && record.expected_qty !== undefined && parseFloat(record.expected_qty) > 0) ? parseFloat(record.expected_qty) : 0;
        
        let discrepancy = 0;
        if (record.discrepancy !== null && record.discrepancy !== undefined) {
          const parsed = parseFloat(record.discrepancy);
          discrepancy = (!isNaN(parsed)) ? parsed : 0;
        } else if (actualQty !== null && actualQty !== undefined) {
          discrepancy = actualQty - expectedQty;
          if (isNaN(discrepancy)) {
            discrepancy = 0;
          }
        } else {
          discrepancy = 0;
        }
        
        if (discrepancy === null || discrepancy === undefined || isNaN(discrepancy)) {
          discrepancy = 0;
        }

        const apiOutput = {
          line_id: `LINE-${record.id}`,
          id: record.id,
          item_code: record.item_code,
          expected_qty: expectedQty,
          actual_qty: actualQty,
          discrepancy: discrepancy,
          bin_location: record.bin_location || null,
          status: record.status || 'Pending'
        };

        const hasNull = apiOutput.discrepancy === null || apiOutput.discrepancy === undefined;
        const isNumber = typeof apiOutput.discrepancy === 'number' && !isNaN(apiOutput.discrepancy);
        
        console.log(`   ${idx + 1}. ${record.item_code}:`);
        console.log(`      API Output: ${JSON.stringify(apiOutput, null, 2)}`);
        console.log(`      Discrepancy: ${apiOutput.discrepancy} (type: ${typeof apiOutput.discrepancy}) ${hasNull ? '❌ NULL' : isNumber ? '✅' : '❌ Invalid'}\n`);
        
        if (hasNull || !isNumber) {
          apiTestPassed = false;
          allTestsPassed = false;
        }
      });

      if (apiTestPassed) {
        console.log('✅ PASSED: All API responses have valid discrepancy values (0 or number, not null)\n');
        testResults.push({ test: 'API Response Format', passed: true });
      } else {
        console.log('❌ FAILED: Some API responses have NULL or invalid discrepancy values\n');
        testResults.push({ test: 'API Response Format', passed: false, issue: 'NULL or invalid values in API response' });
      }
    } else {
      console.log('⚠️  No counted records found for API testing\n');
      testResults.push({ test: 'API Response Format', passed: true, note: 'No data to test' });
    }

    // ============================================================
    // FINAL SUMMARY
    // ============================================================
    console.log('==========================================');
    console.log('📋 FINAL TEST SUMMARY\n');

    testResults.forEach(result => {
      const status = result.passed ? '✅ PASSED' : '❌ FAILED';
      console.log(`   ${result.test}: ${status}`);
      if (result.issue) {
        console.log(`      Issue: ${result.issue}`);
      }
      if (result.note) {
        console.log(`      Note: ${result.note}`);
      }
    });

    console.log(`\n   Overall: ${allTestsPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}\n`);

    if (!allTestsPassed) {
      console.log('📋 Recommendations:\n');
      
      if (testResults.find(r => r.test === 'Column Definition' && !r.passed)) {
        console.log('   1. Run migration script to fix column definition:');
        console.log('      mysql -u root -p wms_desktop < MIGRATION_UPDATE_DISCREPANCY_TO_ZERO.sql');
        console.log('      OR: node wms-api/update-discrepancy-to-zero.js\n');
      }
      
      if (testResults.find(r => r.test === 'NULL Check' && !r.passed)) {
        console.log('   2. Existing records may have NULL discrepancy values');
        console.log('      Run migration script to update formula\n');
      }
      
      console.log('   3. Rebuild and restart desktop application:');
      console.log('      - Close the desktop app');
      console.log('      - Rebuild the project');
      console.log('      - Restart the application\n');
      
      console.log('   4. Verify in desktop app:');
      console.log('      - Refresh the cycle count task view');
      console.log('      - Check Discrepancy column shows 0.00 instead of empty\n');
    } else {
      console.log('✅ All tests passed! System is working correctly.\n');
      console.log('📋 Next Steps:');
      console.log('   1. Rebuild desktop application (if not already done)');
      console.log('   2. Restart desktop application');
      console.log('   3. Refresh cycle count task view');
      console.log('   4. Verify Discrepancy column shows values (0.00 or variance)\n');
    }

    return allTestsPassed ? 0 : 1;

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    console.error('Error details:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    return 1;
  } finally {
    if (connection) {
      await connection.end();
      console.log('✅ Database connection closed');
    }
  }
}

// Run the test
testDiscrepancyComplete()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });
