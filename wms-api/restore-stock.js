/**
 * Restore stock for production items
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function restore() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  console.log('🔧 Restoring Stock...\n');
  
  // Set stock for items
  const items = [
    { code: 'SKU-HAT-301-BLU-OS', name: 'Baseball Cap Blue One Size', qty: 25 },
    { code: 'SKU-HAT-301-GRN-OS', name: 'Baseball Cap Green One Size', qty: 25 }
  ];
  
  for (const item of items) {
    // Update item stock
    await conn.execute(`
      UPDATE tabItem SET stock_qty = ? WHERE code = ?
    `, [item.qty, item.code]);
    
    // Create stock ledger entry
    await conn.execute(`
      INSERT INTO tabStockLedger (item_code, warehouse, bin_location, qty, reserved_qty, last_transaction_date, last_transaction_type, created_at, updated_at)
      VALUES (?, 'WH-MAIN', 'DEFAULT-BIN', ?, 0, NOW(), 'RESTORE', NOW(), NOW())
      ON DUPLICATE KEY UPDATE qty = ?
    `, [item.code, item.qty, item.qty]);
    
    console.log(`✅ ${item.code}: ${item.qty} units`);
  }
  
  // Show final state
  console.log('\n=== Final State ===');
  const [ledger] = await conn.execute(`SELECT item_code, bin_location, qty FROM tabStockLedger WHERE qty > 0`);
  console.table(ledger);
  
  const [itemsResult] = await conn.execute(`SELECT code, stock_qty FROM tabItem WHERE stock_qty > 0`);
  console.table(itemsResult);
  
  await conn.end();
  console.log('\n✅ Done');
}

restore().catch(console.error);
