import { getConnection } from './src/db/connection.js';

async function checkMismatch() {
  const connection = await getConnection();

  try {
    console.log('=== Checking Stock Ledger vs Transaction History ===\n');

    // Get a sample item and location from Stock Ledger
    const [ledgerRows] = await connection.execute(`
      SELECT 
        sl.item_code,
        sl.warehouse,
        sl.bin_location,
        sl.qty,
        sl.last_transaction_ref,
        sl.last_transaction_type,
        sl.last_transaction_date
      FROM tabStockLedger sl
      INNER JOIN (
        SELECT 
          item_code,
          warehouse,
          bin_location,
          MAX(last_transaction_date) as max_date
        FROM tabStockLedger
        GROUP BY item_code, warehouse, bin_location
      ) latest ON sl.item_code = latest.item_code
        AND sl.warehouse = latest.warehouse
        AND (sl.bin_location = latest.bin_location OR (sl.bin_location IS NULL AND latest.bin_location IS NULL))
        AND sl.last_transaction_date = latest.max_date
      WHERE sl.last_transaction_ref IS NOT NULL
      ORDER BY sl.last_transaction_date DESC
      LIMIT 5
    `);

    if (ledgerRows.length === 0) {
      console.log('No Stock Ledger entries found');
      return;
    }

    for (const ledger of ledgerRows) {
      console.log(`\n--- Item: ${ledger.item_code}, Location: ${ledger.bin_location}, Ref: ${ledger.last_transaction_ref} ---`);
      
      // Get aggregated Transaction History for this item+location+reference
      const [historyRows] = await connection.execute(`
        SELECT 
          item_code,
          warehouse,
          COALESCE(bin_location, location_id) as bin_location,
          reference_doc,
          transaction_type,
          DATE(transaction_date) as transaction_date,
          MAX(qty_before) as qty_before,
          SUM(qty_change) as qty_change,
          MAX(qty_after) as qty_after,
          COUNT(*) as record_count
        FROM tabTransactionHistory
        WHERE item_code = ?
          AND warehouse = ?
          AND (bin_location = ? OR location_id = ?)
          AND reference_doc = ?
          AND transaction_type = ?
          AND DATE(transaction_date) = DATE(?)
        GROUP BY item_code, warehouse, COALESCE(bin_location, location_id), reference_doc, transaction_type, DATE(transaction_date)
      `, [
        ledger.item_code,
        ledger.warehouse,
        ledger.bin_location,
        ledger.bin_location,
        ledger.last_transaction_ref,
        ledger.last_transaction_type,
        ledger.last_transaction_date
      ]);

      console.log('Stock Ledger:');
      console.log(`  Qty (current stock): ${ledger.qty}`);
      console.log(`  Last Transaction: ${ledger.last_transaction_type} - ${ledger.last_transaction_ref}`);
      console.log(`  Last Transaction Date: ${ledger.last_transaction_date}`);

      if (historyRows.length > 0) {
        const history = historyRows[0];
        console.log('\nTransaction History (Aggregated):');
        console.log(`  Qty Before: ${history.qty_before}`);
        console.log(`  Qty Change: ${history.qty_change}`);
        console.log(`  Qty After: ${history.qty_after}`);
        console.log(`  Record Count: ${history.record_count}`);
        
        // Calculate expected qty_after
        const expectedQtyAfter = (parseFloat(history.qty_before) || 0) + (parseFloat(history.qty_change) || 0);
        console.log(`\nExpected Qty After (qty_before + qty_change): ${expectedQtyAfter}`);
        console.log(`Actual Stock Ledger Qty: ${ledger.qty}`);
        
        if (Math.abs(expectedQtyAfter - parseFloat(ledger.qty)) > 0.01) {
          console.log(`\n❌ MISMATCH: Expected ${expectedQtyAfter}, but Stock Ledger shows ${ledger.qty}`);
        } else {
          console.log(`\n✅ MATCH: Stock Ledger matches Transaction History`);
        }
      } else {
        console.log('\n⚠️  No matching Transaction History found');
        
        // Check if there are any transaction history records for this item+location
        const [anyHistory] = await connection.execute(`
          SELECT COUNT(*) as count
          FROM tabTransactionHistory
          WHERE item_code = ?
            AND warehouse = ?
            AND (bin_location = ? OR location_id = ?)
        `, [
          ledger.item_code,
          ledger.warehouse,
          ledger.bin_location,
          ledger.bin_location
        ]);
        
        console.log(`  (Total Transaction History records for this item+location: ${anyHistory[0].count})`);
      }

      // Check individual transaction history records
      const [individualHistory] = await connection.execute(`
        SELECT 
          transaction_type,
          reference_doc,
          qty_before,
          qty_change,
          qty_after,
          carton_id,
          transaction_date
        FROM tabTransactionHistory
        WHERE item_code = ?
          AND warehouse = ?
          AND (bin_location = ? OR location_id = ?)
          AND reference_doc = ?
          AND transaction_type = ?
          AND DATE(transaction_date) = DATE(?)
        ORDER BY transaction_date
      `, [
        ledger.item_code,
        ledger.warehouse,
        ledger.bin_location,
        ledger.bin_location,
        ledger.last_transaction_ref,
        ledger.last_transaction_type,
        ledger.last_transaction_date
      ]);

      if (individualHistory.length > 0) {
        console.log(`\nIndividual Transaction History Records (${individualHistory.length}):`);
        individualHistory.forEach((tx, idx) => {
          console.log(`  ${idx + 1}. ${tx.transaction_type} - ${tx.reference_doc} - Carton: ${tx.carton_id || 'NULL'}`);
          console.log(`     Qty Before: ${tx.qty_before}, Change: ${tx.qty_change}, After: ${tx.qty_after}`);
        });
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await connection.end();
  }
}

checkMismatch();
