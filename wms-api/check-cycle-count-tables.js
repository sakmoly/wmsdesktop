/**
 * Check if Cycle Count tables exist and create them if missing
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

async function checkAndCreateTables() {
  let connection;
  
  try {
    console.log("🔍 Checking Cycle Count Tables\n");
    console.log("=".repeat(60));
    
    connection = await mysql.createConnection(config);
    console.log("✅ Connected to database\n");

    // Check if tabCycleCountTask exists
    const [taskTable] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCycleCountTask'
    `);

    if (taskTable.length === 0) {
      console.log("❌ tabCycleCountTask table does NOT exist\n");
      console.log("📝 Creating tabCycleCountTask table...\n");
      
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS tabCycleCountTask (
          title VARCHAR(100) PRIMARY KEY,
          status VARCHAR(50) DEFAULT 'Draft',
          count_type VARCHAR(50) NOT NULL,
          warehouse VARCHAR(100) NOT NULL,
          zone VARCHAR(100) NULL,
          count_date DATE NOT NULL,
          scheduled_start_time TIME NULL,
          scheduled_end_time TIME NULL,
          freeze_stock BOOLEAN DEFAULT FALSE,
          created_by VARCHAR(100) NOT NULL,
          assigned_to VARCHAR(100) NULL,
          total_items INT DEFAULT 0,
          counted_items INT DEFAULT 0,
          items_with_discrepancy INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_status (status),
          INDEX idx_count_type (count_type),
          INDEX idx_warehouse (warehouse),
          INDEX idx_zone (zone),
          INDEX idx_count_date (count_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      console.log("✅ tabCycleCountTask table created\n");
    } else {
      console.log("✅ tabCycleCountTask table exists\n");
    }

    // Check if tabCycleCountLine exists
    const [lineTable] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCycleCountLine'
    `);

    if (lineTable.length === 0) {
      console.log("❌ tabCycleCountLine table does NOT exist\n");
      console.log("📝 Creating tabCycleCountLine table...\n");
      
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS tabCycleCountLine (
          id INT AUTO_INCREMENT PRIMARY KEY,
          parent_title VARCHAR(100) NOT NULL,
          item_code VARCHAR(100) NOT NULL,
          bin_location VARCHAR(100) NULL,
          expected_qty DECIMAL(10,2) NOT NULL,
          actual_qty DECIMAL(10,2) NULL,
          discrepancy DECIMAL(10,2) AS (COALESCE(actual_qty, 0) - expected_qty) STORED,
          counted_by VARCHAR(100) NULL,
          counted_on TIMESTAMP NULL,
          reviewed_by VARCHAR(100) NULL,
          reviewed_on TIMESTAMP NULL,
          approval_required BOOLEAN DEFAULT FALSE,
          approved_by VARCHAR(100) NULL,
          approved_on TIMESTAMP NULL,
          discrepancy_reason TEXT NULL,
          status VARCHAR(50) DEFAULT 'Pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_parent (parent_title),
          INDEX idx_item_code (item_code),
          INDEX idx_bin_location (bin_location),
          INDEX idx_status (status),
          FOREIGN KEY (parent_title) REFERENCES tabCycleCountTask(title) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      console.log("✅ tabCycleCountLine table created\n");
    } else {
      console.log("✅ tabCycleCountLine table exists\n");
    }

    // Verify tables
    console.log("📊 Verifying Tables:\n");
    const [allTables] = await connection.execute(`
      SELECT TABLE_NAME, TABLE_ROWS
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME IN ('tabCycleCountTask', 'tabCycleCountLine')
      ORDER BY TABLE_NAME
    `);

    allTables.forEach(table => {
      console.log(`  ✅ ${table.TABLE_NAME}: ${table.TABLE_ROWS} rows`);
    });

    // Check columns
    console.log("\n📋 Checking Columns:\n");
    const [taskColumns] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCycleCountTask'
      ORDER BY ORDINAL_POSITION
    `);

    console.log("tabCycleCountTask columns:");
    taskColumns.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME}: ${col.DATA_TYPE} (${col.IS_NULLABLE})`);
    });

    const [lineColumns] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCycleCountLine'
      ORDER BY ORDINAL_POSITION
      LIMIT 10
    `);

    console.log("\ntabCycleCountLine columns (first 10):");
    lineColumns.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME}: ${col.DATA_TYPE} (${col.IS_NULLABLE})`);
    });

    console.log("\n✅✅✅ CHECK COMPLETE ✅✅✅\n");

  } catch (error) {
    console.error("\n❌❌❌ CHECK FAILED ❌❌❌\n");
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

checkAndCreateTables().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

