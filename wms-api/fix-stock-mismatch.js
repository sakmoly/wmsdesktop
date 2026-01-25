/**
 * Fix Stock Mismatch - Sync tabItem.stock_qty with tabStockLedger
 * 
 * Run: node fix-stock-mismatch.js
 * 
 * Options:
 *   --dry-run    Show what would be done without making changes
 *   --reset      Reset stock ledger to match original item quantities
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isReset = args.includes('--reset');

async function fix() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  console.log('🔧 Stock Mismatch Fix Tool\n');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : isReset ? 'RESET' : 'SYNC'}\n`);
  
  if (isReset) {
    // RESET MODE: Delete all test-related stock ledger entries
    console.log('=== RESET MODE: Cleaning up test stock ledger entries ===\n');
    
    // Get current stock ledger
    const [ledger] = await conn.execute(`
      SELECT item_code, warehouse, bin_location, qty 
      FROM tabStockLedger 
      ORDER BY item_code, bin_location
    `);
    
    console.log('Current stock ledger entries:', ledger.length);
    console.table(ledger);
    
    // Calculate what the stock should be based on tabItem
    const [items] = await conn.execute(`
      SELECT code, stock_qty FROM tabItem WHERE stock_qty > 0
    `);
    
    if (isDryRun) {
      console.log('\n[DRY RUN] Would delete all stock ledger entries and recreate from item quantities');
      console.log('Items to recreate:');
      console.table(items);
    } else {
      // Delete all stock ledger entries
      await conn.execute(`DELETE FROM tabStockLedger`);
      console.log('✅ Deleted all stock ledger entries');
      
      // Recreate stock ledger from item quantities (put all in first bin)
      for (const item of items) {
        await conn.execute(`
          INSERT INTO tabStockLedger (item_code, warehouse, bin_location, qty, reserved_qty, last_transaction_date, last_transaction_type, created_at, updated_at)
          VALUES (?, 'WH-MAIN', 'DEFAULT-BIN', ?, 0, NOW(), 'RESET', NOW(), NOW())
        `, [item.code, item.stock_qty]);
        console.log(`✅ Created stock ledger for ${item.code}: ${item.stock_qty}`);
      }
    }
  } else {
    // SYNC MODE: Update tabItem.stock_qty to match tabStockLedger
    console.log('=== SYNC MODE: Update tabItem.stock_qty to match tabStockLedger ===\n');
    
    // Get stock ledger totals
    const [ledgerTotals] = await conn.execute(`
      SELECT item_code, SUM(qty) as total_qty
      FROM tabStockLedger 
      GROUP BY item_code
    `);
    
    // Get all items
    const [items] = await conn.execute(`SELECT code, stock_qty FROM tabItem`);
    
    for (const item of items) {
      const ledgerItem = ledgerTotals.find(l => l.item_code === item.code);
      const ledgerQty = ledgerItem ? parseFloat(ledgerItem.total_qty) : 0;
      const itemQty = parseFloat(item.stock_qty) || 0;
      
      if (ledgerQty !== itemQty) {
        console.log(`${item.code}: ${itemQty} -> ${ledgerQty}`);
        
        if (!isDryRun) {
          await conn.execute(`
            UPDATE tabItem SET stock_qty = ? WHERE code = ?
          `, [ledgerQty, item.code]);
          console.log(`  ✅ Updated`);
        }
      }
    }
  }
  
  // Show final state
  console.log('\n=== Final State ===');
  const [finalItems] = await conn.execute(`
    SELECT code, stock_qty FROM tabItem WHERE stock_qty > 0
  `);
  console.table(finalItems);
  
  const [finalLedger] = await conn.execute(`
    SELECT item_code, SUM(qty) as total_qty
    FROM tabStockLedger 
    GROUP BY item_code
  `);
  console.table(finalLedger);
  
  await conn.end();
  console.log('\n✅ Done');
}

fix().catch(console.error);
