// ============================================================
// Auto-Test Script: Verify Discrepancy Returns 0 Instead of NULL
// ============================================================
// This script:
// 1. Checks current discrepancy column definition
// 2. Updates it if needed
// 3. Tests the API endpoint
// 4. Verifies discrepancy is 0 instead of null
// ============================================================

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''; // You may need to get a valid token

// Helper function to make API calls (using built-in fetch)
async function apiCall(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    const data = await response.json();
    return {
      status: response.status,
      statusText: response.statusText,
      data: data,
      ok: response.ok
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

async function testDiscrepancyFix() {
  console.log('==========================================');
  console.log('🧪 Auto-Test: Discrepancy Fix Verification');
  console.log('==========================================\n');

  let connection;
  let testResults = {
    database: { passed: false, issues: [] },
    api: { passed: false, issues: [] },
    data: { passed: false, issues: [] }
  };

  try {
    // ============================================================
    // PART 1: Database Connection & Check
    // ============================================================
    console.log('📋 PART 1: Database Check\n');
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'wms_desktop',
      multipleStatements: true
    });

    console.log(`✅ Connected to database: ${process.env.DB_NAME || 'wms_desktop'}\n`);

    // Step 1: Check current discrepancy column definition
    console.log('📋 Step 1.1: Checking discrepancy column definition...');
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
      console.log('❌ discrepancy column does not exist!');
      testResults.database.issues.push('discrepancy column does not exist');
    } else {
      const col = columns[0];
      console.log(`✅ Found discrepancy column:`);
      console.log(`   Type: ${col.COLUMN_TYPE}`);
      console.log(`   Nullable: ${col.IS_NULLABLE}`);
      console.log(`   Expression: ${col.GENERATION_EXPRESSION || 'N/A'}`);
      console.log(`   Extra: ${col.EXTRA}\n`);

      const isGenerated = col.EXTRA && col.EXTRA.includes('STORED');
      if (!isGenerated) {
        console.log('⚠️  discrepancy is not a generated column - this may cause issues\n');
        testResults.database.issues.push('discrepancy is not a generated column');
      }

      // Check if formula handles NULL correctly
      const formula = (col.GENERATION_EXPRESSION || '').toLowerCase();
      // Check for proper NULL handling - accept both ISNULL() and IS NULL
      const hasCaseWhen = formula.includes('case') && (formula.includes('when') || formula.includes('isnull'));
      const hasNullHandling = hasCaseWhen || (formula.includes('coalesce') && formula.includes('actual_qty') && formula.includes('expected_qty'));
      
      // Formula is correct if it has CASE WHEN with NULL check or uses COALESCE properly
      const isCorrect = hasCaseWhen || (formula.includes('coalesce(actual_qty') && formula.includes('coalesce(expected_qty'));
      
      if (!isCorrect && formula.includes('actual_qty') && formula.includes('expected_qty')) {
        console.log('⚠️  Formula may not handle NULL values correctly');
        console.log(`   Current: ${col.GENERATION_EXPRESSION}`);
        console.log('   Expected: CASE WHEN actual_qty IS NULL THEN 0 ELSE (actual_qty - COALESCE(expected_qty, 0)) END\n');
        testResults.database.issues.push('Formula does not handle NULL values correctly');
        
        // Fix the formula
        console.log('🔧 Fixing discrepancy formula...');
        try {
          // Drop index if exists
          try {
            await connection.execute(`ALTER TABLE tabCycleCountLine DROP INDEX idx_discrepancy`);
            console.log('   ✅ Dropped index');
          } catch (e) {
            // Index may not exist, that's okay
          }

          // Drop column
          await connection.execute(`ALTER TABLE tabCycleCountLine DROP COLUMN discrepancy`);
          console.log('   ✅ Dropped old column');

          // Recreate with correct formula
          await connection.execute(`
            ALTER TABLE tabCycleCountLine
            ADD COLUMN discrepancy DECIMAL(10,2) AS (
              CASE 
                WHEN actual_qty IS NULL THEN 0
                ELSE (actual_qty - COALESCE(expected_qty, 0))
              END
            ) STORED
          `);
          console.log('   ✅ Recreated column with correct formula');
          console.log('   Formula: CASE WHEN actual_qty IS NULL THEN 0 ELSE (actual_qty - COALESCE(expected_qty, 0)) END');

          // Recreate index
          try {
            await connection.execute(`CREATE INDEX idx_discrepancy ON tabCycleCountLine(discrepancy)`);
            console.log('   ✅ Recreated index\n');
          } catch (e) {
            // Index may already exist, that's okay
          }

          console.log('✅ Formula updated successfully!\n');
        } catch (error) {
          console.error('❌ Error fixing formula:', error.message);
          testResults.database.issues.push(`Error fixing formula: ${error.message}`);
        }
      } else {
        console.log('✅ Formula looks correct\n');
      }
    }

    // Step 2: Update expected_qty to 0 where it's NULL
    console.log('📋 Step 1.2: Updating expected_qty to 0 where NULL...');
    const [updateResult] = await connection.execute(`
      UPDATE tabCycleCountLine
      SET expected_qty = 0
      WHERE expected_qty IS NULL
    `);
    console.log(`✅ Updated ${updateResult.affectedRows} records with NULL expected_qty to 0\n`);

    // Step 3: Check for NULL discrepancy values
    console.log('📋 Step 1.3: Checking for NULL discrepancy values...');
    const [nullCheck] = await connection.execute(`
      SELECT 
        COUNT(*) as total_records,
        SUM(CASE WHEN discrepancy IS NULL THEN 1 ELSE 0 END) as records_with_null_discrepancy,
        SUM(CASE WHEN discrepancy = 0 THEN 1 ELSE 0 END) as records_with_zero_discrepancy,
        SUM(CASE WHEN discrepancy != 0 THEN 1 ELSE 0 END) as records_with_variance
      FROM tabCycleCountLine
    `);

    const stats = nullCheck[0];
    console.log(`   Total Records: ${stats.total_records || 0}`);
    console.log(`   Records with NULL discrepancy: ${stats.records_with_null_discrepancy || 0} ${stats.records_with_null_discrepancy > 0 ? '❌' : '✅'}`);
    console.log(`   Records with 0 discrepancy: ${stats.records_with_zero_discrepancy || 0}`);
    console.log(`   Records with variance: ${stats.records_with_variance || 0}\n`);

    if (stats.records_with_null_discrepancy > 0) {
      testResults.data.issues.push(`${stats.records_with_null_discrepancy} records still have NULL discrepancy`);
    } else {
      testResults.data.passed = true;
      console.log('✅ No NULL discrepancy values found!\n');
    }

    // Step 4: Check sample records
    console.log('📋 Step 1.4: Checking sample records...');
    const [sampleRecords] = await connection.execute(`
      SELECT 
        id,
        item_code,
        expected_qty,
        actual_qty,
        discrepancy,
        CASE 
          WHEN discrepancy IS NULL THEN '❌ NULL'
          WHEN discrepancy = 0 THEN '✅ 0'
          ELSE CONCAT('✅ ', discrepancy)
        END as status
      FROM tabCycleCountLine
      WHERE actual_qty IS NOT NULL
      ORDER BY id DESC
      LIMIT 10
    `);

    if (sampleRecords.length > 0) {
      console.log('   Sample records:');
      sampleRecords.forEach((record, idx) => {
        const status = record.status;
        const hasNull = record.discrepancy === null;
        console.log(`   ${idx + 1}. ${record.item_code}: expected=${record.expected_qty}, actual=${record.actual_qty}, discrepancy=${record.discrepancy || 'NULL'} ${status}`);
        if (hasNull) {
          testResults.data.issues.push(`Record ${record.id} (${record.item_code}) has NULL discrepancy`);
        }
      });
      console.log();
    } else {
      console.log('   ⚠️  No counted records found (actual_qty IS NOT NULL)\n');
    }

    // Step 5: Get a task with lines for API testing
    console.log('📋 Step 1.5: Finding a task for API testing...');
    const [tasks] = await connection.execute(`
      SELECT parent_title
      FROM tabCycleCountLine
      WHERE actual_qty IS NOT NULL
      GROUP BY parent_title
      ORDER BY MAX(id) DESC
      LIMIT 1
    `);

    let testTaskTitle = null;
    if (tasks.length > 0) {
      testTaskTitle = tasks[0].parent_title;
      console.log(`✅ Found test task: ${testTaskTitle}\n`);
      testResults.database.passed = true;
    } else {
      console.log('⚠️  No tasks with counted items found for API testing\n');
      testResults.database.issues.push('No tasks with counted items found');
    }

    // ============================================================
    // PART 2: API Testing
    // ============================================================
    console.log('==========================================');
    console.log('📋 PART 2: API Testing\n');

    if (testTaskTitle && AUTH_TOKEN) {
      console.log(`📋 Step 2.1: Testing API endpoint for task: ${testTaskTitle}`);
      
      try {
        const response = await apiCall(
          `${API_BASE_URL}/api/cycle-count/${testTaskTitle}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${AUTH_TOKEN}`
            }
          }
        );

        if (response.status === 200 && response.data && response.data.ok !== false) {
          console.log('✅ API call successful\n');
          
          const task = response.data.data || response.data;
          const items = task.items || task.lines || [];

          if (items.length > 0) {
            console.log(`📋 Step 2.2: Checking ${items.length} items in API response...`);
            
            let nullDiscrepancyCount = 0;
            let zeroDiscrepancyCount = 0;
            let varianceCount = 0;

            items.forEach((item, idx) => {
              const discrepancy = item.discrepancy;
              const itemCode = item.item_code || 'Unknown';
              
              if (discrepancy === null || discrepancy === undefined) {
                nullDiscrepancyCount++;
                console.log(`   ${idx + 1}. ${itemCode}: discrepancy=${discrepancy} ❌ NULL (should be 0)`);
                testResults.api.issues.push(`Item ${itemCode} has NULL discrepancy in API response`);
              } else if (discrepancy === 0) {
                zeroDiscrepancyCount++;
                console.log(`   ${idx + 1}. ${itemCode}: discrepancy=${discrepancy} ✅`);
              } else {
                varianceCount++;
                console.log(`   ${idx + 1}. ${itemCode}: discrepancy=${discrepancy} ✅ (variance)`);
              }
            });

            console.log(`\n   Summary:`);
            console.log(`   - Items with NULL discrepancy: ${nullDiscrepancyCount} ${nullDiscrepancyCount > 0 ? '❌' : '✅'}`);
            console.log(`   - Items with 0 discrepancy: ${zeroDiscrepancyCount} ✅`);
            console.log(`   - Items with variance: ${varianceCount} ✅\n`);

            if (nullDiscrepancyCount === 0) {
              testResults.api.passed = true;
              console.log('✅ All items have valid discrepancy values (0 or number, not null)!\n');
            } else {
              console.log(`❌ ${nullDiscrepancyCount} items still have NULL discrepancy in API response\n`);
            }
          } else {
            console.log('⚠️  No items found in API response\n');
            testResults.api.issues.push('No items found in API response');
          }
        } else {
          console.log(`❌ API call returned unexpected status: ${response.status}`);
          console.log(`   Response:`, JSON.stringify(response.data, null, 2));
          testResults.api.issues.push(`API returned status ${response.status}`);
        }
      } catch (error) {
        console.log(`❌ API call failed: ${error.message}`);
        console.log(`   Make sure the API server is running at ${API_BASE_URL}`);
        console.log(`   And that AUTH_TOKEN is valid (if required)`);
        testResults.api.issues.push(`API error: ${error.message}`);
        console.log();
      }
    } else {
      if (!AUTH_TOKEN) {
        console.log('⚠️  AUTH_TOKEN not provided - skipping API testing');
        console.log('   Set AUTH_TOKEN in .env file or as environment variable to test API\n');
        testResults.api.issues.push('AUTH_TOKEN not provided');
      } else {
        console.log('⚠️  No test task found - skipping API testing\n');
      }
    }

    // ============================================================
    // PART 3: Summary & Recommendations
    // ============================================================
    console.log('==========================================');
    console.log('📋 PART 3: Test Summary\n');

    const allPassed = testResults.database.passed && 
                     testResults.api.passed && 
                     testResults.data.passed &&
                     testResults.database.issues.length === 0 &&
                     testResults.api.issues.length === 0 &&
                     testResults.data.issues.length === 0;

    console.log('Test Results:');
    console.log(`   Database: ${testResults.database.passed && testResults.database.issues.length === 0 ? '✅ PASSED' : '❌ FAILED'}`);
    if (testResults.database.issues.length > 0) {
      testResults.database.issues.forEach(issue => console.log(`      - ${issue}`));
    }
    
    console.log(`   Data: ${testResults.data.passed && testResults.data.issues.length === 0 ? '✅ PASSED' : '❌ FAILED'}`);
    if (testResults.data.issues.length > 0) {
      testResults.data.issues.forEach(issue => console.log(`      - ${issue}`));
    }
    
    console.log(`   API: ${testResults.api.passed && testResults.api.issues.length === 0 ? '✅ PASSED' : testResults.api.issues.length > 0 ? '❌ FAILED' : '⚠️  SKIPPED'}`);
    if (testResults.api.issues.length > 0) {
      testResults.api.issues.forEach(issue => console.log(`      - ${issue}`));
    }

    console.log(`\n   Overall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}\n`);

    if (!allPassed) {
      console.log('Recommendations:');
      if (testResults.database.issues.length > 0 || !testResults.database.passed) {
        console.log('   1. Run the migration script: MIGRATION_UPDATE_DISCREPANCY_TO_ZERO.sql');
        console.log('   2. Or run: node wms-api/update-discrepancy-to-zero.js');
      }
      if (testResults.data.issues.length > 0) {
        console.log('   3. Check database for records with NULL discrepancy');
        console.log('   4. Verify the generated column formula is correct');
      }
      if (testResults.api.issues.length > 0 && testResults.api.issues[0] !== 'AUTH_TOKEN not provided') {
        console.log('   5. Restart the API server to load updated code');
        console.log('   6. Verify the formatCycleCountLine function is working correctly');
      }
      console.log();
    }

    return allPassed ? 0 : 1;

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
testDiscrepancyFix()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });
