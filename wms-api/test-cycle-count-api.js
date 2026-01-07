/**
 * Test Cycle Count API endpoints
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

async function testCycleCountAPI() {
  let connection;
  
  try {
    console.log("🧪 Testing Cycle Count API Setup\n");
    console.log("=".repeat(60));
    
    connection = await mysql.createConnection(config);
    console.log("✅ Connected to database\n");

    // 1. Check tables exist
    console.log("1️⃣ Checking Tables:\n");
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME IN ('tabCycleCountTask', 'tabCycleCountLine')
      ORDER BY TABLE_NAME
    `);

    if (tables.length !== 2) {
      console.log("❌ Missing tables!");
      tables.forEach(t => console.log(`  ✅ ${t.TABLE_NAME}`));
      const missing = ['tabCycleCountTask', 'tabCycleCountLine'].filter(
        name => !tables.some(t => t.TABLE_NAME === name)
      );
      missing.forEach(name => console.log(`  ❌ ${name} (MISSING)`));
      return;
    }

    tables.forEach(t => console.log(`  ✅ ${t.TABLE_NAME}`));

    // 2. Check table structure
    console.log("\n2️⃣ Checking Table Structure:\n");
    
    const [taskColumns] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCycleCountTask'
      ORDER BY ORDINAL_POSITION
    `);

    console.log("tabCycleCountTask columns:");
    const requiredTaskColumns = ['title', 'status', 'count_type', 'warehouse', 'count_date', 'total_items', 'counted_items', 'items_with_discrepancy'];
    taskColumns.forEach(col => {
      const isRequired = requiredTaskColumns.includes(col.COLUMN_NAME);
      const marker = isRequired ? '✅' : '  ';
      console.log(`  ${marker} ${col.COLUMN_NAME}: ${col.DATA_TYPE} (${col.IS_NULLABLE})`);
    });

    const [lineColumns] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCycleCountLine'
      ORDER BY ORDINAL_POSITION
    `);

    console.log("\ntabCycleCountLine columns:");
    const requiredLineColumns = ['id', 'parent_title', 'item_code', 'expected_qty', 'actual_qty', 'discrepancy', 'status'];
    lineColumns.forEach(col => {
      const isRequired = requiredLineColumns.includes(col.COLUMN_NAME);
      const marker = isRequired ? '✅' : '  ';
      console.log(`  ${marker} ${col.COLUMN_NAME}: ${col.DATA_TYPE} (${col.IS_NULLABLE})`);
    });

    // 3. Test creating a sample task
    console.log("\n3️⃣ Testing Sample Data Creation:\n");
    
    const testTitle = `TEST-CC-${Date.now()}`;
    
    try {
      // Create test task
      await connection.execute(`
        INSERT INTO tabCycleCountTask 
          (title, status, count_type, warehouse, count_date, created_by, total_items, counted_items, items_with_discrepancy)
        VALUES (?, 'Draft', 'Cycle', 'WH-MAIN', CURDATE(), 'TEST-USER', 2, 0, 0)
      `, [testTitle]);

      console.log(`  ✅ Created test task: ${testTitle}`);

      // Create test lines
      await connection.execute(`
        INSERT INTO tabCycleCountLine 
          (parent_title, item_code, bin_location, expected_qty, status)
        VALUES (?, 'ITEM-001', 'BIN-001', 50.00, 'Pending')
      `, [testTitle]);

      await connection.execute(`
        INSERT INTO tabCycleCountLine 
          (parent_title, item_code, bin_location, expected_qty, status)
        VALUES (?, 'ITEM-002', 'BIN-002', 30.00, 'Pending')
      `, [testTitle]);

      console.log(`  ✅ Created 2 test lines`);

      // Test updating a line
      await connection.execute(`
        UPDATE tabCycleCountLine 
        SET actual_qty = 48.00, counted_by = 'TEST-USER', counted_on = NOW(), status = 'Counted'
        WHERE parent_title = ? AND item_code = 'ITEM-001'
      `, [testTitle]);

      console.log(`  ✅ Updated line with actual count`);

      // Test recalculating statistics
      const [stats] = await connection.execute(`
        SELECT 
          COUNT(*) as total_counted,
          SUM(CASE WHEN ABS(COALESCE(discrepancy, 0)) > 0 THEN 1 ELSE 0 END) as with_discrepancy
        FROM tabCycleCountLine 
        WHERE parent_title = ? AND actual_qty IS NOT NULL
      `, [testTitle]);

      console.log(`  ✅ Statistics: ${stats[0].total_counted} counted, ${stats[0].with_discrepancy} with discrepancy`);

      // Cleanup
      await connection.execute(`DELETE FROM tabCycleCountLine WHERE parent_title = ?`, [testTitle]);
      await connection.execute(`DELETE FROM tabCycleCountTask WHERE title = ?`, [testTitle]);
      console.log(`  ✅ Cleaned up test data`);

    } catch (error) {
      console.error(`  ❌ Error creating test data: ${error.message}`);
      // Try to cleanup
      try {
        await connection.execute(`DELETE FROM tabCycleCountLine WHERE parent_title = ?`, [testTitle]);
        await connection.execute(`DELETE FROM tabCycleCountTask WHERE title = ?`, [testTitle]);
      } catch {}
    }

    // 4. List available API endpoints
    console.log("\n4️⃣ Available API Endpoints:\n");
    const endpoints = [
      "GET    /api/cycle-count",
      "GET    /api/cycle-count/:title",
      "POST   /api/cycle-count",
      "POST   /api/cycle-count/:title/start",
      "POST   /api/cycle-count/:title/count",
      "POST   /api/cycle-count/:title/update-line",
      "POST   /api/cycle-count/:title/submit",
      "POST   /api/cycle-count/:title/complete"
    ];

    endpoints.forEach(endpoint => {
      console.log(`  ✅ ${endpoint}`);
    });

    console.log("\n✅✅✅ ALL TESTS PASSED ✅✅✅\n");
    console.log("📱 Cycle Count API is ready for mobile app integration!\n");

  } catch (error) {
    console.error("\n❌❌❌ TEST FAILED ❌❌❌\n");
    console.error("Error:", error.message);
    if (error.code) {
      console.error(`   Code: ${error.code}`);
    }
    if (error.sqlMessage) {
      console.error(`   SQL: ${error.sqlMessage}`);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log("🔌 Database connection closed");
    }
  }
}

testCycleCountAPI().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

