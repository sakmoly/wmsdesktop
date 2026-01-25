/**
 * Check Stock Mismatch between tabStockLedger and tabItem
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  console.log('=== Current Stock Ledger ===');
  const [ledger] = await conn.execute(`
    SELECT item_code, warehouse, bin_location, qty 
    FROM tabStockLedger 
    WHERE qty > 0 
    ORDER BY item_code, bin_location
  `);
  console.table(ledger);
  
  console.log('\n=== Stock Ledger Summary by Item ===');
  const [summary] = await conn.execute(`
    SELECT item_code, SUM(qty) as total_qty
    FROM tabStockLedger 
    WHERE qty > 0 
    GROUP BY item_code
    ORDER BY item_code
  `);
  console.table(summary);
  
  console.log('\n=== Item Stock Qty (from tabItem) ===');
  const [items] = await conn.execute(`
    SELECT code, name, stock_qty 
    FROM tabItem 
    WHERE stock_qty > 0
    ORDER BY code
  `);
  console.table(items);
  
  console.log('\n=== Test Carton Stock (should be cleaned up) ===');
  const [testCartons] = await conn.execute(`
    SELECT carton_id, item_code, bin_location, qty 
    FROM tabCartonStock 
    WHERE carton_id LIKE 'CTN-TEST-%'
  `);
  console.log('Test cartons found:', testCartons.length);
  if (testCartons.length > 0) console.table(testCartons);
  
  console.log('\n=== Test Stock Ledger Entries (A1- bins) ===');
  const [testLedger] = await conn.execute(`
    SELECT item_code, bin_location, qty
    FROM tabStockLedger 
    WHERE bin_location LIKE 'A1-%'
  `);
  console.log('Test bin stock ledger entries:', testLedger.length);
  if (testLedger.length > 0) console.table(testLedger);
  
  // Check mismatch
  console.log('\n=== MISMATCH ANALYSIS ===');
  for (const item of items) {
    const ledgerItem = summary.find(s => s.item_code === item.code);
    const ledgerQty = ledgerItem ? parseFloat(ledgerItem.total_qty) : 0;
    const itemQty = parseFloat(item.stock_qty);
    
    if (ledgerQty !== itemQty) {
      console.log(`❌ MISMATCH: ${item.code}`);
      console.log(`   Item.stock_qty: ${itemQty}`);
      console.log(`   StockLedger sum: ${ledgerQty}`);
      console.log(`   Difference: ${itemQty - ledgerQty}`);
    } else {
      console.log(`✅ OK: ${item.code} (qty: ${itemQty})`);
    }
  }
  
  await conn.end();
}

check().catch(console.error);
