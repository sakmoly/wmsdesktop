/**
 * Script to add carton_id column to tabCycleCountLine
 * Run this script to fix the "Unknown column 'carton_id'" error
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

async function addCartonIdColumn() {
  let connection;
  
  try {
    console.log("🔧 Adding carton_id column to tabCycleCountLine...\n");
    console.log("=".repeat(60));
    
    connection = await mysql.createConnection(config);
    console.log("✅ Connected to database\n");

    // Check if column already exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCycleCountLine'
        AND COLUMN_NAME = 'carton_id'
    `);

    if (columns.length > 0) {
      console.log("ℹ️  carton_id column already exists!\n");
      const col = columns[0];
      console.log(`   Column: ${col.COLUMN_NAME}`);
      console.log(`   Type: ${col.DATA_TYPE}`);
      console.log(`   Nullable: ${col.IS_NULLABLE}\n`);
      console.log("✅ No action needed - column is ready to use!\n");
      return;
    }

    // Check if table exists
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCycleCountLine'
    `);

    if (tables.length === 0) {
      console.error("❌ Table 'tabCycleCountLine' does not exist!");
      console.error("   Please run the cycle count migration first.\n");
      process.exit(1);
    }

    console.log("📋 Adding carton_id column...\n");

    // Add the column
    await connection.execute(`
      ALTER TABLE tabCycleCountLine 
      ADD COLUMN carton_id VARCHAR(100) NULL AFTER bin_location
    `);

    console.log("✅ Added carton_id column\n");

    // Check if index exists
    const [indexes] = await connection.execute(`
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCycleCountLine'
        AND INDEX_NAME = 'idx_carton_id'
    `);

    if (indexes.length === 0) {
      console.log("📋 Adding index for carton_id...\n");
      await connection.execute(`
        ALTER TABLE tabCycleCountLine 
        ADD INDEX idx_carton_id (carton_id)
      `);
      console.log("✅ Added index idx_carton_id\n");
    } else {
      console.log("ℹ️  Index idx_carton_id already exists\n");
    }

    // Verify the column was added
    const [verifyColumns] = await connection.execute(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCycleCountLine'
        AND COLUMN_NAME = 'carton_id'
    `);

    if (verifyColumns.length > 0) {
      const col = verifyColumns[0];
      console.log("✅✅✅ SUCCESS! ✅✅✅\n");
      console.log("Column Details:");
      console.log(`   Name: ${col.COLUMN_NAME}`);
      console.log(`   Type: ${col.DATA_TYPE}`);
      console.log(`   Nullable: ${col.IS_NULLABLE}`);
      console.log(`   Default: ${col.COLUMN_DEFAULT || 'NULL'}\n`);
      console.log("🎉 carton_id column is now ready to use!\n");
      console.log("📝 You can now test the cycle count API with carton_id.\n");
    } else {
      throw new Error("Column was not added successfully");
    }

  } catch (error) {
    console.error("\n❌❌❌ ERROR ❌❌❌\n");
    
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.error("⚠️  Column 'carton_id' already exists!");
      console.error("   This is OK - the column is ready to use.\n");
      return;
    }
    
    if (error.code === 'ER_DUP_KEYNAME') {
      console.error("⚠️  Index 'idx_carton_id' already exists!");
      console.error("   This is OK - the index is ready to use.\n");
      return;
    }
    
    console.error(`Error: ${error.message}`);
    if (error.code) {
      console.error(`   Code: ${error.code}`);
    }
    if (error.sqlMessage) {
      console.error(`   SQL: ${error.sqlMessage}`);
    }
    console.error("\n");
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log("🔌 Database connection closed");
    }
  }
}

addCartonIdColumn().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

