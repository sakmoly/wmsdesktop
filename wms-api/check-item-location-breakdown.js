/**
 * Check Item Location Breakdown for SKU-HAT-301-BLU-OS
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

async function checkLocationBreakdown() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    const itemCode = 'SKU-HAT-301-BLU-OS';
    const warehouse = 'WH-MAIN';

    console.log(`🔍 Checking Location Breakdown for ${itemCode} in ${warehouse}\n`);

    // 1. Check tabStockLedger by location
    console.log('1. tabStockLedger by location:');
    const [stockLedger] = await connection.execute(
      `SELECT 
        bin_location,
        qty,
        reserved_qty,
        qty - reserved_qty as available_qty,
        qty_before,
        qty_reduced,
        last_transaction_date,
        last_transaction_ref
      FROM tabStockLedger 
      WHERE item_code = ? AND warehouse = ?
      ORDER BY bin_location`,
      [itemCode, warehouse]
    );
    stockLedger.forEach(row => {
      console.log(`   ${row.bin_location || 'NULL'}: Qty=${row.qty}, Reserved=${row.reserved_qty}, Available=${row.available_qty}, QtyBefore=${row.qty_before}, QtyReduced=${row.qty_reduced}, Ref=${row.last_transaction_ref}`);
    });
    console.log('');

    // 2. Check tabTransactionHistory (aggregated) by location
    console.log('2. tabTransactionHistory (aggregated) by location:');
    const [transactionHistory] = await connection.execute(
      `SELECT 
        COALESCE(location_id, bin_location) as location,
        carton_id,
        reference_doc,
        transaction_type,
        qty_change,
        qty_before,
        qty_after,
        DATE(transaction_date) as date
      FROM tabTransactionHistory 
      WHERE item_code = ? AND warehouse = ?
      ORDER BY location, carton_id, transaction_date DESC`,
      [itemCode, warehouse]
    );
    transactionHistory.forEach(row => {
      console.log(`   ${row.location}: Carton=${row.carton_id || 'NULL'}, Ref=${row.reference_doc}, Type=${row.transaction_type}, QtyChange=${row.qty_change}, QtyBefore=${row.qty_before}, QtyAfter=${row.qty_after}`);
    });
    console.log('');

    // 3. Check tabStockTransaction (individual) by location
    console.log('3. tabStockTransaction (individual) by location:');
    const [stockTransaction] = await connection.execute(
      `SELECT 
        bin_location,
        carton_id,
        reference_doc,
        transaction_type,
        qty_change,
        qty_before,
        qty_after,
        transaction_date
      FROM tabStockTransaction 
      WHERE item_code = ? AND warehouse = ?
      ORDER BY bin_location, transaction_date DESC`,
      [itemCode, warehouse]
    );
    stockTransaction.forEach(row => {
      console.log(`   ${row.bin_location || 'NULL'}: Carton=${row.carton_id || 'NULL'}, Ref=${row.reference_doc}, Type=${row.transaction_type}, QtyChange=${row.qty_change}, Date=${row.transaction_date}`);
    });
    console.log('');

    // 4. Calculate totals
    const ledgerTotal = stockLedger.reduce((sum, r) => sum + parseFloat(r.qty || 0), 0);
    const historyTotal = transactionHistory
      .filter(r => r.transaction_type === 'Putaway')
      .reduce((sum, r) => sum + parseFloat(r.qty_change || 0), 0) -
      transactionHistory
      .filter(r => r.transaction_type === 'Picking')
      .reduce((sum, r) => sum + Math.abs(parseFloat(r.qty_change || 0)), 0);

    console.log('📊 Summary:');
    console.log(`   tabStockLedger total: ${ledgerTotal}`);
    console.log(`   tabTransactionHistory net change: ${historyTotal}`);
    console.log(`   Expected total: ${ledgerTotal}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await connection.end();
  }
}

checkLocationBreakdown();
