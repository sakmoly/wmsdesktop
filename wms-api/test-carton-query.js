import mysql from 'mysql2/promise';

async function testCartonQuery() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'wms_desktop'
  });

  try {
    // First, check what's in tabTransactionHistory
    const [thRows] = await connection.execute(`
      SELECT carton_id, location_id, bin_location, target_bin, qty_after, transaction_id, transaction_date
      FROM tabTransactionHistory
      WHERE item_code = ? AND warehouse = ? AND qty_after > 0
      ORDER BY transaction_date DESC
      LIMIT 20
    `, ['SKU-HAT-301-BLU-OS', 'WH-MAIN']);

    console.log('tabTransactionHistory rows:', thRows.length);
    console.log(JSON.stringify(thRows, null, 2));

    // Then check tabStockTransaction
    const [stRows] = await connection.execute(`
      SELECT id, carton_id, bin_location, target_bin, qty_after, transaction_date
      FROM tabStockTransaction
      WHERE item_code = ? AND warehouse = ? AND carton_id IS NOT NULL AND carton_id != ''
      ORDER BY transaction_date DESC
      LIMIT 20
    `, ['SKU-HAT-301-BLU-OS', 'WH-MAIN']);

    console.log('\ntabStockTransaction rows:', stRows.length);
    console.log(JSON.stringify(stRows, null, 2));

    // Now try the join
    const [rows] = await connection.execute(`
      SELECT 
        COALESCE(th.carton_id, st.carton_id) as carton_id,
        COALESCE(th.location_id, th.bin_location, th.target_bin, st.bin_location, st.target_bin) as location_id,
        th.qty_after,
        th.transaction_date as last_transaction_date,
        th.transaction_type
      FROM tabTransactionHistory th
      LEFT JOIN tabStockTransaction st ON st.id = th.transaction_id
      WHERE th.item_code = ?
        AND th.warehouse = ?
        AND th.qty_after > 0
        AND (th.carton_id IS NOT NULL AND th.carton_id != '' OR st.carton_id IS NOT NULL AND st.carton_id != '')
      ORDER BY th.transaction_date DESC
      LIMIT 10
    `, ['SKU-HAT-301-BLU-OS', 'WH-MAIN']);

    console.log('\nJoined result:', rows.length, 'cartons:');
    console.log(JSON.stringify(rows, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.end();
  }
}

testCartonQuery();
