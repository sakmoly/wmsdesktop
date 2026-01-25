/**
 * Check database for cartons at a specific location
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms'
};

async function checkItemCartons() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    const itemCode = 'SKU-HAT-301-BLU-OS';
    const location = 'A1-R02-L2-B2';
    const warehouse = 'WH-MAIN';

    console.log(`🔍 Checking cartons for ${itemCode} at ${location} in ${warehouse}\n`);

    // 1. Check tabCartonStock
    console.log('1. Cartons in tabCartonStock:');
    const [cartonStock] = await connection.execute(`
      SELECT carton_id, item_code, bin_location, qty, status, updated_at
      FROM tabCartonStock
      WHERE item_code = ? 
        AND warehouse = ?
        AND bin_location = ?
        AND qty > 0
      ORDER BY updated_at DESC
    `, [itemCode, warehouse, location]);
    
    console.log(`   Found ${cartonStock.length} carton(s):`);
    cartonStock.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.carton_id} - Qty: ${c.qty}, Status: ${c.status || 'NULL'}`);
    });
    console.log('');

    // 2. Check tabStockLedger
    console.log('2. Entries in tabStockLedger:');
    // Check if carton_id column exists
    const [cartonIdCheck] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockLedger' 
      AND COLUMN_NAME = 'carton_id'
    `);
    const hasCartonId = cartonIdCheck.length > 0;
    
    const cartonIdSelect = hasCartonId ? ', carton_id' : ', NULL as carton_id';
    const [stockLedger] = await connection.execute(`
      SELECT bin_location, qty, reserved_qty${cartonIdSelect}
      FROM tabStockLedger
      WHERE item_code = ?
        AND warehouse = ?
        AND bin_location = ?
    `, [itemCode, warehouse, location]);
    
    console.log(`   Found ${stockLedger.length} entry/entries:`);
    stockLedger.forEach((s, i) => {
      console.log(`   ${i + 1}. Carton: ${s.carton_id || 'NULL'}, Qty: ${s.qty}, Reserved: ${s.reserved_qty || 0}`);
    });
    console.log('');

    // 3. Check tabStockTransaction
    console.log('3. Transactions in tabStockTransaction:');
    // Check what columns exist
    const [txColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockTransaction'
      AND (COLUMN_NAME LIKE '%qty%' OR COLUMN_NAME LIKE '%quantity%')
    `);
    console.log(`   Available quantity columns: ${txColumns.map(c => c.COLUMN_NAME).join(', ') || 'NONE'}`);
    
    const qtyColumn = txColumns.find(c => c.COLUMN_NAME === 'qty') ? 'qty' : 
                     txColumns.find(c => c.COLUMN_NAME === 'qty_change') ? 'qty_change' :
                     txColumns.find(c => c.COLUMN_NAME === 'quantity') ? 'quantity' : 'NULL as qty';
    
    const [transactions] = await connection.execute(`
      SELECT carton_id, ${qtyColumn} as qty, transaction_type, transaction_date, target_bin, bin_location
      FROM tabStockTransaction
      WHERE item_code = ?
        AND warehouse = ?
        AND (target_bin = ? OR bin_location = ?)
        AND transaction_type = 'Putaway'
        AND carton_id IS NOT NULL
        AND carton_id != ''
      ORDER BY transaction_date DESC
    `, [itemCode, warehouse, location, location]);
    
    // Also get a sample transaction to see all columns
    if (transactions.length > 0) {
      const [sample] = await connection.execute(`
        SELECT * FROM tabStockTransaction
        WHERE item_code = ? AND carton_id = ?
        LIMIT 1
      `, [itemCode, transactions[0].carton_id]);
      console.log(`   Sample transaction columns: ${Object.keys(sample[0] || {}).join(', ')}`);
    }
    
    console.log(`   Found ${transactions.length} transaction(s):`);
    const uniqueCartons = new Set();
    transactions.forEach((t, i) => {
      uniqueCartons.add(t.carton_id);
      console.log(`   ${i + 1}. Carton: ${t.carton_id}, Qty: ${t.qty}, Date: ${t.transaction_date}`);
    });
    console.log(`   Unique cartons: ${Array.from(uniqueCartons).join(', ')}`);
    console.log('');

    // 4. Check tabTransactionHistory
    console.log('4. Transactions in tabTransactionHistory:');
    const [history] = await connection.execute(`
      SELECT carton_id, qty_change, transaction_type, transaction_date, bin_location
      FROM tabTransactionHistory
      WHERE item_code = ?
        AND bin_location = ?
        AND transaction_type = 'Putaway'
        AND carton_id IS NOT NULL
        AND carton_id != ''
      ORDER BY transaction_date DESC
    `, [itemCode, location]);
    
    console.log(`   Found ${history.length} transaction(s):`);
    const historyCartons = new Set();
    history.forEach((h, i) => {
      historyCartons.add(h.carton_id);
      console.log(`   ${i + 1}. Carton: ${h.carton_id}, Qty Change: ${h.qty_change}, Date: ${h.transaction_date}`);
    });
    console.log(`   Unique cartons: ${Array.from(historyCartons).join(', ')}`);
    console.log('');

    // Summary
    console.log('📊 Summary:');
    console.log(`   tabCartonStock: ${cartonStock.length} carton(s)`);
    console.log(`   tabStockLedger: ${stockLedger.length} entry/entries`);
    console.log(`   tabStockTransaction: ${transactions.length} transaction(s), ${uniqueCartons.size} unique carton(s)`);
    console.log(`   tabTransactionHistory: ${history.length} transaction(s), ${historyCartons.size} unique carton(s)`);
    console.log('');
    
    if (uniqueCartons.size > 1 || historyCartons.size > 1) {
      console.log('⚠️  Multiple cartons detected in transaction history!');
      console.log('   The API should return one row per carton.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await connection.end();
  }
}

checkItemCartons();
