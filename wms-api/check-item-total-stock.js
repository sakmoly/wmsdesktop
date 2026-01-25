/**
 * Check total stock for an item across all locations
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

async function checkItemTotalStock() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    const itemCode = 'SKU-HAT-301-BLU-OS';
    const warehouse = 'WH-MAIN';

    console.log(`🔍 Checking total stock for ${itemCode} in ${warehouse}\n`);

    // 1. Check tabItem.stock_qty
    const [item] = await connection.execute(
      `SELECT stock_qty, reserved_qty FROM tabItem WHERE code = ?`,
      [itemCode]
    );
    console.log('1. tabItem.stock_qty:');
    if (item.length > 0) {
      const stockQty = parseFloat(item[0].stock_qty) || 0;
      const reservedQty = parseFloat(item[0].reserved_qty) || 0;
      const availableQty = stockQty - reservedQty;
      console.log(`   Stock Qty: ${stockQty}`);
      console.log(`   Reserved Qty: ${reservedQty}`);
      console.log(`   Available Qty: ${availableQty}`);
    } else {
      console.log('   Item not found');
    }
    console.log('');

    // 2. Sum from tabStockLedger
    const [stockLedger] = await connection.execute(
      `SELECT 
        SUM(qty) as total_qty,
        SUM(reserved_qty) as total_reserved,
        SUM(qty) - SUM(reserved_qty) as total_available
      FROM tabStockLedger 
      WHERE item_code = ? AND warehouse = ?`,
      [itemCode, warehouse]
    );
    console.log('2. tabStockLedger (sum):');
    if (stockLedger.length > 0) {
      console.log(`   Total Qty: ${stockLedger[0].total_qty || 0}`);
      console.log(`   Total Reserved: ${stockLedger[0].total_reserved || 0}`);
      console.log(`   Total Available: ${stockLedger[0].total_available || 0}`);
    }
    console.log('');

    // 3. Sum from tabCartonStock
    const [cartonStock] = await connection.execute(
      `SELECT 
        SUM(qty) as total_qty
      FROM tabCartonStock 
      WHERE item_code = ? AND warehouse = ?`,
      [itemCode, warehouse]
    );
    console.log('3. tabCartonStock (sum):');
    if (cartonStock.length > 0) {
      console.log(`   Total Qty: ${cartonStock[0].total_qty || 0}`);
    }
    console.log('');

    // 4. Sum from tabStockTransaction (putaway transactions only)
    const [stockTransaction] = await connection.execute(
      `SELECT 
        SUM(qty_change) as total_qty
      FROM tabStockTransaction 
      WHERE item_code = ? 
        AND warehouse = ? 
        AND transaction_type = 'Putaway'
        AND qty_change > 0`,
      [itemCode, warehouse]
    );
    console.log('4. tabStockTransaction (Putaway, positive qty_change):');
    if (stockTransaction.length > 0) {
      console.log(`   Total Qty: ${stockTransaction[0].total_qty || 0}`);
    }
    console.log('');

    // 5. Breakdown by location
    const [locationBreakdown] = await connection.execute(
      `SELECT 
        bin_location,
        SUM(qty) as total_qty,
        SUM(reserved_qty) as total_reserved
      FROM tabStockLedger 
      WHERE item_code = ? AND warehouse = ?
      GROUP BY bin_location
      ORDER BY bin_location`,
      [itemCode, warehouse]
    );
    console.log('5. Breakdown by location:');
    locationBreakdown.forEach(loc => {
      console.log(`   ${loc.bin_location}: Qty: ${loc.total_qty || 0}, Reserved: ${loc.total_reserved || 0}, Available: ${(loc.total_qty || 0) - (loc.total_reserved || 0)}`);
    });
    console.log('');

    // Summary
    const itemStockQty = item.length > 0 ? parseFloat(item[0].stock_qty) || 0 : 0;
    const ledgerTotalQty = stockLedger.length > 0 ? parseFloat(stockLedger[0].total_qty) || 0 : 0;
    const ledgerTotalAvailable = stockLedger.length > 0 ? parseFloat(stockLedger[0].total_available) || 0 : 0;

    console.log('📊 Summary:');
    console.log(`   tabItem.stock_qty: ${itemStockQty}`);
    console.log(`   tabStockLedger total: ${ledgerTotalQty}`);
    console.log(`   tabStockLedger available: ${ledgerTotalAvailable}`);
    console.log(`   Difference: ${itemStockQty - ledgerTotalQty}`);

    if (Math.abs(itemStockQty - ledgerTotalQty) > 0.01) {
      console.log('\n⚠️  WARNING: tabItem.stock_qty does not match tabStockLedger total!');
      console.log('   This indicates the stock posting service needs to be run.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await connection.end();
  }
}

checkItemTotalStock();
