/**
 * Check total quantities across all locations for SKU-HAT-301-BLU-OS
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

async function checkAllLocationsTotal() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    const itemCode = 'SKU-HAT-301-BLU-OS';
    const warehouse = 'WH-MAIN';

    console.log(`🔍 Checking total quantities for ${itemCode} in ${warehouse}\n`);

    // 1. Check tabItem
    const [itemRows] = await connection.execute(
      `SELECT stock_qty, reserved_qty FROM tabItem WHERE code = ?`,
      [itemCode]
    );
    console.log('1. tabItem:');
    if (itemRows.length > 0) {
      console.log(`   Stock Qty: ${itemRows[0].stock_qty}`);
      console.log(`   Reserved Qty: ${itemRows[0].reserved_qty}`);
      console.log(`   Available Qty: ${itemRows[0].stock_qty - itemRows[0].reserved_qty}`);
    }
    console.log('');

    // 2. Check tabStockLedger (sum by location)
    const [stockLedger] = await connection.execute(
      `SELECT bin_location, qty, reserved_qty 
       FROM tabStockLedger 
       WHERE item_code = ? AND warehouse = ?
       ORDER BY bin_location`,
      [itemCode, warehouse]
    );
    console.log('2. tabStockLedger by location:');
    let ledgerTotal = 0;
    stockLedger.forEach(row => {
      const qty = parseFloat(row.qty || 0);
      ledgerTotal += qty;
      console.log(`   ${row.bin_location || 'NULL'}: Qty=${qty}, Reserved=${row.reserved_qty}`);
    });
    console.log(`   Total: ${ledgerTotal}`);
    console.log('');

    // 3. Check tabTransactionHistory (aggregated net qty by location)
    const [historyByLocation] = await connection.execute(
      `SELECT 
        COALESCE(location_id, bin_location) as location,
        SUM(CASE WHEN transaction_type = 'Putaway' THEN qty_change ELSE 0 END) as putaway_qty,
        SUM(CASE WHEN transaction_type = 'Picking' THEN ABS(qty_change) ELSE 0 END) as picked_qty,
        SUM(CASE WHEN transaction_type = 'Putaway' THEN qty_change ELSE -ABS(qty_change) END) as net_qty
      FROM tabTransactionHistory
      WHERE item_code = ? AND warehouse = ?
      GROUP BY COALESCE(location_id, bin_location)
      ORDER BY location`,
      [itemCode, warehouse]
    );
    console.log('3. tabTransactionHistory (aggregated) by location:');
    let historyTotal = 0;
    historyByLocation.forEach(row => {
      const netQty = parseFloat(row.net_qty || 0);
      historyTotal += netQty;
      console.log(`   ${row.location || 'NULL'}: Putaway=${row.putaway_qty}, Picked=${row.picked_qty}, Net=${netQty}`);
    });
    console.log(`   Total: ${historyTotal}`);
    console.log('');

    // 4. Check tabTransactionHistory (by carton, net qty > 0)
    const [historyByCarton] = await connection.execute(
      `SELECT 
        COALESCE(location_id, bin_location) as location,
        carton_id,
        SUM(CASE WHEN transaction_type = 'Putaway' THEN qty_change ELSE 0 END) as putaway_qty,
        SUM(CASE WHEN transaction_type = 'Picking' THEN ABS(qty_change) ELSE 0 END) as picked_qty,
        SUM(CASE WHEN transaction_type = 'Putaway' THEN qty_change ELSE -ABS(qty_change) END) as net_qty
      FROM tabTransactionHistory
      WHERE item_code = ? AND warehouse = ?
      GROUP BY COALESCE(location_id, bin_location), carton_id
      HAVING net_qty > 0
      ORDER BY location, carton_id`,
      [itemCode, warehouse]
    );
    console.log('4. tabTransactionHistory (by carton, net_qty > 0):');
    let cartonTotal = 0;
    historyByCarton.forEach(row => {
      const netQty = parseFloat(row.net_qty || 0);
      cartonTotal += netQty;
      console.log(`   ${row.location || 'NULL'}: Carton=${row.carton_id}, Net=${netQty}`);
    });
    console.log(`   Total: ${cartonTotal}`);
    console.log('');

    console.log('📊 Summary:');
    console.log(`   tabItem.stock_qty: ${itemRows.length > 0 ? itemRows[0].stock_qty : 0}`);
    console.log(`   tabStockLedger total: ${ledgerTotal}`);
    console.log(`   tabTransactionHistory (by location) total: ${historyTotal}`);
    console.log(`   tabTransactionHistory (by carton) total: ${cartonTotal}`);
    console.log(`   Expected total: 52`);
    console.log(`   Current breakdown total: 57 (25 + 20 + 2 + 10)`);
    console.log(`   Difference: ${57 - (itemRows.length > 0 ? itemRows[0].stock_qty : 0)}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await connection.end();
  }
}

checkAllLocationsTotal();
