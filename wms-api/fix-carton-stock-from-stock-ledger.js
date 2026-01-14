// wms-api/fix-carton-stock-from-stock-ledger.js
// Automatically sync tabCartonStock with tabStockLedger

import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database configuration from .env
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms_desktop',
  multipleStatements: true, // Allow multiple SQL statements
};

console.log('🔧 Carton Stock Sync Tool');
console.log('==========================\n');
console.log(`Database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
console.log(`User: ${dbConfig.user}\n`);

async function runFixScript() {
  let connection;
  
  try {
    // Connect to database
    console.log('📡 Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database\n');

    // Check if carton_id column exists in tabStockLedger
    console.log('🔍 Checking database schema...');
    const [cartonIdColumn] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockLedger' 
      AND COLUMN_NAME = 'carton_id'
    `);
    const hasCartonIdColumn = cartonIdColumn.length > 0;
    
    if (!hasCartonIdColumn) {
      console.log('⚠️  NOTE: carton_id column does not exist in tabStockLedger');
      console.log('   Will sync carton stock by matching item_code, warehouse, and bin_location.\n');
      
      // Sync without carton_id - match by item_code, warehouse, bin_location
      // For each carton stock entry, find matching stock ledger entry and update quantity
      console.log('📊 Syncing carton stock without carton_id...\n');
      
      const [cartonEntries] = await connection.execute(`
        SELECT carton_id, item_code, warehouse, bin_location, qty
        FROM tabCartonStock
        WHERE qty > 0
      `);
      
      console.log(`Found ${cartonEntries.length} carton stock entries to check\n`);
      
      let updatedCount = 0;
      for (const carton of cartonEntries) {
        // Find matching stock ledger entry
        const [stockLedger] = await connection.execute(`
          SELECT qty
          FROM tabStockLedger
          WHERE item_code = ? AND warehouse = ? AND bin_location = ?
          LIMIT 1
        `, [carton.item_code, carton.warehouse, carton.bin_location]);
        
        if (stockLedger.length > 0) {
          const stockLedgerQty = parseFloat(stockLedger[0].qty) || 0;
          const cartonQty = parseFloat(carton.qty) || 0;
          
          if (Math.abs(stockLedgerQty - cartonQty) > 0.01) {
            // Update carton stock to match stock ledger
            await connection.execute(`
              UPDATE tabCartonStock
              SET qty = ?, updated_at = NOW()
              WHERE carton_id = ? AND item_code = ? AND warehouse = ? AND bin_location = ?
            `, [stockLedgerQty, carton.carton_id, carton.item_code, carton.warehouse, carton.bin_location]);
            
            updatedCount++;
            console.log(`✅ Updated carton ${carton.carton_id} (${carton.item_code} @ ${carton.bin_location}): ${cartonQty} → ${stockLedgerQty}`);
          }
        }
      }
      
      console.log(`\n✅ Updated ${updatedCount} carton stock entr(y/ies)\n`);
      console.log('✅ Sync completed!\n');
      return;
    }
    
    console.log('✅ carton_id column found in tabStockLedger\n');

    // Check if tabCartonStock table exists
    const [cartonStockTable] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCartonStock'
    `);
    const hasCartonStockTable = cartonStockTable.length > 0;
    
    if (!hasCartonStockTable) {
      console.log('⚠️  WARNING: tabCartonStock table does not exist');
      console.log('   This script requires tabCartonStock table to sync carton stock.\n');
      return;
    }
    
    console.log('✅ tabCartonStock table found\n');

    // Execute SQL operations directly (better control)
    console.log('📊 Step 1: Finding carton stock mismatches...\n');
    
    // Find mismatches
    const [mismatches] = await connection.execute(`
      SELECT 
        sl.item_code,
        sl.warehouse,
        sl.bin_location,
        sl.carton_id,
        sl.qty as stock_ledger_qty,
        cs.qty as carton_stock_qty,
        (sl.qty - cs.qty) as difference,
        sl.last_transaction_type,
        sl.last_transaction_ref
      FROM tabStockLedger sl
      INNER JOIN tabCartonStock cs ON 
        sl.carton_id = cs.carton_id 
        AND sl.item_code = cs.item_code 
        AND sl.warehouse = cs.warehouse 
        AND sl.bin_location = cs.bin_location
      WHERE sl.carton_id IS NOT NULL
        AND sl.carton_id != ''
        AND ABS(sl.qty - cs.qty) > 0.01
      ORDER BY ABS(sl.qty - cs.qty) DESC, sl.item_code, sl.bin_location
    `);
    
    if (mismatches.length === 0) {
      console.log('✅ No mismatches found - carton stock is already in sync!\n');
    } else {
      console.log(`⚠️  Found ${mismatches.length} mismatch(es):\n`);
      if (mismatches.length <= 10) {
        console.table(mismatches);
      } else {
        console.table(mismatches.slice(0, 10));
        console.log(`... and ${mismatches.length - 10} more mismatches\n`);
      }
      
      console.log('\n📊 Step 2: Updating tabCartonStock from tabStockLedger...\n');
      
      // Update carton stock
      const [updateResult] = await connection.execute(`
        UPDATE tabCartonStock cs
        INNER JOIN tabStockLedger sl ON 
          sl.carton_id = cs.carton_id 
          AND sl.item_code = cs.item_code 
          AND sl.warehouse = cs.warehouse 
          AND sl.bin_location = cs.bin_location
        SET cs.qty = sl.qty,
            cs.updated_at = NOW()
        WHERE sl.carton_id IS NOT NULL
          AND sl.carton_id != ''
          AND ABS(sl.qty - cs.qty) > 0.01
      `);
      
      console.log(`✅ Updated ${updateResult.affectedRows} carton stock entr(y/ies)\n`);
    }
    
    console.log('📊 Step 3: Creating missing carton stock entries...\n');
    
    // Create missing entries
    const [insertResult] = await connection.execute(`
      INSERT INTO tabCartonStock 
        (carton_id, item_code, warehouse, bin_location, qty, status)
      SELECT 
        sl.carton_id,
        sl.item_code,
        sl.warehouse,
        sl.bin_location,
        sl.qty,
        'PUTAWAY' as status
      FROM tabStockLedger sl
      LEFT JOIN tabCartonStock cs ON 
        sl.carton_id = cs.carton_id 
        AND sl.item_code = cs.item_code 
        AND sl.warehouse = cs.warehouse 
        AND sl.bin_location = cs.bin_location
      WHERE sl.carton_id IS NOT NULL
        AND sl.carton_id != ''
        AND cs.carton_id IS NULL
        AND sl.qty > 0
      ON DUPLICATE KEY UPDATE
        qty = VALUES(qty),
        updated_at = NOW(),
        status = 'PUTAWAY'
    `);
    
    if (insertResult.affectedRows > 0) {
      console.log(`✅ Created ${insertResult.affectedRows} missing carton stock entr(y/ies)\n`);
    } else {
      console.log('✅ No missing carton stock entries to create\n');
    }


    // Final verification
    console.log('\n' + '='.repeat(60));
    console.log('📋 Final Verification');
    console.log('='.repeat(60) + '\n');

    // Check remaining mismatches
    const [mismatchCount] = await connection.execute(`
      SELECT 
        COUNT(*) as remaining_mismatches
      FROM tabStockLedger sl
      INNER JOIN tabCartonStock cs ON 
        sl.carton_id = cs.carton_id 
        AND sl.item_code = cs.item_code 
        AND sl.warehouse = cs.warehouse 
        AND sl.bin_location = cs.bin_location
      WHERE sl.carton_id IS NOT NULL
        AND sl.carton_id != ''
        AND ABS(sl.qty - cs.qty) > 0.01
    `);

    const remainingMismatches = mismatchCount[0]?.remaining_mismatches || 0;

    if (remainingMismatches === 0) {
      console.log('✅ SUCCESS: All carton stock entries are now in sync with stock ledger!\n');
    } else {
      console.log(`⚠️  WARNING: ${remainingMismatches} carton stock entries still have mismatches.\n`);
      
      // Show remaining mismatches
      const [remaining] = await connection.execute(`
        SELECT 
          sl.item_code,
          sl.bin_location,
          sl.carton_id,
          sl.qty as stock_ledger_qty,
          cs.qty as carton_stock_qty,
          (sl.qty - cs.qty) as difference
        FROM tabStockLedger sl
        INNER JOIN tabCartonStock cs ON 
          sl.carton_id = cs.carton_id 
          AND sl.item_code = cs.item_code 
          AND sl.warehouse = cs.warehouse 
          AND sl.bin_location = cs.bin_location
        WHERE sl.carton_id IS NOT NULL
          AND sl.carton_id != ''
          AND ABS(sl.qty - cs.qty) > 0.01
        ORDER BY ABS(sl.qty - cs.qty) DESC
        LIMIT 10
      `);

      if (remaining.length > 0) {
        console.log('Remaining mismatches:');
        console.table(remaining);
      }
    }

    // Summary
    const [summary] = await connection.execute(`
      SELECT 
        (SELECT COUNT(*) FROM tabStockLedger 
         WHERE carton_id IS NOT NULL AND carton_id != '') as stock_ledger_entries_with_carton,
        (SELECT COUNT(*) FROM tabCartonStock 
         WHERE qty > 0) as carton_stock_entries,
        (SELECT COUNT(*) 
         FROM tabStockLedger sl
         INNER JOIN tabCartonStock cs ON 
            sl.carton_id = cs.carton_id 
            AND sl.item_code = cs.item_code 
            AND sl.warehouse = cs.warehouse 
            AND sl.bin_location = cs.bin_location
         WHERE sl.carton_id IS NOT NULL
           AND sl.carton_id != ''
           AND ABS(sl.qty - cs.qty) <= 0.01) as matched_entries
    `);

    console.log('\n📊 Summary:');
    console.log('─'.repeat(60));
    console.log(`Stock Ledger entries with carton_id: ${summary[0].stock_ledger_entries_with_carton}`);
    console.log(`Carton Stock entries: ${summary[0].carton_stock_entries}`);
    console.log(`Matched entries: ${summary[0].matched_entries}`);
    console.log('─'.repeat(60) + '\n');

    console.log('✅ Script completed successfully!\n');
    console.log('💡 Next steps:');
    console.log('   1. Restart the desktop app to refresh data');
    console.log('   2. Check Item Location Breakdown - quantities should now be correct\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('📡 Database connection closed');
    }
  }
}

// Run the script
runFixScript().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
