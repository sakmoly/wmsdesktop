// Migration: Add qty_before and qty_reduced columns to tabStockLedger
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function addColumns() {
  console.log("==========================================");
  console.log("Adding qty_before and qty_reduced to tabStockLedger");
  console.log("==========================================\n");

  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "3306"),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "root",
      database: process.env.DB_NAME || "wms_desktop",
      multipleStatements: true,
    });

    console.log(
      `✅ Connected to database: ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || "3306"}/${process.env.DB_NAME || "wms_desktop"}\n`
    );

    // Check if columns already exist
    const [qtyBeforeCheck] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabStockLedger'
      AND COLUMN_NAME = 'qty_before';
    `);

    const [qtyReducedCheck] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabStockLedger'
      AND COLUMN_NAME = 'qty_reduced';
    `);

    if (qtyBeforeCheck.length === 0) {
      console.log("Adding qty_before column to tabStockLedger...");
      await connection.execute(`
        ALTER TABLE tabStockLedger
        ADD COLUMN qty_before DECIMAL(10,2) NULL 
        COMMENT 'Quantity before last transaction'
        AFTER qty;
      `);
      console.log("✅ qty_before column added.");
    } else {
      console.log("ℹ️  qty_before column already exists. Skipping.");
    }

    if (qtyReducedCheck.length === 0) {
      console.log("Adding qty_reduced column to tabStockLedger...");
      await connection.execute(`
        ALTER TABLE tabStockLedger
        ADD COLUMN qty_reduced DECIMAL(10,2) NULL 
        COMMENT 'Quantity changed in last transaction (negative = reduction, positive = increase)'
        AFTER qty_before;
      `);
      console.log("✅ qty_reduced column added.");
    } else {
      console.log("ℹ️  qty_reduced column already exists. Skipping.");
    }

    // Verify columns
    const [verify] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_COMMENT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabStockLedger'
      AND COLUMN_NAME IN ('qty_before', 'qty_reduced')
      ORDER BY ORDINAL_POSITION;
    `);

    console.log("\n✅ Verification:");
    verify.forEach((col) => {
      console.log(
        `  ${col.COLUMN_NAME}: ${col.DATA_TYPE} ${col.IS_NULLABLE === "YES" ? "NULL" : "NOT NULL"} - ${col.COLUMN_COMMENT || "No comment"}`
      );
    });

    await connection.end();
    console.log("\n==========================================");
    console.log("Migration complete.");
    console.log("==========================================");
  } catch (error) {
    console.error("❌ Error during migration:", error);
    process.exit(1);
  }
}

addColumns();

