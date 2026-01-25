import { getConnection } from './src/db/connection.js';

async function checkStockLedger() {
  const connection = await getConnection();

  try {
    console.log('=== Checking Stock Ledger for MR-0003 ===\n');

    // Check tabStockLedger
    console.log('1. tabStockLedger entries for A1-R02-L2-B2:');
    const [ledgerRows] = await connection.execute(`
      SELECT item_code, qty, last_transaction_ref, last_transaction_type, last_transaction_date
      FROM tabStockLedger
      WHERE bin_location = 'A1-R02-L2-B2'
        AND last_transaction_ref = 'MR-0003'
      ORDER BY item_code
    `);
    console.table(ledgerRows);

    // Check tabTransactionHistory
    console.log('\n2. tabTransactionHistory entries for MR-0003 at A1-R02-L2-B2:');
    const [historyRows] = await connection.execute(`
      SELECT item_code, carton_id, qty_before, qty_change, qty_after, reference_doc, transaction_type, transaction_date
      FROM tabTransactionHistory
      WHERE reference_doc = 'MR-0003'
        AND (bin_location = 'A1-R02-L2-B2' OR location_id = 'A1-R02-L2-B2')
      ORDER BY item_code, carton_id
    `);
    console.table(historyRows);

    // Check if there are multiple cartons per item
    console.log('\n3. Aggregated by item_code:');
    const [aggregated] = await connection.execute(`
      SELECT 
        item_code,
        COUNT(*) as record_count,
        SUM(qty_change) as total_qty_change,
        MAX(qty_before) as max_qty_before,
        MAX(qty_after) as max_qty_after
      FROM tabTransactionHistory
      WHERE reference_doc = 'MR-0003'
        AND (bin_location = 'A1-R02-L2-B2' OR location_id = 'A1-R02-L2-B2')
      GROUP BY item_code
      ORDER BY item_code
    `);
    console.table(aggregated);

    // Simulate the JOIN query
    console.log('\n4. Simulating Stock Ledger JOIN query:');
    const [joinRows] = await connection.execute(`
      SELECT 
        sl.item_code,
        sl.qty as ledger_qty,
        sl.last_transaction_ref,
        sl.last_transaction_type,
        sl.last_transaction_date,
        th.qty_before,
        th.qty_change,
        th.carton_id,
        COUNT(*) as matching_records
      FROM tabStockLedger sl
      LEFT JOIN tabTransactionHistory th ON 
        th.item_code = sl.item_code
        AND (th.bin_location = sl.bin_location OR th.location_id = sl.bin_location)
        AND th.reference_doc = sl.last_transaction_ref
        AND th.transaction_type = sl.last_transaction_type
        AND DATE(th.transaction_date) = DATE(sl.last_transaction_date)
        AND th.warehouse = sl.warehouse
      WHERE sl.bin_location = 'A1-R02-L2-B2'
        AND sl.last_transaction_ref = 'MR-0003'
      GROUP BY sl.item_code, th.carton_id
      ORDER BY sl.item_code, th.carton_id
    `);
    console.table(joinRows);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.end();
  }
}

checkStockLedger();
