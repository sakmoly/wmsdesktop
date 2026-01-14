// wms-api/src/modules/stock-ledger/stockPostingService.js
// Centralized Stock Posting Service
// Ensures stock updates are immediate and consistent everywhere

import { getConnection } from '../../db/connection.js';

/**
 * Normalize bin_location for consistent storage
 * - Trim whitespace
 * - Uppercase
 * - Remove duplicate spaces
 */
function normalizeBinLocation(binLocation) {
  if (!binLocation) return null;
  return binLocation.trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Normalize item_code for consistent storage
 * - Trim whitespace
 * - Uppercase
 */
function normalizeItemCode(itemCode) {
  if (!itemCode) return null;
  return itemCode.trim().toUpperCase();
}

/**
 * Normalize warehouse for consistent storage
 * - Trim whitespace
 * - Uppercase
 */
function normalizeWarehouse(warehouse) {
  if (!warehouse) return null;
  return warehouse.trim().toUpperCase();
}

/**
 * Generate posting key for idempotency
 * Format: "TRANSACTION_TYPE:TRANSACTION_ID"
 */
function generatePostingKey(transactionType, transactionId) {
  return `${transactionType}:${transactionId}`;
}

/**
 * Check if stock posting has already been done for this transaction
 */
async function isAlreadyPosted(connection, postingKey) {
  const [rows] = await connection.execute(
    'SELECT id FROM tabStockPostingLog WHERE posting_key = ?',
    [postingKey]
  );
  return rows.length > 0;
}

/**
 * Log stock posting to prevent duplicate processing
 */
async function logStockPosting(connection, postingKey, transactionType, transactionId, itemCodes, warehouse, postedBy) {
  const itemCodesJson = itemCodes && itemCodes.length > 0 
    ? JSON.stringify(itemCodes) 
    : null;
  
  await connection.execute(
    `INSERT INTO tabStockPostingLog 
      (posting_key, transaction_type, transaction_id, item_codes, warehouse, posted_by, posted_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE posted_at = NOW()`,
    [postingKey, transactionType, transactionId, itemCodesJson, warehouse, postedBy]
  );
}

/**
 * Rebuild item stock summary from ledger for specific items
 * Updates tabItem.stock_qty = SUM(tabStockLedger.qty) for each item
 */
async function rebuildItemStockSummary(connection, itemCodes, warehouse) {
  const affectedItems = new Set();
  
  // Use provided itemCodes directly (don't query from tabStockLedger)
  // This ensures we update ALL affected items, even if they don't have stock ledger entries yet
  let items = [];
  
  if (itemCodes && itemCodes.length > 0) {
    // Use provided item codes directly
    items = itemCodes.map(code => ({ item_code: normalizeItemCode(code) }));
  } else {
    // If no itemCodes provided, get all items from tabItem
    const [allItems] = await connection.execute('SELECT code as item_code FROM tabItem');
    items = allItems;
  }
  
  // Update each item's stock_qty from ledger
  for (const item of items) {
    const itemCode = normalizeItemCode(item.item_code);
    
    // Check if tabCartonStock exists and has data
    const [cartonStockTable] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCartonStock'
    `);
    const hasCartonStockTable = cartonStockTable.length > 0;
    
    let totalQty = 0;
    
    if (hasCartonStockTable) {
      // Prioritize tabCartonStock if available and has stock
      let cartonQuery = `
        SELECT COALESCE(SUM(cs.qty), 0) as total_qty
        FROM tabCartonStock cs
        INNER JOIN (
          SELECT 
            carton_id,
            item_code,
            warehouse,
            bin_location,
            batch_no,
            MAX(id) as max_id
          FROM tabCartonStock
          WHERE item_code = ?
            AND qty > 0
            AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
          GROUP BY carton_id, item_code, warehouse, bin_location, batch_no
        ) latest
          ON cs.carton_id = latest.carton_id
          AND cs.item_code = latest.item_code
          AND cs.warehouse = latest.warehouse
          AND cs.bin_location = latest.bin_location
          AND (cs.batch_no = latest.batch_no OR (cs.batch_no IS NULL AND latest.batch_no IS NULL))
          AND cs.id = latest.max_id
        WHERE cs.item_code = ?
          AND cs.qty > 0
          AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')
      `;
      const cartonParams = [itemCode, itemCode];
      
      if (warehouse) {
        cartonQuery = cartonQuery.replace('WHERE cs.item_code = ?', 'WHERE cs.item_code = ? AND cs.warehouse = ?');
        cartonParams.push(normalizeWarehouse(warehouse));
      }
      
      const [cartonSum] = await connection.execute(cartonQuery, cartonParams);
      totalQty = parseFloat(cartonSum[0].total_qty) || 0;
    }
    
    // If no carton stock or carton stock is 0, use stock ledger
    if (totalQty === 0) {
      let ledgerQuery = `
        SELECT COALESCE(SUM(qty), 0) as total_qty
        FROM tabStockLedger
        WHERE item_code = ?
      `;
      const ledgerParams = [itemCode];
      
      if (warehouse) {
        ledgerQuery += ' AND warehouse = ?';
        ledgerParams.push(normalizeWarehouse(warehouse));
      }
      
      const [stockSum] = await connection.execute(ledgerQuery, ledgerParams);
      totalQty = parseFloat(stockSum[0].total_qty) || 0;
    }
    
    // Get current tabItem.stock_qty for validation
    const [currentItem] = await connection.execute(
      'SELECT stock_qty FROM tabItem WHERE code = ?',
      [itemCode]
    );
    const currentStockQty = currentItem.length > 0 ? parseFloat(currentItem[0].stock_qty) || 0 : 0;
    
    // Validate: Check if there's a discrepancy
    const discrepancy = Math.abs(totalQty - currentStockQty);
    if (discrepancy > 0.01) {
      console.warn(`⚠️  Stock discrepancy detected for ${itemCode}:`);
      console.warn(`   Current tabItem.stock_qty: ${currentStockQty}`);
      console.warn(`   Calculated from ledger/carton: ${totalQty}`);
      console.warn(`   Difference: ${discrepancy > 0 ? '+' : ''}${discrepancy}`);
      console.warn(`   Auto-correcting to calculated value...`);
    }
    
    // Update tabItem.stock_qty (always use calculated value to fix any discrepancies)
    await connection.execute(
      `UPDATE tabItem
       SET stock_qty = ?,
           updated_at = NOW()
       WHERE code = ?`,
      [totalQty, itemCode]
    );
    
    affectedItems.add(itemCode);
    
    if (discrepancy > 0.01) {
      console.log(`✅ Fixed stock discrepancy for ${itemCode}: ${currentStockQty} → ${totalQty} (corrected by ${discrepancy > 0 ? '+' : ''}${discrepancy})`);
    } else {
      console.log(`✅ Rebuilt item stock summary for ${itemCode}: ${totalQty}`);
    }
  }
  
  return Array.from(affectedItems);
}

/**
 * Rebuild bin stock summary from ledger
 * This ensures tabStockLedger is the source of truth
 * Bin stock = SUM(qty) from tabStockLedger grouped by (item_code, warehouse, bin_location)
 */
async function rebuildBinStockSummary(connection, itemCodes, warehouse) {
  // tabStockLedger already contains bin-level stock
  // This function ensures consistency by removing duplicates and normalizing
  // Also validates and fixes any discrepancies
  
  let query = `
    SELECT 
      item_code,
      warehouse,
      bin_location,
      SUM(qty) as total_qty,
      COUNT(*) as record_count
    FROM tabStockLedger
    WHERE 1=1
  `;
  const params = [];
  
  if (itemCodes && itemCodes.length > 0) {
    query += ' AND item_code IN (' + itemCodes.map(() => '?').join(',') + ')';
    params.push(...itemCodes.map(code => normalizeItemCode(code)));
  }
  
  if (warehouse) {
    query += ' AND warehouse = ?';
    params.push(normalizeWarehouse(warehouse));
  }
  
  query += ' GROUP BY item_code, warehouse, bin_location';
  
  const [binStocks] = await connection.execute(query, params);
  
  let duplicatesFixed = 0;
  let discrepanciesFixed = 0;
  
  // Update tabStockLedger to ensure one record per (item_code, warehouse, bin_location)
  // This handles any duplicates that might exist
  for (const binStock of binStocks) {
    const itemCode = normalizeItemCode(binStock.item_code);
    const normalizedWarehouse = normalizeWarehouse(binStock.warehouse);
    const normalizedBin = normalizeBinLocation(binStock.bin_location);
    const totalQty = parseFloat(binStock.total_qty) || 0;
    const recordCount = parseInt(binStock.record_count) || 1;
    
    // Check for duplicates
    if (recordCount > 1) {
      duplicatesFixed++;
      console.warn(`⚠️  Found ${recordCount} duplicate records for ${itemCode} @ ${normalizedWarehouse}/${normalizedBin}, consolidating to ${totalQty}`);
    }
    
    // Get current value to check for discrepancies
    const [currentBin] = await connection.execute(
      `SELECT qty FROM tabStockLedger 
       WHERE item_code = ? AND warehouse = ? AND bin_location = ?
       LIMIT 1`,
      [itemCode, normalizedWarehouse, normalizedBin]
    );
    
    if (currentBin.length > 0) {
      const currentQty = parseFloat(currentBin[0].qty) || 0;
      const discrepancy = Math.abs(totalQty - currentQty);
      
      if (discrepancy > 0.01) {
        discrepanciesFixed++;
        console.warn(`⚠️  Bin stock discrepancy for ${itemCode} @ ${normalizedBin}: ${currentQty} → ${totalQty} (fixing...)`);
      }
    }
    
    // Use INSERT ... ON DUPLICATE KEY UPDATE to ensure single record with correct value
    await connection.execute(
      `INSERT INTO tabStockLedger 
        (item_code, warehouse, bin_location, qty, updated_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         qty = ?,
         updated_at = NOW()`,
      [itemCode, normalizedWarehouse, normalizedBin, totalQty, totalQty]
    );
  }
  
  // If there were duplicates, delete the extra records
  if (duplicatesFixed > 0) {
    for (const binStock of binStocks) {
      const itemCode = normalizeItemCode(binStock.item_code);
      const normalizedWarehouse = normalizeWarehouse(binStock.warehouse);
      const normalizedBin = normalizeBinLocation(binStock.bin_location);
      
      // Keep only the most recent record (highest id), delete others
      await connection.execute(
        `DELETE FROM tabStockLedger
         WHERE item_code = ? AND warehouse = ? AND bin_location = ?
         AND id NOT IN (
           SELECT id FROM (
             SELECT MAX(id) as id
             FROM tabStockLedger
             WHERE item_code = ? AND warehouse = ? AND bin_location = ?
           ) AS keep
         )`,
        [itemCode, normalizedWarehouse, normalizedBin, itemCode, normalizedWarehouse, normalizedBin]
      );
    }
  }
  
  if (duplicatesFixed > 0 || discrepanciesFixed > 0) {
    console.log(`✅ Rebuilt bin stock summary: ${binStocks.length} locations, ${duplicatesFixed} duplicates fixed, ${discrepanciesFixed} discrepancies fixed`);
  } else {
    console.log(`✅ Rebuilt bin stock summary for ${binStocks.length} bin locations`);
  }
  
  return binStocks.length;
}

/**
 * Mark item as dirty for recalculation
 */
async function markItemDirty(connection, itemCode, warehouse, reason) {
  try {
    await connection.execute(
      `INSERT INTO tabStockDirtyFlag 
        (item_code, warehouse, marked_at, reason, recalculated_count)
       VALUES (?, ?, NOW(), ?, 0)
       ON DUPLICATE KEY UPDATE
         marked_at = NOW(),
         reason = ?,
         recalculated_at = NULL`,
      [normalizeItemCode(itemCode), normalizeWarehouse(warehouse), reason, reason]
    );
  } catch (error) {
    // If table doesn't exist, just log and continue
    if (error.message.includes("doesn't exist") || error.message.includes("Unknown table")) {
      console.warn(`⚠️  tabStockDirtyFlag table not found, skipping dirty flag (run CreateDirtyFlagTable.sql)`);
    } else {
      console.error(`⚠️  Failed to mark item as dirty: ${error.message}`);
    }
  }
}

/**
 * Recalculate dirty items for a warehouse (self-healing)
 * Called automatically when any transaction occurs in a warehouse
 */
async function recalculateDirtyItems(connection, warehouse, limit = 10) {
  try {
    // Check if table exists
    const [tableCheck] = await connection.execute(`
      SELECT COUNT(*) > 0 as table_exists
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabStockDirtyFlag'
    `);
    
    if (!tableCheck[0].table_exists) {
      return { recalculated: 0, cleared: 0 };
    }
    
    // Get dirty items for this warehouse (limit batch size)
    const [dirtyItems] = await connection.execute(
      `SELECT item_code, warehouse, reason
       FROM tabStockDirtyFlag
       WHERE warehouse = ?
         AND (recalculated_at IS NULL OR recalculated_at < DATE_SUB(NOW(), INTERVAL 1 HOUR))
       ORDER BY marked_at ASC
       LIMIT ?`,
      [normalizeWarehouse(warehouse), limit]
    );
    
    if (dirtyItems.length === 0) {
      return { recalculated: 0, cleared: 0 };
    }
    
    console.log(`🔄 Self-healing: Recalculating ${dirtyItems.length} dirty item(s) for warehouse ${warehouse}`);
    
    let recalculated = 0;
    let cleared = 0;
    
    for (const dirtyItem of dirtyItems) {
      const itemCode = normalizeItemCode(dirtyItem.item_code);
      const itemWarehouse = normalizeWarehouse(dirtyItem.warehouse);
      
      try {
        // Rebuild stock for this item
        await rebuildItemStockSummary(connection, [itemCode], itemWarehouse);
        
        // Validate consistency
        const [ledgerSum] = await connection.execute(
          `SELECT COALESCE(SUM(qty), 0) as total_qty
           FROM tabStockLedger
           WHERE item_code = ? AND warehouse = ?`,
          [itemCode, itemWarehouse]
        );
        const ledgerTotal = parseFloat(ledgerSum[0].total_qty) || 0;
        
        const [itemRow] = await connection.execute(
          'SELECT stock_qty FROM tabItem WHERE code = ?',
          [itemCode]
        );
        const itemStock = itemRow.length > 0 ? parseFloat(itemRow[0].stock_qty) || 0 : 0;
        
        const discrepancy = Math.abs(ledgerTotal - itemStock);
        
        if (discrepancy <= 0.01) {
          // Fixed! Clear dirty flag
          await connection.execute(
            `UPDATE tabStockDirtyFlag
             SET recalculated_at = NOW(),
                 recalculated_count = recalculated_count + 1
             WHERE item_code = ? AND warehouse = ?`,
            [itemCode, itemWarehouse]
          );
          cleared++;
          console.log(`✅ Self-healed: ${itemCode} @ ${itemWarehouse} (was: ${dirtyItem.reason})`);
        } else {
          // Still has discrepancy, keep dirty but update recalculated timestamp
          await connection.execute(
            `UPDATE tabStockDirtyFlag
             SET recalculated_at = NOW(),
                 recalculated_count = recalculated_count + 1
             WHERE item_code = ? AND warehouse = ?`,
            [itemCode, itemWarehouse]
          );
          recalculated++;
          console.warn(`⚠️  Still dirty after recalculation: ${itemCode} @ ${itemWarehouse} (discrepancy: ${discrepancy})`);
        }
      } catch (itemError) {
        console.error(`⚠️  Failed to recalculate dirty item ${itemCode}: ${itemError.message}`);
      }
    }
    
    return { recalculated, cleared };
  } catch (error) {
    console.error(`⚠️  Failed to recalculate dirty items: ${error.message}`);
    return { recalculated: 0, cleared: 0 };
  }
}

/**
 * Main stock posting function
 * - Checks idempotency
 * - Rebuilds item stock summary
 * - Rebuilds bin stock summary
 * - Validates consistency
 * - Marks dirty items if discrepancies found
 * - Self-heals dirty items for the warehouse
 * - Logs the posting
 * - All in a single transaction
 */
export async function postStock(transactionType, transactionId, options = {}) {
  const {
    itemCodes = [],
    warehouse = null,
    postedBy = null,
    connection: providedConnection = null
  } = options;
  
  const connection = providedConnection || await getConnection();
  const useTransaction = !providedConnection; // Only use transaction if we created the connection
  
  try {
    if (useTransaction) {
      await connection.beginTransaction();
    }
    
    // Generate posting key
    const postingKey = generatePostingKey(transactionType, transactionId);
    
    // Check if already posted
    if (await isAlreadyPosted(connection, postingKey)) {
      console.log(`⏭️  Stock already posted for ${postingKey}, skipping...`);
      return {
        posted: false,
        reason: 'already_posted',
        postingKey
      };
    }
    
    // Normalize item codes
    const normalizedItemCodes = itemCodes.map(code => normalizeItemCode(code));
    
    // Rebuild item stock summary (with auto-correction)
    const affectedItems = await rebuildItemStockSummary(connection, normalizedItemCodes, warehouse);
    
    // Rebuild bin stock summary (with duplicate removal and validation)
    const binLocationsCount = await rebuildBinStockSummary(connection, normalizedItemCodes, warehouse);
    
    // Validate final stock consistency after posting
    let validationWarnings = [];
    let dirtyItemsMarked = 0;
    
    for (const itemCode of normalizedItemCodes) {
      // Get calculated total from ledger
      const ledgerQuery = warehouse
        ? `SELECT COALESCE(SUM(qty), 0) as total_qty FROM tabStockLedger WHERE item_code = ? AND warehouse = ?`
        : `SELECT COALESCE(SUM(qty), 0) as total_qty FROM tabStockLedger WHERE item_code = ?`;
      
      const ledgerParams = warehouse 
        ? [itemCode, normalizeWarehouse(warehouse)]
        : [itemCode];
      
      const [ledgerSum] = await connection.execute(ledgerQuery, ledgerParams);
      const ledgerTotal = parseFloat(ledgerSum[0].total_qty) || 0;
      
      // Get item stock
      const [itemRow] = await connection.execute(
        'SELECT stock_qty FROM tabItem WHERE code = ?',
        [itemCode]
      );
      const itemStock = itemRow.length > 0 ? parseFloat(itemRow[0].stock_qty) || 0 : 0;
      
      // Check consistency
      const discrepancy = Math.abs(ledgerTotal - itemStock);
      if (discrepancy > 0.01) {
        validationWarnings.push({
          item_code: itemCode,
          ledger_total: ledgerTotal,
          item_stock: itemStock,
          discrepancy: discrepancy
        });
        
        // Auto-correct: Update item stock to match ledger
        await connection.execute(
          `UPDATE tabItem SET stock_qty = ?, updated_at = NOW() WHERE code = ?`,
          [ledgerTotal, itemCode]
        );
        console.warn(`⚠️  Auto-corrected stock for ${itemCode}: ${itemStock} → ${ledgerTotal} (discrepancy: ${discrepancy})`);
        
        // If auto-correction fails or discrepancy persists, mark as dirty
        // Check again after update
        const [itemRowAfter] = await connection.execute(
          'SELECT stock_qty FROM tabItem WHERE code = ?',
          [itemCode]
        );
        const itemStockAfter = itemRowAfter.length > 0 ? parseFloat(itemRowAfter[0].stock_qty) || 0 : 0;
        const discrepancyAfter = Math.abs(ledgerTotal - itemStockAfter);
        
        if (discrepancyAfter > 0.01) {
          // Still has discrepancy, mark as dirty for next transaction
          const itemWarehouse = warehouse || 'ALL';
          await markItemDirty(connection, itemCode, itemWarehouse, `Discrepancy after auto-correction: ${discrepancyAfter}`);
          dirtyItemsMarked++;
        }
      }
    }
    
    // Self-healing: Recalculate dirty items for this warehouse (if warehouse specified)
    let selfHealingResult = { recalculated: 0, cleared: 0 };
    if (warehouse) {
      selfHealingResult = await recalculateDirtyItems(connection, warehouse, 10);
    }
    
    // Log the posting
    await logStockPosting(
      connection,
      postingKey,
      transactionType,
      transactionId,
      normalizedItemCodes,
      warehouse ? normalizeWarehouse(warehouse) : null,
      postedBy
    );
    
    if (useTransaction) {
      await connection.commit();
    }
    
    if (validationWarnings.length > 0) {
      console.log(`✅ Stock posted for ${postingKey}: ${affectedItems.length} items, ${binLocationsCount} bin locations`);
      console.warn(`⚠️  ${validationWarnings.length} discrepancy(ies) detected and auto-corrected`);
    } else {
      console.log(`✅ Stock posted for ${postingKey}: ${affectedItems.length} items, ${binLocationsCount} bin locations`);
    }
    
    return {
      posted: true,
      postingKey,
      affectedItems: Array.from(affectedItems),
      binLocationsCount,
      discrepanciesFixed: validationWarnings.length,
      warnings: validationWarnings.length > 0 ? validationWarnings : null
    };
    
  } catch (error) {
    if (useTransaction) {
      await connection.rollback();
    }
    console.error(`❌ Stock posting failed for ${transactionType}:${transactionId}:`, error);
    throw error;
  } finally {
    if (!providedConnection) {
      connection.release();
    }
  }
}

/**
 * Diagnose stock discrepancies
 * Returns ledger total, item stock total, and bin stock totals
 */
export async function diagnoseStock(itemCode, warehouse) {
  const connection = await getConnection();
  
  try {
    const normalizedItemCode = normalizeItemCode(itemCode);
    const normalizedWarehouse = normalizeWarehouse(warehouse);
    
    // Get ledger total
    const [ledgerRows] = await connection.execute(
      `SELECT COALESCE(SUM(qty), 0) as total_qty
       FROM tabStockLedger
       WHERE item_code = ? AND warehouse = ?`,
      [normalizedItemCode, normalizedWarehouse]
    );
    const ledgerTotal = parseFloat(ledgerRows[0].total_qty) || 0;
    
    // Get item stock total
    const [itemRows] = await connection.execute(
      `SELECT stock_qty FROM tabItem WHERE code = ?`,
      [normalizedItemCode]
    );
    const itemStockTotal = itemRows.length > 0 ? parseFloat(itemRows[0].stock_qty) || 0 : 0;
    
    // Get bin stock totals (sum of all bins)
    const [binRows] = await connection.execute(
      `SELECT 
         bin_location,
         SUM(qty) as bin_qty
       FROM tabStockLedger
       WHERE item_code = ? AND warehouse = ?
       GROUP BY bin_location
       ORDER BY bin_location`,
      [normalizedItemCode, normalizedWarehouse]
    );
    
    const binStockTotal = binRows.reduce((sum, row) => sum + (parseFloat(row.bin_qty) || 0), 0);
    const binBreakdown = binRows.map(row => ({
      bin_location: row.bin_location,
      qty: parseFloat(row.bin_qty) || 0
    }));
    
    // Check for duplicates in tabStockLedger
    const [duplicateRows] = await connection.execute(
      `SELECT 
         item_code,
         warehouse,
         bin_location,
         COUNT(*) as count,
         SUM(qty) as total_qty
       FROM tabStockLedger
       WHERE item_code = ? AND warehouse = ?
       GROUP BY item_code, warehouse, bin_location
       HAVING COUNT(*) > 1`,
      [normalizedItemCode, normalizedWarehouse]
    );
    
    // Check for mismatches
    const ledgerVsItem = Math.abs(ledgerTotal - itemStockTotal) < 0.01 ? 'match' : 'mismatch';
    const ledgerVsBin = Math.abs(ledgerTotal - binStockTotal) < 0.01 ? 'match' : 'mismatch';
    
    return {
      item_code: normalizedItemCode,
      warehouse: normalizedWarehouse,
      ledger_total: ledgerTotal,
      item_stock_total: itemStockTotal,
      bin_stock_total: binStockTotal,
      bin_breakdown: binBreakdown,
      matches: {
        ledger_vs_item: ledgerVsItem,
        ledger_vs_bin: ledgerVsBin
      },
      discrepancies: {
        item_difference: itemStockTotal - ledgerTotal,
        bin_difference: binStockTotal - ledgerTotal
      },
      duplicates: duplicateRows.map(row => ({
        bin_location: row.bin_location,
        duplicate_count: row.count,
        total_qty: parseFloat(row.total_qty) || 0
      }))
    };
    
  } catch (error) {
    console.error('Failed to diagnose stock:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Export normalization functions for use in other modules
export { normalizeBinLocation, normalizeItemCode, normalizeWarehouse };
