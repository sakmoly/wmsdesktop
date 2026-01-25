import { getConnection } from './src/db/connection.js';

/**
 * Rebuild Stock Ledger from Transaction History
 * 
 * This tool regenerates the stock ledger from transaction history,
 * ensuring it matches the correct current stock based on all transactions.
 * 
 * Usage:
 *   node rebuild-stock-ledger-from-history.js [--dry-run] [--warehouse WAREHOUSE] [--item ITEM_CODE]
 */

async function rebuildStockLedger(options = {}) {
  const { dryRun = false, warehouse = null, itemCode = null } = options;
  const connection = await getConnection();

  try {
    console.log('=== Rebuilding Stock Ledger from Transaction History ===\n');
    console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (will update database)'}`);
    
    // Get default warehouse from tabWarehouse if not provided
    let actualWarehouse = warehouse;
    if (!actualWarehouse) {
      try {
        const [warehouseRows] = await connection.execute(`
          SELECT code
          FROM tabWarehouse
          WHERE warehouse_type = 'warehouse'
          ORDER BY code
          LIMIT 1
        `);
        
        if (warehouseRows.length > 0) {
          actualWarehouse = warehouseRows[0].code;
          console.log(`Using default warehouse from tabWarehouse: ${actualWarehouse}`);
        } else {
          // Fallback to WH-MAIN if no warehouse found in tabWarehouse
          actualWarehouse = 'WH-MAIN';
          console.log(`No warehouse found in tabWarehouse, using default: ${actualWarehouse}`);
        }
      } catch (whError) {
        // If tabWarehouse doesn't exist or query fails, use WH-MAIN as fallback
        actualWarehouse = 'WH-MAIN';
        console.log(`Could not query tabWarehouse, using default: ${actualWarehouse}`);
      }
    }
    
    if (actualWarehouse) console.log(`Warehouse filter: ${actualWarehouse}`);
    if (itemCode) console.log(`Item filter: ${itemCode}`);
    console.log('');

    // Check if tabTransactionHistory table exists
    const [historyTable] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabTransactionHistory'
    `);

    if (historyTable.length === 0) {
      console.error('❌ ERROR: tabTransactionHistory table does not exist.');
      console.error('   Please run the transaction history setup script first.');
      return;
    }

    // Check if carton_id column exists in tabStockLedger
    const [cartonIdColumn] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabStockLedger'
      AND COLUMN_NAME = 'carton_id'
    `);

    const hasCartonId = cartonIdColumn.length > 0;
    console.log(`Carton ID support: ${hasCartonId ? '✅ Enabled' : '❌ Not available'}`);
    console.log('');

    // Build WHERE clause for filtering
    let whereClause = '1=1';
    const params = [];

    // Always filter by warehouse (use default if not provided)
    if (actualWarehouse) {
      whereClause += ' AND warehouse = ?';
      params.push(actualWarehouse);
    }

    if (itemCode) {
      whereClause += ' AND item_code = ?';
      params.push(itemCode);
    }

    // Get all unique combinations from transaction history
    // Group by: warehouse, bin_location, item_code, carton_id (if available)
    const cartonIdSelect = hasCartonId ? 'carton_id' : 'NULL as carton_id';
    const cartonIdGroupBy = hasCartonId ? ', carton_id' : '';
    const cartonIdJoin = hasCartonId ? 'AND (th.carton_id = sl.carton_id OR (th.carton_id IS NULL AND sl.carton_id IS NULL))' : '';
    const cartonIdOrderBy = hasCartonId ? ', carton_id' : '';

    const [combinations] = await connection.execute(`
      SELECT DISTINCT
        warehouse,
        COALESCE(bin_location, location_id) as bin_location,
        item_code,
        ${cartonIdSelect}
      FROM tabTransactionHistory
      WHERE ${whereClause}
      ORDER BY warehouse, item_code, bin_location${cartonIdOrderBy}
    `, params);

    console.log(`Found ${combinations.length} unique location+item${hasCartonId ? '+carton' : ''} combinations\n`);

    if (combinations.length === 0) {
      console.log('No transactions found. Nothing to rebuild.');
      return;
    }

    let processed = 0;
    let created = 0;
    let updated = 0;
    let errors = 0;

    // Process each combination
    for (const combo of combinations) {
      try {
        processed++;

        // Get the latest transaction for this combination to get last_transaction info
        const [latestTx] = await connection.execute(`
          SELECT 
            transaction_type,
            reference_doc,
            transaction_date,
            performed_by
          FROM tabTransactionHistory
          WHERE warehouse = ?
            AND COALESCE(bin_location, location_id) = ?
            AND item_code = ?
            ${hasCartonId ? 'AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))' : ''}
            AND ${whereClause}
          ORDER BY transaction_date DESC, id DESC
          LIMIT 1
        `, [
          combo.warehouse,
          combo.bin_location,
          combo.item_code,
          ...(hasCartonId ? [combo.carton_id, combo.carton_id] : []),
          ...params
        ]);

        // Calculate current stock by summing all qty_change
        const [stockCalc] = await connection.execute(`
          SELECT 
            SUM(qty_change) as total_qty_change,
            MAX(qty_after) as latest_qty_after
          FROM tabTransactionHistory
          WHERE warehouse = ?
            AND COALESCE(bin_location, location_id) = ?
            AND item_code = ?
            ${hasCartonId ? 'AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))' : ''}
            AND ${whereClause}
        `, [
          combo.warehouse,
          combo.bin_location,
          combo.item_code,
          ...(hasCartonId ? [combo.carton_id, combo.carton_id] : []),
          ...params
        ]);

        const totalQtyChange = parseFloat(stockCalc[0].total_qty_change) || 0;
        const latestQtyAfter = parseFloat(stockCalc[0].latest_qty_after) || 0;

        // Use latest_qty_after as the source of truth (it's calculated correctly in transaction history)
        const currentQty = latestQtyAfter;

        // Get current reserved_qty from existing ledger entry (if any)
        const [existingLedger] = await connection.execute(`
          SELECT reserved_qty
          FROM tabStockLedger
          WHERE warehouse = ?
            AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
            AND item_code = ?
            ${hasCartonId ? cartonIdJoin : ''}
        `, [
          combo.warehouse,
          combo.bin_location,
          combo.bin_location,
          combo.item_code,
          ...(hasCartonId ? [combo.carton_id, combo.carton_id] : [])
        ]);

        const reservedQty = existingLedger.length > 0 
          ? parseFloat(existingLedger[0].reserved_qty) || 0 
          : 0;

        // Get qty_before and qty_reduced from latest transaction
        const [latestTxDetails] = await connection.execute(`
          SELECT qty_before, qty_change
          FROM tabTransactionHistory
          WHERE warehouse = ?
            AND COALESCE(bin_location, location_id) = ?
            AND item_code = ?
            ${hasCartonId ? 'AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))' : ''}
            AND ${whereClause}
          ORDER BY transaction_date DESC, id DESC
          LIMIT 1
        `, [
          combo.warehouse,
          combo.bin_location,
          combo.item_code,
          ...(hasCartonId ? [combo.carton_id, combo.carton_id] : []),
          ...params
        ]);

        const qtyBefore = latestTxDetails.length > 0 
          ? parseFloat(latestTxDetails[0].qty_before) || null 
          : null;
        const qtyReduced = latestTxDetails.length > 0 
          ? parseFloat(latestTxDetails[0].qty_change) || null 
          : null;

        const lastTransactionType = latestTx.length > 0 ? latestTx[0].transaction_type : null;
        const lastTransactionRef = latestTx.length > 0 ? latestTx[0].reference_doc : null;
        const lastTransactionDate = latestTx.length > 0 ? latestTx[0].transaction_date : null;

        // Build INSERT/UPDATE query
        let insertFields = 'item_code, warehouse, bin_location, qty, reserved_qty';
        let insertValues = '?, ?, ?, ?, ?';
        let insertParams = [
          combo.item_code,
          combo.warehouse,
          combo.bin_location,
          currentQty,
          reservedQty
        ];

        let updateFields = 'qty = ?, reserved_qty = ?';
        let updateParams = [currentQty, reservedQty];

        // Add optional fields if columns exist
        const [hasQtyBefore] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabStockLedger'
          AND COLUMN_NAME = 'qty_before'
        `);

        if (hasQtyBefore.length > 0 && qtyBefore !== null) {
          insertFields += ', qty_before';
          insertValues += ', ?';
          insertParams.push(qtyBefore);
          updateFields += ', qty_before = ?';
          updateParams.push(qtyBefore);
        }

        const [hasQtyReduced] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabStockLedger'
          AND COLUMN_NAME = 'qty_reduced'
        `);

        if (hasQtyReduced.length > 0 && qtyReduced !== null) {
          insertFields += ', qty_reduced';
          insertValues += ', ?';
          insertParams.push(qtyReduced);
          updateFields += ', qty_reduced = ?';
          updateParams.push(qtyReduced);
        }

        if (hasCartonId && combo.carton_id) {
          insertFields += ', carton_id';
          insertValues += ', ?';
          insertParams.push(combo.carton_id);
          updateFields += ', carton_id = ?';
          updateParams.push(combo.carton_id);
        }

        insertFields += ', last_transaction_date, last_transaction_type, last_transaction_ref, updated_at, created_at';
        insertValues += ', ?, ?, ?, NOW(), NOW()';
        insertParams.push(
          lastTransactionDate,
          lastTransactionType,
          lastTransactionRef
        );

        updateFields += ', last_transaction_date = ?, last_transaction_type = ?, last_transaction_ref = ?, updated_at = NOW()';
        updateParams.push(
          lastTransactionDate,
          lastTransactionType,
          lastTransactionRef
        );

        if (!dryRun) {
          // Check if record exists
          const [existing] = await connection.execute(`
            SELECT id FROM tabStockLedger
            WHERE warehouse = ?
              AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
              AND item_code = ?
              ${hasCartonId ? cartonIdJoin : ''}
          `, [
            combo.warehouse,
            combo.bin_location,
            combo.bin_location,
            combo.item_code,
            ...(hasCartonId ? [combo.carton_id, combo.carton_id] : [])
          ]);

          if (existing.length > 0) {
            updated++;
          } else {
            created++;
          }

          await connection.execute(`
            INSERT INTO tabStockLedger (${insertFields})
            VALUES (${insertValues})
            ON DUPLICATE KEY UPDATE ${updateFields}
          `, [...insertParams, ...updateParams]);
        }

        if (processed % 100 === 0) {
          console.log(`Processed ${processed}/${combinations.length} combinations...`);
        }

      } catch (error) {
        errors++;
        console.error(`Error processing ${combo.warehouse}/${combo.bin_location}/${combo.item_code}${hasCartonId ? `/${combo.carton_id}` : ''}:`, error.message);
      }
    }

    console.log('\n=== Rebuild Summary ===');
    console.log(`Total combinations processed: ${processed}`);
    if (!dryRun) {
      console.log(`Records created: ${created}`);
      console.log(`Records updated: ${updated}`);
    }
    console.log(`Errors: ${errors}`);

    if (dryRun) {
      console.log('\n⚠️  DRY RUN MODE: No changes were made to the database.');
      console.log('   Run without --dry-run to apply changes.');
    } else {
      console.log('\n✅ Stock ledger rebuild completed!');
    }

  } catch (error) {
    console.error('Fatal error:', error);
    throw error;
  } finally {
    await connection.release();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  warehouse: args.includes('--warehouse') ? args[args.indexOf('--warehouse') + 1] : null,
  itemCode: args.includes('--item') ? args[args.indexOf('--item') + 1] : null
};

// Run rebuild
rebuildStockLedger(options).catch(console.error);
