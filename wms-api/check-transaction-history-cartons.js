/**
 * Check Transaction History carton quantities for SKU-HAT-301-BLU-OS
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

async function checkTransactionHistoryCartons() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    const itemCode = 'SKU-HAT-301-BLU-OS';
    const warehouse = 'WH-MAIN';
    const location = 'A1-R02-L2-B2';

    console.log(`🔍 Checking Transaction History cartons for ${itemCode} at ${location}\n`);

    // Get aggregated carton quantities from Transaction History
    const [historyCartons] = await connection.execute(
      `SELECT 
        carton_id,
        SUM(CASE WHEN transaction_type = 'Putaway' THEN qty_change ELSE 0 END) as putaway_qty,
        SUM(CASE WHEN transaction_type = 'Picking' THEN ABS(qty_change) ELSE 0 END) as picked_qty,
        SUM(CASE WHEN transaction_type = 'Putaway' THEN qty_change ELSE -ABS(qty_change) END) as net_qty,
        MAX(transaction_date) as last_transaction_date
      FROM tabTransactionHistory
      WHERE item_code = ?
        AND warehouse = ?
        AND (bin_location = ? OR location_id = ?)
        AND carton_id IS NOT NULL
        AND carton_id != ''
      GROUP BY carton_id
      ORDER BY MAX(transaction_date) DESC`,
      [itemCode, warehouse, location, location]
    );

    console.log(`Found ${historyCartons.length} carton(s) in Transaction History:\n`);
    historyCartons.forEach((hc, index) => {
      console.log(`  ${index + 1}. Carton: ${hc.carton_id}`);
      console.log(`     Putaway Qty: ${hc.putaway_qty}`);
      console.log(`     Picked Qty: ${hc.picked_qty}`);
      console.log(`     Net Qty: ${hc.net_qty}`);
      console.log(`     Last Transaction: ${hc.last_transaction_date}`);
      console.log('');
    });

    const totalNetQty = historyCartons.reduce((sum, hc) => sum + parseFloat(hc.net_qty || 0), 0);
    console.log(`Total Net Qty from Transaction History: ${totalNetQty}`);

    // Check stock ledger
    const [stockLedger] = await connection.execute(
      `SELECT qty FROM tabStockLedger WHERE item_code = ? AND warehouse = ? AND bin_location = ?`,
      [itemCode, warehouse, location]
    );
    if (stockLedger.length > 0) {
      console.log(`Stock Ledger Qty: ${stockLedger[0].qty}`);
      console.log(`Difference: ${totalNetQty - parseFloat(stockLedger[0].qty)}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await connection.end();
  }
}

checkTransactionHistoryCartons();
