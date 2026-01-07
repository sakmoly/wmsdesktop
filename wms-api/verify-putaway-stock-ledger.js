/**
 * Verify Putaway Stock Ledger Updates
 * 
 * This script checks if putaway tasks are correctly updating tabStockLedger
 * and helps identify warehouse name mismatches.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Database configuration - uses environment variables or defaults
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'wms_desktop',
};

async function verifyPutawayStockLedger() {
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Connected to database\n');

    // 1. Check recent putaway tasks
    console.log('=== Recent Putaway Tasks ===');
    const [putawayTasks] = await connection.execute(`
      SELECT title, status, advance_shipping_notice, created_at
      FROM tabPutawayTask
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.table(putawayTasks);
    console.log('');

    // 2. Check putaway lines with locations
    console.log('=== Putaway Lines with Locations ===');
    const [putawayLines] = await connection.execute(`
      SELECT 
        pl.parent_title,
        pl.item_code,
        pl.qty,
        pl.rack,
        pl.bin,
        CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), '')) as bin_location,
        pt.status
      FROM tabPutawayLine pl
      JOIN tabPutawayTask pt ON pl.parent_title = pt.title
      WHERE pl.rack IS NOT NULL
      ORDER BY pl.parent_title DESC, pl.item_code
      LIMIT 20
    `);
    
    console.table(putawayLines);
    console.log('');

    // 3. Check stock ledger entries for items in putaway
    console.log('=== Stock Ledger Entries for Putaway Items ===');
    if (putawayLines.length > 0) {
      const itemCodes = [...new Set(putawayLines.map(l => l.item_code))];
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
        ORDER BY item_code, warehouse, bin_location
      `, itemCodes);
      
      console.table(stockLedger);
      console.log('');
    }

    // 4. Check warehouse names used
    console.log('=== Warehouse Names in Stock Ledger ===');
    const [warehouses] = await connection.execute(`
      SELECT DISTINCT warehouse, COUNT(*) as entry_count
      FROM tabStockLedger
      GROUP BY warehouse
      ORDER BY entry_count DESC
    `);
    
    console.table(warehouses);
    console.log('');

    // 5. Check warehouse names in ASN (if column exists)
    console.log('=== Warehouse Names in ASN ===');
    try {
      // First check if warehouse column exists
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabAdvanceShippingNotice'
        AND COLUMN_NAME = 'warehouse'
      `);
      
      if (columns.length > 0) {
        const [asnWarehouses] = await connection.execute(`
          SELECT DISTINCT warehouse, COUNT(*) as asn_count
          FROM tabAdvanceShippingNotice
          WHERE warehouse IS NOT NULL
          GROUP BY warehouse
          ORDER BY asn_count DESC
        `);
        console.table(asnWarehouses);
      } else {
        console.log('⚠️  Column "warehouse" does not exist in tabAdvanceShippingNotice');
        console.log('   Putaway code will use default "Main Warehouse"');
        console.log('   This is expected - warehouse is determined from other sources');
      }
    } catch (error) {
      console.log('⚠️  Could not check ASN warehouse column:', error.message);
    }
    console.log('');

    // 6. Compare: Putaway items vs Stock Ledger
    console.log('=== Comparison: Putaway Items vs Stock Ledger ===');
    if (putawayLines.length > 0) {
      const itemCodes = [...new Set(putawayLines.map(l => l.item_code))];
      const placeholders = itemCodes.map(() => '?').join(',');
      
      // Try multiple warehouse names to find matches
      const [comparison] = await connection.execute(`
        SELECT 
          pl.item_code,
          pl.parent_title as putaway_task,
          CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), '')) as putaway_bin_location,
          pl.qty as putaway_qty,
          sl.warehouse as stock_warehouse,
          sl.bin_location as stock_bin_location,
          sl.qty as stock_qty,
          CASE 
            WHEN sl.item_code IS NULL THEN 'MISSING IN STOCK LEDGER'
            WHEN sl.bin_location != CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), '')) THEN 'BIN LOCATION MISMATCH'
            WHEN sl.qty != pl.qty THEN 'QTY MISMATCH'
            ELSE 'OK'
          END as status
        FROM tabPutawayLine pl
        LEFT JOIN tabStockLedger sl ON 
          sl.item_code = pl.item_code 
          AND sl.warehouse IN ('Main Warehouse', 'WH-MAIN', 'WH-Main')
          AND sl.bin_location = CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), ''))
        WHERE pl.item_code IN (${placeholders})
          AND pl.rack IS NOT NULL
        ORDER BY pl.parent_title DESC, pl.item_code
        LIMIT 20
      `, itemCodes);
      
      console.table(comparison);
      console.log('');
    }

    // 7. Check tabItem.stock_qty vs sum of tabStockLedger
    console.log('=== Item Stock Qty vs Stock Ledger Sum ===');
    const [itemStock] = await connection.execute(`
      SELECT 
        i.code as item_code,
        i.stock_qty as item_stock_qty,
        COALESCE(SUM(sl.qty), 0) as ledger_sum,
        CASE 
          WHEN ABS(i.stock_qty - COALESCE(SUM(sl.qty), 0)) > 0.01 THEN 'MISMATCH'
          ELSE 'OK'
        END as status
      FROM tabItem i
      LEFT JOIN tabStockLedger sl ON sl.item_code = i.code
      WHERE i.stock_qty > 0 OR EXISTS (SELECT 1 FROM tabStockLedger WHERE item_code = i.code)
      GROUP BY i.code, i.stock_qty
      HAVING ABS(i.stock_qty - COALESCE(SUM(sl.qty), 0)) > 0.01
      ORDER BY ABS(i.stock_qty - COALESCE(SUM(sl.qty), 0)) DESC
      LIMIT 20
    `);
    
    console.table(itemStock);
    console.log('');

    console.log('=== Verification Complete ===');
    console.log('\nIf you see "MISSING IN STOCK LEDGER" or "BIN LOCATION MISMATCH",');
    console.log('the putaway stock update may not be working correctly.');
    console.log('\nIf warehouse names differ between ASN and Stock Ledger,');
    console.log('update the putaway code to use consistent warehouse names.');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run the verification
verifyPutawayStockLedger().catch(console.error);

