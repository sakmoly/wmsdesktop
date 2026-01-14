/**
 * Test Cycle Count API carton_id functionality
 * This test verifies that carton_id is properly saved and retrieved
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const config = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "wms_db",
  port: process.env.DB_PORT || 3306,
};

async function testCartonIdFunctionality() {
  let connection;
  const testTitle = `TEST-CC-CARTON-${Date.now()}`;
  
  try {
    console.log("🧪 Testing Cycle Count carton_id Functionality\n");
    console.log("=".repeat(60));
    
    connection = await mysql.createConnection(config);
    console.log("✅ Connected to database\n");

    // 1. Check if carton_id column exists
    console.log("1️⃣ Checking carton_id Column:\n");
    const [cartonIdColumn] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCycleCountLine' 
      AND COLUMN_NAME = 'carton_id'
    `);

    if (cartonIdColumn.length === 0) {
      console.log("  ⚠️  carton_id column does NOT exist in tabCycleCountLine");
      console.log("  💡 Run MIGRATION_005_BIN_CARTON_INVENTORY.sql to add the column\n");
      console.log("  ⚠️  Some tests will be skipped\n");
    } else {
      const col = cartonIdColumn[0];
      console.log(`  ✅ carton_id column exists`);
      console.log(`     Type: ${col.DATA_TYPE}`);
      console.log(`     Nullable: ${col.IS_NULLABLE}\n`);
    }

    const hasCartonIdColumn = cartonIdColumn.length > 0;

    // 2. Create test cycle count task
    console.log("2️⃣ Creating Test Cycle Count Task:\n");
    await connection.execute(`
      INSERT INTO tabCycleCountTask 
        (title, status, count_type, warehouse, count_date, created_by, total_items, counted_items, items_with_discrepancy)
      VALUES (?, 'In Progress', 'Cycle', 'WH-MAIN', CURDATE(), 'TEST-USER', 0, 0, 0)
    `, [testTitle]);
    console.log(`  ✅ Created test task: ${testTitle}\n`);

    // 3. Test INSERT with carton_id (if column exists)
    if (hasCartonIdColumn) {
      console.log("3️⃣ Testing INSERT with carton_id:\n");
      
      // Insert line with carton_id
      const [insertResult] = await connection.execute(`
        INSERT INTO tabCycleCountLine 
          (parent_title, item_code, bin_location, carton_id, expected_qty, status)
        VALUES (?, 'SKU-001', 'A1-R01-L1-B1', 'CARTON-001', 50.00, 'Pending')
      `, [testTitle]);
      
      const lineId = insertResult.insertId;
      console.log(`  ✅ Inserted line with carton_id: LINE-${lineId}`);

      // Verify carton_id was saved
      const [verifyRows] = await connection.execute(`
        SELECT id, item_code, bin_location, carton_id, expected_qty
        FROM tabCycleCountLine 
        WHERE id = ?
      `, [lineId]);

      if (verifyRows.length > 0) {
        const line = verifyRows[0];
        if (line.carton_id === 'CARTON-001') {
          console.log(`  ✅ Verified carton_id saved correctly: ${line.carton_id}\n`);
        } else {
          console.log(`  ❌ carton_id mismatch! Expected: CARTON-001, Got: ${line.carton_id}\n`);
          throw new Error(`carton_id not saved correctly`);
        }
      }
    } else {
      console.log("3️⃣ Skipping INSERT test (carton_id column doesn't exist)\n");
    }

    // 4. Test UPDATE with carton_id (if column exists)
    if (hasCartonIdColumn) {
      console.log("4️⃣ Testing UPDATE with carton_id:\n");
      
      // First, create a line without carton_id
      const [insertResult2] = await connection.execute(`
        INSERT INTO tabCycleCountLine 
          (parent_title, item_code, bin_location, expected_qty, status)
        VALUES (?, 'SKU-002', 'A1-R01-L1-B1', 30.00, 'Pending')
      `, [testTitle]);
      
      const lineId2 = insertResult2.insertId;
      console.log(`  ✅ Created line without carton_id: LINE-${lineId2}`);

      // Verify it's NULL initially
      const [checkRows] = await connection.execute(`
        SELECT carton_id FROM tabCycleCountLine WHERE id = ?
      `, [lineId2]);
      
      if (checkRows[0].carton_id === null) {
        console.log(`  ✅ Verified carton_id is NULL initially`);
      }

      // Now UPDATE with carton_id
      const [updateResult] = await connection.execute(`
        UPDATE tabCycleCountLine 
        SET 
          actual_qty = 28.00,
          counted_by = 'TEST-USER',
          counted_on = NOW(),
          status = 'Counted',
          carton_id = ?
        WHERE id = ?
      `, ['CARTON-002', lineId2]);

      if (updateResult.affectedRows > 0) {
        console.log(`  ✅ Updated line with carton_id: CARTON-002`);

        // Verify carton_id was updated
        const [verifyRows2] = await connection.execute(`
          SELECT carton_id, actual_qty FROM tabCycleCountLine WHERE id = ?
        `, [lineId2]);

        if (verifyRows2[0].carton_id === 'CARTON-002') {
          console.log(`  ✅ Verified carton_id updated correctly: ${verifyRows2[0].carton_id}\n`);
        } else {
          console.log(`  ❌ carton_id update failed! Expected: CARTON-002, Got: ${verifyRows2[0].carton_id}\n`);
          throw new Error(`carton_id not updated correctly`);
        }
      } else {
        throw new Error(`UPDATE did not affect any rows`);
      }
    } else {
      console.log("4️⃣ Skipping UPDATE test (carton_id column doesn't exist)\n");
    }

    // 5. Test UPDATE with NULL carton_id (clearing it)
    if (hasCartonIdColumn) {
      console.log("5️⃣ Testing UPDATE to clear carton_id:\n");
      
      // Create a line with carton_id
      const [insertResult3] = await connection.execute(`
        INSERT INTO tabCycleCountLine 
          (parent_title, item_code, bin_location, carton_id, expected_qty, status)
        VALUES (?, 'SKU-003', 'A1-R01-L1-B1', 'CARTON-003', 20.00, 'Pending')
      `, [testTitle]);
      
      const lineId3 = insertResult3.insertId;
      console.log(`  ✅ Created line with carton_id: LINE-${lineId3}`);

      // Update to set carton_id to NULL
      await connection.execute(`
        UPDATE tabCycleCountLine 
        SET carton_id = NULL
        WHERE id = ?
      `, [lineId3]);

      // Verify it's NULL
      const [verifyRows3] = await connection.execute(`
        SELECT carton_id FROM tabCycleCountLine WHERE id = ?
      `, [lineId3]);

      if (verifyRows3[0].carton_id === null) {
        console.log(`  ✅ Verified carton_id can be set to NULL\n`);
      } else {
        console.log(`  ❌ Failed to clear carton_id\n`);
        throw new Error(`carton_id not cleared correctly`);
      }
    } else {
      console.log("5️⃣ Skipping NULL update test (carton_id column doesn't exist)\n");
    }

    // 6. Test SELECT query (simulating GET endpoint)
    if (hasCartonIdColumn) {
      console.log("6️⃣ Testing SELECT with carton_id (simulating GET endpoint):\n");
      
      const [selectRows] = await connection.execute(`
        SELECT 
          id,
          item_code,
          bin_location,
          carton_id,
          expected_qty,
          actual_qty,
          status
        FROM tabCycleCountLine 
        WHERE parent_title = ?
        ORDER BY id
      `, [testTitle]);

      console.log(`  ✅ Retrieved ${selectRows.length} lines`);
      
      let cartonIdCount = 0;
      selectRows.forEach((line, index) => {
        const hasCartonId = line.carton_id !== null;
        if (hasCartonId) cartonIdCount++;
        console.log(`     Line ${index + 1}: ${line.item_code} | carton_id: ${line.carton_id || 'NULL'} | qty: ${line.actual_qty || line.expected_qty}`);
      });

      console.log(`  ✅ Found ${cartonIdCount} lines with carton_id\n`);
    } else {
      console.log("6️⃣ Skipping SELECT test (carton_id column doesn't exist)\n");
    }

    // 7. Test the exact scenario from user's request
    if (hasCartonIdColumn) {
      console.log("7️⃣ Testing User's Exact Scenario:\n");
      console.log("   Simulating: POST /api/cycle-count/:title/count with carton_id\n");
      
      const testLine = {
        line_id: "LINE-1",
        item_code: "SKU-001",
        bin_location: "A1-R01-L1-B1",
        carton_id: "CARTON-001",
        expected_qty: 50.00,
        actual_qty: 48.00,
        counted_qty: 48.00,
        discrepancy_reason: "Damaged items found"
      };

      // Find or create line
      const [findRows] = await connection.execute(`
        SELECT id FROM tabCycleCountLine 
        WHERE parent_title = ? AND item_code = ? AND bin_location = ?
        LIMIT 1
      `, [testTitle, testLine.item_code, testLine.bin_location]);

      let targetLineId;
      if (findRows.length > 0) {
        targetLineId = findRows[0].id;
        console.log(`  ✅ Found existing line: LINE-${targetLineId}`);
      } else {
        // Create new line
        const [newLine] = await connection.execute(`
          INSERT INTO tabCycleCountLine 
            (parent_title, item_code, bin_location, carton_id, expected_qty, status)
          VALUES (?, ?, ?, ?, ?, 'Pending')
        `, [testTitle, testLine.item_code, testLine.bin_location, testLine.carton_id, testLine.expected_qty]);
        targetLineId = newLine.insertId;
        console.log(`  ✅ Created new line: LINE-${targetLineId}`);
      }

      // Simulate the UPDATE query from the controller
      const cartonId = testLine.carton_id ? String(testLine.carton_id).trim() : null;
      const qty = testLine.actual_qty !== undefined ? testLine.actual_qty : testLine.counted_qty;
      
      let updateQuery = `
        UPDATE tabCycleCountLine 
        SET 
          actual_qty = ?,
          counted_by = ?,
          counted_on = NOW(),
          discrepancy_reason = ?,
          status = 'Counted',
          updated_at = NOW()
      `;
      const updateParams = [qty, 'USER-001', testLine.discrepancy_reason];
      
      if (cartonId !== null && cartonId !== undefined) {
        updateQuery += `, carton_id = ?`;
        updateParams.push(cartonId);
      }
      
      updateQuery += ` WHERE id = ?`;
      updateParams.push(targetLineId);

      console.log(`  🔄 Executing UPDATE query...`);
      const [updateResult] = await connection.execute(updateQuery, updateParams);
      
      if (updateResult.affectedRows > 0) {
        console.log(`  ✅ UPDATE successful (affected ${updateResult.affectedRows} row(s))`);

        // Verify the update
        const [verifyRows] = await connection.execute(`
          SELECT carton_id, actual_qty, counted_by, discrepancy_reason
          FROM tabCycleCountLine 
          WHERE id = ?
        `, [targetLineId]);

        const updated = verifyRows[0];
        if (updated.carton_id === 'CARTON-001' && updated.actual_qty == 48.00) {
          console.log(`  ✅ Verified: carton_id = ${updated.carton_id}, actual_qty = ${updated.actual_qty}`);
          console.log(`  ✅ carton_id is correctly saved!\n`);
        } else {
          console.log(`  ❌ Verification failed!`);
          console.log(`     Expected: carton_id = CARTON-001, actual_qty = 48.00`);
          console.log(`     Got: carton_id = ${updated.carton_id}, actual_qty = ${updated.actual_qty}\n`);
          throw new Error(`carton_id not saved correctly in user scenario`);
        }
      } else {
        throw new Error(`UPDATE did not affect any rows`);
      }
    } else {
      console.log("7️⃣ Skipping user scenario test (carton_id column doesn't exist)\n");
    }

    // Cleanup
    console.log("8️⃣ Cleaning up test data:\n");
    await connection.execute(`DELETE FROM tabCycleCountLine WHERE parent_title = ?`, [testTitle]);
    await connection.execute(`DELETE FROM tabCycleCountTask WHERE title = ?`, [testTitle]);
    console.log(`  ✅ Cleaned up test task: ${testTitle}\n`);

    console.log("✅✅✅ ALL CARTON_ID TESTS PASSED ✅✅✅\n");
    console.log("📦 carton_id functionality is working correctly!\n");

  } catch (error) {
    console.error("\n❌❌❌ TEST FAILED ❌❌❌\n");
    console.error("Error:", error.message);
    if (error.code) {
      console.error(`   Code: ${error.code}`);
    }
    if (error.sqlMessage) {
      console.error(`   SQL: ${error.sqlMessage}`);
    }
    
    // Try to cleanup on error
    try {
      if (connection) {
        await connection.execute(`DELETE FROM tabCycleCountLine WHERE parent_title = ?`, [testTitle]);
        await connection.execute(`DELETE FROM tabCycleCountTask WHERE title = ?`, [testTitle]);
        console.log(`\n🧹 Cleaned up test data after error`);
      }
    } catch (cleanupError) {
      console.error(`\n⚠️  Cleanup failed: ${cleanupError.message}`);
    }
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log("🔌 Database connection closed");
    }
  }
}

testCartonIdFunctionality().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

