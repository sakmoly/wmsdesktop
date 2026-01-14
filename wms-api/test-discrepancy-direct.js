// ============================================================
// Direct Database Test: Verify Discrepancy Values
// ============================================================
// This script directly queries the database and shows what the API should return
// ============================================================

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function testDiscrepancyDirect() {
  console.log('==========================================');
  console.log('🧪 Direct Database Test: Discrepancy Values');
  console.log('==========================================\n');

  let connection;

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

    // Get all cycle count lines with their discrepancy values
    console.log('📋 Querying all cycle count lines...\n');
    const [lines] = await connection.execute(`
      SELECT 
        id,
        parent_title,
        item_code,
        bin_location,
        expected_qty,
        actual_qty,
        discrepancy,
        CASE 
          WHEN discrepancy IS NULL THEN '❌ NULL'
          WHEN discrepancy = 0 THEN '✅ 0'
          ELSE CONCAT('✅ ', discrepancy)
        END as discrepancy_status,
        status,
        counted_by,
        counted_on
      FROM tabCycleCountLine
      ORDER BY id DESC
    `);

    if (lines.length === 0) {
      console.log('⚠️  No cycle count lines found\n');
    } else {
      console.log(`✅ Found ${lines.length} cycle count line(s):\n`);
      
      lines.forEach((line, idx) => {
        console.log(`Line ${idx + 1}:`);
        console.log(`  ID: ${line.id}`);
        console.log(`  Task: ${line.parent_title}`);
        console.log(`  Item: ${line.item_code}`);
        console.log(`  Bin Location: ${line.bin_location || 'NULL'}`);
        console.log(`  Expected Qty: ${line.expected_qty || 0}`);
        console.log(`  Actual Qty: ${line.actual_qty || 'NULL'}`);
        console.log(`  Discrepancy: ${line.discrepancy !== null ? line.discrepancy : 'NULL'} ${line.discrepancy_status}`);
        console.log(`  Status: ${line.status || 'NULL'}`);
        console.log(`  Counted By: ${line.counted_by || 'NULL'}`);
        console.log(`  Counted On: ${line.counted_on ? line.counted_on.toISOString() : 'NULL'}`);
        console.log();
      });

      // Check for NULL discrepancy values
      const nullDiscrepancyCount = lines.filter(l => l.discrepancy === null).length;
      const zeroDiscrepancyCount = lines.filter(l => l.discrepancy === 0).length;
      const varianceCount = lines.filter(l => l.discrepancy !== null && l.discrepancy !== 0).length;

      console.log('📊 Summary:');
      console.log(`  Total Lines: ${lines.length}`);
      console.log(`  Lines with NULL discrepancy: ${nullDiscrepancyCount} ${nullDiscrepancyCount > 0 ? '❌' : '✅'}`);
      console.log(`  Lines with 0 discrepancy: ${zeroDiscrepancyCount} ✅`);
      console.log(`  Lines with variance: ${varianceCount} ✅\n`);

      if (nullDiscrepancyCount > 0) {
        console.log('❌ Found lines with NULL discrepancy:');
        lines.filter(l => l.discrepancy === null).forEach((line, idx) => {
          console.log(`  ${idx + 1}. ID: ${line.id}, Item: ${line.item_code}, Actual: ${line.actual_qty || 'NULL'}, Expected: ${line.expected_qty || 0}`);
        });
        console.log();
      } else {
        console.log('✅ All lines have valid discrepancy values (no NULL found)!\n');
      }

      // Simulate what the API formatCycleCountLine function should return
      console.log('📋 Simulating API formatCycleCountLine function output:\n');
      lines.forEach((line, idx) => {
        // Simulate the formatCycleCountLine logic
        const actualQty = line.actual_qty ? parseFloat(line.actual_qty) : null;
        const expectedQty = (line.expected_qty !== null && line.expected_qty !== undefined && parseFloat(line.expected_qty) > 0) ? parseFloat(line.expected_qty) : 0;
        let discrepancy = 0; // Default to 0 instead of null
        
        if (line.discrepancy !== null && line.discrepancy !== undefined) {
          const parsedDiscrepancy = parseFloat(line.discrepancy);
          discrepancy = (!isNaN(parsedDiscrepancy)) ? parsedDiscrepancy : 0;
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
          line_id: `LINE-${line.id}`,
          id: line.id,
          item_code: line.item_code,
          expected_qty: expectedQty,
          actual_qty: actualQty,
          discrepancy: discrepancy,
          bin_location: line.bin_location || null,
          status: line.status || 'Pending'
        };

        console.log(`Line ${idx + 1} API Output:`);
        console.log(`  ${JSON.stringify(apiOutput, null, 2)}`);
        console.log(`  Discrepancy value: ${discrepancy} (type: ${typeof discrepancy}) ${discrepancy === null ? '❌ NULL' : discrepancy === 0 ? '✅ 0' : '✅ Valid'}`);
        console.log();
      });
    }

    // Test specific case: What happens when actual_qty is NULL?
    console.log('📋 Testing NULL actual_qty case (item not counted yet)...\n');
    const [nullActualQtyLines] = await connection.execute(`
      SELECT 
        id,
        item_code,
        expected_qty,
        actual_qty,
        discrepancy
      FROM tabCycleCountLine
      WHERE actual_qty IS NULL
      LIMIT 5
    `);

    if (nullActualQtyLines.length > 0) {
      console.log(`✅ Found ${nullActualQtyLines.length} line(s) with NULL actual_qty:`);
      nullActualQtyLines.forEach((line, idx) => {
        console.log(`  ${idx + 1}. Item: ${line.item_code}, Expected: ${line.expected_qty || 0}, Actual: NULL, Discrepancy: ${line.discrepancy !== null ? line.discrepancy : 'NULL'} ${line.discrepancy === 0 ? '✅ Should be 0' : line.discrepancy === null ? '❌ Should be 0' : '⚠️'}`);
      });
      console.log();
    } else {
      console.log('⚠️  No lines found with NULL actual_qty (all items have been counted)\n');
    }

    console.log('==========================================');
    console.log('✅ Direct Database Test Complete');
    console.log('==========================================\n');

    return 0;

  } catch (error) {
    console.error('❌ Test failed:', error);
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
testDiscrepancyDirect()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });
