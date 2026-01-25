const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'erppadmin',
    password: 'P61nt!',
    database: 'wms_desktop'
  });

  const itemCode = 'SKU-HAT-301-BLU-OS';
  
  // Calculate correct stock from transaction history per location
  const [correctStock] = await connection.execute(`
    SELECT
      CASE
        WHEN stock_direction = 'IN' THEN COALESCE(NULLIF(target_bin, ''), location_id, bin_location)
        WHEN stock_direction = 'OUT' THEN COALESCE(NULLIF(source_bin, ''), location_id, bin_location)
        ELSE COALESCE(location_id, bin_location)
      END AS bin_location,
      SUM(qty_change) AS correct_qty
    FROM tabTransactionHistory
    WHERE item_code = ?
    GROUP BY 1
    HAVING SUM(qty_change) > 0
  `, [itemCode]);
  
  console.log('Correct stock per location (from transaction history):');
  console.table(correctStock);
  
  // Get warehouse from existing entry
  const [warehouseRow] = await connection.execute(
    `SELECT warehouse FROM tabStockLedger WHERE item_code = ? LIMIT 1`,
    [itemCode]
  );
  const warehouse = warehouseRow.length > 0 ? warehouseRow[0].warehouse : 'WH-MAIN';
  
  // DELETE all Stock Ledger entries for this item and recreate
  await connection.execute(`DELETE FROM tabStockLedger WHERE item_code = ?`, [itemCode]);
  console.log('Deleted old Stock Ledger entries');
  
  // Recreate Stock Ledger entries from transaction history
  for (const row of correctStock) {
    const qty = parseFloat(row.correct_qty) || 0;
    if (qty > 0 && row.bin_location) {
      await connection.execute(`
        INSERT INTO tabStockLedger (item_code, warehouse, bin_location, qty, reserved_qty, 
          last_transaction_date, last_transaction_type, updated_at, created_at)
        VALUES (?, ?, ?, ?, 0, NOW(), 'SYNC', NOW(), NOW())
      `, [itemCode, warehouse, row.bin_location, qty]);
      console.log(`Created Stock Ledger: ${row.bin_location} = ${qty}`);
    }
  }
  
  // Calculate total stock
  const totalStock = correctStock.reduce((sum, row) => sum + parseFloat(row.correct_qty), 0);
  console.log('\nTotal correct stock:', totalStock);
  
  // Update tabItem.stock_qty
  await connection.execute(`
    UPDATE tabItem SET stock_qty = ? WHERE code = ?
  `, [totalStock, itemCode]);
  console.log('Updated tabItem.stock_qty to', totalStock);

  await connection.end();
  console.log('\n✅ Stock corrected!');
}

main().catch(console.error);
