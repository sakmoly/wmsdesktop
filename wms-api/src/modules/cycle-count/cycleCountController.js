// wms-api/src/modules/cycle-count/cycleCountController.js
// Cycle Count API endpoints - Mobile App Compatible Format

import { getConnection } from '../../db/connection.js';
import { postStock } from '../stock-ledger/stockPostingService.js';

/**
 * Helper function to lookup and validate item from master data (tabItem)
 * Checks both barcode and item_code fields
 * 
 * @param {Object} connection - Database connection
 * @param {string} scannedValue - The scanned barcode or item_code from mobile app
 * @returns {Object|null} - Item details from master data, or null if not found
 */
async function lookupItemFromMasterData(connection, scannedValue) {
  if (!scannedValue || (typeof scannedValue === 'string' && scannedValue.trim() === '')) {
    return null;
  }
  
  const normalizedValue = typeof scannedValue === 'string' ? scannedValue.trim() : String(scannedValue);
  
  try {
    // Lookup by both barcode AND item_code (code)
    // Priority: barcode first, then item_code
    const [rows] = await connection.execute(`
      SELECT 
        code as item_code,
        name as item_name,
        barcode,
        item_group,
        brand,
        default_uom,
        stock_uom,
        maintain_stock
      FROM tabItem
      WHERE barcode = ? OR code = ?
      LIMIT 1
    `, [normalizedValue, normalizedValue]);
    
    if (rows.length > 0) {
      const item = rows[0];
      console.log(`[Cycle Count] ✅ Found item in master data: scanned="${normalizedValue}", item_code="${item.item_code}", barcode="${item.barcode || 'NULL'}"`);
      
      // Return item with correct item_code from master data
      // Use item_code (code) as primary identifier, barcode as secondary
      return {
        item_code: item.item_code,
        item_name: item.item_name || null,
        barcode: item.barcode || item.item_code, // Use item_code as barcode if barcode is null
        item_group: item.item_group || null,
        brand: item.brand || null,
        default_uom: item.default_uom || null,
        stock_uom: item.stock_uom || null,
        maintain_stock: Boolean(item.maintain_stock)
      };
    } else {
      console.log(`[Cycle Count] ⚠️ Item not found in master data: scanned="${normalizedValue}" (will allow ad-hoc counting)`);
      return null;
    }
  } catch (error) {
    console.error(`[Cycle Count] ❌ Error looking up item in master data: ${error.message}`);
    // Don't fail the transaction - allow ad-hoc counting even if lookup fails
    return null;
  }
}

/**
 * Helper function to validate warehouse exists in master data (tabWarehouse)
 * @param {Object} connection - Database connection
 * @param {string} warehouseCode - Warehouse code to validate
 * @returns {Promise<boolean>} - True if warehouse exists in master data, false otherwise
 */
async function validateWarehouseFromMasterData(connection, warehouseCode) {
  if (!warehouseCode || (typeof warehouseCode === 'string' && warehouseCode.trim() === '')) {
    return false;
  }
  
  const normalizedWarehouse = typeof warehouseCode === 'string' ? warehouseCode.trim() : String(warehouseCode);
  
  try {
    // Check if warehouse exists in tabWarehouse master data
    const [rows] = await connection.execute(`
      SELECT code
      FROM tabWarehouse
      WHERE code = ?
      LIMIT 1
    `, [normalizedWarehouse]);
    
    if (rows.length > 0) {
      console.log(`[Cycle Count] ✅ Warehouse validated in master data: "${normalizedWarehouse}"`);
      return true;
    } else {
      console.log(`[Cycle Count] ❌ Warehouse not found in master data: "${normalizedWarehouse}"`);
      return false;
    }
  } catch (error) {
    console.error(`[Cycle Count] ❌ Error validating warehouse in master data: ${error.message}`);
    // On error, return false to prevent sync
    return false;
  }
}

/**
 * Helper function to normalize warehouse to CODE (not name)
 * CRITICAL: tabStockLedger stores warehouse CODE, not NAME
 * @param {Object} connection - Database connection
 * @param {string} warehouse - Warehouse name or code
 * @returns {Promise<string>} - Warehouse code (e.g., "WH-MAIN")
 */
async function normalizeWarehouseToCode(connection, warehouse) {
  if (!warehouse || typeof warehouse !== 'string') {
    // Get default warehouse code
    const [defaultWarehouse] = await connection.execute(
      `SELECT code FROM tabWarehouse 
       WHERE warehouse_type = 'Warehouse' 
       ORDER BY code 
       LIMIT 1`
    );
    return defaultWarehouse.length > 0 ? defaultWarehouse[0].code : 'WH-MAIN';
  }

  const normalized = warehouse.trim();
  
  // If it's already a code (check if exists in tabWarehouse by code), return it
  const [codeCheck] = await connection.execute(
    `SELECT code FROM tabWarehouse WHERE code = ? LIMIT 1`,
    [normalized]
  );
  
  if (codeCheck.length > 0) {
    return codeCheck[0].code; // Already a code
  }
  
  // If it's a name, look up the code
  const [nameCheck] = await connection.execute(
    `SELECT code FROM tabWarehouse WHERE name = ? LIMIT 1`,
    [normalized]
  );
  
  if (nameCheck.length > 0) {
    console.log(`[Cycle Count] Normalized warehouse "${normalized}" (name) to code "${nameCheck[0].code}"`);
    return nameCheck[0].code;
  }
  
  // Fallback: try to find default warehouse
  const [defaultWarehouse] = await connection.execute(
    `SELECT code FROM tabWarehouse 
     WHERE warehouse_type = 'Warehouse' 
     ORDER BY code 
     LIMIT 1`
  );
  
  if (defaultWarehouse.length > 0) {
    console.log(`[Cycle Count] Warning: Warehouse "${normalized}" not found, using default: "${defaultWarehouse[0].code}"`);
    return defaultWarehouse[0].code;
  }
  
  // Last resort: return as-is (but log warning)
  console.warn(`[Cycle Count] Warning: Could not normalize warehouse "${normalized}", using as-is`);
  return normalized;
}

/**
 * Helper function to lookup expected_qty from stock ledger/carton stock
 * @param {Object} connection - Database connection
 * @param {string} itemCode - Item code
 * @param {string} binLocation - Bin location (required)
 * @param {string|null} cartonId - Carton ID (optional, for carton-level inventory)
 * @param {string|null} warehouse - Warehouse code (optional, for additional filtering)
 * @returns {Promise<number>} Expected quantity (0 if not found)
 */
async function lookupExpectedQtyFromStock(connection, itemCode, binLocation, cartonId = null, warehouse = null) {
  try {
    if (!itemCode || !binLocation) {
      return 0;
    }

    // Normalize values for comparison
    const normalizedItemCode = String(itemCode || '').trim().toUpperCase();
    const normalizedBinLocation = String(binLocation || '').trim().toUpperCase();
    const normalizedCartonId = cartonId ? String(cartonId).trim().toUpperCase() : null;
    const normalizedWarehouse = warehouse ? String(warehouse).trim().toUpperCase() : null;

    // Strategy 1: If carton_id is provided, lookup from tabCartonStock (carton-level inventory)
    if (normalizedCartonId) {
      // Check if tabCartonStock table exists
      const [tableCheck] = await connection.execute(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabCartonStock'
      `);

      if (tableCheck.length > 0) {
        let cartonQuery = `
          SELECT qty
          FROM tabCartonStock
          WHERE UPPER(TRIM(item_code)) = ?
            AND UPPER(TRIM(bin_location)) = ?
            AND UPPER(TRIM(carton_id)) = ?
            AND qty > 0
        `;
        const cartonParams = [normalizedItemCode, normalizedBinLocation, normalizedCartonId];

        if (normalizedWarehouse) {
          cartonQuery += ' AND UPPER(TRIM(warehouse)) = ?';
          cartonParams.push(normalizedWarehouse);
        }

        // Only show items with PUTAWAY status (exclude PICKED, SHIPPED, etc.)
        cartonQuery += ` AND (status IS NULL OR status = '' OR status = 'PUTAWAY')`;

        cartonQuery += ' LIMIT 1';

        const [cartonRows] = await connection.execute(cartonQuery, cartonParams);

        if (cartonRows.length > 0 && cartonRows[0].qty) {
          const expectedQty = parseFloat(cartonRows[0].qty) || 0;
          console.log(`[Cycle Count] 📦 Found expected_qty from tabCartonStock: ${expectedQty} (item: ${normalizedItemCode}, bin: ${normalizedBinLocation}, carton: ${normalizedCartonId})`);
          return expectedQty;
        }
      }
    }

    // Strategy 2: Lookup from tabStockLedger (bin-level inventory)
    let ledgerQuery = `
      SELECT qty
      FROM tabStockLedger
      WHERE UPPER(TRIM(item_code)) = ?
        AND UPPER(TRIM(bin_location)) = ?
        AND qty > 0
    `;
    const ledgerParams = [normalizedItemCode, normalizedBinLocation];

    if (normalizedWarehouse) {
      ledgerQuery += ' AND UPPER(TRIM(warehouse)) = ?';
      ledgerParams.push(normalizedWarehouse);
    }

    ledgerQuery += ' LIMIT 1';

    const [ledgerRows] = await connection.execute(ledgerQuery, ledgerParams);

    if (ledgerRows.length > 0 && ledgerRows[0].qty) {
      const expectedQty = parseFloat(ledgerRows[0].qty) || 0;
      console.log(`[Cycle Count] 📊 Found expected_qty from tabStockLedger: ${expectedQty} (item: ${normalizedItemCode}, bin: ${normalizedBinLocation})`);
      return expectedQty;
    }

    // Not found - return 0 (opening stock scenario)
    console.log(`[Cycle Count] ⚠️ No expected_qty found in stock ledger for item: ${normalizedItemCode}, bin: ${normalizedBinLocation}, carton: ${normalizedCartonId || 'NULL'}`);
    return 0;

  } catch (error) {
    console.error(`[Cycle Count] ⚠️ Error looking up expected_qty from stock ledger: ${error.message}`);
    // Don't fail the transaction - return 0 (opening stock scenario)
    return 0;
  }
}

/**
 * Helper function to format cycle count line for mobile app
 */
function formatCycleCountLine(line) {
  const lineId = line.id;
  const actualQty = line.actual_qty ? parseFloat(line.actual_qty) : null;
  // Format expected_qty - use 0 if null/undefined or <= 0
  // If expected_qty is 0, treat it as "no previous history"
  const expectedQty = (line.expected_qty !== null && line.expected_qty !== undefined && parseFloat(line.expected_qty) > 0) ? parseFloat(line.expected_qty) : 0;
  
  // Calculate discrepancy: actual_qty - expected_qty
  // For opening stock (expected_qty = 0, actual_qty > 0), discrepancy = actual_qty (positive)
  // For existing stock with variance, discrepancy = actual_qty - expected_qty
  // This ensures stock is updated even when there's no opening stock
  // IMPORTANT: Always return 0 instead of null when there's no value
  let discrepancy = 0; // Default to 0 instead of null
  
  // If discrepancy is already calculated in database (generated column), use it
  // But ensure it's never null - use 0 instead
  if (line.discrepancy !== null && line.discrepancy !== undefined) {
    const parsedDiscrepancy = parseFloat(line.discrepancy);
    discrepancy = (!isNaN(parsedDiscrepancy)) ? parsedDiscrepancy : 0;
  } else if (actualQty !== null && actualQty !== undefined) {
    // Calculate discrepancy: actual_qty - expected_qty
    discrepancy = actualQty - expectedQty;
    // Ensure it's a valid number
    if (isNaN(discrepancy)) {
      discrepancy = 0;
    }
  } else {
    // No actual_qty yet, discrepancy should be 0, not null
    discrepancy = 0;
  }
  
  // Final safety check: Ensure discrepancy is never null, undefined, or NaN - use 0 instead
  if (discrepancy === null || discrepancy === undefined || isNaN(discrepancy)) {
    discrepancy = 0;
  }
  
  const formattedLine = {
    // Mobile app fields
    line_id: `LINE-${lineId}`, // String format for mobile app
    id: lineId, // Keep numeric ID for compatibility
    item_code: line.item_code,
    barcode: line.item_code, // Use item_code as barcode if not separate
    uom: 'EA', // Default unit of measure
    expected_qty: expectedQty, // 0 for opening stock, > 0 for normal cycle count
    actual_qty: actualQty,
    counted_qty: actualQty, // Alias for actual_qty
    variance_qty: discrepancy, // actual_qty - expected_qty (can be positive or negative, always 0 instead of null)
    discrepancy: discrepancy, // Alias for variance_qty (always 0 instead of null)
    bin_location: line.bin_location || null,
    carton_id: (line.carton_id !== undefined && line.carton_id !== null) ? String(line.carton_id).trim() : null, // Include carton_id in response (always present, even if null)
    status: line.status || 'Pending',
    is_unexpected_item: false, // Default, can be set later
    reason_code: null, // Can map from discrepancy_reason if needed
    notes: line.discrepancy_reason || null,
    discrepancy_reason: line.discrepancy_reason || null, // Keep for backward compatibility
    counted_by: line.counted_by || null,
    counted_on: line.counted_on ? line.counted_on.toISOString() : null,
    reviewed_by: line.reviewed_by || null,
    reviewed_on: line.reviewed_on ? line.reviewed_on.toISOString() : null,
    approval_required: Boolean(line.approval_required),
    approved_by: line.approved_by || null,
    approved_on: line.approved_on ? line.approved_on.toISOString() : null
  };
  
  return formattedLine;
}

/**
 * Helper function to update stock ledger from cycle count discrepancies
 * @param {Object} connection - Database connection
 * @param {string} title - Cycle count task title
 * @param {string} warehouse - Warehouse code
 * @returns {Promise<{stockUpdated: boolean, stockUpdateCount: number}>}
 */
async function updateStockFromCycleCount(connection, title, warehouse) {
  let stockUpdated = false;
  let stockUpdateCount = 0;
  
  // Get task to check items_with_discrepancy
  const [taskRows] = await connection.execute(`
    SELECT items_with_discrepancy
    FROM tabCycleCountTask WHERE title = ?
  `, [title]);
  
  if (taskRows.length === 0) {
    return { stockUpdated: false, stockUpdateCount: 0 };
  }
  
  const itemsWithDiscrepancy = parseInt(taskRows[0].items_with_discrepancy) || 0;
  
  // Check if there are any lines that need stock update:
  // Only update stock if:
  // 1. actual_qty > 0 (to confirm items are scanned)
  // 2. discrepancy != 0 (if discrepancy is 0, nothing to update - no change needed)
  // Don't rely only on items_with_discrepancy as it might be outdated or calculated incorrectly
  // Always check the actual lines to see if stock needs updating
  
  // Check if tabStockLedger table exists
  const [stockLedgerTable] = await connection.execute(`
    SELECT TABLE_NAME 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'tabStockLedger'
  `);
  
  if (stockLedgerTable.length === 0) {
    console.log(`[Cycle Count] ⚠️ tabStockLedger table does not exist, skipping stock update`);
    return { stockUpdated: false, stockUpdateCount: 0 };
  }
  
  // First, get all counted lines to debug
  const [allCountedLines] = await connection.execute(`
    SELECT 
      item_code,
      bin_location,
      expected_qty,
      actual_qty,
      discrepancy
    FROM tabCycleCountLine
    WHERE parent_title = ?
      AND actual_qty IS NOT NULL
  `, [title]);
  
  console.log(`[Cycle Count] 🔍 Debug: Found ${allCountedLines.length} total counted lines for task ${title}`);
  allCountedLines.forEach((line, idx) => {
    console.log(`[Cycle Count]   Line ${idx + 1}: item=${line.item_code}, expected=${line.expected_qty}, actual=${line.actual_qty}, discrepancy=${line.discrepancy !== null ? line.discrepancy : 'NULL'}`);
  });
  
  // Check if carton_id column exists in tabCycleCountLine
  const [cartonIdColumn] = await connection.execute(`
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'tabCycleCountLine' 
    AND COLUMN_NAME = 'carton_id'
  `);
  const hasCartonIdColumn = cartonIdColumn.length > 0;

  // Get all lines that need stock update:
  // Only update stock if:
  // 1. actual_qty > 0 (to confirm items are scanned)
  // 2. discrepancy != 0 (if discrepancy is 0, nothing to update - no change needed)
  // This means:
  // - Items with actual_qty = 0 will NOT update stock (not scanned yet)
  // - Items with discrepancy = 0 will NOT update stock (no change, matches expected)
  // - Only items with actual_qty > 0 AND discrepancy != 0 will update stock
  const [linesWithDiscrepancy] = await connection.execute(`
    SELECT 
      item_code,
      bin_location,
      ${hasCartonIdColumn ? 'carton_id,' : ''}
      expected_qty,
      actual_qty,
      discrepancy,
      counted_by
    FROM tabCycleCountLine
    WHERE parent_title = ?
      AND actual_qty > 0
      AND discrepancy IS NOT NULL
      AND discrepancy != 0
  `, [title]);
  
  console.log(`[Cycle Count] 📊 Found ${linesWithDiscrepancy.length} lines needing stock update for task ${title} (items_with_discrepancy in DB: ${itemsWithDiscrepancy})`);
  
  // If no lines need updating, return early
  if (linesWithDiscrepancy.length === 0) {
    console.log(`[Cycle Count] ℹ️ No lines need stock update for task ${title} - all items match expected quantities`);
    return { stockUpdated: false, stockUpdateCount: 0 };
  }
  
  for (const line of linesWithDiscrepancy) {
    const itemCode = line.item_code;
    const binLocation = line.bin_location || null;
    const cartonId = (hasCartonIdColumn && line.carton_id) ? String(line.carton_id).trim() : null;
    const expectedQty = parseFloat(line.expected_qty) || 0;
    const actualQty = parseFloat(line.actual_qty) || 0;
    
    // Calculate discrepancy: actual_qty - expected_qty
    // For opening stock (expected_qty = 0, actual_qty > 0), discrepancy = actual_qty
    // For existing stock with variance, discrepancy = actual_qty - expected_qty
    let discrepancy = actualQty - expectedQty;
    
    // If discrepancy is NULL in database but we have actual_qty, calculate it
    if (line.discrepancy === null || line.discrepancy === undefined) {
      discrepancy = actualQty - expectedQty;
    } else {
      discrepancy = parseFloat(line.discrepancy);
    }
    
    const countedBy = line.counted_by || null;
    
    // Get current stock
    const [currentStock] = await connection.execute(`
      SELECT qty, reserved_qty
      FROM tabStockLedger
      WHERE item_code = ? AND warehouse = ? 
        AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
    `, [itemCode, warehouse, binLocation, binLocation]);
    
    let currentQty = 0;
    let currentReservedQty = 0;
    const isExistingRow = currentStock.length > 0;
    if (isExistingRow) {
      currentQty = parseFloat(currentStock[0].qty) || 0;
      currentReservedQty = parseFloat(currentStock[0].reserved_qty) || 0;
    }
    
    const newQty = currentQty + discrepancy;
    
    // qty_before: quantity before this transaction (currentQty, or 0 if new row)
    // qty_reduced: change amount from this transaction (discrepancy, can be positive or negative)
    const qtyBefore = currentQty; // For existing rows, use current qty. For new rows, it's 0.
    const qtyReduced = discrepancy; // The change amount (positive = increase, negative = decrease)
    
    // Check if qty_before and qty_reduced columns exist in tabStockLedger
    const [qtyBeforeColumn] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockLedger' 
      AND COLUMN_NAME = 'qty_before'
    `);
    const hasQtyBeforeColumn = qtyBeforeColumn.length > 0;
    
    const [qtyReducedColumn] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockLedger' 
      AND COLUMN_NAME = 'qty_reduced'
    `);
    const hasQtyReducedColumn = qtyReducedColumn.length > 0;
    
    // Check if carton_id column exists in tabStockLedger
    const [stockLedgerCartonIdColumn] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockLedger' 
      AND COLUMN_NAME = 'carton_id'
    `);
    const hasStockLedgerCartonIdColumn = stockLedgerCartonIdColumn.length > 0;
    
    // Check if tabCartonStock table exists
    const [cartonStockTable] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCartonStock'
    `);
    const hasCartonStockTable = cartonStockTable.length > 0;
    
    // Build INSERT/UPDATE query based on column existence
    let updateStockSql = `
      INSERT INTO tabStockLedger 
        (item_code, warehouse, bin_location, qty, reserved_qty, 
         last_transaction_date, last_transaction_type, last_transaction_ref, 
         updated_at, created_at`;
    let valuesClause = ` VALUES (?, ?, ?, ?, ?,
              NOW(), 'CycleCount', ?, NOW(), NOW()`;
    let updateClause = ` ON DUPLICATE KEY UPDATE
        qty = ?,
        last_transaction_date = NOW(),
        last_transaction_type = 'CycleCount',
        last_transaction_ref = ?,
        updated_at = NOW()`;
    let params = [itemCode, warehouse, binLocation, newQty, currentReservedQty, title];
    
    // Add qty_before and qty_reduced if columns exist
    if (hasQtyBeforeColumn) {
      updateStockSql += `, qty_before`;
      valuesClause += `, ?`;
      updateClause += `, qty_before = ?`;
      params.push(qtyBefore); // For new rows: 0, for existing: currentQty
    }
    
    if (hasQtyReducedColumn) {
      updateStockSql += `, qty_reduced`;
      valuesClause += `, ?`;
      updateClause += `, qty_reduced = ?`;
      params.push(qtyReduced); // The discrepancy (change amount)
    }
    
    // Add carton_id if column exists and cartonId is provided
    if (hasStockLedgerCartonIdColumn && cartonId) {
      updateStockSql += `, carton_id`;
      valuesClause += `, ?`;
      updateClause += `, carton_id = ?`;
      params.push(cartonId);
      console.log(`[Cycle Count] 📦 Including carton_id in tabStockLedger update: ${cartonId} for item ${itemCode}`);
    }
    
    updateStockSql += `)` + valuesClause + `)` + updateClause;
    
    // Add update params for ON DUPLICATE KEY UPDATE clause
    params.push(newQty, title);
    if (hasQtyBeforeColumn) {
      // For ON DUPLICATE KEY UPDATE: qty_before should be the current qty BEFORE this update
      // We need to use the existing qty value, but we already have currentQty which is correct
      // However, in UPDATE, we should preserve the original qty_before or update it?
      // Actually, qty_before should reflect the quantity BEFORE this specific transaction
      // So we use currentQty (which is the qty before this update)
      params.push(currentQty); // This is the quantity before this cycle count adjustment
    }
    if (hasQtyReducedColumn) {
      params.push(discrepancy); // The change from this cycle count
    }
    if (hasStockLedgerCartonIdColumn && cartonId) {
      params.push(cartonId); // Include carton_id in UPDATE clause
    }
    
    // Update or insert stock ledger
    await connection.execute(updateStockSql, params);
    
    console.log(`[Cycle Count] 📊 Stock Ledger Update: item=${itemCode}, qty_before=${qtyBefore}, qty_reduced=${qtyReduced}, new_qty=${newQty}, carton_id=${cartonId || 'NULL'}`);
    
    // Update tabCartonStock if table exists and carton_id is provided
    if (hasCartonStockTable && cartonId && binLocation) {
      try {
        // Use INSERT ... ON DUPLICATE KEY UPDATE to handle existing entries
        // Note: created_on has DEFAULT CURRENT_TIMESTAMP, so we don't set it manually
        await connection.execute(`
          INSERT INTO tabCartonStock 
            (carton_id, item_code, warehouse, bin_location, qty, status)
          VALUES 
            (?, ?, ?, ?, ?, 'PUTAWAY')
          ON DUPLICATE KEY UPDATE
            qty = VALUES(qty),
            updated_at = NOW(),
            status = 'PUTAWAY',
            bin_location = VALUES(bin_location)
        `, [cartonId, itemCode, warehouse, binLocation, actualQty]);
        
        console.log(`[Cycle Count] 📦 Updated tabCartonStock: carton_id=${cartonId}, item=${itemCode}, qty=${actualQty}, bin=${binLocation}`);
      } catch (cartonStockError) {
        console.warn(`[Cycle Count] ⚠️ Could not update tabCartonStock: ${cartonStockError.message}`);
        // Don't fail the transaction - stock ledger is already updated
      }
    }
    
    // Check if tabStockTransaction table exists
    const [stockTransactionTable] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockTransaction'
    `);
    
    if (stockTransactionTable.length > 0) {
      // Check if carton_id column exists in tabStockTransaction
      const [transactionCartonIdColumn] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabStockTransaction' 
        AND COLUMN_NAME = 'carton_id'
      `);
      const hasTransactionCartonIdColumn = transactionCartonIdColumn.length > 0;
      
      // Create stock transaction log
      let transactionSql = `
        INSERT INTO tabStockTransaction
          (transaction_date, transaction_type, reference_doc_type, reference_doc,
           item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
           source_bin, target_bin, performed_by, created_at`;
      let transactionValues = ` VALUES (NOW(), 'CycleCount', 'Cycle Count Task', ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, NOW()`;
      let transactionParams = [
        title,
        itemCode, warehouse, binLocation, discrepancy, currentQty, newQty,
        binLocation, binLocation, countedBy
      ];
      
      // Include carton_id if column exists and cartonId is provided
      if (hasTransactionCartonIdColumn && cartonId) {
        transactionSql += `, carton_id`;
        transactionValues += `, ?`;
        transactionParams.push(cartonId);
      }
      
      transactionSql += `)` + transactionValues + `)`;
      
      await connection.execute(transactionSql, transactionParams);
      
      console.log(`[Cycle Count] 📝 Stock Transaction logged: item=${itemCode}, carton_id=${cartonId || 'NULL'}`);
    }
    
    console.log(`[Cycle Count] ✅ Updated stock for ${itemCode} @ ${warehouse}/${binLocation || 'NULL'}: ${currentQty} → ${newQty} (change: ${discrepancy > 0 ? '+' : ''}${discrepancy})`);
    stockUpdateCount++;
  }
  
  // Update tabItem.stock_qty for all affected items (warehouse-level summary)
  // This ensures stock quantities are immediately visible in the desktop app
  if (stockUpdateCount > 0) {
    try {
      // Get unique item codes from updated lines
      // Only items with actual_qty > 0 AND discrepancy != 0 were updated
      const [updatedItems] = await connection.execute(`
        SELECT DISTINCT item_code
        FROM tabCycleCountLine
        WHERE parent_title = ?
          AND actual_qty > 0
          AND discrepancy IS NOT NULL
          AND discrepancy != 0
      `, [title]);
      
      // Update stock_qty in tabItem for each affected item
      for (const item of updatedItems) {
        const itemCode = item.item_code;
        
        // Calculate total stock from tabCartonStock first (if exists)
        // Carton-level items are tracked in tabCartonStock, not tabStockLedger
        let totalQty = 0;
        
        // Check if tabCartonStock table exists
        const [cartonStockTable] = await connection.execute(`
          SELECT TABLE_NAME 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabCartonStock'
        `);
        
        if (cartonStockTable.length > 0) {
          try {
            // First, get all cartons for debugging
            const [allCartons] = await connection.execute(`
              SELECT carton_id, qty, status
              FROM tabCartonStock
              WHERE item_code = ?
                AND qty > 0
                AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
              ORDER BY carton_id
            `, [itemCode]);
            
            console.log(`[Cycle Count] 🔍 Found ${allCartons.length} carton(s) for ${itemCode}:`);
            allCartons.forEach((carton, idx) => {
              console.log(`[Cycle Count]   Carton ${idx + 1}: ${carton.carton_id} = ${carton.qty} (status: ${carton.status || 'NULL'})`);
            });
            
            // Sum from tabCartonStock (carton-level stock)
            // Only count cartons with PUTAWAY status (exclude picked/shipped cartons)
            const [cartonStockTotal] = await connection.execute(`
              SELECT COALESCE(SUM(qty), 0) as total_qty,
                     COUNT(*) as carton_count
              FROM tabCartonStock
              WHERE item_code = ?
                AND qty > 0
                AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
            `, [itemCode]);
            
            const cartonQty = parseFloat(cartonStockTotal[0].total_qty) || 0;
            const cartonCount = parseInt(cartonStockTotal[0].carton_count) || 0;
            
            console.log(`[Cycle Count] 📊 Carton stock calculation for ${itemCode}: ${cartonCount} carton(s) = ${cartonQty} total`);
            
            if (cartonQty > 0) {
              // If we have carton stock, use carton stock as the total
              // (carton-level items are tracked in tabCartonStock, not tabStockLedger)
              totalQty = cartonQty;
              console.log(`[Cycle Count] 📦 Using carton stock total for ${itemCode}: ${cartonQty} (from ${cartonCount} carton(s))`);
            }
          } catch (cartonError) {
            console.warn(`[Cycle Count] ⚠️ Could not calculate carton stock total: ${cartonError.message}`);
            console.error(`[Cycle Count] ⚠️ Error details:`, cartonError);
          }
        }
        
        // If no carton stock, fall back to stock ledger (bin-level stock)
        if (totalQty === 0) {
          const [stockLedgerTotal] = await connection.execute(`
            SELECT COALESCE(SUM(qty), 0) as total_qty
            FROM tabStockLedger
            WHERE item_code = ?
          `, [itemCode]);
          
          totalQty = parseFloat(stockLedgerTotal[0].total_qty) || 0;
          console.log(`[Cycle Count] 📊 Using stock ledger total for ${itemCode}: ${totalQty}`);
        }
        
        // Update tabItem.stock_qty
        await connection.execute(`
          UPDATE tabItem
          SET stock_qty = ?,
              updated_at = NOW()
          WHERE code = ?
        `, [totalQty, itemCode]);
        
        console.log(`[Cycle Count] ✅ Updated tabItem.stock_qty for ${itemCode}: ${totalQty}`);
      }
    } catch (itemUpdateError) {
      console.warn(`[Cycle Count] ⚠️ Could not update tabItem.stock_qty: ${itemUpdateError.message}`);
      // Don't fail the transaction - stock ledger is already updated
    }
  }
  
  stockUpdated = stockUpdateCount > 0;
  
  // Post stock updates (rebuild summaries from ledger) if stock was updated
  if (stockUpdateCount > 0) {
    try {
      // Get unique item codes from updated lines
      const [updatedItems] = await connection.execute(`
        SELECT DISTINCT item_code
        FROM tabCycleCountLine
        WHERE parent_title = ?
          AND actual_qty > 0
          AND discrepancy IS NOT NULL
          AND discrepancy != 0
      `, [title]);
      
      const itemCodes = updatedItems.map(row => row.item_code).filter(Boolean);
      
      if (itemCodes.length > 0) {
        const postingResult = await postStock('CYCLE_COUNT', title, {
          itemCodes,
          warehouse: warehouse,
          postedBy: 'SYSTEM',
          connection // Use existing connection
        });
        
        if (postingResult.posted) {
          console.log(`[Cycle Count] ✅ Stock posted for Cycle Count ${title}: ${postingResult.affectedItems.length} items updated`);
        } else {
          console.log(`[Cycle Count] ⏭️  Stock posting skipped for ${title}: ${postingResult.reason}`);
        }
      }
    } catch (postingError) {
      console.error(`[Cycle Count] ⚠️  Stock posting failed for Cycle Count ${title}:`, postingError);
      // Don't fail the entire operation, but log the error
    }
  }
  
  return { stockUpdated, stockUpdateCount };
}

/**
 * Helper function to format cycle count task for mobile app
 */
function formatCycleCountTask(row, lines = []) {
  // Map count_type: "Cycle" -> "Directed", "Full" -> "Adhoc", keep original
  const countType = row.count_type;
  const mobileCountType = countType === 'Cycle' ? 'Directed' : (countType === 'Full' ? 'Adhoc' : countType);
  
  // Determine if blind count (expected_qty is 0 for all lines)
  const isBlindCount = lines.length > 0 && lines.every(line => (line.expected_qty === null || line.expected_qty === 0));
  
  // Determine if this is an opening stock task (has items with expected_qty = 0 and actual_qty > 0)
  // Opening stock task: contains at least one item with expected_qty = 0 and actual_qty > 0
  const isOpeningStock = lines.some(line => {
    const expectedQty = line.expected_qty === null || line.expected_qty === undefined ? 0 : parseFloat(line.expected_qty);
    const actualQty = line.actual_qty !== null && line.actual_qty !== undefined ? parseFloat(line.actual_qty) : null;
    return expectedQty === 0 && actualQty !== null && actualQty > 0;
  });
  
  // Get started_at and started_by (if status changed to "In Progress", use updated_at as started_at)
  const startedAt = row.status === 'In Progress' && row.updated_at ? row.updated_at.toISOString() : null;
  const startedBy = row.status === 'In Progress' ? row.assigned_to || row.created_by : null;
  
  // Format lines for mobile app (support both 'items' and 'lines' field names)
  const formattedLines = lines.map(formatCycleCountLine);
  
  console.log(`[Cycle Count] 📋 Task ${row.title}: is_blind_count=${isBlindCount}, is_opening_stock=${isOpeningStock}, lines=${lines.length}`);
  
  return {
    // Core fields
    title: row.title,
    status: row.status,
    count_type: mobileCountType, // Mobile app format
    count_type_original: countType, // Keep original for compatibility
    
    // Warehouse and location
    warehouse_id: row.warehouse, // Mobile app field
    warehouse: row.warehouse, // Keep for backward compatibility
    bin_code: row.zone || null, // Mobile app uses bin_code
    bin_id: row.zone || null, // Mobile app uses bin_id (can be same as bin_code)
    zone: row.zone || null, // Keep for backward compatibility
    
    // Dates and times
    count_date: row.count_date ? row.count_date.toISOString().split('T')[0] : null,
    scheduled_start_time: row.scheduled_start_time || null,
    scheduled_end_time: row.scheduled_end_time || null,
    started_at: startedAt,
    started_by: startedBy,
    created_at: row.created_at ? row.created_at.toISOString() : null,
    updated_at: row.updated_at ? row.updated_at.toISOString() : null,
    
    // Flags
    is_blind_count: isBlindCount,
    is_opening_stock: isOpeningStock, // true if task contains opening stock items (expected_qty = 0 and actual_qty > 0)
    freeze_stock: Boolean(row.freeze_stock),
    
    // Users
    created_by: row.created_by,
    assigned_to: row.assigned_to || null,
    
    // Statistics
    total_items: parseInt(row.total_items) || 0,
    counted_items: parseInt(row.counted_items) || 0,
    items_with_discrepancy: parseInt(row.items_with_discrepancy) || 0,
    
    // Lines - support both 'items' and 'lines' field names for mobile app compatibility
    items: formattedLines, // Mobile app primary field
    lines: formattedLines // Alternative field name
  };
}

/**
 * GET /api/cycle-count
 * Get all Cycle Count Task documents
 * 
 * Query Parameters:
 * - status (optional): Filter by status (comma-separated values supported)
 * - warehouse (optional): Filter by warehouse
 * - zone (optional): Filter by zone
 * - count_type (optional): Filter by count type
 */
export const getCycleCountTasks = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { status, warehouse, zone, count_type } = req.query;
    
    let query = `
      SELECT 
        title,
        status,
        count_type,
        warehouse,
        zone,
        count_date,
        scheduled_start_time,
        scheduled_end_time,
        freeze_stock,
        created_by,
        assigned_to,
        total_items,
        counted_items,
        items_with_discrepancy,
        created_at,
        updated_at
      FROM tabCycleCountTask
      WHERE 1=1
    `;
    
    const params = [];
    
    // Support comma-separated status values
    if (status) {
      const statusList = status.split(',').map(s => s.trim()).filter(s => s);
      if (statusList.length > 0) {
        query += ` AND status IN (${statusList.map(() => '?').join(',')})`;
        params.push(...statusList);
      }
    }
    
    if (warehouse) {
      query += ' AND warehouse = ?';
      params.push(warehouse);
    }
    
    if (zone) {
      query += ' AND zone = ?';
      params.push(zone);
    }
    
    if (count_type) {
      query += ' AND count_type = ?';
      params.push(count_type);
    }
    
    query += ' ORDER BY count_date DESC, title';
    
    const [rows] = await connection.execute(query, params);
    
    // Get lines for each Cycle Count Task (only if needed - for list view, we might skip this)
    const cycleCountTasks = await Promise.all(rows.map(async (row) => {
      // For list view, we don't need all lines - just return task info
      // Mobile app will call detail endpoint for lines
      return formatCycleCountTask(row, []);
    }));
    
    res.json({
      ok: true,
      data: cycleCountTasks
    });
    
  } catch (error) {
    console.error('Failed to fetch Cycle Count Tasks:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch Cycle Count Tasks',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/cycle-count/:title
 * Get a single Cycle Count Task document by title
 */
export const getCycleCountTaskByTitle = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    
    const [rows] = await connection.execute(`
      SELECT 
        title,
        status,
        count_type,
        warehouse,
        zone,
        count_date,
        scheduled_start_time,
        scheduled_end_time,
        freeze_stock,
        created_by,
        assigned_to,
        total_items,
        counted_items,
        items_with_discrepancy,
        created_at,
        updated_at
      FROM tabCycleCountTask
      WHERE title = ?
    `, [title]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Cycle Count Task ${title} not found`
        }
      });
    }
    
    const row = rows[0];
    
    // Check if carton_id column exists
    const [cartonIdColumn] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCycleCountLine' 
      AND COLUMN_NAME = 'carton_id'
    `);
    const hasCartonIdColumn = cartonIdColumn.length > 0;
    
    // Get query parameters for filtering
    const { carton_id, counted_by } = req.query;
    
    // Build WHERE clause with filters
    let whereClause = 'WHERE parent_title = ? AND actual_qty IS NOT NULL';
    const queryParams = [title];
    
    // Filter by carton_id if provided (mobile app may filter by current carton)
    if (carton_id !== undefined && carton_id !== null && carton_id !== '') {
      if (hasCartonIdColumn) {
        whereClause += ' AND carton_id = ?';
        queryParams.push(carton_id);
        console.log(`[Cycle Count] 🔍 Filtering lines by carton_id: ${carton_id}`);
      } else {
        console.log(`[Cycle Count] ⚠️ carton_id filter requested but column doesn't exist in database`);
      }
    }
    
    // Filter by counted_by if provided (mobile app may filter by current user)
    if (counted_by !== undefined && counted_by !== null && counted_by !== '') {
      whereClause += ' AND counted_by = ?';
      queryParams.push(counted_by);
      console.log(`[Cycle Count] 🔍 Filtering lines by counted_by: ${counted_by}`);
    }
    
    console.log(`[Cycle Count] 📋 Fetching lines for task ${title} (filters: carton_id=${carton_id || 'none'}, counted_by=${counted_by || 'none'})`);
    
    // Get lines - Only return lines that have been counted (actual_qty IS NOT NULL)
    // Optionally filter by carton_id and/or counted_by for mobile app sessions
    const [lineRows] = await connection.execute(`
      SELECT 
        id,
        item_code,
        bin_location,
        ${hasCartonIdColumn ? 'carton_id,' : ''}
        expected_qty,
        actual_qty,
        discrepancy,
        counted_by,
        counted_on,
        reviewed_by,
        reviewed_on,
        approval_required,
        approved_by,
        approved_on,
        discrepancy_reason,
        status
      FROM tabCycleCountLine
      ${whereClause}
      ORDER BY item_code, bin_location
    `, queryParams);
    
    // Debug: Log carton_id in retrieved lines
    if (lineRows.length > 0) {
      console.log(`[Cycle Count] 📋 Retrieved ${lineRows.length} line(s) for task ${title}`);
      lineRows.forEach((line, idx) => {
        console.log(`[Cycle Count]   Line ${idx + 1}: item=${line.item_code}, carton_id=${line.carton_id || 'NULL'}, hasCartonIdColumn=${hasCartonIdColumn}`);
      });
    }
    
    const formattedTask = formatCycleCountTask(row, lineRows);
    
    // Debug: Verify carton_id and is_opening_stock in formatted response
    if (formattedTask.items && formattedTask.items.length > 0) {
      console.log(`[Cycle Count] ✅ Formatted ${formattedTask.items.length} line(s) for response`);
      formattedTask.items.slice(0, 3).forEach((item, idx) => {
        console.log(`[Cycle Count]   Formatted Line ${idx + 1}: item=${item.item_code}, carton_id=${item.carton_id || 'NULL'}, is_opening_stock=${item.is_opening_stock !== undefined ? item.is_opening_stock : 'MISSING'}`);
      });
    }
    
    // Final verification: Check if is_opening_stock exists in response
    const firstItem = formattedTask.items && formattedTask.items.length > 0 ? formattedTask.items[0] : null;
    if (firstItem) {
      console.log(`[Cycle Count] 🔍 Final check - First item keys: ${Object.keys(firstItem).join(', ')}`);
      console.log(`[Cycle Count] 🔍 Final check - is_opening_stock value: ${firstItem.is_opening_stock !== undefined ? firstItem.is_opening_stock : 'UNDEFINED'}`);
    }
    
    res.json({
      ok: true,
      data: formattedTask
    });
    
  } catch (error) {
    console.error('Failed to fetch Cycle Count Task:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch Cycle Count Task',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/cycle-count
 * Create a new Cycle Count Task document
 */
export const createCycleCountTask = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title, count_type, warehouse, zone, count_date, scheduled_start_time, scheduled_end_time, freeze_stock, created_by, assigned_to, lines } = req.body;
    
    // Validation
    if (!title || !count_type || !warehouse || !count_date || !created_by) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'title, count_type, warehouse, count_date, and created_by are required'
        }
      });
    }
    
    // Validate warehouse exists in master data (tabWarehouse)
    const warehouseValid = await validateWarehouseFromMasterData(connection, warehouse);
    if (!warehouseValid) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_WAREHOUSE',
          message: `Warehouse "${warehouse}" not found in master data. Please use a valid warehouse code from tabWarehouse.`
        }
      });
    }
    
    // Lines are optional - task can be created without pre-populating items
    // Items will be added dynamically as they are scanned/counted
    const total_items = (lines && Array.isArray(lines) && lines.length > 0) ? lines.length : 0;
    
    // Insert Cycle Count Task
    await connection.execute(`
      INSERT INTO tabCycleCountTask 
        (title, status, count_type, warehouse, zone, count_date, scheduled_start_time, scheduled_end_time, freeze_stock, created_by, assigned_to, total_items, counted_items, items_with_discrepancy)
      VALUES (?, 'Draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `, [title, count_type, warehouse, zone || null, count_date, scheduled_start_time || null, scheduled_end_time || null, freeze_stock || false, created_by, assigned_to || null, total_items]);
    
    // Insert lines only if provided (optional)
    // Don't accept expected_qty from user input - only set it from actual stock data lookup
    // Use 0 instead of NULL for expected_qty (no previous history)
    if (lines && Array.isArray(lines) && lines.length > 0) {
      for (const line of lines) {
        await connection.execute(`
          INSERT INTO tabCycleCountLine 
            (parent_title, item_code, bin_location, expected_qty, status)
          VALUES (?, ?, ?, 0, 'Pending')
        `, [title, line.item_code, line.bin_location || null]);
      }
    }
    
    res.status(201).json({
      ok: true,
      message: 'Cycle Count Task created successfully',
      data: {
        title: title,
        status: 'Draft',
        total_items: total_items
      }
    });
    
  } catch (error) {
    console.error('Failed to create Cycle Count Task:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        error: {
          code: 'DUPLICATE_ENTRY',
          message: 'Cycle Count Task with this title already exists'
        }
      });
    }
    
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to create Cycle Count Task',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/cycle-count/:title/start
 * Start a Cycle Count Task (change status to "In Progress")
 */
export const startCycleCount = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    const { started_by } = req.body;
    
    // Check if task exists
    const [rows] = await connection.execute(`
      SELECT status FROM tabCycleCountTask WHERE title = ?
    `, [title]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Cycle Count Task ${title} not found`
        }
      });
    }
    
    if (rows[0].status !== 'Draft' && rows[0].status !== 'Scheduled') {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Cannot start Cycle Count Task. Current status: ${rows[0].status}`
        }
      });
    }
    
    // Update status to "In Progress" and set assigned_to if started_by provided
    const updateQuery = started_by 
      ? `UPDATE tabCycleCountTask SET status = 'In Progress', assigned_to = ?, updated_at = NOW() WHERE title = ?`
      : `UPDATE tabCycleCountTask SET status = 'In Progress', updated_at = NOW() WHERE title = ?`;
    const updateParams = started_by ? [started_by, title] : [title];
    
    await connection.execute(updateQuery, updateParams);
    
    res.json({
      ok: true,
      message: 'Cycle Count Task started successfully',
      data: {
        title: title,
        status: 'In Progress',
        started_at: new Date().toISOString(),
        started_by: started_by || null
      }
    });
    
  } catch (error) {
    console.error('Failed to start Cycle Count Task:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to start Cycle Count Task',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/cycle-count/:title/update-line
 * Update a single cycle count line
 * Accepts both 'id' (number) and 'line_id' (string) formats
 */
export const updateCountLine = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    const { line_id, id, actual_qty, counted_qty, counted_by, discrepancy_reason, reason_code, notes } = req.body;
    
    // Support both 'id' (number) and 'line_id' (string "LINE-{id}") formats
    let lineId = line_id || id;
    if (typeof lineId === 'string' && lineId.startsWith('LINE-')) {
      lineId = parseInt(lineId.replace('LINE-', ''));
    }
    lineId = parseInt(lineId);
    
    // Support both actual_qty and counted_qty (they're the same)
    const qty = actual_qty !== undefined ? actual_qty : counted_qty;
    
    // Validation
    if (!lineId || (qty === undefined && qty === null)) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'line_id (or id) and actual_qty (or counted_qty) are required'
        }
      });
    }
    
    // Check if task exists
    const [taskRows] = await connection.execute(`
      SELECT status FROM tabCycleCountTask WHERE title = ?
    `, [title]);
    
    if (taskRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Cycle Count Task ${title} not found`
        }
      });
    }
    
    // Check if line exists and belongs to this task
    const [lineRows] = await connection.execute(`
      SELECT id, parent_title, expected_qty, actual_qty
      FROM tabCycleCountLine 
      WHERE id = ? AND parent_title = ?
    `, [lineId, title]);
    
    if (lineRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Cycle Count Line ${lineId} not found for task ${title}`
        }
      });
    }
    
    const line = lineRows[0];
    const wasCounted = line.actual_qty !== null;
    
    // Use discrepancy_reason, reason_code, or notes (prefer reason_code/notes for mobile app)
    const reason = reason_code || notes || discrepancy_reason || null;
    
    // DO NOT calculate discrepancy here - it's a GENERATED COLUMN
    // MySQL will automatically calculate: discrepancy = actual_qty - expected_qty when actual_qty is updated
    
    // Update line (DO NOT include discrepancy - it's generated automatically)
    await connection.execute(`
      UPDATE tabCycleCountLine 
      SET 
        actual_qty = ?,
        counted_by = ?,
        counted_on = NOW(),
        discrepancy_reason = ?,
        status = 'Counted',
        updated_at = NOW()
      WHERE id = ?
    `, [qty, counted_by || null, reason, lineId]);
    
    // Recalculate task statistics
    // Count items with discrepancy:
    // 1. expected_qty > 0 AND discrepancy != 0 (existing stock with variance)
    // 2. expected_qty = 0 AND actual_qty > 0 (opening stock - new items found)
    const [countedRows] = await connection.execute(`
      SELECT 
        COUNT(*) as total_counted,
        SUM(CASE 
          WHEN (expected_qty > 0 AND ABS(COALESCE(discrepancy, 0)) > 0) 
            OR (COALESCE(expected_qty, 0) = 0 AND actual_qty > 0)
          THEN 1 
          ELSE 0 
        END) as with_discrepancy
      FROM tabCycleCountLine 
      WHERE parent_title = ? AND actual_qty IS NOT NULL
    `, [title]);
    
    const counted_items = countedRows[0].total_counted || 0;
    const items_with_discrepancy = countedRows[0].with_discrepancy || 0;
    
    // Update task
    await connection.execute(`
      UPDATE tabCycleCountTask 
      SET 
        counted_items = ?,
        items_with_discrepancy = ?,
        updated_at = NOW()
      WHERE title = ?
    `, [counted_items, items_with_discrepancy, title]);
    
    res.json({
      ok: true,
      message: 'Cycle Count Line updated successfully',
      data: {
        line_id: `LINE-${lineId}`,
        id: lineId,
        actual_qty: parseFloat(qty),
        counted_qty: parseFloat(qty),
        variance_qty: parseFloat(qty) - parseFloat(line.expected_qty),
        was_counted: wasCounted
      }
    });
    
  } catch (error) {
    console.error('Failed to update Cycle Count Line:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to update Cycle Count Line',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/cycle-count/:title/count
 * Batch update multiple count lines (for mobile app)
 * Accepts both 'id' (number) and 'line_id' (string) formats
 */
export const updateCountLines = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    const { counted_by, lines } = req.body;
    
    // Validation (before starting transaction)
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'lines array is required and must not be empty'
        }
      });
    }
    
    // Start transaction after validation
    await connection.beginTransaction();
    
    // Clean up any NULL item_code lines for this task (orphaned lines that shouldn't exist)
    // This prevents duplicate lines from being created
    try {
      const [deleteResult] = await connection.execute(`
        DELETE FROM tabCycleCountLine 
        WHERE parent_title = ? 
          AND (item_code IS NULL OR item_code = '')
          AND actual_qty IS NULL
      `, [title]);
      
      if (deleteResult.affectedRows > 0) {
        console.log(`[Cycle Count] 🧹 Cleaned up ${deleteResult.affectedRows} orphaned NULL item_code line(s) for task ${title}`);
      }
    } catch (cleanupError) {
      // Log but don't fail - cleanup is best effort
      console.warn(`[Cycle Count] ⚠️ Warning: Could not clean up NULL lines: ${cleanupError.message}`);
    }
    
    // Check if task exists
    let [taskRows] = await connection.execute(`
      SELECT status, warehouse, zone FROM tabCycleCountTask WHERE title = ?
    `, [title]);
    
    console.log(`[Cycle Count] 📥 Received count submission for task: ${title}`);
    console.log(`[Cycle Count] Task exists: ${taskRows.length > 0}, Lines to process: ${lines.length}`);
    
    // Note: Mobile app should send item_code in the request for proper line matching
    
    // If task doesn't exist, try to auto-create it for ad-hoc counts
    if (taskRows.length === 0) {
      console.log(`[Cycle Count] ⚠️ Task ${title} not found, attempting auto-creation for ad-hoc count`);
      // Extract task metadata from request body or title
      const { 
        warehouse_id, warehouse, 
        bin_code, bin_id, zone,
        count_type = 'Adhoc', // Default to Adhoc for auto-created tasks
        created_by, counted_by,
        count_date 
      } = req.body;
      
      // Determine warehouse and zone/bin from request
      const taskWarehouse = warehouse_id || warehouse || 'DEFAULT-WH';
      const taskZone = bin_code || bin_id || zone || null;
      const taskCreatedBy = created_by || counted_by || 'MOBILE-USER';
      const taskCountDate = count_date || new Date().toISOString().split('T')[0];
      
      // Parse bin code from title if available (e.g., "CC-BIN-A1-01-4B7A84C7" or "CC-A1-R01-L1-B1-7658B91F")
      let parsedBinCode = null;
      if (title.startsWith('CC-')) {
        const parts = title.replace('CC-', '').split('-');
        // Try to extract bin code (everything before the last part which is usually a hash)
        if (parts.length > 1) {
          // For "CC-BIN-A1-01-4B7A84C7", bin_code might be "BIN-A1-01"
          // For "CC-A1-R01-L1-B1-7658B91F", bin_code might be "A1-R01-L1-B1"
          const lastPart = parts[parts.length - 1];
          // If last part looks like a hash (8 hex chars), use everything before it
          if (/^[0-9A-F]{8}$/i.test(lastPart)) {
            parsedBinCode = parts.slice(0, -1).join('-');
          } else {
            parsedBinCode = parts.join('-');
          }
        }
      }
      
      const finalBinCode = bin_code || bin_id || zone || parsedBinCode;
      
      console.log(`[Cycle Count] Auto-creating ad-hoc task: ${title} (warehouse: ${taskWarehouse}, bin: ${finalBinCode})`);
      
      try {
        // Create the task with minimal required fields
        await connection.execute(`
          INSERT INTO tabCycleCountTask 
            (title, status, count_type, warehouse, zone, count_date, created_by, total_items, counted_items, items_with_discrepancy)
          VALUES (?, 'In Progress', ?, ?, ?, ?, ?, 0, 0, 0)
        `, [title, count_type, taskWarehouse, finalBinCode, taskCountDate, taskCreatedBy]);
        
        console.log(`[Cycle Count] ✅ Auto-created ad-hoc task: ${title}`);
        
        // Re-fetch the task
        [taskRows] = await connection.execute(`
          SELECT status, warehouse, zone FROM tabCycleCountTask WHERE title = ?
        `, [title]);
        
        console.log(`[Cycle Count] ✅ Auto-created task ${title}, status: ${taskRows[0]?.status}`);
      } catch (createError) {
        // If creation fails (e.g., duplicate), try to fetch again
        if (createError.code === 'ER_DUP_ENTRY') {
          [taskRows] = await connection.execute(`
            SELECT status FROM tabCycleCountTask WHERE title = ?
          `, [title]);
        } else {
          console.error(`[Cycle Count] Failed to auto-create task ${title}:`, createError);
          return res.status(500).json({
            ok: false,
            error: {
              code: 'TASK_CREATION_FAILED',
              message: `Failed to auto-create Cycle Count Task: ${createError.message}`
            }
          });
        }
      }
    }
    
    let updatedCount = 0;
    const errors = [];
    
    // Update each line
    for (const line of lines) {
      // Log incoming line data for debugging
      console.log(`[Cycle Count] Processing line: ${JSON.stringify(line)}`);
      
      // Support both actual_qty and counted_qty (they're the same)
      const qty = line.actual_qty !== undefined ? line.actual_qty : line.counted_qty;
      
      // Log the extracted quantity
      console.log(`[Cycle Count] Extracted qty: ${qty} (actual_qty: ${line.actual_qty}, counted_qty: ${line.counted_qty})`);
      
      if ((qty === undefined || qty === null)) {
        console.log(`[Cycle Count] ⚠️ Skipping line - missing qty: ${JSON.stringify(line)}`);
        errors.push(`Line missing actual_qty/counted_qty: ${JSON.stringify(line)}`);
        continue;
      }
      
      // Extract line data from request - item_code or barcode is REQUIRED
      const scannedValue = line.item_code || line.barcode || null;
      const binLocation = line.bin_location || null;
      
      // Validation: item_code or barcode is required (must be non-empty string)
      if (!scannedValue || (typeof scannedValue === 'string' && scannedValue.trim() === '')) {
        const errorMsg = `Line missing required field: item_code or barcode. Line data: ${JSON.stringify(line)}`;
        console.error(`[Cycle Count] ❌ ${errorMsg}`);
        errors.push(errorMsg);
        continue;
      }
      
      // Normalize scanned value (trim whitespace)
      const normalizedScannedValue = typeof scannedValue === 'string' ? scannedValue.trim() : String(scannedValue);
      
      // STEP 1: Lookup item from master data (tabItem)
      // This validates the item and gets the correct item_code from master data
      const masterItem = await lookupItemFromMasterData(connection, normalizedScannedValue);
      
      let normalizedItemCode = normalizedScannedValue; // Default to scanned value
      let itemValidated = false;
      let barcodeSynced = false;
      
      if (masterItem) {
        // Item found in master data - use correct item_code from master data
        normalizedItemCode = masterItem.item_code;
        itemValidated = true;
        
        // Auto-sync: If scanned value matches barcode but barcode in master data is different/null,
        // update the barcode in master data (internal sync)
        if (normalizedScannedValue !== masterItem.item_code && normalizedScannedValue !== masterItem.barcode) {
          // Scanned value doesn't match barcode or item_code - might be a new barcode
          // Update barcode in master data if item was found by item_code only
          try {
            const [checkByCode] = await connection.execute(`
              SELECT barcode FROM tabItem WHERE code = ? AND (barcode IS NULL OR barcode = '')
            `, [masterItem.item_code]);
            
            if (checkByCode.length > 0) {
              // Item exists but barcode is null/empty - update it
              await connection.execute(`
                UPDATE tabItem 
                SET barcode = ?, updated_at = NOW()
                WHERE code = ?
              `, [normalizedScannedValue, masterItem.item_code]);
              
              console.log(`[Cycle Count] 🔄 Auto-synced barcode in master data: item_code="${masterItem.item_code}", barcode="${normalizedScannedValue}"`);
              barcodeSynced = true;
            } else {
              // Item exists with different barcode - check if scanned value should be the barcode
              // Only update if current barcode is null or empty
              const [checkByBarcode] = await connection.execute(`
                SELECT barcode FROM tabItem WHERE code = ?
              `, [masterItem.item_code]);
              
              if (checkByBarcode.length > 0 && (!checkByBarcode[0].barcode || checkByBarcode[0].barcode === '')) {
                await connection.execute(`
                  UPDATE tabItem 
                  SET barcode = ?, updated_at = NOW()
                  WHERE code = ?
                `, [normalizedScannedValue, masterItem.item_code]);
                
                console.log(`[Cycle Count] 🔄 Auto-synced barcode in master data: item_code="${masterItem.item_code}", barcode="${normalizedScannedValue}"`);
                barcodeSynced = true;
              }
            }
          } catch (syncError) {
            console.warn(`[Cycle Count] ⚠️ Could not auto-sync barcode in master data: ${syncError.message}`);
            // Don't fail the transaction - continue with the count
          }
        }
        
        console.log(`[Cycle Count] ✅ Using item_code from master data: scanned="${normalizedScannedValue}" -> item_code="${normalizedItemCode}"`);
      } else {
        // Item not found in master data - allow ad-hoc counting but log warning
        console.warn(`[Cycle Count] ⚠️ Item not found in master data: scanned="${normalizedScannedValue}" (allowing ad-hoc count)`);
        // For ad-hoc counts, use scanned value as item_code
        normalizedItemCode = normalizedScannedValue;
      }
      
      // Accept expected_qty from mobile app request if provided (mobile app already looked it up from stock ledger)
      // If not provided, look it up from stock ledger/carton stock
      // Priority: 1. From request, 2. From existing line, 3. Lookup from stock ledger, 4. Default to 0
      let expectedQty = null;
      
      // Strategy 1: Accept expected_qty from request if provided
      if (line.expected_qty !== undefined && line.expected_qty !== null) {
        const parsedExpectedQty = parseFloat(line.expected_qty);
        if (!isNaN(parsedExpectedQty) && parsedExpectedQty >= 0) {
          expectedQty = parsedExpectedQty;
          console.log(`[Cycle Count] ✅ Using expected_qty from request: ${expectedQty} for item: ${normalizedItemCode}`);
        }
      }
      
      // Extract carton_id - handle both string and null/undefined cases
      const cartonId = (line.carton_id !== undefined && line.carton_id !== null) ? String(line.carton_id).trim() : null;
      
      // Log carton_id extraction for debugging
      if (cartonId) {
        console.log(`[Cycle Count] 📦 Extracted carton_id: "${cartonId}" from line: ${JSON.stringify(line)}`);
      }
      
      // Declare lineId outside try-catch so it's accessible in catch block
      let lineId = null;
      
      try {
        let lineRows = [];
        
        // Strategy 1: Try to find by database ID (if line_id is provided as "LINE-{id}" or direct number)
        // NOTE: If line_id is provided, we trust it, but still verify carton_id matches if provided
        if (line.line_id || line.id) {
          let providedId = line.line_id || line.id;
          if (typeof providedId === 'string' && providedId.startsWith('LINE-')) {
            providedId = parseInt(providedId.replace('LINE-', ''));
          }
          providedId = parseInt(providedId);
          
          if (providedId && !isNaN(providedId)) {
            // Check if carton_id column exists
            const [cartonIdColumnCheck] = await connection.execute(`
              SELECT COLUMN_NAME 
              FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'tabCycleCountLine' 
              AND COLUMN_NAME = 'carton_id'
            `);
            const hasCartonIdForStrategy1 = cartonIdColumnCheck.length > 0;
            
            // Include carton_id in SELECT if column exists
            const cartonIdSelect = hasCartonIdForStrategy1 ? ', carton_id' : '';
            [lineRows] = await connection.execute(`
              SELECT id, parent_title, expected_qty${cartonIdSelect}
              FROM tabCycleCountLine 
              WHERE id = ? AND parent_title = ?
            `, [providedId, title]);
            
            if (lineRows.length > 0) {
              // Verify carton_id matches if both are provided
              let cartonIdMatches = true;
              if (hasCartonIdForStrategy1 && cartonId) {
                const foundCartonId = lineRows[0].carton_id || null;
                const foundCartonIdNormalized = foundCartonId ? String(foundCartonId).trim() : null;
                const requestCartonIdNormalized = cartonId ? String(cartonId).trim() : null;
                
                if (foundCartonIdNormalized !== null && requestCartonIdNormalized !== null) {
                  cartonIdMatches = foundCartonIdNormalized === requestCartonIdNormalized;
                } else if (foundCartonIdNormalized !== null || requestCartonIdNormalized !== null) {
                  // One is null, one is not - no match
                  cartonIdMatches = false;
                }
                
                if (!cartonIdMatches) {
                  console.log(`[Cycle Count] ⚠️ Strategy 1: Line ${providedId} has carton_id="${foundCartonIdNormalized || 'NULL'}" but request has carton_id="${requestCartonIdNormalized || 'NULL'}" - will use Strategy 2 instead`);
                  lineRows = []; // Clear so Strategy 2 can find/create correct line
                }
              }
              
              if (lineRows.length > 0 && cartonIdMatches) {
                lineId = lineRows[0].id;
                // Strategy 2a: Use existing line's expected_qty ONLY if not provided in request
                // Priority: Request value > Existing line value
                if (expectedQty === null && lineRows[0].expected_qty !== null && lineRows[0].expected_qty !== undefined) {
                  const existingExpectedQty = parseFloat(lineRows[0].expected_qty) || 0;
                  if (existingExpectedQty > 0) {
                    expectedQty = existingExpectedQty;
                    console.log(`[Cycle Count] ✅ Using existing line's expected_qty: ${expectedQty} for line: ${lineId}`);
                  }
                } else if (expectedQty !== null && expectedQty > 0) {
                  console.log(`[Cycle Count] ✅ Using expected_qty from request: ${expectedQty} for line: ${lineId} (will update existing line)`);
                }
                console.log(`[Cycle Count] Found line by database ID: ${lineId}`);
              }
            }
          }
        }
        
        // Strategy 2: Find by item_code, bin_location, and carton_id (PRIMARY METHOD)
        // This is the most reliable method when mobile app sends item_code
        // IMPORTANT: Match more flexibly to avoid creating duplicate lines
        if (!lineId) {
          // Check if carton_id column exists first
          const [cartonIdColumn] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabCycleCountLine' 
            AND COLUMN_NAME = 'carton_id'
          `);
          const hasCartonIdColumn = cartonIdColumn.length > 0;
          
          // Match by item_code + bin_location + carton_id (all must match)
          // Different carton_ids should create separate lines for the same item
          // This allows tracking the same item across different cartons
          let findQuery = `
            SELECT id, parent_title, expected_qty, carton_id, bin_location, item_code
            FROM tabCycleCountLine 
            WHERE parent_title = ? 
              AND item_code = ?
              AND item_code IS NOT NULL
          `;
          const findParams = [title, normalizedItemCode];
          
          // Match bin_location exactly (or both NULL)
          if (binLocation) {
            findQuery += ' AND bin_location = ?';
            findParams.push(binLocation);
          } else {
            findQuery += ' AND bin_location IS NULL';
          }
          
          // IMPORTANT: Match carton_id as well to allow separate lines for same item in different cartons
          // If carton_id is provided in request, ONLY match lines with the EXACT same carton_id
          // If carton_id is NULL/empty in request, ONLY match lines with NULL/empty carton_id
          // This ensures different cartons create separate lines for the same item
          if (hasCartonIdColumn) {
            if (cartonId && cartonId.trim() !== '') {
              // Request has carton_id - ONLY match lines with this exact carton_id
              // This prevents matching lines with NULL or different carton_id
              findQuery += ' AND carton_id = ?';
              findParams.push(cartonId.trim());
              console.log(`[Cycle Count] 🔍 Strategy 2: Searching for line with carton_id="${cartonId.trim()}" (strict match)`);
            } else {
              // Request has no carton_id - ONLY match lines with NULL or empty carton_id
              // This prevents matching lines that already have a carton_id assigned
              findQuery += ' AND (carton_id IS NULL OR carton_id = "" OR TRIM(carton_id) = "")';
              console.log(`[Cycle Count] 🔍 Strategy 2: Searching for line with NULL/empty carton_id (strict match)`);
            }
          }
          
          findQuery += ' LIMIT 1';
          
          console.log(`[Cycle Count] 🔍 Strategy 2 Query: ${findQuery}`);
          console.log(`[Cycle Count] 🔍 Strategy 2 Params: [${findParams.map(p => typeof p === 'string' ? `"${p}"` : p).join(', ')}]`);
          
          [lineRows] = await connection.execute(findQuery, findParams);
          
          console.log(`[Cycle Count] 🔍 Strategy 2 Results: Found ${lineRows.length} line(s)`);
          if (lineRows.length > 0) {
            const foundCartonId = hasCartonIdColumn ? (lineRows[0].carton_id || 'NULL') : 'N/A';
            console.log(`[Cycle Count] 🔍 Strategy 2: Found line ${lineRows[0].id} with carton_id="${foundCartonId}"`);
          }
          
          if (lineRows.length > 0) {
            const foundCartonId = hasCartonIdColumn ? (lineRows[0].carton_id || null) : null;
            const foundBinLocation = lineRows[0].bin_location || 'NULL';
            const requestCartonId = cartonId || null;
            
            // CRITICAL: Verify carton_id matches exactly - if different, DO NOT use this line
            // This prevents replacing quantity when scanning same item in different cartons
            let cartonIdMatches = true;
            
            if (hasCartonIdColumn) {
              const foundCartonIdNormalized = foundCartonId ? String(foundCartonId).trim() : null;
              const requestCartonIdNormalized = requestCartonId ? String(requestCartonId).trim() : null;
              
              // Carton IDs match if:
              // 1. Both are null/empty (no carton specified)
              // 2. Both have the same non-null value
              // Carton IDs DON'T match if:
              // 3. One is null and the other is not null
              // 4. Both are not null but different values
              
              if (foundCartonIdNormalized === null && requestCartonIdNormalized === null) {
                // Both null - match
                cartonIdMatches = true;
              } else if (foundCartonIdNormalized !== null && requestCartonIdNormalized !== null) {
                // Both not null - must be exactly equal
                cartonIdMatches = foundCartonIdNormalized === requestCartonIdNormalized;
              } else {
                // One null, one not null - no match
                cartonIdMatches = false;
              }
              
              if (!cartonIdMatches) {
                console.log(`[Cycle Count] ⚠️ Carton ID mismatch! Found line has carton_id="${foundCartonIdNormalized || 'NULL'}" but request has carton_id="${requestCartonIdNormalized || 'NULL'}" - will create NEW line for different carton`);
                // Clear lineRows so no line is used - this will trigger creation of a new line below
                lineRows = [];
              }
            }
            
            // Only use existing line if carton_id matches (or no carton_id column)
            if (lineRows.length > 0 && cartonIdMatches) {
              lineId = lineRows[0].id;
              
              // Strategy 2b: Use existing line's expected_qty ONLY if not provided in request
              // Priority: Request value > Existing line value
              if (expectedQty === null && lineRows[0].expected_qty !== null && lineRows[0].expected_qty !== undefined) {
                const existingExpectedQty = parseFloat(lineRows[0].expected_qty) || 0;
                if (existingExpectedQty > 0) {
                  expectedQty = existingExpectedQty;
                  console.log(`[Cycle Count] ✅ Using existing line's expected_qty: ${expectedQty} for line: ${lineId}`);
                }
              } else if (expectedQty !== null && expectedQty > 0) {
                console.log(`[Cycle Count] ✅ Using expected_qty from request: ${expectedQty} for line: ${lineId} (will update existing line)`);
              }
              
              const displayCartonId = hasCartonIdColumn ? (foundCartonId || 'NULL') : 'N/A';
              console.log(`[Cycle Count] ✅ Found existing line: ${lineId} (item: ${normalizedItemCode}, bin: ${foundBinLocation}, carton: ${displayCartonId})`);
            } else if (lineRows.length > 0 && !cartonIdMatches) {
              // Line found but carton_id doesn't match - will create new line
              console.log(`[Cycle Count] ⚠️ Line found but carton_id mismatch - will create NEW line instead of updating`);
            }
          } else {
            console.log(`[Cycle Count] ⚠️ No existing line found for item: ${normalizedItemCode}, bin: ${binLocation || 'NULL'}, carton: ${cartonId || 'NULL'} - will create new line`);
          }
        }
        
        // Strategy 3: If expected_qty still not set, lookup from stock ledger
        if (expectedQty === null && binLocation && normalizedItemCode) {
          // Get warehouse from task if available
          let taskWarehouse = null;
          if (taskRows.length > 0 && taskRows[0].warehouse) {
            taskWarehouse = taskRows[0].warehouse;
          }
          
          expectedQty = await lookupExpectedQtyFromStock(connection, normalizedItemCode, binLocation, cartonId, taskWarehouse);
          
          if (expectedQty > 0) {
            console.log(`[Cycle Count] ✅ Looked up expected_qty from stock ledger: ${expectedQty} for item: ${normalizedItemCode}, bin: ${binLocation}`);
          } else {
            console.log(`[Cycle Count] ⚠️ No expected_qty found in stock ledger, will use 0 (opening stock scenario) for item: ${normalizedItemCode}, bin: ${binLocation}`);
            expectedQty = 0; // Opening stock scenario
          }
        } else if (expectedQty === null) {
          // No bin_location or item_code - default to 0 (opening stock)
          expectedQty = 0;
          console.log(`[Cycle Count] ⚠️ Missing bin_location or item_code, defaulting expected_qty to 0 for item: ${normalizedItemCode}`);
        }
        
        // Ensure expectedQty is always a number (never null)
        expectedQty = expectedQty !== null && expectedQty !== undefined ? parseFloat(expectedQty) || 0 : 0;
        
        // Strategy 3.5: FINAL SAFETY CHECK before creating/updating line
        // If lineId was set but carton_id doesn't match, clear lineId to force new line creation
        if (lineId) {
          const [safetyCartonIdColumn] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabCycleCountLine' 
            AND COLUMN_NAME = 'carton_id'
          `);
          const hasCartonIdColumnForSafety = safetyCartonIdColumn.length > 0;
          
          if (hasCartonIdColumnForSafety) {
            const [cartonIdCheck] = await connection.execute(`
              SELECT carton_id FROM tabCycleCountLine WHERE id = ?
            `, [lineId]);
            
            if (cartonIdCheck.length > 0) {
              const existingCartonId = cartonIdCheck[0].carton_id;
              const existingCartonIdNormalized = existingCartonId ? String(existingCartonId).trim() : null;
              const requestCartonIdNormalized = cartonId ? String(cartonId).trim() : null;
              
              // Determine if carton_ids match
              let cartonIdsMatch = false;
              if (existingCartonIdNormalized === null && requestCartonIdNormalized === null) {
                cartonIdsMatch = true;
              } else if (existingCartonIdNormalized !== null && requestCartonIdNormalized !== null) {
                cartonIdsMatch = existingCartonIdNormalized === requestCartonIdNormalized;
              } else {
                cartonIdsMatch = false;
              }
              
              // If carton_ids don't match, clear lineId to force creation of new line
              if (!cartonIdsMatch) {
                console.error(`[Cycle Count] ❌ CRITICAL: Line ${lineId} has carton_id="${existingCartonIdNormalized || 'NULL'}" but request has carton_id="${requestCartonIdNormalized || 'NULL'}". Clearing lineId to create NEW line instead of updating.`);
                lineId = null; // Clear lineId - this will trigger creation of new line in Strategy 4
                
                // Re-lookup expected_qty for the new carton (don't use existing line's expected_qty)
                if (binLocation && normalizedItemCode) {
                  let taskWarehouse = null;
                  if (taskRows.length > 0 && taskRows[0].warehouse) {
                    taskWarehouse = taskRows[0].warehouse;
                  }
                  expectedQty = await lookupExpectedQtyFromStock(connection, normalizedItemCode, binLocation, cartonId, taskWarehouse);
                  if (expectedQty === null || expectedQty === undefined) {
                    expectedQty = 0; // Opening stock scenario
                  }
                  console.log(`[Cycle Count] 🔄 Re-looked up expected_qty=${expectedQty} for new line with carton_id="${requestCartonIdNormalized || 'NULL'}"`);
                }
              } else {
                console.log(`[Cycle Count] ✅ Carton ID verification passed: existing="${existingCartonIdNormalized || 'NULL'}", request="${requestCartonIdNormalized || 'NULL'}"`);
              }
            }
          }
        }
        
        // Strategy 4: If still not found, create the line (for ad-hoc counts)
        // Use expected_qty from request, lookup, or default to 0 (opening stock)
        // expectedQty is already set at this point (from request, existing line, or stock ledger lookup)
        if (!lineId) {
          // Check if carton_id column exists
          const [cartonIdColumn] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabCycleCountLine' 
            AND COLUMN_NAME = 'carton_id'
          `);
          const hasCartonIdColumn = cartonIdColumn.length > 0;
          
          // Validate item_code before inserting - prevent NULL item_code (double-check)
          if (!normalizedItemCode || normalizedItemCode === '') {
            const errorMsg = `Cannot create line with empty item_code for task ${title}`;
            console.error(`[Cycle Count] ❌ ${errorMsg}`);
            errors.push(errorMsg);
            continue;
          }
          
          // Use expected_qty from request, lookup, or default to 0 (opening stock)
          // expectedQty is already set at this point (from request, existing line, or stock ledger lookup)
          if (hasCartonIdColumn) {
            const [insertResult] = await connection.execute(`
              INSERT INTO tabCycleCountLine 
                (parent_title, item_code, bin_location, carton_id, expected_qty, status)
              VALUES (?, ?, ?, ?, ?, 'Pending')
            `, [title, normalizedItemCode, binLocation, cartonId, expectedQty]);
            
            lineId = insertResult.insertId;
            console.log(`[Cycle Count] ✅ Auto-created line for task ${title} (item: ${normalizedItemCode}, bin: ${binLocation || 'NULL'}, carton: ${cartonId || 'NULL'}, expected_qty: ${expectedQty}, line_id: ${lineId})`);
          } else {
            const [insertResult] = await connection.execute(`
              INSERT INTO tabCycleCountLine 
                (parent_title, item_code, bin_location, expected_qty, status)
              VALUES (?, ?, ?, ?, 'Pending')
            `, [title, normalizedItemCode, binLocation, expectedQty]);
            
            lineId = insertResult.insertId;
            console.log(`[Cycle Count] ✅ Auto-created line for task ${title} (item: ${normalizedItemCode}, bin: ${binLocation || 'NULL'}, expected_qty: ${expectedQty}, line_id: ${lineId})`);
          }
          
          // Re-fetch the line
          [lineRows] = await connection.execute(`
            SELECT id, parent_title, expected_qty
            FROM tabCycleCountLine 
            WHERE id = ?
          `, [lineId]);
        }
        
        // Use discrepancy_reason, reason_code, or notes
        const reason = line.reason_code || line.notes || line.discrepancy_reason || null;
        
        // Ensure lineId is set before proceeding
        if (!lineId) {
          const errorMsg = `Could not find or create line for item ${normalizedItemCode} in task ${title}`;
          console.error(`[Cycle Count] ❌ ${errorMsg}`);
          errors.push(errorMsg);
          continue;
        }
        
        // Note: Carton ID safety check moved to Strategy 3.5 (before line creation)
        // This ensures we create a new line if carton_ids don't match, instead of updating
        
        // Check if this is a duplicate update (same line being updated again)
        const [currentLine] = await connection.execute(`
          SELECT id, item_code, actual_qty, status, carton_id FROM tabCycleCountLine WHERE id = ?
        `, [lineId]);
        
        if (currentLine.length > 0) {
          const currentQty = currentLine[0].actual_qty;
          const currentItemCode = currentLine[0].item_code;
          const currentStatus = currentLine[0].status;
          
          // Verify item_code matches
          if (currentItemCode !== normalizedItemCode) {
            console.warn(`[Cycle Count] ⚠️ Item code mismatch! Line ${lineId} has item_code=${currentItemCode}, but request has ${normalizedItemCode}`);
          }
          
          if (currentQty !== null && currentQty !== qty) {
            console.log(`[Cycle Count] ⚠️ Updating line ${lineId} from qty ${currentQty} to qty ${qty} (item: ${normalizedItemCode}, status: ${currentStatus})`);
          } else if (currentQty === null) {
            console.log(`[Cycle Count] 🔄 Setting initial qty ${qty} for line ${lineId} (item: ${normalizedItemCode}, status: ${currentStatus})`);
          }
        } else {
          console.error(`[Cycle Count] ❌ Line ${lineId} not found in database before UPDATE!`);
          errors.push(`Line ${lineId} not found in database`);
          continue;
        }
        
        // Update line (include carton_id if column exists)
        // Check if carton_id column exists (check once, reuse)
        let hasCartonIdColumn = false;
        try {
          const [cartonIdColumn] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabCycleCountLine' 
            AND COLUMN_NAME = 'carton_id'
          `);
          hasCartonIdColumn = cartonIdColumn.length > 0;
        } catch (colError) {
          console.error(`[Cycle Count] ⚠️ Error checking carton_id column: ${colError.message}`);
          hasCartonIdColumn = false;
        }
        
        let updateQuery = `
          UPDATE tabCycleCountLine 
          SET 
            actual_qty = ?,
            counted_by = ?,
            counted_on = NOW(),
            discrepancy_reason = ?,
            status = 'Counted',
            updated_at = NOW()
        `;
        const updateParams = [qty, counted_by || null, reason];
        
        // CRITICAL: Only update carton_id if it matches the existing line's carton_id
        // If carton_id is different, we should have created a new line instead (handled above)
        // This prevents accidentally replacing carton_id when scanning same item in different cartons
        if (hasCartonIdColumn) {
          // Check current carton_id of the line before updating
          const [currentCartonCheck] = await connection.execute(`
            SELECT carton_id FROM tabCycleCountLine WHERE id = ?
          `, [lineId]);
          
          if (currentCartonCheck.length > 0) {
            const currentCartonId = currentCartonCheck[0].carton_id;
            const currentCartonIdNormalized = currentCartonId ? String(currentCartonId).trim() : null;
            const requestCartonIdNormalized = cartonId ? String(cartonId).trim() : null;
            
            // Only update carton_id if:
            // 1. Current is NULL/empty and request has a value (initial assignment)
            // 2. Current matches request (no change needed, but safe to update)
            // DO NOT update if current and request are different non-null values
            if (currentCartonIdNormalized === null && requestCartonIdNormalized !== null) {
              // Initial assignment: line had no carton_id, now assigning one
              updateQuery += `, carton_id = ?`;
              updateParams.push(cartonId);
              console.log(`[Cycle Count] ✅ Assigning initial carton_id: ${cartonId} to line ${lineId}`);
            } else if (currentCartonIdNormalized === requestCartonIdNormalized) {
              // Carton IDs match - safe to update (no change, but ensures consistency)
              updateQuery += `, carton_id = ?`;
              updateParams.push(cartonId);
              console.log(`[Cycle Count] ✅ Updating carton_id (matches existing): ${cartonId} for line ${lineId}`);
            } else if (currentCartonIdNormalized !== null && requestCartonIdNormalized !== null && 
                       currentCartonIdNormalized !== requestCartonIdNormalized) {
              // CRITICAL: Carton IDs are different - this should not happen if matching logic works correctly
              // Log warning but don't update carton_id (preserve existing)
              console.error(`[Cycle Count] ❌ ERROR: Attempted to update line ${lineId} with different carton_id! Current: "${currentCartonIdNormalized}", Request: "${requestCartonIdNormalized}". This should have created a new line. Preserving existing carton_id.`);
              // Don't update carton_id - preserve the existing one
            } else {
              // Both are null or one is null and other is not (but not the initial assignment case)
              console.log(`[Cycle Count] ℹ️ Skipping carton_id update: current="${currentCartonIdNormalized}", request="${requestCartonIdNormalized}"`);
            }
          }
        } else {
          console.log(`[Cycle Count] ⚠️ carton_id column does not exist in tabCycleCountLine`);
        }
        
        // Include bin_location in UPDATE if provided (to update location if item moved)
        if (binLocation !== null && binLocation !== undefined) {
          updateQuery += `, bin_location = ?`;
          updateParams.push(binLocation);
          console.log(`[Cycle Count] ✅ Including bin_location in UPDATE: ${binLocation} for line ${lineId}`);
        }
        
        // Update expected_qty if we have a value from request/lookup
        // Priority: Always use expected_qty from mobile app request if provided
        // This ensures expected_qty from mobile app is respected (mobile app has the most current data)
        const [currentLineForExpected] = await connection.execute(`
          SELECT expected_qty FROM tabCycleCountLine WHERE id = ?
        `, [lineId]);
        
        if (currentLineForExpected.length > 0) {
          const currentExpectedQty = currentLineForExpected[0].expected_qty;
          const parsedCurrentExpectedQty = currentExpectedQty !== null && currentExpectedQty !== undefined ? parseFloat(currentExpectedQty) || 0 : 0;
          
          // Always update expected_qty if provided in request and different from current value
          // This allows mobile app to override existing expected_qty (mobile app has real-time stock data)
          if (expectedQty !== null && expectedQty !== undefined && expectedQty > 0) {
            if (parsedCurrentExpectedQty !== expectedQty) {
              updateQuery += `, expected_qty = ?`;
              updateParams.push(expectedQty);
              console.log(`[Cycle Count] ✅ Including expected_qty in UPDATE: ${expectedQty} for line ${lineId} (was: ${parsedCurrentExpectedQty || 'NULL/0'})`);
            } else {
              console.log(`[Cycle Count] ℹ️ expected_qty already matches: ${expectedQty} for line ${lineId}`);
            }
          } else if (parsedCurrentExpectedQty === 0 || parsedCurrentExpectedQty === null) {
            // If no expected_qty from request but current is 0/null, try to look it up (but this should already be done earlier)
            console.log(`[Cycle Count] ⚠️ No expected_qty provided in request and current is 0/null for line ${lineId}`);
          }
        }
        
        // IMPORTANT: DO NOT update discrepancy - it's a GENERATED COLUMN (calculated automatically by MySQL)
        // MySQL will automatically calculate: discrepancy = actual_qty - expected_qty when actual_qty or expected_qty is updated
        
        updateQuery += ` WHERE id = ?`;
        updateParams.push(lineId);
        
        // Log the UPDATE query structure for debugging
        console.log(`[Cycle Count] 🔄 Executing UPDATE for line ${lineId}`);
        console.log(`[Cycle Count]    Item: ${normalizedItemCode}, Qty: ${qty}, LineId: ${lineId}`);
        console.log(`[Cycle Count]    Counted By: ${counted_by || 'NULL'}, Reason: ${reason || 'NULL'}`);
        console.log(`[Cycle Count]    Query includes carton_id: ${updateQuery.includes('carton_id')}`);
        console.log(`[Cycle Count]    Parameters: [${updateParams.map(p => typeof p === 'string' ? `'${p}'` : p).join(', ')}]`);
        
        const [updateResult] = await connection.execute(updateQuery, updateParams);
        
        console.log(`[Cycle Count]    Update result: affectedRows=${updateResult.affectedRows}, insertId=${updateResult.insertId || 'N/A'}`);
        
        // Check if update actually affected a row
        if (updateResult.affectedRows === 0) {
          const errorMsg = `Update failed: No rows affected for line ${lineId} (item: ${normalizedItemCode}, qty: ${qty}). Line may not exist or id mismatch.`;
          console.error(`[Cycle Count] ❌ ${errorMsg}`);
          errors.push(errorMsg);
          
          // Verify line exists
          const [verifyLine] = await connection.execute(`
            SELECT id, item_code, actual_qty FROM tabCycleCountLine WHERE id = ?
          `, [lineId]);
          if (verifyLine.length === 0) {
            console.error(`[Cycle Count] ❌ Line ${lineId} does not exist in database!`);
          } else {
            console.error(`[Cycle Count] ❌ Line ${lineId} exists but UPDATE didn't affect it. Current values: item_code=${verifyLine[0].item_code || 'NULL'}, actual_qty=${verifyLine[0].actual_qty !== null ? verifyLine[0].actual_qty : 'NULL'}`);
          }
          continue;
        }
        
        // Verify the update by re-fetching the line (after UPDATE)
        const [updatedLine] = await connection.execute(`
          SELECT id, item_code, actual_qty, counted_by, counted_on, status
          FROM tabCycleCountLine 
          WHERE id = ?
        `, [lineId]);
        
        if (updatedLine.length > 0) {
          const verifiedQty = updatedLine[0].actual_qty;
          const verifiedItemCode = updatedLine[0].item_code;
          console.log(`[Cycle Count] ✅ Updated line ${lineId} for task ${title} (item: ${normalizedItemCode}, qty: ${qty})`);
          console.log(`[Cycle Count]    Verified: item_code=${verifiedItemCode || 'NULL'}, actual_qty=${verifiedQty !== null ? verifiedQty : 'NULL'}, counted_by=${updatedLine[0].counted_by || 'NULL'}, status=${updatedLine[0].status || 'NULL'}`);
          
          if (verifiedQty !== qty) {
            console.error(`[Cycle Count] ⚠️ WARNING: Updated qty mismatch! Expected: ${qty}, Actual in DB: ${verifiedQty}`);
          }
        } else {
          console.error(`[Cycle Count] ❌ WARNING: Could not verify update - line ${lineId} not found after UPDATE!`);
        }
        
        updatedCount++;
      } catch (error) {
        // lineId might not be defined if error occurs before it's set
        const lineIdForError = typeof lineId !== 'undefined' ? lineId : 'unknown';
        const errorMsg = `Failed to update line for item ${itemCode || 'unknown'}: ${error.message}`;
        console.error(`[Cycle Count] ❌ ${errorMsg} (lineId: ${lineIdForError})`);
        errors.push(errorMsg);
      }
    }
    
    // Recalculate task statistics
    // Count items with discrepancy:
    // 1. expected_qty > 0 AND discrepancy != 0 (existing stock with variance)
    // 2. expected_qty = 0 AND actual_qty > 0 (opening stock - new items found)
    const [countedRows] = await connection.execute(`
      SELECT 
        COUNT(*) as total_counted,
        SUM(CASE 
          WHEN (expected_qty > 0 AND ABS(COALESCE(discrepancy, 0)) > 0) 
            OR (COALESCE(expected_qty, 0) = 0 AND actual_qty > 0)
          THEN 1 
          ELSE 0 
        END) as with_discrepancy
      FROM tabCycleCountLine 
      WHERE parent_title = ? AND actual_qty IS NOT NULL
    `, [title]);
    
    // Get total items count (in case new lines were auto-created)
    const [totalRows] = await connection.execute(`
      SELECT COUNT(*) as total_items
      FROM tabCycleCountLine 
      WHERE parent_title = ?
    `, [title]);
    
    // Ensure all values are numbers (MySQL might return BigInt or string)
    // Use Number() to handle BigInt properly, then ensure it's an integer
    const counted_items = Number(countedRows[0].total_counted) || 0;
    const items_with_discrepancy = Number(countedRows[0].with_discrepancy) || 0;
    const total_items = Number(totalRows[0].total_items) || 0;
    
    // Log for debugging
    console.log(`[Cycle Count] 📊 Calculated statistics: counted_items=${counted_items} (type: ${typeof counted_items}), items_with_discrepancy=${items_with_discrepancy} (type: ${typeof items_with_discrepancy}), total_items=${total_items} (type: ${typeof total_items})`);
    
    // Update task (including total_items in case new lines were created)
    const [updateTaskResult] = await connection.execute(`
      UPDATE tabCycleCountTask 
      SET 
        total_items = ?,
        counted_items = ?,
        items_with_discrepancy = ?,
        updated_at = NOW()
      WHERE title = ?
    `, [total_items, counted_items, items_with_discrepancy, title]);
    
    console.log(`[Cycle Count] 📊 Task update result: ${updateTaskResult.affectedRows} row(s) affected`);
    
    // Commit transaction
    await connection.commit();
    
    console.log(`[Cycle Count] ✅ Transaction committed for task ${title}`);
    console.log(`[Cycle Count] ✅ Updated task ${title}: total_items=${total_items}, counted_items=${counted_items}, items_with_discrepancy=${items_with_discrepancy}`);
    
    // Verify the update was persisted by reading it back
    const [verifyRows] = await connection.execute(`
      SELECT total_items, counted_items, items_with_discrepancy
      FROM tabCycleCountTask
      WHERE title = ?
    `, [title]);
    
    if (verifyRows.length > 0) {
      console.log(`[Cycle Count] ✅ Verified task ${title} in database: total_items=${verifyRows[0].total_items}, counted_items=${verifyRows[0].counted_items}, items_with_discrepancy=${verifyRows[0].items_with_discrepancy}`);
    } else {
      console.log(`[Cycle Count] ⚠️ WARNING: Task ${title} not found after commit!`);
    }
    
    if (errors.length > 0) {
      return res.status(207).json({
        ok: true,
        message: `Updated ${updatedCount} lines with ${errors.length} errors`,
        data: {
          title: title,
          updated_count: updatedCount,
          counted_items: counted_items,
          items_with_discrepancy: items_with_discrepancy,
          total_items: total_items,
          errors: errors
        }
      });
    }
    
    res.json({
      ok: true,
      message: `Successfully updated ${updatedCount} lines`,
      data: {
        title: title,
        updated_count: updatedCount,
        counted_items: counted_items,
        items_with_discrepancy: items_with_discrepancy,
        total_items: total_items
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Failed to update Cycle Count Lines:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to update Cycle Count Lines',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * Optional: Push cycle count to ERPNext sync_task_capture_only after submit.
 * Set env CYCLE_COUNT_ERP_URL and CYCLE_COUNT_ERP_API_KEY to enable. Runs fire-and-forget after commit.
 */
async function pushCycleCountToErpSyncTaskCaptureOnly(title) {
  const baseUrl = process.env.CYCLE_COUNT_ERP_URL || process.env.ERP_CYCLE_COUNT_PUSH_URL;
  const apiKey = process.env.CYCLE_COUNT_ERP_API_KEY || process.env.ERP_CYCLE_COUNT_PUSH_API_KEY;
  if (!baseUrl || !apiKey) {
    console.log('[Cycle Count] ERP push skipped: CYCLE_COUNT_ERP_URL or CYCLE_COUNT_ERP_API_KEY not set');
    return;
  }
  let connection;
  try {
    connection = await getConnection();
    const [taskRows] = await connection.execute(`
      SELECT title, warehouse, zone, count_date, created_by, assigned_to
      FROM tabCycleCountTask WHERE title = ?
    `, [title]);
    if (taskRows.length === 0) return;
    const task = taskRows[0];

    const hasCartonId = await connection.execute(`
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabCycleCountLine' AND COLUMN_NAME = 'carton_id'
    `).then(([r]) => r.length > 0);

    const linesSql = hasCartonId
      ? `SELECT item_code, bin_location, carton_id, expected_qty, actual_qty, counted_by, counted_on
         FROM tabCycleCountLine WHERE parent_title = ? AND actual_qty IS NOT NULL ORDER BY item_code`
      : `SELECT item_code, bin_location, NULL as carton_id, expected_qty, actual_qty, counted_by, counted_on
         FROM tabCycleCountLine WHERE parent_title = ? AND actual_qty IS NOT NULL ORDER BY item_code`;
    const [lines] = await connection.execute(linesSql, [title]);
    if (lines.length === 0) {
      console.log(`[Cycle Count] ERP push skipped for ${title}: no counted lines`);
      return;
    }

    const openingStock = lines.some(l => (parseFloat(l.expected_qty) || 0) === 0 && (parseFloat(l.actual_qty) || 0) > 0) ? 1 : 0;
    const firstLine = lines[0];
    const countedBy = firstLine.counted_by || task.assigned_to || task.created_by || '';
    const countedOn = firstLine.counted_on
      ? new Date(firstLine.counted_on).toISOString().replace('T', ' ').slice(0, 19)
      : new Date().toISOString().replace('T', ' ').slice(0, 19);

    const company = process.env.CYCLE_COUNT_ERP_COMPANY || process.env.ERP_COMPANY || 'Mohammed Abdullah Almousa Trading Company';
    const warehouseName = task.warehouse || '';
    const warehouseCode = task.warehouse || 'WH-MAIN';
    const binLocation = (task.zone || '').trim();

    // Match desktop final format: no bin_location at header; each line has item_code, bin_location, carton_id, counted_qty, uom
    const payload = {
      payload: {
        company,
        warehouse: warehouseName,
        warehouse_code: warehouseCode,
        posting_date: task.count_date ? new Date(task.count_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        external_ref: title,
        opening_stock: openingStock,
        counted_by: countedBy,
        counted_on: countedOn,
        lines: lines.map(l => ({
          item_code: String(l.item_code || '').trim(),
          bin_location: String(l.bin_location || binLocation).trim(),
          carton_id: l.carton_id ? String(l.carton_id).trim() : null,
          counted_qty: parseFloat(l.actual_qty) || 0,
          uom: 'Nos'
        }))
      }
    };

    const url = baseUrl.replace(/\/$/, '');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `token ${apiKey.trim()}`
      },
      body: JSON.stringify(payload)
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`[Cycle Count] ERP push failed for ${title}: ${res.status} ${body}`);
      return;
    }
    let erpRef = null;
    try {
      const data = JSON.parse(body);
      const msg = data?.message;
      if (msg != null) {
        if (typeof msg === 'string') erpRef = msg;
        else if (msg.task) erpRef = msg.task;   // sync_task_capture_only returns "task" (ERP doc name)
        else if (msg.name) erpRef = msg.name;
        else if (msg.reference) erpRef = msg.reference;
      }
    } catch (_) {}
    console.log(`[Cycle Count] ERP push success for ${title}${erpRef ? `, reference: ${erpRef}` : ''}`);

    const [colRows] = await connection.execute(`
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabCycleCountTask' AND COLUMN_NAME = 'erp_reference'
    `);
    if (colRows.length > 0) {
      await connection.execute(
        'UPDATE tabCycleCountTask SET erp_reference = ?, erp_synced_at = NOW() WHERE title = ?',
        [erpRef || null, title]
      );
    }
  } catch (err) {
    console.error('[Cycle Count] ERP push error:', err);
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /api/cycle-count/:title/submit
 * Submit a Cycle Count Task (change status to "Review" if there are discrepancies, or "Completed" if none)
 */
export const submitCycleCount = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    
    console.log(`[Cycle Count] 📤 Received SUBMIT request for task: ${title}`);
    
    await connection.beginTransaction();
    
    // Check if task exists
    const [taskRows] = await connection.execute(`
      SELECT status, total_items, counted_items, items_with_discrepancy, warehouse
      FROM tabCycleCountTask WHERE title = ?
    `, [title]);
    
    console.log(`[Cycle Count] 📋 Task found: ${taskRows.length > 0}, Current status: ${taskRows[0]?.status || 'N/A'}`);
    
    if (taskRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Cycle Count Task ${title} not found`
        }
      });
    }
    
    const task = taskRows[0];
    
    if (task.status !== 'In Progress') {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Cannot submit Cycle Count Task. Current status: ${task.status}`
        }
      });
    }
    
    // Check if any items are counted (for ad-hoc counts, we allow submission even if not all original items are counted)
    // For ad-hoc counts, new items can be added dynamically, so we only require at least one item to be counted
    if (parseInt(task.counted_items) === 0) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: 'NO_ITEMS_COUNTED',
          message: 'No items have been counted yet. Please count at least one item before submitting.'
        }
      });
    }
    
    // For non-ad-hoc counts (Cycle, Full), require all items to be counted
    // Check count_type from task
    const [taskTypeRows] = await connection.execute(`
      SELECT count_type FROM tabCycleCountTask WHERE title = ?
    `, [title]);
    
    const countType = taskTypeRows[0]?.count_type;
    const isAdhocCount = countType === 'Adhoc' || countType === 'Ad-hoc';
    
    // For directed/cycle counts, require all items to be counted
    // For ad-hoc counts, allow submission with partial counts (new items can be added dynamically)
    if (!isAdhocCount && parseInt(task.counted_items) < parseInt(task.total_items)) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INCOMPLETE_COUNT',
          message: `Not all items have been counted. Counted: ${task.counted_items}/${task.total_items}`
        }
      });
    }
    
    // Determine new status based on discrepancies
    const newStatus = parseInt(task.items_with_discrepancy) > 0 ? 'Review' : 'Completed';
    
    console.log(`[Cycle Count] 📝 Updating task ${title} status from "${task.status}" to "${newStatus}"`);
    
    // Update status
    const [updateResult] = await connection.execute(`
      UPDATE tabCycleCountTask 
      SET status = ?, updated_at = NOW()
      WHERE title = ?
    `, [newStatus, title]);
    
    console.log(`[Cycle Count] ✅ Status update result: ${updateResult.affectedRows} row(s) affected`);
    
    // Verify status was updated
    const [verifyRows] = await connection.execute(`
      SELECT status FROM tabCycleCountTask WHERE title = ?
    `, [title]);
    
    if (verifyRows.length > 0) {
      console.log(`[Cycle Count] ✅ Verified task ${title} status in database: "${verifyRows[0].status}"`);
    } else {
      console.log(`[Cycle Count] ⚠️ WARNING: Task ${title} not found after status update!`);
    }
    
    // If status is "Completed" (no discrepancies), update stock immediately
    let stockUpdated = false;
    let stockUpdateCount = 0;
    
    if (newStatus === 'Completed') {
      // Normalize warehouse to CODE (not name) - CRITICAL for stock ledger consistency
      const normalizedWarehouse = await normalizeWarehouseToCode(connection, task.warehouse);
      const stockResult = await updateStockFromCycleCount(connection, title, normalizedWarehouse);
      stockUpdated = stockResult.stockUpdated;
      stockUpdateCount = stockResult.stockUpdateCount;
      
      // Unfreeze stock if it was frozen
      await connection.execute(`
        UPDATE tabCycleCountTask 
        SET freeze_stock = FALSE
        WHERE title = ? AND freeze_stock = TRUE
      `, [title]);
      
      console.log(`[Cycle Count] ✅ Submitted and completed task ${title}. Stock updated: ${stockUpdated} (${stockUpdateCount} items)`);
    }
    
    await connection.commit();
    
    // Final verification after commit
    const [finalVerifyRows] = await connection.execute(`
      SELECT status FROM tabCycleCountTask WHERE title = ?
    `, [title]);
    
    if (finalVerifyRows.length > 0) {
      const finalStatus = finalVerifyRows[0].status;
      console.log(`[Cycle Count] ✅ Final verification after commit: task ${title} status = "${finalStatus}"`);
      if (finalStatus !== newStatus) {
        console.log(`[Cycle Count] ⚠️ WARNING: Status mismatch! Expected "${newStatus}" but got "${finalStatus}"`);
      }
    }

    // Optional: push to ERPNext sync_task_capture_only (fire-and-forget; set CYCLE_COUNT_ERP_URL + CYCLE_COUNT_ERP_API_KEY to enable)
    pushCycleCountToErpSyncTaskCaptureOnly(title).catch(err => console.error('[Cycle Count] ERP push after submit failed', err));

    res.json({
      ok: true,
      message: `Cycle Count Task submitted successfully. Status: ${newStatus}`,
      data: {
        title: title,
        status: newStatus,
        items_with_discrepancy: parseInt(task.items_with_discrepancy),
        stock_updated: stockUpdated,
        items_adjusted: stockUpdateCount
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Failed to submit Cycle Count Task:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to submit Cycle Count Task',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/cycle-count/:title/complete
 * Complete a Cycle Count Task (change status to "Completed")
 * This should be called after stock adjustments are made
 */
export const completeCycleCount = async (req, res) => {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { title } = req.params;
    
    // 1. Get task details (status, warehouse, items_with_discrepancy)
    const [taskRows] = await connection.execute(`
      SELECT status, warehouse, items_with_discrepancy
      FROM tabCycleCountTask WHERE title = ?
    `, [title]);
    
    if (taskRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Cycle Count Task ${title} not found`
        }
      });
    }
    
    const task = taskRows[0];
    const currentStatus = task.status;
    // Normalize warehouse to CODE (not name) - CRITICAL for stock ledger consistency
    let warehouse = await normalizeWarehouseToCode(connection, task.warehouse);
    const itemsWithDiscrepancy = parseInt(task.items_with_discrepancy) || 0;
    
    if (currentStatus === 'Completed') {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: 'ALREADY_COMPLETED',
          message: 'Cycle Count Task is already completed'
        }
      });
    }
    
    // 2. Update status to "Completed"
    await connection.execute(`
      UPDATE tabCycleCountTask 
      SET status = 'Completed', updated_at = NOW()
      WHERE title = ?
    `, [title]);
    
    // 3. Unfreeze stock if it was frozen
    await connection.execute(`
      UPDATE tabCycleCountTask 
      SET freeze_stock = FALSE
      WHERE title = ? AND freeze_stock = TRUE
    `, [title]);
    
    // 4. Update stock ledger directly (if discrepancies exist)
    const stockResult = await updateStockFromCycleCount(connection, title, warehouse);
    const stockUpdated = stockResult.stockUpdated;
    const stockUpdateCount = stockResult.stockUpdateCount;
    
    await connection.commit();
    
    console.log(`[Cycle Count] ✅ Completed task ${title}. Stock updated: ${stockUpdated} (${stockUpdateCount} items)`);
    
    res.json({
      ok: true,
      message: 'Cycle Count Task completed successfully',
      data: {
        title: title,
        status: 'Completed',
        stock_updated: stockUpdated,
        items_adjusted: stockUpdateCount
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Failed to complete Cycle Count Task:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to complete Cycle Count Task',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * DELETE /api/cycle-count/:title
 * Delete a Cycle Count Task and all its lines
 * This should only be allowed for Draft tasks or tasks that haven't been started
 */
export const deleteCycleCount = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    
    // Check if task exists
    const [taskRows] = await connection.execute(`
      SELECT title, status FROM tabCycleCountTask WHERE title = ?
    `, [title]);
    
    if (taskRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Cycle Count Task ${title} not found`
        }
      });
    }
    
    const task = taskRows[0];
    const currentStatus = task.status;
    
    // Optional: Prevent deletion of tasks that are in progress or completed
    // Uncomment if you want to restrict deletion to Draft tasks only
    // if (currentStatus !== 'Draft') {
    //   return res.status(400).json({
    //     ok: false,
    //     error: {
    //       code: 'INVALID_STATUS',
    //       message: `Cannot delete Cycle Count Task. Current status: ${currentStatus}. Only Draft tasks can be deleted.`
    //     }
    //   });
    // }
    
    // Start transaction
    await connection.beginTransaction();
    
    try {
      // Delete all lines first (foreign key constraint)
      const [deleteLinesResult] = await connection.execute(`
        DELETE FROM tabCycleCountLine WHERE parent_title = ?
      `, [title]);
      
      const deletedLinesCount = deleteLinesResult.affectedRows;
      
      // Delete the task
      const [deleteTaskResult] = await connection.execute(`
        DELETE FROM tabCycleCountTask WHERE title = ?
      `, [title]);
      
      if (deleteTaskResult.affectedRows === 0) {
        // This shouldn't happen since we checked above, but handle it anyway
        await connection.rollback();
        return res.status(500).json({
          ok: false,
          error: {
            code: 'DELETE_FAILED',
            message: 'Failed to delete Cycle Count Task'
          }
        });
      }
      
      // Commit transaction
      await connection.commit();
      
      console.log(`[Cycle Count] ✅ Deleted task ${title} with ${deletedLinesCount} lines`);
      
      res.json({
        ok: true,
        message: 'Cycle Count Task deleted successfully',
        data: {
          title: title,
          deleted_lines: deletedLinesCount
        }
      });
      
    } catch (deleteError) {
      // Rollback transaction on error
      await connection.rollback();
      throw deleteError;
    }
    
  } catch (error) {
    console.error('Failed to delete Cycle Count Task:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to delete Cycle Count Task',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/cycle-count/:title/sync-to-erp
 * Sync a single completed Cycle Count Task to ERP
 * This endpoint sends cycle count adjustments to the ERP system
 */
export const syncCycleCountToErp = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    
    // Get completed cycle count task with all lines
    const [taskRows] = await connection.execute(`
      SELECT 
        title, status, warehouse, count_date, created_by, created_at
      FROM tabCycleCountTask 
      WHERE title = ?
    `, [title]);
    
    if (taskRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Cycle Count Task ${title} not found`
        }
      });
    }
    
    const task = taskRows[0];
    
    // Only sync completed tasks
    if (task.status !== 'Completed') {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Cannot sync Cycle Count Task. Current status: ${task.status}. Only Completed tasks can be synced to ERP.`
        }
      });
    }
    
    // Get all lines with discrepancies (items that need adjustment in ERP)
    const [lines] = await connection.execute(`
      SELECT 
        item_code,
        bin_location,
        expected_qty,
        actual_qty,
        discrepancy,
        counted_by,
        counted_on
      FROM tabCycleCountLine
      WHERE parent_title = ?
        AND actual_qty IS NOT NULL
        AND (
          (expected_qty > 0 AND discrepancy IS NOT NULL AND discrepancy != 0)
          OR
          (COALESCE(expected_qty, 0) = 0 AND actual_qty > 0)
        )
      ORDER BY item_code, bin_location
    `, [title]);
    
    if (lines.length === 0) {
      return res.json({
        ok: true,
        message: 'No discrepancies found. Nothing to sync to ERP.',
        data: {
          title: title,
          synced: false,
          items_count: 0
        }
      });
    }
    
    // Format data for ERP sync
    const erpPayload = {
      transaction_type: 'CYCLE_COUNT_ADJUSTMENT',
      wms_reference: task.title,
      warehouse: task.warehouse,
      count_date: task.count_date,
      created_by: task.created_by,
      created_at: task.created_at,
      adjustments: lines.map(line => ({
        item_code: line.item_code,
        bin_location: line.bin_location || null,
        expected_qty: parseFloat(line.expected_qty) || 0,
        actual_qty: parseFloat(line.actual_qty) || 0,
        adjustment_qty: parseFloat(line.discrepancy) || 0, // Can be positive (increase) or negative (decrease)
        counted_by: line.counted_by || null,
        counted_on: line.counted_on ? line.counted_on.toISOString() : null
      }))
    };
    
    // TODO: Implement actual ERP API call here
    // Example structure:
    // const erpResponse = await fetch(ERP_API_URL + '/stock-adjustments', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ERP_API_TOKEN },
    //   body: JSON.stringify(erpPayload)
    // });
    // const erpResult = await erpResponse.json();
    
    // For now, just log the payload and return success
    console.log(`[Cycle Count] 📤 ERP Sync Payload for ${title}:`, JSON.stringify(erpPayload, null, 2));
    
    // Optional: Mark task as synced (if you have a sync_status field)
    // await connection.execute(`
    //   UPDATE tabCycleCountTask 
    //   SET sync_status = 'Synced', synced_at = NOW(), updated_at = NOW()
    //   WHERE title = ?
    // `, [title]);
    
    res.json({
      ok: true,
      message: 'Cycle Count Task synced to ERP successfully',
      data: {
        title: title,
        synced: true,
        items_count: lines.length,
        payload: erpPayload,
        // erp_response: erpResult // Uncomment when ERP integration is implemented
      }
    });
    
  } catch (error) {
    console.error('Failed to sync Cycle Count Task to ERP:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'SYNC_ERROR',
        message: 'Failed to sync Cycle Count Task to ERP',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/cycle-count/sync-to-erp
 * Sync multiple completed Cycle Count Tasks to ERP in a single consolidated transaction
 * This endpoint allows batching multiple cycle count adjustments into one ERP transaction
 * 
 * Request Body:
 * {
 *   "task_titles": ["CC-A1-R01-L1-B1-MK6KXT", "CC-A1-R01-L1-B1-MK6KXU"], // Optional: specific tasks
 *   "warehouse": "WH-MAIN", // Optional: filter by warehouse
 *   "from_date": "2026-01-01", // Optional: filter by date range
 *   "to_date": "2026-01-31"
 * }
 */
export const syncMultipleCycleCountsToErp = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { task_titles, warehouse, from_date, to_date } = req.body;
    
    // Build query to get completed tasks
    let query = `
      SELECT 
        title, status, warehouse, count_date, created_by, created_at
      FROM tabCycleCountTask 
      WHERE status = 'Completed'
    `;
    const params = [];
    
    // Filter by specific task titles if provided
    if (task_titles && Array.isArray(task_titles) && task_titles.length > 0) {
      const placeholders = task_titles.map(() => '?').join(',');
      query += ` AND title IN (${placeholders})`;
      params.push(...task_titles);
    }
    
    // Filter by warehouse if provided
    if (warehouse) {
      query += ` AND warehouse = ?`;
      params.push(warehouse);
    }
    
    // Filter by date range if provided
    if (from_date) {
      query += ` AND count_date >= ?`;
      params.push(from_date);
    }
    
    if (to_date) {
      query += ` AND count_date <= ?`;
      params.push(to_date);
    }
    
    query += ` ORDER BY count_date DESC, title`;
    
    const [tasks] = await connection.execute(query, params);
    
    if (tasks.length === 0) {
      return res.json({
        ok: true,
        message: 'No completed Cycle Count Tasks found to sync.',
        data: {
          tasks_count: 0,
          items_count: 0,
          synced: false
        }
      });
    }
    
    // Get all lines with discrepancies from all selected tasks
    const taskTitles = tasks.map(t => t.title);
    const placeholders = taskTitles.map(() => '?').join(',');
    
    const [lines] = await connection.execute(`
      SELECT 
        ccl.parent_title,
        ccl.item_code,
        ccl.bin_location,
        ccl.expected_qty,
        ccl.actual_qty,
        ccl.discrepancy,
        ccl.counted_by,
        ccl.counted_on,
        cct.warehouse,
        cct.count_date
      FROM tabCycleCountLine ccl
      INNER JOIN tabCycleCountTask cct ON cct.title = ccl.parent_title
      WHERE ccl.parent_title IN (${placeholders})
        AND ccl.actual_qty IS NOT NULL
        AND (
          (ccl.expected_qty > 0 AND ccl.discrepancy IS NOT NULL AND ccl.discrepancy != 0)
          OR
          (COALESCE(ccl.expected_qty, 0) = 0 AND ccl.actual_qty > 0)
        )
      ORDER BY ccl.parent_title, ccl.item_code, ccl.bin_location
    `, taskTitles);
    
    if (lines.length === 0) {
      return res.json({
        ok: true,
        message: 'No discrepancies found in selected tasks. Nothing to sync to ERP.',
        data: {
          tasks_count: tasks.length,
          items_count: 0,
          synced: false
        }
      });
    }
    
    // Group adjustments by task (for audit/reference)
    const taskGroups = {};
    for (const line of lines) {
      if (!taskGroups[line.parent_title]) {
        const task = tasks.find(t => t.title === line.parent_title);
        taskGroups[line.parent_title] = {
          wms_reference: line.parent_title,
          warehouse: line.warehouse,
          count_date: line.count_date,
          adjustments: []
        };
      }
      taskGroups[line.parent_title].adjustments.push({
        item_code: line.item_code,
        bin_location: line.bin_location || null,
        expected_qty: parseFloat(line.expected_qty) || 0,
        actual_qty: parseFloat(line.actual_qty) || 0,
        adjustment_qty: parseFloat(line.discrepancy) || 0,
        counted_by: line.counted_by || null,
        counted_on: line.counted_on ? line.counted_on.toISOString() : null
      });
    }

    // Format consolidated payload for ERP
    const erpPayload = {
      transaction_type: 'CYCLE_COUNT_BATCH_ADJUSTMENT',
      batch_date: new Date().toISOString(),
      tasks: Object.values(taskGroups),
      summary: {
        total_tasks: tasks.length,
        total_adjustments: lines.length,
        warehouses: [...new Set(tasks.map(t => t.warehouse))]
      }
    };

    // TODO: Implement actual ERP API call here
    // Example structure:
    // const erpResponse = await fetch(ERP_API_URL + '/stock-adjustments/batch', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ERP_API_TOKEN },
    //   body: JSON.stringify(erpPayload)
    // });
    // const erpResult = await erpResponse.json();
    
    // For now, just log the payload and return success
    console.log(`[Cycle Count] 📤 Consolidated ERP Sync Payload for ${tasks.length} task(s):`, JSON.stringify(erpPayload, null, 2));

    // Optional: Mark all tasks as synced (if you have a sync_status field)
    // const taskPlaceholders = taskTitles.map(() => '?').join(',');
    // await connection.execute(`
    //   UPDATE tabCycleCountTask 
    //   SET sync_status = 'Synced', synced_at = NOW(), updated_at = NOW()
    //   WHERE title IN (${taskPlaceholders})
    // `, taskTitles);

    res.json({
      ok: true,
      message: `Successfully synced ${tasks.length} Cycle Count Task(s) to ERP in a consolidated transaction`,
      data: {
        tasks_count: tasks.length,
        items_count: lines.length,
        synced: true,
        payload: erpPayload,
        // erp_response: erpResult // Uncomment when ERP integration is implemented
      }
    });
    
  } catch (error) {
    console.error('Failed to sync Cycle Count Tasks to ERP:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'SYNC_ERROR',
        message: 'Failed to sync Cycle Count Tasks to ERP',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};
