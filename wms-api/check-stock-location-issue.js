/**
 * Check Stock Location Issue
 * Diagnose why location breakdown is not showing
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'wms_desktop',
};

async function checkStockLocationIssue() {
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Connected to database\n');

    // 1. Check completed putaway tasks with actual locations
    console.log('=== Completed Putaway Tasks with Locations ===');
    const [completedTasks] = await connection.execute(`
      SELECT 
        pt.title,
        pt.status,
        pt.advance_shipping_notice,
        COUNT(pl.id) as line_count,
        SUM(CASE WHEN pl.rack != 'TBD' AND pl.rack IS NOT NULL THEN 1 ELSE 0 END) as lines_with_location
      FROM tabPutawayTask pt
      LEFT JOIN tabPutawayLine pl ON pl.parent_title = pt.title
      WHERE pt.status = 'Completed'
      GROUP BY pt.title, pt.status, pt.advance_shipping_notice
      ORDER BY pt.created_at DESC
      LIMIT 10
    `);
    console.table(completedTasks);
    console.log('');

    // 2. Check putaway lines with actual locations (not TBD)
    console.log('=== Putaway Lines with Actual Locations (not TBD) ===');
    const [linesWithLocation] = await connection.execute(`
      SELECT 
        pl.parent_title,
        pl.item_code,
        pl.qty,
        pl.rack,
        pl.bin,
        CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL AND pl.bin != 'TBD', CONCAT('-', pl.bin), '')) as bin_location,
        pt.status
      FROM tabPutawayLine pl
      JOIN tabPutawayTask pt ON pl.parent_title = pt.title
      WHERE pl.rack IS NOT NULL 
        AND pl.rack != 'TBD'
        AND pt.status = 'Completed'
      ORDER BY pl.parent_title DESC, pl.item_code
      LIMIT 20
    `);
    console.table(linesWithLocation);
    console.log('');

    // 3. Check stock ledger entries for these items
    if (linesWithLocation.length > 0) {
      console.log('=== Stock Ledger Entries for Putaway Items ===');
      const itemCodes = [...new Set(linesWithLocation.map(l => l.item_code))];
      const placeholders = itemCodes.map(() => '?').join(',');
      
      const [stockLedger] = await connection.execute(`
        SELECT 
          item_code,
          warehouse,
          bin_location,
          qty,
          last_transaction_type,
          last_transaction_ref,
          updated_at
        FROM tabStockLedger
        WHERE item_code IN (${placeholders})
          AND bin_location IS NOT NULL
        ORDER BY item_code, warehouse, bin_location
      `, itemCodes);
      
      console.table(stockLedger);
      console.log('');
    }

    // 4. Check all warehouse names in stock ledger
    console.log('=== All Warehouse Names in Stock Ledger ===');
    const [allWarehouses] = await connection.execute(`
      SELECT DISTINCT warehouse, COUNT(*) as entry_count
      FROM tabStockLedger
      GROUP BY warehouse
      ORDER BY entry_count DESC
    `);
    console.table(allWarehouses);
    console.log('');

    // 5. Check specific item that should have location breakdown
    console.log('=== Checking SKU-HAT-301-BLU-OS Stock Ledger ===');
    const [itemStock] = await connection.execute(`
      SELECT 
        item_code,
        warehouse,
        bin_location,
        qty,
        last_transaction_type,
        last_transaction_ref
      FROM tabStockLedger
      WHERE item_code = 'SKU-HAT-301-BLU-OS'
      ORDER BY warehouse, bin_location
    `);
    console.table(itemStock);
    console.log('');

    // 6. Check item stock qty
    const [itemQty] = await connection.execute(`
      SELECT code, stock_qty
      FROM tabItem
      WHERE code = 'SKU-HAT-301-BLU-OS'
    `);
    if (itemQty.length > 0) {
      console.log(`Item Stock Qty: ${itemQty[0].stock_qty}`);
      console.log(`Stock Ledger Sum: ${itemStock.reduce((sum, row) => sum + parseFloat(row.qty || 0), 0)}`);
    }
    console.log('');

    // 7. Detailed comparison: Putaway lines vs Stock Ledger
    console.log('=== Detailed Comparison: Putaway vs Stock Ledger ===');
    if (linesWithLocation.length > 0) {
      const itemCodes = [...new Set(linesWithLocation.map(l => l.item_code))];
      const placeholders = itemCodes.map(() => '?').join(',');
      
      const [detailedComparison] = await connection.execute(`
        SELECT 
          pl.item_code,
          pl.parent_title as putaway_task,
          CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL AND pl.bin != 'TBD', CONCAT('-', pl.bin), '')) as putaway_bin_location,
          pl.qty as putaway_qty,
          sl.warehouse as stock_warehouse,
          sl.bin_location as stock_bin_location,
          sl.qty as stock_qty,
          CASE 
            WHEN sl.item_code IS NULL THEN '❌ MISSING IN STOCK LEDGER'
            WHEN sl.bin_location != CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL AND pl.bin != 'TBD', CONCAT('-', pl.bin), '')) THEN '⚠️ BIN LOCATION MISMATCH'
            WHEN ABS(sl.qty - pl.qty) > 0.01 THEN '⚠️ QTY MISMATCH'
            ELSE '✅ OK'
          END as status
        FROM tabPutawayLine pl
        LEFT JOIN tabStockLedger sl ON 
          sl.item_code = pl.item_code 
          AND sl.warehouse IN ('Main Warehouse', 'WH-MAIN', 'WH-Main')
          AND sl.bin_location = CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL AND pl.bin != 'TBD', CONCAT('-', pl.bin), ''))
        WHERE pl.item_code IN (${placeholders})
          AND pl.rack IS NOT NULL
          AND pl.rack != 'TBD'
        ORDER BY pl.parent_title DESC, pl.item_code
        LIMIT 20
      `, itemCodes);
      
      console.table(detailedComparison);
      console.log('');
    }

    // 8. Summary
    console.log('=== Summary ===');
    const [summary] = await connection.execute(`
      SELECT 
        (SELECT COUNT(*) FROM tabPutawayTask WHERE status = 'Completed') as completed_tasks,
        (SELECT COUNT(*) FROM tabPutawayLine pl JOIN tabPutawayTask pt ON pl.parent_title = pt.title WHERE pt.status = 'Completed' AND pl.rack != 'TBD' AND pl.rack IS NOT NULL) as lines_with_location,
        (SELECT COUNT(*) FROM tabStockLedger WHERE bin_location IS NOT NULL) as stock_ledger_entries_with_location,
        (SELECT COUNT(DISTINCT item_code) FROM tabStockLedger WHERE bin_location IS NOT NULL) as items_with_location
    `);
    console.table(summary);
    console.log('');

    console.log('=== Diagnosis ===');
    if (completedTasks.length === 0) {
      console.log('❌ No completed putaway tasks found');
      console.log('   → Putaway tasks need to be completed (status = "Completed")');
    } else if (linesWithLocation.length === 0) {
      console.log('❌ No putaway lines with actual locations (all have rack="TBD")');
      console.log('   → Locations need to be scanned in mobile app (rack and bin must be set)');
    } else if (itemStock.length === 0) {
      console.log('❌ No stock ledger entries found for items');
      console.log('   → Stock ledger was not updated when putaway was completed');
      console.log('   → Need to run update script or fix putaway completion logic');
    } else {
      console.log('✅ Found stock ledger entries');
      console.log('   → Check warehouse name matches location breakdown query');
      console.log('   → Check bin_location format matches location breakdown parsing');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkStockLocationIssue().catch(console.error);

