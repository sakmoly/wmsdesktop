/**
 * Migration Script: Add location_id column to tabPutawayLine
 * 
 * This script adds the location_id column to tabPutawayLine table
 * to store the exact scanned location ID (e.g., "A1-R01-L1-B1")
 * 
 * Usage:
 *   node add-location-id-to-putaway-line.js
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

async function addLocationIdColumn() {
  let connection;
  
  try {
    console.log("🔄 Adding location_id column to tabPutawayLine\n");
    
    // Connect to database
    connection = await mysql.createConnection(config);
    console.log("✅ Connected to database\n");

    // Check if column already exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayLine' 
      AND COLUMN_NAME = 'location_id'
    `);

    if (columns.length > 0) {
      console.log("✅ location_id column already exists in tabPutawayLine\n");
      console.log("   No migration needed.\n");
      return;
    }

    console.log("📝 Adding location_id column...\n");

    // Add location_id column
    await connection.execute(`
      ALTER TABLE tabPutawayLine
      ADD COLUMN location_id VARCHAR(100) NULL
      AFTER bin
    `);

    console.log("✅ Successfully added location_id column\n");

    // Add index for better query performance
    try {
      await connection.execute(`
        CREATE INDEX idx_location_id ON tabPutawayLine(location_id)
      `);
      console.log("✅ Added index on location_id column\n");
    } catch (error) {
      if (error.code === 'ER_DUP_KEYNAME') {
        console.log("ℹ️  Index already exists (skipping)\n");
      } else {
        throw error;
      }
    }

    // Verify the column was added
    const [verifyColumns] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayLine' 
      AND COLUMN_NAME = 'location_id'
    `);

    if (verifyColumns.length > 0) {
      const col = verifyColumns[0];
      console.log("✅ Verification successful:");
      console.log(`   - Column Name: ${col.COLUMN_NAME}`);
      console.log(`   - Data Type: ${col.DATA_TYPE}`);
      console.log(`   - Nullable: ${col.IS_NULLABLE}`);
      console.log(`   - Default: ${col.COLUMN_DEFAULT || 'NULL'}\n`);
    }

    console.log("✅✅✅ MIGRATION COMPLETE ✅✅✅\n");
    console.log("📋 Next Steps:");
    console.log("   1. Restart API server");
    console.log("   2. Test location scanning with putaway tasks");
    console.log("   3. Verify location_id is stored correctly\n");

  } catch (error) {
    console.error("\n❌❌❌ MIGRATION FAILED ❌❌❌\n");
    console.error("Error:", error.message);
    if (error.code) {
      console.error(`   Code: ${error.code}`);
    }
    if (error.sqlMessage) {
      console.error(`   SQL: ${error.sqlMessage}`);
    }
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log("🔌 Database connection closed");
    }
  }
}

// Run the migration
addLocationIdColumn().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

