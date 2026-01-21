/**
 * stockMovementService.js
 * Unified stock movement service for putaway, relocation, and other operations
 * Ensures consistent stock updates across ASN and Transfer In
 */

import { logger } from '../utils/logger.js';

/**
 * Apply stock movement (putaway, relocation, merge, etc.)
 * Updates: tabCarton, tabCartonStock, tabStockLedger, tabTransactionHistory
 * 
 * @param {Connection} db - Database connection
 * @param {Object} params - Movement parameters
 * @param {string} params.transaction_type - Transaction type: 'Putaway', 'CARTON_RELOCATION', 'CARTON_MERGE'
 * @param {string} params.source_type - Source type: 'ASN', 'TransferIn', 'Relocation'
 * @param {string} params.source_doc - Source document: 'ASN-xxx', 'INSLIP-xxx', 'RL-xxx'
 * @param {string} params.warehouse - Warehouse code
 * @param {string} params.bin_location - Destination bin location
 * @param {string} params.carton_id - Carton ID (CTN-* format)
 * @param {Array} params.lines - Array of { item_code, qty }
 * @param {string} params.user_id - User ID
 * @param {string} [params.from_bin_location] - Source bin location (for moves)
 */
export async function applyStockMovement(db, {
  transaction_type,
  source_type,
  source_doc,
  warehouse,
  bin_location,
  carton_id,
  lines,
  user_id,
  from_bin_location = null
}) {
  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    logger.warn('[Stock Movement] No lines provided - skipping stock update');
    return;
  }

  try {
    // 1) Update carton location
    const [cartonColumns] = await db.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCarton'
        AND COLUMN_NAME IN ('warehouse', 'bin_location', 'location_id')
    `);
    const hasCartonWarehouse = cartonColumns.some(col => col.COLUMN_NAME === 'warehouse');
    const hasCartonBinLocation = cartonColumns.some(col => col.COLUMN_NAME === 'bin_location');
    const hasCartonLocationId = cartonColumns.some(col => col.COLUMN_NAME === 'location_id');

    if (carton_id) {
      const cartonUpdates = [];
      const cartonParams = [];

      if (hasCartonWarehouse && warehouse) {
        cartonUpdates.push('warehouse = ?');
        cartonParams.push(warehouse);
      }

      if (hasCartonBinLocation && bin_location) {
        cartonUpdates.push('bin_location = ?');
        cartonParams.push(bin_location);
      }

      if (hasCartonLocationId && bin_location) {
        cartonUpdates.push('location_id = ?');
        cartonParams.push(bin_location);
      }

      if (cartonUpdates.length > 0) {
        cartonParams.push(carton_id);
        await db.execute(
          `UPDATE tabCarton SET ${cartonUpdates.join(', ')}, updated_at = NOW() WHERE carton_id = ?`,
          cartonParams
        );
        logger.info(`[Stock Movement] Updated carton ${carton_id} location: ${bin_location}`);
      }
    }

    // 2) Update carton stock location
    const [cartonStockColumns] = await db.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCartonStock'
        AND COLUMN_NAME IN ('warehouse', 'bin_location', 'location_id')
    `);
    const hasCartonStockWarehouse = cartonStockColumns.some(col => col.COLUMN_NAME === 'warehouse');
    const hasCartonStockBinLocation = cartonStockColumns.some(col => col.COLUMN_NAME === 'bin_location');
    const hasCartonStockLocationId = cartonStockColumns.some(col => col.COLUMN_NAME === 'location_id');

    if (carton_id) {
      const cartonStockUpdates = [];
      const cartonStockParams = [];

      if (hasCartonStockWarehouse && warehouse) {
        cartonStockUpdates.push('warehouse = ?');
        cartonStockParams.push(warehouse);
      }

      if (hasCartonStockBinLocation && bin_location) {
        cartonStockUpdates.push('bin_location = ?');
        cartonStockParams.push(bin_location);
      }

      if (hasCartonStockLocationId && bin_location) {
        cartonStockUpdates.push('location_id = ?');
        cartonStockParams.push(bin_location);
      }

      if (cartonStockUpdates.length > 0) {
        cartonStockParams.push(carton_id);
        await db.execute(
          `UPDATE tabCartonStock SET ${cartonStockUpdates.join(', ')}, updated_at = NOW() WHERE carton_id = ?`,
          cartonStockParams
        );
        logger.info(`[Stock Movement] Updated carton stock ${carton_id} location: ${bin_location}`);
      }
    }

    // 3) Update stock ledger and transaction history per item
    for (const line of lines) {
      const { item_code, qty } = line;

      if (!item_code || qty === null || qty === undefined) {
        continue;
      }

      // 3a) Update stock ledger (increase at destination)
      await upsertStockLedger(db, {
        item_code,
        warehouse,
        bin_location,
        qty_change: qty,
        transaction_type,
        reference_doc: source_doc,
        carton_id
      });

      // 3b) Decrease from source location (if moving from staging)
      if (from_bin_location && from_bin_location !== bin_location) {
        await upsertStockLedger(db, {
          item_code,
          warehouse,
          bin_location: from_bin_location,
          qty_change: -qty, // Negative for decrease
          transaction_type,
          reference_doc: source_doc,
          carton_id
        });
      }

      // 3c) Insert transaction history (audit trail)
      await insertTransactionHistory(db, {
        transaction_type,
        reference_doc: source_doc,
        source_type,
        warehouse,
        bin_location,
        carton_id,
        item_code,
        qty_change: qty,
        stock_direction: 'IN',
        user_id,
        from_bin_location
      });
    }

    logger.info(`[Stock Movement] ✅ Applied ${transaction_type} for ${lines.length} item(s) at ${bin_location}`);

  } catch (error) {
    logger.error(`[Stock Movement] ❌ Error applying stock movement:`, error);
    throw error;
  }
}

/**
 * Upsert stock ledger entry
 * 
 * @param {Connection} db - Database connection
 * @param {Object} params - Ledger parameters
 */
async function upsertStockLedger(db, {
  item_code,
  warehouse,
  bin_location,
  qty_change,
  transaction_type,
  reference_doc,
  carton_id = null
}) {
  // Check which columns exist
  const [columns] = await db.execute(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabStockLedger'
      AND COLUMN_NAME IN ('item_code', 'warehouse', 'bin_location', 'qty', 'carton_id', 
                          'last_transaction_type', 'last_transaction_ref', 'last_transaction_date')
  `);

  const columnNames = new Set(columns.map(col => col.COLUMN_NAME));
  const hasCartonId = columnNames.has('carton_id');

  // Get current quantity
  const [current] = await db.execute(
    `SELECT qty FROM tabStockLedger 
     WHERE item_code = ? AND warehouse = ? AND bin_location = ?`,
    [item_code, warehouse, bin_location]
  );

  const currentQty = current.length > 0 ? parseFloat(current[0].qty || 0) : 0;
  const newQty = Math.max(0, currentQty + qty_change); // Prevent negative

  // Build INSERT/UPDATE query
  let insertFields = 'item_code, warehouse, bin_location, qty';
  let insertValues = '?, ?, ?, ?';
  let insertParams = [item_code, warehouse, bin_location, newQty];

  if (hasCartonId && carton_id) {
    insertFields += ', carton_id';
    insertValues += ', ?';
    insertParams.push(carton_id);
  }

  if (columnNames.has('last_transaction_type')) {
    insertFields += ', last_transaction_type, last_transaction_ref, last_transaction_date';
    insertValues += ', ?, ?, NOW()';
    insertParams.push(transaction_type, reference_doc);
  }

  let updateFields = 'qty = ?';
  let updateParams = [newQty];

  if (hasCartonId && carton_id) {
    updateFields += ', carton_id = ?';
    updateParams.push(carton_id);
  }

  if (columnNames.has('last_transaction_type')) {
    updateFields += ', last_transaction_type = ?, last_transaction_ref = ?, last_transaction_date = NOW()';
    updateParams.push(transaction_type, reference_doc);
  }

  await db.execute(
    `INSERT INTO tabStockLedger (${insertFields}, updated_at, created_at)
     VALUES (${insertValues}, NOW(), NOW())
     ON DUPLICATE KEY UPDATE ${updateFields}, updated_at = NOW()`,
    [...insertParams, ...updateParams]
  );

  logger.info(`[Stock Movement] Updated ledger: ${item_code} @ ${bin_location}: ${currentQty} → ${newQty} (${qty_change > 0 ? '+' : ''}${qty_change})`);
}

/**
 * Insert transaction history entry (audit trail)
 * 
 * @param {Connection} db - Database connection
 * @param {Object} row - Transaction history row
 */
async function insertTransactionHistory(db, row) {
  // Check which columns exist
  const [columns] = await db.execute(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabTransactionHistory'
      AND COLUMN_NAME IN (
        'transaction_number', 'transaction_date', 'transaction_type',
        'reference_doc_type', 'reference_doc',
        'warehouse', 'bin_location', 'location_id',
        'carton_id', 'item_code', 'qty_change', 'stock_direction',
        'performed_by', 'created_at', 'source_bin'
      )
  `);

  const columnNames = new Set(columns.map(col => col.COLUMN_NAME));

  const fields = [];
  const values = [];
  const params = [];

  // Required fields
  if (columnNames.has('transaction_number')) {
    fields.push('transaction_number');
    values.push('?');
    params.push(row.reference_doc || `TRX-${Date.now()}`);
  }

  if (columnNames.has('transaction_date')) {
    fields.push('transaction_date');
    values.push('NOW()');
  } else if (columnNames.has('created_at')) {
    fields.push('created_at');
    values.push('NOW()');
  }

  if (columnNames.has('transaction_type')) {
    fields.push('transaction_type');
    values.push('?');
    params.push(row.transaction_type);
  }

  if (columnNames.has('reference_doc_type')) {
    fields.push('reference_doc_type');
    values.push('?');
    params.push(row.source_type || 'Putaway');
  }

  if (columnNames.has('reference_doc')) {
    fields.push('reference_doc');
    values.push('?');
    params.push(row.reference_doc);
  }

  if (columnNames.has('warehouse') && row.warehouse) {
    fields.push('warehouse');
    values.push('?');
    params.push(row.warehouse);
  }

  // CRITICAL: Always include bin_location and location_id
  if (columnNames.has('bin_location') && row.bin_location) {
    fields.push('bin_location');
    values.push('?');
    params.push(row.bin_location);
  }

  if (columnNames.has('location_id') && row.bin_location) {
    fields.push('location_id');
    values.push('?');
    params.push(row.bin_location); // location_id = bin_location
  }

  if (columnNames.has('source_bin') && row.from_bin_location) {
    fields.push('source_bin');
    values.push('?');
    params.push(row.from_bin_location);
  }

  if (columnNames.has('carton_id') && row.carton_id) {
    fields.push('carton_id');
    values.push('?');
    params.push(row.carton_id);
  }

  if (columnNames.has('item_code') && row.item_code) {
    fields.push('item_code');
    values.push('?');
    params.push(row.item_code);
  }

  if (columnNames.has('qty_change')) {
    fields.push('qty_change');
    values.push('?');
    params.push(row.qty_change);
  }

  if (columnNames.has('stock_direction')) {
    fields.push('stock_direction');
    values.push('?');
    params.push(row.stock_direction || 'IN');
  }

  if (columnNames.has('performed_by')) {
    fields.push('performed_by');
    values.push('?');
    params.push(row.user_id || 'SYSTEM');
  }

  if (fields.length === 0) {
    logger.warn('[Stock Movement] No valid columns found for tabTransactionHistory - skipping audit trail');
    return;
  }

  await db.execute(
    `INSERT INTO tabTransactionHistory (${fields.join(', ')})
     VALUES (${values.join(', ')})`,
    params
  );

  logger.info(`[Stock Movement] ✅ Inserted audit trail: ${row.transaction_type} for ${row.item_code} @ ${row.bin_location}`);
}
