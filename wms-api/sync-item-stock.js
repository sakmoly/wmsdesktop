/**
 * Sync tabItem.stock_qty with tabStockLedger totals
 * Usage: node sync-item-stock.js [item_code]
 * If no item_code provided, syncs all items
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms'
});

const itemCode = process.argv[2];

if (itemCode) {
  // Sync single item
  console.log(`Syncing stock for: ${itemCode}`);
  
  const [result] = await conn.execute(`
    UPDATE tabItem SET stock_qty = (
      SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger 
      WHERE item_code = ? AND bin_location != 'STAGING'
    ), updated_at = NOW() WHERE code = ?
  `, [itemCode, itemCode]);
  
  // Verify
  const [rows] = await conn.execute('SELECT code, stock_qty FROM tabItem WHERE code = ?', [itemCode]);
  console.log('Updated item:', rows[0]);
  
  // Also check stock ledger
  const [ledger] = await conn.execute('SELECT item_code, bin_location, qty FROM tabStockLedger WHERE item_code = ?', [itemCode]);
  console.log('Stock ledger entries:', ledger);
  
} else {
  // Sync all items
  console.log('Syncing stock_qty for ALL items...');
  
  const [result] = await conn.execute(`
    UPDATE tabItem i SET stock_qty = (
      SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger sl 
      WHERE sl.item_code = i.code AND sl.bin_location != 'STAGING'
    ), updated_at = NOW()
  `);
  
  console.log(`Updated ${result.affectedRows} items`);
  
  // Show items with stock
  const [rows] = await conn.execute(`
    SELECT code, stock_qty FROM tabItem WHERE stock_qty > 0 ORDER BY stock_qty DESC LIMIT 20
  `);
  console.log('\nItems with stock:', rows);
}

await conn.end();
console.log('\nDone!');
