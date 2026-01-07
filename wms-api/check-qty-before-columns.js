/**
 * Check if qty_before and qty_reduced columns exist in tabStockLedger
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

async function checkColumns() {
  let connection;
  
  try {
    console.log("🔍 Checking qty_before and qty_reduced columns in tabStockLedger\n");
    
    connection = await mysql.createConnection(config);
    console.log("✅ Connected to database\n");

    // Check columns
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockLedger' 
      AND COLUMN_NAME IN ('qty_before', 'qty_reduced')
      ORDER BY COLUMN_NAME
    `);

    console.log(`Found ${columns.length} column(s):\n`);
    
    if (columns.length === 0) {
      console.log("❌ Columns do NOT exist!\n");
      console.log("📋 Running migration to add columns...\n");
      
      // Add columns
      await connection.execute(`
        ALTER TABLE tabStockLedger
        ADD COLUMN qty_before DECIMAL(10,2) NULL 
        COMMENT 'Quantity before last transaction'
        AFTER qty
      `);
      
      await connection.execute(`
        ALTER TABLE tabStockLedger
        ADD COLUMN qty_reduced DECIMAL(10,2) NULL 
        COMMENT 'Quantity changed in last transaction (negative = reduction, positive = increase)'
        AFTER qty_before
      `);
      
      console.log("✅ Columns added successfully!\n");
      
      // Verify
      const [verifyColumns] = await connection.execute(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabStockLedger' 
        AND COLUMN_NAME IN ('qty_before', 'qty_reduced')
        ORDER BY COLUMN_NAME
      `);
      
      verifyColumns.forEach(col => {
        console.log(`  ✅ ${col.COLUMN_NAME}: ${col.DATA_TYPE} (${col.IS_NULLABLE})`);
      });
    } else {
      columns.forEach(col => {
        console.log(`  ✅ ${col.COLUMN_NAME}: ${col.DATA_TYPE} (${col.IS_NULLABLE})`);
      });
    }

    // Check recent putaway transactions
    console.log("\n📊 Checking Recent Putaway Transactions:\n");
    const [recentTransactions] = await connection.execute(`
      SELECT 
        item_code,
        bin_location,
        qty,
        qty_before,
        qty_reduced,
        last_transaction_type,
        last_transaction_ref,
        last_transaction_date
      FROM tabStockLedger
      WHERE last_transaction_type = 'Putaway'
        AND last_transaction_date >= DATE_SUB(NOW(), INTERVAL 1 DAY)
      ORDER BY last_transaction_date DESC
      LIMIT 10
    `);

    console.log(`Found ${recentTransactions.length} recent putaway transaction(s):\n`);
    
    if (recentTransactions.length > 0) {
      recentTransactions.forEach((tx, index) => {
        console.log(`${index + 1}. ${tx.item_code} @ ${tx.bin_location || 'NULL'}`);
        console.log(`   qty: ${tx.qty}`);
        console.log(`   qty_before: ${tx.qty_before !== null ? tx.qty_before : 'NULL'}`);
        console.log(`   qty_reduced: ${tx.qty_reduced !== null ? tx.qty_reduced : 'NULL'}`);
        console.log(`   Transaction: ${tx.last_transaction_ref} (${tx.last_transaction_date})`);
        console.log();
      });
    } else {
      console.log("No recent putaway transactions found.\n");
    }

    console.log("✅✅✅ CHECK COMPLETE ✅✅✅\n");

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

checkColumns().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

