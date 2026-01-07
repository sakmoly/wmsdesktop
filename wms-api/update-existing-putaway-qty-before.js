/**
 * Backfill qty_before and qty_reduced for existing putaway transactions
 * 
 * This script updates existing putaway transactions in tabStockLedger
 * to populate qty_before and qty_reduced values based on tabStockTransaction
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

async function backfillQtyBefore() {
  let connection;
  
  try {
    console.log("🔄 Backfilling qty_before and qty_reduced for Putaway transactions\n");
    console.log("=".repeat(60));
    
    connection = await mysql.createConnection(config);
    console.log("✅ Connected to database\n");

    // Check if columns exist
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockLedger' 
      AND COLUMN_NAME IN ('qty_before', 'qty_reduced')
    `);
    
    if (columns.length === 0) {
      console.log("❌ Columns do not exist. Please run migration first.\n");
      return;
    }
    
    console.log("✅ Columns exist\n");

    // Get putaway transactions that need updating
    const [putawayTransactions] = await connection.execute(`
      SELECT 
        st.item_code,
        st.warehouse,
        st.bin_location,
        st.qty_before,
        st.qty_after,
        st.qty_change,
        st.reference_doc,
        st.transaction_date,
        sl.qty as current_qty,
        sl.qty_before as sl_qty_before,
        sl.qty_reduced as sl_qty_reduced
      FROM tabStockTransaction st
      INNER JOIN tabStockLedger sl ON 
        st.item_code = sl.item_code 
        AND st.warehouse = sl.warehouse
        AND (st.bin_location = sl.bin_location OR (st.bin_location IS NULL AND sl.bin_location IS NULL))
      WHERE st.transaction_type = 'Putaway'
        AND st.transaction_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        AND (sl.qty_before IS NULL OR sl.qty_reduced IS NULL)
      ORDER BY st.transaction_date DESC
    `);

    console.log(`Found ${putawayTransactions.length} putaway transaction(s) to update\n`);

    if (putawayTransactions.length === 0) {
      console.log("✅ No transactions need updating.\n");
      return;
    }

    let updated = 0;
    let skipped = 0;

    for (const tx of putawayTransactions) {
      const qtyBefore = tx.qty_before !== null ? parseFloat(tx.qty_before) : null;
      const qtyReduced = tx.qty_change !== null ? parseFloat(tx.qty_change) : null;
      
      // Skip if we don't have the data
      if (qtyBefore === null || qtyReduced === null) {
        skipped++;
        continue;
      }

      // Update tabStockLedger
      await connection.execute(
        `UPDATE tabStockLedger 
         SET qty_before = ?,
             qty_reduced = ?
         WHERE item_code = ?
           AND warehouse = ?
           AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
           AND last_transaction_ref = ?`,
        [
          qtyBefore,
          qtyReduced,
          tx.item_code,
          tx.warehouse,
          tx.bin_location,
          tx.bin_location,
          tx.reference_doc
        ]
      );

      updated++;
      console.log(`✅ Updated: ${tx.item_code} @ ${tx.bin_location || 'NULL'} - qty_before: ${qtyBefore}, qty_reduced: ${qtyReduced}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log("=".repeat(60));
    console.log("\n✅✅✅ BACKFILL COMPLETE ✅✅✅\n");

  } catch (error) {
    console.error("\n❌❌❌ BACKFILL FAILED ❌❌❌\n");
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

backfillQtyBefore().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

