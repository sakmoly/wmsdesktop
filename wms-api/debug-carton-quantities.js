/**
 * Debug carton quantities from tabStockTransaction
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

async function debugCartonQuantities() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    const itemCode = 'SKU-HAT-301-BLU-OS';
    const location = 'A1-R02-L2-B2';
    const warehouse = 'WH-MAIN';

    console.log(`🔍 Debugging carton quantities for ${itemCode} at ${location}\n`);

    // Check all transactions for this carton
    const [allTx] = await connection.execute(`
      SELECT 
        id,
        carton_id,
        qty_change,
        transaction_date,
        transaction_type,
        target_bin,
        bin_location
      FROM tabStockTransaction
      WHERE item_code = ?
        AND warehouse = ?
        AND carton_id = 'CTN-TI-123457-20260121-000237-042'
      ORDER BY transaction_date DESC
    `, [itemCode, warehouse]);

    console.log(`All transactions for CTN-TI-123457-20260121-000237-042:`);
    console.log(JSON.stringify(allTx, null, 2));
    console.log('');

    // Check what the SUM query returns
    const [sumResult] = await connection.execute(`
      SELECT carton_id, SUM(qty_change) as total_qty, MAX(transaction_date) as transaction_date
      FROM tabStockTransaction
      WHERE item_code = ?
        AND warehouse = ?
        AND (target_bin = ? OR bin_location = ?)
        AND carton_id IS NOT NULL
        AND carton_id != ''
        AND transaction_type = 'Putaway'
      GROUP BY carton_id
      ORDER BY MAX(transaction_date) DESC
    `, [itemCode, warehouse, location, location]);

    console.log(`SUM query result:`);
    console.log(JSON.stringify(sumResult, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await connection.end();
  }
}

debugCartonQuantities();
