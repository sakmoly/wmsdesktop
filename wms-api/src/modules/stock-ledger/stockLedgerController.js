// wms-api/src/modules/stock-ledger/stockLedgerController.js
// Stock Ledger API endpoints

import { getConnection } from "../../db/connection.js";
import { normalizeWarehouse } from "../../utils/warehouseUtils.js";
import { logger } from "../../utils/logger.js";

/**
 * Helper function to resolve full location_id from bin_location
 * Handles both old format (e.g., "Rack 02-B2") and new format (e.g., "A1-R02-L1-B2")
 * Returns the full location_id if found, otherwise returns the original bin_location
 */
export async function resolveFullLocationId(connection, binLocation, warehouse) {
  if (!binLocation || !warehouse) {
    return binLocation;
  }

  // Try exact match first (new format like "A1-R02-L1-B2")
  const [exactMatch] = await connection.execute(
    `SELECT location_id FROM tabLocation WHERE location_id = ? AND warehouse = ? LIMIT 1`,
    [binLocation, warehouse]
  );

  if (exactMatch.length > 0) {
    return exactMatch[0].location_id; // Already in correct format
  }

  // Try to parse old format like "Rack 02-B2"
  const parts = binLocation.split('-');
  if (parts.length >= 2) {
    const binPart = parts[parts.length - 1].trim(); // "B2"
    const rackPart = parts.slice(0, -1).join('-').trim(); // "Rack 02"

    // Try to match by parent_rack and bin_id
    const [matchByRackBin] = await connection.execute(
      `SELECT location_id FROM tabLocation 
       WHERE warehouse = ?
         AND (
           parent_rack = ? 
           OR parent_rack LIKE ? 
           OR parent_rack LIKE ?
         )
         AND bin_id = ?
       LIMIT 1`,
      [
        warehouse,
        rackPart, // Exact match: "Rack 02"
        `%${rackPart.replace('Rack ', '').trim()}%`, // Contains "02"
        `%${rackPart}%`, // Contains "Rack 02"
        binPart // bin_id = "B2"
      ]
    );

    if (matchByRackBin.length > 0) {
      return matchByRackBin[0].location_id; // Return full location_id
    }
  }

  // Fallback: return original bin_location if no match found
  return binLocation;
}

/**
 * GET /api/stock/ledger
 * Get stock ledger entries filtered by bin_location (required) and optional carton_id
 * Designed for Cycle Count mobile workflow to fetch expected items before creating tasks
 * 
 * Query Parameters:
 * - bin_location (required): Filter by bin code or location ID (e.g., A1-R01-L2-B1)
 * - carton_id (optional): Filter by carton ID for carton-level inventory (e.g., CTN-001)
 * - warehouse (optional): Filter by warehouse code
 * - item_code (optional): Filter by specific item code
 * 
 * Response Format:
 * {
 *   "data": [...],
 *   "total": number,
 *   "bin_location": string,
 *   "carton_id": string | null
 * }
 */
export const getStockLedgerByLocation = async (req, res) => {
  const connection = await getConnection();

  try {
    const { bin_location, carton_id, warehouse, item_code } = req.query;

    // Validation: bin_location is required
    if (!bin_location || (typeof bin_location === 'string' && bin_location.trim() === '')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PARAMETER',
          message: 'bin_location parameter is required',
          details: {
            parameter: 'bin_location',
            value: bin_location || null,
            expected: 'string (non-empty)'
          }
        }
      });
    }

    const normalizedBinLocation = typeof bin_location === 'string' ? bin_location.trim() : String(bin_location);
    const normalizedCartonId = carton_id && typeof carton_id === 'string' ? carton_id.trim() : (carton_id || null);
    const normalizedWarehouse = warehouse && typeof warehouse === 'string' ? warehouse.trim() : (warehouse || null);
    const normalizedItemCode = item_code && typeof item_code === 'string' ? item_code.trim() : (item_code || null);

    // Validate that bin_location exists in tabLocation (single source of truth)
    // This ensures data integrity and confirms the location is valid
    const [locationCheck] = await connection.execute(`
      SELECT location_id, warehouse, is_available
      FROM tabLocation 
      WHERE location_id = ?
    `, [normalizedBinLocation]);

    if (locationCheck.length === 0) {
      return res.status(404).json({
        error: {
          code: 'LOCATION_NOT_FOUND',
          message: `Location "${normalizedBinLocation}" not found in tabLocation table`,
          details: {
            bin_location: normalizedBinLocation,
            suggestion: 'Please verify the location ID exists in the location master data (tabLocation)'
          }
        }
      });
    }

    const locationInfo = locationCheck[0];
    
    // Optional: Check if location is available (if needed)
    // if (!locationInfo.is_available) {
    //   return res.status(400).json({
    //     error: {
    //       code: 'LOCATION_NOT_AVAILABLE',
    //       message: `Location "${normalizedBinLocation}" is not available`,
    //       details: {
    //         bin_location: normalizedBinLocation,
    //         is_available: false
    //       }
    //     }
    //   });
    // }

    // ✅ Location validated: bin_location exists in tabLocation (single source of truth)
    // Note: warehouse from locationInfo.warehouse is available if needed, but we use the warehouse filter if provided

    // Check if tabCartonStock table exists (for carton-level inventory)
    const [cartonStockTable] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCartonStock'
    `);
    const hasCartonStockTable = cartonStockTable.length > 0;

    let query;
    let params = [];

    // If carton_id is provided and tabCartonStock exists, query from carton stock table
    if (normalizedCartonId && hasCartonStockTable) {
      // Carton-level inventory: Query from tabCartonStock
      query = `
        SELECT 
          cs.item_code,
          cs.qty,
          cs.bin_location,
          cs.carton_id,
          cs.warehouse,
          cs.warehouse as warehouse_id,
          cs.batch_no,
          cs.serial_no,
          cs.status,
          cs.updated_at as last_updated,
          i.name as item_name,
          i.barcode,
          i.stock_uom as uom,
          NULL as expiry_date
        FROM tabCartonStock cs
        LEFT JOIN tabItem i ON cs.item_code = i.code
        WHERE UPPER(TRIM(cs.bin_location)) = UPPER(TRIM(?))
          AND UPPER(TRIM(cs.carton_id)) = UPPER(TRIM(?))
      `;
      params.push(normalizedBinLocation, normalizedCartonId);

      if (normalizedWarehouse) {
        query += ' AND UPPER(TRIM(cs.warehouse)) = UPPER(TRIM(?))';
        params.push(normalizedWarehouse);
      }

      if (normalizedItemCode) {
        query += ' AND UPPER(TRIM(cs.item_code)) = UPPER(TRIM(?))';
        params.push(normalizedItemCode);
      }

      // Only show items with stock > 0 (or include 0 for complete view - remove this line if needed)
      query += ' AND cs.qty > 0';

      // Only show items with PUTAWAY status (exclude PICKED, SHIPPED, etc.)
      // For cycle count, we want to see items that are currently in the bin
      query += ` AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')`;

      query += ' ORDER BY cs.item_code ASC';
    } else {
      // Bin-level inventory: Query from tabStockLedger
      // Check if carton_id column exists in tabStockLedger
      const [stockLedgerCartonIdColumn] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabStockLedger' 
        AND COLUMN_NAME = 'carton_id'
      `);
      const hasStockLedgerCartonIdColumn = stockLedgerCartonIdColumn.length > 0;
      
      const cartonIdSelect = hasStockLedgerCartonIdColumn ? "sl.carton_id" : "NULL as carton_id";
      
      query = `
        SELECT 
          sl.item_code,
          sl.qty,
          sl.bin_location,
          ${cartonIdSelect},
          sl.warehouse,
          sl.warehouse as warehouse_id,
          NULL as batch_no,
          NULL as serial_no,
          NULL as status,
          sl.last_transaction_date as last_updated,
          i.name as item_name,
          i.barcode,
          i.stock_uom as uom,
          NULL as expiry_date
        FROM tabStockLedger sl
        LEFT JOIN tabItem i ON sl.item_code = i.code
        WHERE UPPER(TRIM(sl.bin_location)) = UPPER(TRIM(?))
      `;
      params.push(normalizedBinLocation);

      // Note: For bin-level queries, we only query tabStockLedger
      // Carton stock is tracked separately in tabCartonStock (hybrid approach)
      // No need to exclude - both tables are independent

      if (normalizedWarehouse) {
        query += ' AND UPPER(TRIM(sl.warehouse)) = UPPER(TRIM(?))';
        params.push(normalizedWarehouse);
      }

      if (normalizedItemCode) {
        query += ' AND UPPER(TRIM(sl.item_code)) = UPPER(TRIM(?))';
        params.push(normalizedItemCode);
      }

      // Only show items with stock > 0 (or include 0 for complete view - remove this line if needed)
      query += ' AND sl.qty > 0';

      query += ' ORDER BY sl.item_code ASC';
    }

    const [rows] = await connection.execute(query, params);

    // Resolve full location_id and get location details for all rows
    const uniqueBinLocations = [...new Set(rows.map(r => r.bin_location || normalizedBinLocation).filter(Boolean))];
    const locationDetailsMap = new Map();
    
    if (uniqueBinLocations.length > 0 && normalizedWarehouse) {
      const placeholders = uniqueBinLocations.map(() => '?').join(',');
      const [locationDetails] = await connection.execute(
        `SELECT location_id, zone, aisle, parent_rack, level, bin_id 
         FROM tabLocation 
         WHERE warehouse = ? AND location_id IN (${placeholders})`,
        [normalizedWarehouse, ...uniqueBinLocations]
      );
      
      for (const loc of locationDetails) {
        locationDetailsMap.set(loc.location_id, {
          location_id: loc.location_id,
          zone: loc.zone || null,
          aisle: loc.aisle || null,
          rack: loc.parent_rack || null,
          level: loc.level || null,
          bin: loc.bin_id || null
        });
      }
    }
    
    // Format response according to specification
    const stockLedger = rows.map((row) => {
      const binLoc = row.bin_location || normalizedBinLocation;
      const locationDetails = binLoc ? locationDetailsMap.get(binLoc) : null;
      
      // Get carton_id from row (may be from tabCartonStock or tabStockLedger)
      const cartonId = row.carton_id || normalizedCartonId || null;
      
      return {
        item_code: row.item_code,
        item_name: row.item_name || null,
        barcode: row.barcode || row.item_code, // Use item_code as barcode if barcode is null
        qty: parseFloat(row.qty) || 0,
        bin_location: binLoc, // Keep for backward compatibility
        location_id: binLoc || null, // ✅ REQUIRED: Full composite location ID (same as bin_location)
        zone: locationDetails?.zone || null,
        aisle: locationDetails?.aisle || null,
        rack: locationDetails?.rack || null,
        level: locationDetails?.level || null,
        bin: locationDetails?.bin || null,
        carton_id: cartonId, // ✅ REQUIRED: Include carton_id (or null if not applicable)
        warehouse: row.warehouse || null,
        warehouse_id: row.warehouse_id || row.warehouse || null,
        uom: row.uom || 'EA',
        last_updated: row.last_updated ? row.last_updated.toISOString() : null,
        batch_no: row.batch_no || null,
        serial_no: row.serial_no || null,
        expiry_date: row.expiry_date || null
      };
    });

    // Return 200 OK with empty array if no stock found (preferred for mobile apps)
    // Response format matches specification exactly
    res.json({
      data: stockLedger,
      total: stockLedger.length,
      bin_location: normalizedBinLocation,
      carton_id: normalizedCartonId || null
    });

  } catch (error) {
    console.error('Failed to fetch stock ledger by location:', error);
    res.status(500).json({
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to query stock ledger',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/stock-ledger
 * Get stock ledger entries with pagination, date range filtering, and search
 *
 * Query Parameters:
 * - warehouse (optional): Filter by warehouse
 * - item_code (optional): Filter by item code (partial match with LIKE)
 * - bin_location (optional): Filter by bin location
 * - from_date (optional): Filter by last_transaction_date >= from_date (YYYY-MM-DD format)
 * - to_date (optional): Filter by last_transaction_date <= to_date (YYYY-MM-DD format)
 * - page (optional): Page number (default: 1)
 * - page_size (optional): Items per page (default: 100, max: 500)
 *
 * Response Format:
 * {
 *   "data": [...],
 *   "pagination": {
 *     "page": 1,
 *     "page_size": 100,
 *     "total_count": 150000,
 *     "total_pages": 1500
 *   }
 * }
 */
export const getStockLedger = async (req, res) => {
  const connection = await getConnection();

  try {
    const {
      warehouse,
      item_code,
      bin_location,
      from_date,
      to_date,
      reference_id,  // For putaway validation: filter by putaway_task_id (maps to last_transaction_ref)
      reference_doctype,  // For putaway validation: filter by transaction type (maps to last_transaction_type, e.g., "PUTAWAY")
      carton_id,  // For putaway validation: filter by carton_id (if column exists)
      page = "1",
      page_size = "100",
    } = req.query;

    // Parse pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(page_size) || 100));
    const offset = (pageNum - 1) * pageSize;

    // Build WHERE clause (bare names for single-table subqueries / count)
    // and sl.-qualified copy for the outer query (joins th which also has item_code, warehouse, bin_location).
    const conditions = ["1=1"];
    const conditionsSl = ["1=1"];
    const params = [];

    if (warehouse) {
      conditions.push("warehouse = ?");
      conditionsSl.push("sl.warehouse = ?");
      params.push(warehouse);
    }

    if (item_code) {
      conditions.push("item_code LIKE ?");
      conditionsSl.push("sl.item_code LIKE ?");
      params.push(`%${item_code}%`);
    }

    if (bin_location !== undefined) {
      if (
        bin_location === null ||
        bin_location === "null" ||
        bin_location === ""
      ) {
        conditions.push("bin_location IS NULL");
        conditionsSl.push("sl.bin_location IS NULL");
      } else {
        conditions.push("bin_location = ?");
        conditionsSl.push("sl.bin_location = ?");
        params.push(bin_location);
      }
    }

    if (reference_id) {
      conditions.push("last_transaction_ref = ?");
      conditionsSl.push("sl.last_transaction_ref = ?");
      params.push(reference_id);
    }
    
    if (reference_doctype) {
      conditions.push("last_transaction_type = ?");
      conditionsSl.push("sl.last_transaction_type = ?");
      params.push(reference_doctype);
    }
    
    // Check if carton_id column exists and filter by it if provided
    if (carton_id) {
      const [cartonIdColumn] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabStockLedger' 
        AND COLUMN_NAME = 'carton_id'
      `);
      const hasCartonIdColumn = cartonIdColumn.length > 0;
      
      if (hasCartonIdColumn) {
        conditions.push("carton_id = ?");
        conditionsSl.push("sl.carton_id = ?");
        params.push(carton_id);
      }
    }

    if (from_date) {
      conditions.push("DATE(last_transaction_date) >= ?");
      conditionsSl.push("DATE(sl.last_transaction_date) >= ?");
      params.push(from_date);
    }

    if (to_date) {
      conditions.push("DATE(last_transaction_date) <= ?");
      conditionsSl.push("DATE(sl.last_transaction_date) <= ?");
      params.push(to_date);
    }

    const whereClause = conditions.join(" AND ");
    const whereClauseSl = conditionsSl.join(" AND ");

    // Check if qty_before and qty_reduced columns exist
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockLedger' 
      AND COLUMN_NAME IN ('qty_before', 'qty_reduced')
    `);

    const hasQtyBefore = columns.some(
      (col) => col.COLUMN_NAME === "qty_before"
    );
    const hasQtyReduced = columns.some(
      (col) => col.COLUMN_NAME === "qty_reduced"
    );

    // ✅ FIX: Join with tabTransactionHistory to get aggregated values
    // This ensures Stock Ledger matches Transaction History (aggregated values)
    // IMPORTANT: Aggregate by item+location+reference to handle multiple cartons
    // ANY_VALUE(sl.*) satisfies ONLY_FULL_GROUP_BY when th join produces multiple rows per sl group.
    const qtyBeforeSelect = hasQtyBefore 
      ? "COALESCE(MAX(th.qty_before), ANY_VALUE(sl.qty_before)) as qty_before" 
      : "COALESCE(MAX(th.qty_before), NULL) as qty_before";
    
    const qtyReducedSelect = hasQtyReduced
      ? "COALESCE(SUM(th.qty_change), ANY_VALUE(sl.qty_reduced)) as qty_reduced"
      : "COALESCE(SUM(th.qty_change), NULL) as qty_reduced";

    // Get total count (use DISTINCT to count unique item+warehouse+bin combinations)
    // This prevents duplicate entries from inflating the count
    const countQuery = `SELECT COUNT(DISTINCT CONCAT(item_code, '|', warehouse, '|', COALESCE(bin_location, ''))) as total FROM tabStockLedger WHERE ${whereClause}`;
    const [countRows] = await connection.execute(countQuery, params);
    const totalCount = countRows[0].total;
    const totalPages = Math.ceil(totalCount / pageSize);

    // Get paginated data
    // CRITICAL: Use subquery to get most recent row for each item+warehouse+bin combination
    // ✅ FIX: LEFT JOIN with tabTransactionHistory to get aggregated values
    // This ensures Stock Ledger shows aggregated values that match Transaction History
    let dataQuery = `
      SELECT 
        sl.item_code,
        sl.warehouse,
        sl.bin_location,
        sl.qty,
        sl.reserved_qty,
        ${qtyBeforeSelect},
        ${qtyReducedSelect},
        sl.last_transaction_date,
        sl.last_transaction_type,
        sl.last_transaction_ref,
        sl.updated_at,
        sl.created_at
      FROM tabStockLedger sl
      INNER JOIN (
        SELECT 
          item_code,
          warehouse,
          bin_location,
          MAX(last_transaction_date) as max_date
        FROM tabStockLedger
        WHERE ${whereClause}
        GROUP BY item_code, warehouse, bin_location
      ) latest ON sl.item_code = latest.item_code
        AND sl.warehouse = latest.warehouse
        AND (sl.bin_location = latest.bin_location OR (sl.bin_location IS NULL AND latest.bin_location IS NULL))
        AND sl.last_transaction_date = latest.max_date
      LEFT JOIN (
        SELECT 
          item_code,
          warehouse,
          COALESCE(bin_location, location_id) as bin_location,
          reference_doc,
          transaction_type,
          DATE(transaction_date) as transaction_date,
          MAX(qty_before) as qty_before,
          SUM(qty_change) as qty_change
        FROM tabTransactionHistory
        GROUP BY item_code, warehouse, COALESCE(bin_location, location_id), reference_doc, transaction_type, DATE(transaction_date)
      ) th ON 
        th.item_code = sl.item_code
        AND th.bin_location = sl.bin_location
        AND th.reference_doc = sl.last_transaction_ref
        AND th.transaction_type = sl.last_transaction_type
        AND th.transaction_date = DATE(sl.last_transaction_date)
        AND th.warehouse = sl.warehouse
      WHERE ${whereClauseSl}
      GROUP BY sl.item_code, sl.warehouse, sl.bin_location, sl.qty, sl.reserved_qty, sl.last_transaction_date, sl.last_transaction_type, sl.last_transaction_ref, sl.updated_at, sl.created_at
      ORDER BY sl.last_transaction_date DESC, sl.warehouse, sl.item_code, sl.bin_location IS NULL, sl.bin_location
      LIMIT ? OFFSET ?
    `;

    // Inner subquery uses whereClause; outer WHERE uses whereClauseSl — same ? count twice.
    const dataParams = [...params, ...params, pageSize, offset];
    const [rows] = await connection.execute(dataQuery, dataParams);

    // Resolve full location_id for all rows (batch lookup for performance)
    const uniqueBinLocations = [...new Set(rows.map(r => r.bin_location).filter(Boolean))];
    const locationMap = new Map();
    const locationDetailsMap = new Map();
    
    // Get warehouse from first row or query parameter
    const warehouseForLookup = warehouse || (rows.length > 0 ? rows[0].warehouse : null);
    
    // Batch resolve location IDs and fetch location details
    if (uniqueBinLocations.length > 0 && warehouseForLookup) {
      // Resolve full location IDs
      for (const binLoc of uniqueBinLocations) {
        const fullLocationId = await resolveFullLocationId(connection, binLoc, warehouseForLookup);
        locationMap.set(binLoc, fullLocationId);
      }
      
      // Batch fetch location details for all resolved location IDs
      const resolvedLocationIds = [...new Set(locationMap.values())].filter(Boolean);
      if (resolvedLocationIds.length > 0) {
        const placeholders = resolvedLocationIds.map(() => '?').join(',');
        const [locationDetails] = await connection.execute(
          `SELECT location_id, zone, aisle, parent_rack, level, bin_id 
           FROM tabLocation 
           WHERE warehouse = ? AND location_id IN (${placeholders})`,
          [warehouseForLookup, ...resolvedLocationIds]
        );
        
        for (const loc of locationDetails) {
          locationDetailsMap.set(loc.location_id, {
            location_id: loc.location_id,
            zone: loc.zone || null,
            aisle: loc.aisle || null,
            rack: loc.parent_rack || null,
            level: loc.level || null,
            bin: loc.bin_id || null
          });
        }
      }
    }

    const stockLedger = rows.map((row) => {
      // Calculate values based on user requirements:
      // - Qty = Transaction Qty (the quantity involved in the transaction)
      // - Available Qty = Qty after Deduction of this Transaction (stock after transaction)
      // - Qty Before = Stock before deduction of this transaction
      // - Qty +/- = Current transaction qty (negative for picking/reduction)
      
      const qtyAfter = parseFloat(row.qty) || 0; // Remaining stock after transaction
      const reservedQty = parseFloat(row.reserved_qty) || 0;
      const qtyBefore = row.qty_before != null ? parseFloat(row.qty_before) : null;
      const qtyReduced = row.qty_reduced != null ? parseFloat(row.qty_reduced) : null;
      
      // Calculate transaction quantity
      // For relocation transactions, qty should represent current stock, not transaction qty
      let transactionQty = null;
      if (row.last_transaction_type === 'CARTON_RELOCATION' || row.last_transaction_type === 'CARTON_MERGE') {
        // For relocation: qty field represents current stock at bin, not transaction quantity
        // Transaction quantity for relocation is 0 (no net change, just movement)
        transactionQty = qtyAfter; // Use current stock quantity
      } else if (qtyReduced != null) {
        transactionQty = Math.abs(qtyReduced); // Transaction Qty (absolute value)
      } else if (qtyBefore != null) {
        transactionQty = Math.abs(qtyBefore - qtyAfter); // Calculate from before/after
      } else {
        transactionQty = qtyAfter; // Fallback to remaining stock if no transaction data
      }
      
      // CRITICAL: Available Qty = Current Stock (qty) - Reserved Qty
      // NOT qty_before + qty_reduced, but the actual current stock quantity
      // This ensures correct calculation even if there are duplicate entries
      const availableQty = qtyAfter - reservedQty;
      
      // Resolve full location_id from bin_location
      const resolvedBinLocation = row.bin_location 
        ? (locationMap.get(row.bin_location) || row.bin_location)
        : null;
      
      // Get location details from pre-fetched map
      const locationDetails = resolvedBinLocation ? locationDetailsMap.get(resolvedBinLocation) : null;
      
      return {
        item_code: row.item_code,
        warehouse: row.warehouse,
        bin_location: resolvedBinLocation, // Keep for backward compatibility
        location_id: resolvedBinLocation || null, // ✅ REQUIRED: Full composite location ID
        zone: locationDetails?.zone || null,
        aisle: locationDetails?.aisle || null,
        rack: locationDetails?.rack || null,
        level: locationDetails?.level || null,
        bin: locationDetails?.bin || null,
        qty: transactionQty, // Transaction Qty (the quantity involved in the transaction)
        reserved_qty: reservedQty,
        available_qty: availableQty, // Qty after Deduction of this Transaction
        qty_before: qtyBefore, // Stock before deduction of this transaction
        qty_reduced: qtyReduced, // Current transaction qty (negative for picking, positive for increase)
        last_transaction_date: row.last_transaction_date
          ? row.last_transaction_date.toISOString()
          : null,
        last_transaction_type: row.last_transaction_type || null,
        last_transaction_ref: row.last_transaction_ref || null,
        updated_at: row.updated_at ? row.updated_at.toISOString() : null,
        created_at: row.created_at ? row.created_at.toISOString() : null,
      };
    });

    res.json({
      data: stockLedger,
      pagination: {
        page: pageNum,
        page_size: pageSize,
        total_count: totalCount,
        total_pages: totalPages,
      },
    });
  } catch (error) {
    console.error("Failed to fetch stock ledger:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to fetch stock ledger",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/stock-ledger/:item_code/:warehouse
 * Get stock ledger for a specific item in a warehouse (with bin breakdown)
 *
 * Response Format:
 * [
 *   {
 *     "item_code": "ITEM-001",
 *     "warehouse": "WH-MAIN",
 *     "bin_location": "RACK-A-01-BIN-05",
 *     "qty": 50.00,
 *     "reserved_qty": 5.00,
 *     "available_qty": 45.00,
 *     ...
 *   },
 *   {
 *     "item_code": "ITEM-001",
 *     "warehouse": "WH-MAIN",
 *     "bin_location": null,
 *     "qty": 50.00,
 *     ...
 *   }
 * ]
 */
export const getStockLedgerByItem = async (req, res) => {
  const connection = await getConnection();

  try {
    const { item_code, warehouse } = req.params;
    const { bin_location } = req.query; // ✅ Optional bin_location filter

    if (!item_code || !warehouse) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "item_code and warehouse are required",
        },
      });
    }

    // ✅ Normalize warehouse to handle variations like "WH-Main", "Main Warehouse", etc.
    const normalizedWarehouse = normalizeWarehouse(warehouse);
    const whUpper = normalizedWarehouse ? String(normalizedWarehouse).trim().toUpperCase() : null;
    
    // ✅ Resolve bin_location to full location_id if provided
    let normalizedBinLocation = null;
    if (bin_location) {
      normalizedBinLocation = await resolveFullLocationId(connection, bin_location, normalizedWarehouse);
      // If resolution fails, use original bin_location
      if (!normalizedBinLocation) {
        normalizedBinLocation = bin_location;
      }
    }
    
    // Log warehouse normalization for debugging
    logger.info('[Stock Ledger] Item Location Breakdown API called', {
      original_warehouse: warehouse,
      normalized_warehouse: normalizedWarehouse,
      whUpper: whUpper,
      item_code: item_code,
      bin_location_filter: bin_location || null,
      normalized_bin_location: normalizedBinLocation || null
    });

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

    // Build SELECT query for tabStockLedger
    // Get raw data first, then match locations
    let stockLedgerSelect = `
      SELECT 
        sl.item_code,
        sl.warehouse,
        sl.bin_location,
        sl.qty,
        sl.reserved_qty,
        sl.available_qty,
        sl.last_transaction_date,
        sl.last_transaction_type,
        sl.last_transaction_ref,
        sl.updated_at,
        sl.created_at
    `;
    
    if (hasStockLedgerCartonIdColumn) {
      stockLedgerSelect += `, sl.carton_id`;
    }
    
    // ✅ Add bin_location filter if provided
    const stockLedgerParams = [item_code, whUpper];
    let binLocationFilter = '';
    if (normalizedBinLocation) {
      binLocationFilter = ` AND (sl.bin_location = ? OR sl.bin_location = ?)`;
      stockLedgerParams.push(normalizedBinLocation, bin_location); // Support both normalized and original
    }
    
    stockLedgerSelect += `
      FROM tabStockLedger sl
      WHERE sl.item_code = ? AND UPPER(TRIM(sl.warehouse)) = ?${binLocationFilter}
      ORDER BY sl.bin_location IS NULL, sl.bin_location
    `;

    const [stockLedgerRowsRaw] = await connection.execute(
      stockLedgerSelect,
      stockLedgerParams
    );
    
    // Process each row to find matching location_id using resolveFullLocationId helper
    const stockLedgerRows = [];
    for (const row of stockLedgerRowsRaw) {
      const binLocation = row.bin_location || '';
      
      // Use resolveFullLocationId helper to get full location_id
      const resolvedLocationId = binLocation 
        ? await resolveFullLocationId(connection, binLocation, normalizedWarehouse)
        : null;
      
      // ✅ Filter by bin_location if provided (after resolution to handle format variations)
      if (normalizedBinLocation) {
        const rowLocationId = resolvedLocationId || row.bin_location;
        if (rowLocationId !== normalizedBinLocation && rowLocationId !== bin_location) {
          continue; // Skip rows that don't match the filtered bin
        }
      }
      
      // Use resolved location_id or fall back to stored bin_location
      // Preserve carton_id from row if available
      const rowCartonId = hasStockLedgerCartonIdColumn ? (row.carton_id || null) : null;
      
      stockLedgerRows.push({
        ...row,
        bin_location: resolvedLocationId || row.bin_location,
        carton_id: rowCartonId // ✅ Preserve carton_id from database
      });
    }

    // Get all cartons from tabCartonStock for this item+warehouse combination
    let cartonStockRows = [];
    if (hasCartonStockTable) {
      try {
        // First, get carton stock rows with incomplete bin_location
        // Handle duplicates by keeping only the most recent record (by updated_at, then id)
        // Since UNIQUE KEY is on (carton_id, item_code, batch_no), we need to handle cases where
        // batch_no is NULL and multiple records exist
        // Strategy: Use a subquery to get only the most recent record for each carton_id+item_code+bin_location combination
        // ✅ Add bin_location filter if provided
        const cartonStockParams = [item_code, whUpper];
        let cartonBinLocationFilter = '';
        if (normalizedBinLocation) {
          cartonBinLocationFilter = ` AND (bin_location = ? OR bin_location = ?)`;
          cartonStockParams.push(normalizedBinLocation, bin_location); // Support both normalized and original
        }
        
        const [cartonRowsRaw] = await connection.execute(
          `
          SELECT 
            cs.carton_id,
            cs.item_code,
            cs.warehouse,
            cs.bin_location,
            cs.qty,  -- Use quantity from most recent record (not sum)
            cs.updated_at,
            cs.status
          FROM tabCartonStock cs
          INNER JOIN (
            -- Get the most recent record for each carton_id+item_code+bin_location combination
            SELECT 
              carton_id,
              item_code,
              warehouse,
              bin_location,
              MAX(id) as max_id  -- Keep the record with highest id (most recent)
            FROM tabCartonStock
            WHERE item_code = ? AND UPPER(TRIM(warehouse)) = ? AND qty > 0 
              AND (status IS NULL OR status = '' OR status = 'PUTAWAY')${cartonBinLocationFilter}
            GROUP BY carton_id, item_code, warehouse, bin_location
          ) latest
            ON cs.carton_id = latest.carton_id
            AND cs.item_code = latest.item_code
            AND cs.warehouse = latest.warehouse
            AND cs.bin_location = latest.bin_location
            AND cs.id = latest.max_id
          WHERE cs.qty > 0 
            AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')
            AND NOT EXISTS (
              -- Exclude cartons that are marked as MERGED in tabCarton
              SELECT 1 FROM tabCarton c
              WHERE c.carton_id = cs.carton_id
                AND c.status = 'MERGED'
            )
          ORDER BY cs.bin_location, cs.carton_id
        `,
          cartonStockParams
        );
        
        // OPTIMIZED: Batch location matching using resolveFullLocationId helper
        cartonStockRows = [];
        
        // Collect all unique bin_locations
        const uniqueBinLocations = [...new Set(cartonRowsRaw.map(r => r.bin_location).filter(Boolean))];
        
        // Batch resolve all locations using helper function
        const locationMap = new Map();
        for (const binLoc of uniqueBinLocations) {
          const resolvedLocationId = await resolveFullLocationId(connection, binLoc, normalizedWarehouse);
          locationMap.set(binLoc, resolvedLocationId);
        }
        
        // Map rows with resolved location_id
        for (const row of cartonRowsRaw) {
          const binLocation = row.bin_location || '';
          const resolvedLocationId = binLocation 
            ? (locationMap.get(binLocation) || binLocation)
            : null;
          
          // ✅ Filter by bin_location if provided (after resolution to handle format variations)
          if (normalizedBinLocation) {
            const rowLocationId = resolvedLocationId || binLocation;
            if (rowLocationId !== normalizedBinLocation && rowLocationId !== bin_location) {
              continue; // Skip rows that don't match the filtered bin
            }
          }
          
          cartonStockRows.push({
            ...row,
            bin_location: resolvedLocationId
          });
        }
        
        console.log(`[Stock Ledger] Found ${cartonStockRows.length} carton stock entries for ${item_code} @ ${warehouse}`);
      } catch (cartonError) {
        console.warn(`[Stock Ledger] Could not query tabCartonStock: ${cartonError.message}`);
        // Continue without carton stock data
      }
    }

    // Build a map of bin_location -> cartons with standardized quantities
    const binCartonMap = new Map();
    
    // Process carton stock entries first (more granular)
    // total_qty = sum of carton.qty (physical on-hand at bin)
    for (const cartonRow of cartonStockRows) {
      const binLocation = cartonRow.bin_location || null;
      const cartonId = cartonRow.carton_id || null;
      const qty = parseFloat(cartonRow.qty) || 0;
      const status = cartonRow.status || 'PUTAWAY';
      
      if (!binCartonMap.has(binLocation)) {
        binCartonMap.set(binLocation, {
          bin_location: binLocation,
          cartons: [],
          total_qty: 0,
          reserved_qty: 0,
          blocked_qty: 0,
          available_qty: 0,
          calculation_log: [],
        });
      }
      
      const binData = binCartonMap.get(binLocation);
      binData.cartons.push({
        carton_id: cartonId,
        qty: qty,
        status: status,
      });
      binData.total_qty += qty;
      
      // Calculate blocked_qty based on carton status
      // Blocked statuses: HOLD, STAGING, DAMAGED, IN_PROGRESS, PICKED, DISPATCHED
      if (status && ['HOLD', 'STAGING', 'DAMAGED', 'IN_PROGRESS', 'PICKED', 'DISPATCHED'].includes(status.toUpperCase())) {
        binData.blocked_qty += qty;
        binData.calculation_log.push(`Carton ${cartonId}: ${qty} qty blocked (status: ${status})`);
      }
    }

    // Process stock ledger entries to get reserved_qty per bin
    // If carton stock exists for a bin, use carton stock for total_qty, stock ledger for reserved_qty
    // Also check stock ledger for additional cartons that might not be in tabCartonStock
    // NOTE: tabStockLedger may have outdated data - transaction history will override it later
    for (const row of stockLedgerRows) {
      const binLocation = row.bin_location || null;
      const stockLedgerQty = parseFloat(row.qty) || 0;
      const reservedQty = parseFloat(row.reserved_qty) || 0;
      const stockLedgerCartonId = hasStockLedgerCartonIdColumn ? (row.carton_id || null) : null;

      // Skip if qty is 0 (items moved out - transaction history will confirm this)
      if (stockLedgerQty <= 0) {
        continue;
      }

      // If we already have carton stock for this bin, update reserved_qty and total_qty from ledger
      // CRITICAL: Use stockLedgerQty as source of truth for current stock (may be lower if items were picked)
      // BUT: Transaction history will override this later if it has more recent data
      if (binCartonMap.has(binLocation)) {
        const binData = binCartonMap.get(binLocation);
        // Use reserved_qty from stock ledger (per bin)
        binData.reserved_qty = reservedQty;
        // ✅ Update total_qty to match stock ledger (source of truth for current stock)
        // Carton quantities will be scaled proportionally in the transaction query pass
        // NOTE: Transaction history will override this if it shows qty_after = 0
        const oldTotalQty = binData.total_qty;
        binData.total_qty = stockLedgerQty;
        if (Math.abs(oldTotalQty - stockLedgerQty) > 0.01) {
          binData.calculation_log.push(`Updated total_qty from ${oldTotalQty} to ${stockLedgerQty} (from tabStockLedger - will be overridden by transaction history if moved)`);
        }
        if (reservedQty > 0) {
          binData.calculation_log.push(`Reserved: ${reservedQty} qty (from tabStockLedger)`);
        }
        
        // Check if this stock ledger entry has a carton_id that's not already in the cartons array
        if (stockLedgerCartonId) {
          const cartonExists = binData.cartons.some(c => c.carton_id === stockLedgerCartonId);
          if (!cartonExists) {
            // Add this carton from stock ledger (might be a box-based putaway not in tabCartonStock)
            // Note: qty will be scaled proportionally in transaction query pass
            // NOTE: Transaction history will remove this if it shows qty_after = 0
            binData.cartons.push({
              carton_id: stockLedgerCartonId,
              qty: stockLedgerQty, // Temporary - will be overridden by transaction history
              status: 'PUTAWAY'
            });
            binData.calculation_log.push(`Added carton ${stockLedgerCartonId} from tabStockLedger (qty will be overridden by transaction history if moved)`);
          }
        }
        continue;
      }

      // No carton stock for this bin, use stock ledger entry
      // For bin-level mode: total_qty = stock ledger qty
      if (!binCartonMap.has(binLocation)) {
        // If carton_id is not in stock ledger, try to get it from multiple sources
        let cartonIdToUse = stockLedgerCartonId;
        
        if (!cartonIdToUse && binLocation) {
          // Priority 1: Get carton_id from tabCartonStock (most reliable)
          if (hasCartonStockTable) {
            try {
              const [cartonStockRows] = await connection.execute(
                `SELECT DISTINCT carton_id 
                 FROM tabCartonStock 
                 WHERE item_code = ? 
                   AND warehouse = ? 
                   AND bin_location = ?
                   AND carton_id IS NOT NULL 
                   AND carton_id != ''
                   AND qty > 0
                 ORDER BY updated_at DESC
                 LIMIT 1`,
                [item_code, warehouse, binLocation]
              );
              
              if (cartonStockRows.length > 0 && cartonStockRows[0].carton_id) {
                cartonIdToUse = cartonStockRows[0].carton_id;
              }
            } catch (csError) {
              // Silent error - continue to next source
            }
          }
          
          // Priority 2: Get carton_id from stock transaction (if not found in carton stock)
          if (!cartonIdToUse) {
            try {
              // Try target_bin first (most common for putaway)
              let [transactionRows] = await connection.execute(
                `SELECT carton_id 
                 FROM tabStockTransaction 
                 WHERE item_code = ? 
                   AND warehouse = ? 
                   AND target_bin = ?
                   AND carton_id IS NOT NULL 
                   AND carton_id != ''
                   AND transaction_type = 'Putaway'
                 ORDER BY transaction_date DESC, id DESC 
                 LIMIT 1`,
                [item_code, warehouse, binLocation]
              );
              
              // If not found, try bin_location field
              if (transactionRows.length === 0) {
                [transactionRows] = await connection.execute(
                  `SELECT carton_id 
                   FROM tabStockTransaction 
                   WHERE item_code = ? 
                     AND warehouse = ? 
                     AND bin_location = ?
                     AND carton_id IS NOT NULL 
                     AND carton_id != ''
                     AND transaction_type = 'Putaway'
                   ORDER BY transaction_date DESC, id DESC 
                   LIMIT 1`,
                  [item_code, warehouse, binLocation]
                );
              }
              
              if (transactionRows.length > 0 && transactionRows[0].carton_id) {
                cartonIdToUse = transactionRows[0].carton_id;
              }
            } catch (txError) {
              // Silent error - continue without carton_id
            }
          }
        }
        
        // Store bin entry WITHOUT cartons initially
        // Cartons will be populated from tabStockTransaction in the next pass
        // CRITICAL: Use stockLedgerQty as total_qty (source of truth for current stock)
        binCartonMap.set(binLocation, {
          bin_location: binLocation,
          carton_id: cartonIdToUse || null, // ✅ Store carton_id at bin level for display (if found)
          cartons: [], // Will be populated from tabStockTransaction
          total_qty: stockLedgerQty, // ✅ Use stock ledger qty as source of truth (current stock)
          reserved_qty: reservedQty, // Reserved at this bin
          blocked_qty: 0, // No blocked qty for bin-level (no status field)
          available_qty: 0, // Will be calculated below
          calculation_log: [`Bin entry created from tabStockLedger (total qty: ${stockLedgerQty}, reserved: ${reservedQty}). Cartons will be populated from tabStockTransaction and scaled to match ledger total.`],
          last_transaction_date: row.last_transaction_date
            ? row.last_transaction_date.toISOString()
            : null,
          last_transaction_type: row.last_transaction_type || null,
          last_transaction_ref: row.last_transaction_ref || null,
          updated_at: row.updated_at ? row.updated_at.toISOString() : null,
          created_at: row.created_at ? row.created_at.toISOString() : null,
        });
        
        if (reservedQty > 0) {
          binCartonMap.get(binLocation).calculation_log.push(`Reserved: ${reservedQty} qty (from tabStockLedger)`);
        }
      }
    }
    
    // ✅ PRIORITY 1: Query ALL cartons for this item from tabTransactionHistory using QTY_AFTER
    // Get the latest QTY_AFTER for each (location_id, carton_id) combination across ALL bins
    // This ensures we find cartons even after relocation (they'll be at new location)
    let allHistoryCartons = [];
    try {
      // Query ALL cartons for this item (no bin_location filter)
      // Use the latest QTY_AFTER for each (item_code, location_id, carton_id) combination
      // CRITICAL: Must include item_code in grouping because same carton can contain multiple items!
      // CRITICAL: If carton_id is NULL in tabTransactionHistory, get it from tabStockTransaction
      // CRITICAL: Get latest transaction for ALL locations (including qty_after = 0) to know where items were moved OUT
      // CRITICAL FIX: Get the latest transaction per (item_code, carton_id) combination
      // This ensures we only get the CURRENT location of each carton, not all historical locations
      // For cartons that moved, we only want the location where qty_after > 0 (current location)
      const [allHistoryCartonsRaw] = await connection.execute(
        `SELECT 
          COALESCE(th.carton_id, st.carton_id) as carton_id,
          COALESCE(th.location_id, th.bin_location, th.target_bin, st.bin_location, st.target_bin) as location_id,
          th.qty_after,
          th.transaction_date as last_transaction_date,
          th.transaction_type
        FROM tabTransactionHistory th
        LEFT JOIN tabStockTransaction st ON st.id = th.transaction_id
        INNER JOIN (
          -- Get the latest transaction for each (item_code, carton_id) combination
          -- This ensures we only get the CURRENT location of each carton
          SELECT 
            item_code,
            COALESCE(carton_id, 'NO_CARTON') as carton_key,
            MAX(transaction_date) as max_date,
            MAX(id) as max_id
          FROM tabTransactionHistory
          WHERE item_code = ? AND warehouse = ?
            AND (carton_id IS NOT NULL AND carton_id != '')
          GROUP BY item_code, carton_key
        ) latest_carton ON 
          th.item_code = latest_carton.item_code
          AND COALESCE(th.carton_id, 'NO_CARTON') = latest_carton.carton_key
          AND th.transaction_date = latest_carton.max_date
          AND th.id = latest_carton.max_id
        WHERE th.item_code = ?
          AND th.warehouse = ?
          AND (th.carton_id IS NOT NULL AND th.carton_id != '' OR st.carton_id IS NOT NULL AND st.carton_id != '')
          AND th.qty_after > 0
        ORDER BY COALESCE(th.location_id, th.bin_location, th.target_bin, st.bin_location, st.target_bin), COALESCE(th.carton_id, st.carton_id)`,
        [item_code, whUpper, item_code, whUpper]
      );
      
      allHistoryCartons = allHistoryCartonsRaw || [];
      logger.info(`[Stock Ledger] Found ${allHistoryCartons.length} carton(s) from tabTransactionHistory for item ${item_code} (latest transaction per carton, qty_after > 0)`);
      if (allHistoryCartons.length > 0) {
        logger.info(`[Stock Ledger] Transaction History cartons (current locations only):`, JSON.stringify(allHistoryCartons.map(hc => ({ 
          carton_id: hc.carton_id, 
          location_id: hc.location_id,
          qty_after: hc.qty_after,
          transaction_type: hc.transaction_type,
          transaction_date: hc.last_transaction_date
        })), null, 2));
      } else {
        logger.warn(`[Stock Ledger] No cartons found with qty_after > 0 for item ${item_code} - all cartons may have been moved out or merged`);
      }
      
      // Group cartons by location_id and populate binCartonMap
      let cartonsAdded = 0;
      let cartonsUpdated = 0;
      for (const historyCarton of allHistoryCartons) {
        const cartonLocationId = historyCarton.location_id;
        if (!cartonLocationId) {
          logger.warn(`[Stock Ledger] Skipping carton ${historyCarton.carton_id} - no location_id`);
          continue;
        }
        
        // Resolve location_id to full format if needed
        const resolvedLocationId = await resolveFullLocationId(connection, cartonLocationId, normalizedWarehouse);
        const finalLocationId = resolvedLocationId || cartonLocationId;
        
        logger.info(`[Stock Ledger] Processing carton ${historyCarton.carton_id}: location_id=${cartonLocationId}, resolved=${resolvedLocationId}, final=${finalLocationId}`);
        
        // ✅ Filter by bin_location if provided (for relocation scan from bin)
        if (normalizedBinLocation) {
          if (finalLocationId !== normalizedBinLocation && finalLocationId !== bin_location) {
            logger.info(`[Stock Ledger] Skipping carton ${historyCarton.carton_id} - not at filtered bin (${finalLocationId} != ${normalizedBinLocation})`);
            continue; // Skip cartons not at the filtered bin
          }
        }
        
        // Get or create bin entry
        if (!binCartonMap.has(finalLocationId)) {
          binCartonMap.set(finalLocationId, {
            bin_location: finalLocationId,
            cartons: [],
            total_qty: 0,
            reserved_qty: 0,
            blocked_qty: 0,
            available_qty: 0,
            calculation_log: [],
          });
          logger.info(`[Stock Ledger] Created new bin entry for ${finalLocationId}`);
        }
        
        const binData = binCartonMap.get(finalLocationId);
        const qtyAfter = parseFloat(historyCarton.qty_after) || 0;
        
        // Check if carton already exists (from tabCartonStock or previous transaction history processing)
        const existingCartonIndex = binData.cartons.findIndex(c => c.carton_id === historyCarton.carton_id);
        
        if (qtyAfter > 0) {
          if (existingCartonIndex === -1) {
            // Add carton from Transaction History
            const roundedQty = Math.max(0, Math.round(qtyAfter));
            binData.cartons.push({
              carton_id: historyCarton.carton_id,
              qty: roundedQty,
              status: 'PUTAWAY'
            });
            cartonsAdded++;
            binData.calculation_log.push(`Added carton ${historyCarton.carton_id} from tabTransactionHistory (QTY_AFTER: ${qtyAfter}, rounded: ${roundedQty})`);
            logger.info(`[Stock Ledger] ✅ Added carton ${historyCarton.carton_id} to bin ${finalLocationId} with qty ${roundedQty}`);
          } else {
            // Update existing carton qty from Transaction History (QTY_AFTER is source of truth)
            const oldQty = binData.cartons[existingCartonIndex].qty;
            const roundedQty = Math.max(0, Math.round(qtyAfter));
            binData.cartons[existingCartonIndex].qty = roundedQty;
            cartonsUpdated++;
            binData.calculation_log.push(`Updated carton ${historyCarton.carton_id} qty from ${oldQty} to ${roundedQty} (QTY_AFTER: ${qtyAfter})`);
            logger.info(`[Stock Ledger] ✅ Updated carton ${historyCarton.carton_id} at bin ${finalLocationId}: ${oldQty} → ${roundedQty}`);
          }
          
          // ✅ Recalculate total_qty as sum of all carton quantities (QTY_AFTER is source of truth per carton)
          const calculatedTotalQty = binData.cartons.reduce((sum, c) => sum + (parseFloat(c.qty) || 0), 0);
          binData.total_qty = calculatedTotalQty;
        } else {
          // qty_after = 0 means carton was moved out - remove it from this bin
          if (existingCartonIndex !== -1) {
            const removedCarton = binData.cartons.splice(existingCartonIndex, 1)[0];
            logger.info(`[Stock Ledger] ✅ Removed carton ${historyCarton.carton_id} from bin ${finalLocationId} - qty_after is 0 (moved out)`);
            binData.calculation_log.push(`Removed carton ${historyCarton.carton_id} - qty_after is 0 (moved out)`);
            
            // Recalculate total_qty after removal
            const calculatedTotalQty = binData.cartons.reduce((sum, c) => sum + (parseFloat(c.qty) || 0), 0);
            binData.total_qty = calculatedTotalQty;
          } else {
            logger.warn(`[Stock Ledger] Skipping carton ${historyCarton.carton_id} - qty_after is 0 and carton not found in bin ${finalLocationId}`);
          }
        }
      }
      logger.info(`[Stock Ledger] Processed Transaction History: ${cartonsAdded} added, ${cartonsUpdated} updated`);
      
      // After processing transaction history, remove any bins that were created from tabStockLedger
      // but don't have any cartons with positive quantities (items were moved out)
      // This ensures we don't show old locations where items no longer exist
      for (const [binLocation, binData] of Array.from(binCartonMap.entries())) {
        // Recalculate total_qty from cartons (transaction history is source of truth)
        const recalculatedTotalQty = binData.cartons.reduce((sum, c) => sum + (parseFloat(c.qty) || 0), 0);
        
        // If total_qty is 0, remove this bin (items were moved out)
        if (recalculatedTotalQty <= 0) {
          logger.info(`[Stock Ledger] Removing bin ${binLocation} - total_qty is 0 after processing transaction history (items moved out)`);
          binCartonMap.delete(binLocation);
        } else {
          // Update total_qty to match transaction history
          binData.total_qty = recalculatedTotalQty;
        }
      }
    } catch (historyError) {
      logger.warn(`[Stock Ledger] Could not query tabTransactionHistory: ${historyError.message}`);
    }
    
    // Additional pass: For each bin in binCartonMap, ensure we have the latest data
    // This handles cases where tabCartonStock might have outdated location info
    for (const [binLocation, binData] of binCartonMap.entries()) {
      if (!binLocation) continue;
      
      try {
        // Check what quantity column exists in tabStockTransaction
        const [qtyColumns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabStockTransaction'
          AND COLUMN_NAME IN ('qty', 'qty_change', 'quantity')
        `);
        const qtyColumn = qtyColumns.find(c => c.COLUMN_NAME === 'qty') ? 'qty' : 
                         qtyColumns.find(c => c.COLUMN_NAME === 'qty_change') ? 'qty_change' :
                         qtyColumns.find(c => c.COLUMN_NAME === 'quantity') ? 'quantity' : '1';
        
        // ✅ Query tabTransactionHistory for this specific bin (fallback if not found in allHistoryCartons)
        // CRITICAL: Must include item_code in grouping because same carton can contain multiple items!
        // CRITICAL: If carton_id is NULL in tabTransactionHistory, get it from tabStockTransaction
        // This ensures we catch any cartons that might have been missed
        const [historyCartons] = await connection.execute(
          `SELECT 
            COALESCE(th.carton_id, st.carton_id) as carton_id,
            COALESCE(th.location_id, th.bin_location, th.target_bin, st.bin_location, st.target_bin) as location_id,
            th.qty_after,
            th.transaction_date as last_transaction_date
          FROM tabTransactionHistory th
          LEFT JOIN tabStockTransaction st ON st.id = th.transaction_id
          INNER JOIN (
            SELECT 
              item_code,
              COALESCE(carton_id, 'NO_CARTON') as carton_key,
              COALESCE(location_id, bin_location, target_bin) as loc_key,
              MAX(transaction_date) as max_date,
              MAX(id) as max_id
            FROM tabTransactionHistory
            WHERE item_code = ?
              AND warehouse = ?
              AND (bin_location = ? OR location_id = ? OR target_bin = ?)
              AND qty_after > 0
            GROUP BY item_code, carton_key, loc_key
          ) latest ON 
            th.item_code = latest.item_code
            AND COALESCE(th.carton_id, 'NO_CARTON') = latest.carton_key
            AND COALESCE(th.location_id, th.bin_location, th.target_bin) = latest.loc_key
            AND th.transaction_date = latest.max_date
            AND th.id = latest.max_id
          WHERE th.item_code = ?
            AND th.warehouse = ?
            AND th.qty_after > 0
            AND (th.carton_id IS NOT NULL AND th.carton_id != '' OR st.carton_id IS NOT NULL AND st.carton_id != '')
          ORDER BY th.transaction_date DESC`,
          [item_code, whUpper, binLocation, binLocation, binLocation, item_code, whUpper]
        );
        
        // If we found cartons from Transaction History for this specific bin, update binData
        // This is a fallback in case the all-cartons query above missed something
        if (historyCartons.length > 0) {
          logger.info(`[Stock Ledger] Found ${historyCartons.length} additional carton(s) from tabTransactionHistory for bin ${binLocation}`);
          
          // Get the current total_qty from stock ledger (source of truth for current stock)
          const ledgerTotalQty = binData.total_qty || 0;
          
          // Calculate total qty from Transaction History (using QTY_AFTER from latest transaction)
          const historyTotalQty = historyCartons.reduce((sum, hc) => sum + (parseFloat(hc.qty_after) || 0), 0);
          
          logger.info(`[Stock Ledger] Bin ${binLocation}: Ledger total_qty=${ledgerTotalQty}, History total_qty (QTY_AFTER)=${historyTotalQty}`);
          
          // ✅ Use QTY_AFTER from latest transaction for each carton (current stock per carton)
          for (const historyCarton of historyCartons) {
            const cartonId = historyCarton.carton_id;
            const qtyAfter = parseFloat(historyCarton.qty_after) || 0;
            
            if (qtyAfter > 0) {
              // Check if carton already exists (from all-cartons query or tabCartonStock)
              const existingCarton = binData.cartons.find(c => c.carton_id === cartonId);
              if (!existingCarton) {
                // Scale if needed to match ledger total
                let cartonQty = qtyAfter;
                if (Math.abs(historyTotalQty - ledgerTotalQty) > 0.01 && historyTotalQty > 0) {
                  cartonQty = (qtyAfter / historyTotalQty) * ledgerTotalQty;
                }
                
                const roundedQty = Math.max(0, Math.round(cartonQty));
                binData.cartons.push({
                  carton_id: cartonId,
                  qty: roundedQty,
                  status: 'PUTAWAY'
                });
                binData.total_qty += roundedQty;
                binData.calculation_log.push(`Added carton ${cartonId} from tabTransactionHistory (QTY_AFTER: ${qtyAfter}, rounded: ${roundedQty})`);
              }
            }
          }
          
          // Recalculate total from cartons
          const calculatedTotalQty = binData.cartons.reduce((sum, c) => sum + (parseFloat(c.qty) || 0), 0);
          binData.total_qty = calculatedTotalQty;
        } else {
            // FALLBACK: Query tabStockTransaction if Transaction History not available
            // BUT: Only use fallback if we don't already have cartons from the all-cartons query above
            if (binData.cartons.length === 0) {
              logger.info(`[Stock Ledger] No Transaction History found for bin ${binLocation} and no cartons from all-cartons query, trying tabStockTransaction fallback...`);
              
              // Check what quantity column exists in tabStockTransaction
              const [qtyColumns] = await connection.execute(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'tabStockTransaction'
                AND COLUMN_NAME IN ('qty', 'qty_change', 'quantity')
              `);
              const qtyColumn = qtyColumns.find(c => c.COLUMN_NAME === 'qty') ? 'qty' : 
                               qtyColumns.find(c => c.COLUMN_NAME === 'qty_change') ? 'qty_change' :
                               qtyColumns.find(c => c.COLUMN_NAME === 'quantity') ? 'quantity' : '1';
              
              // Get all unique cartons from tabStockTransaction for this bin location
              const [transactionCartons] = await connection.execute(
                `SELECT carton_id, SUM(${qtyColumn}) as qty, MAX(transaction_date) as transaction_date
                 FROM tabStockTransaction
                 WHERE item_code = ?
                   AND warehouse = ?
                   AND (target_bin = ? OR bin_location = ?)
                   AND carton_id IS NOT NULL
                   AND carton_id != ''
                   AND transaction_type = 'Putaway'
                 GROUP BY carton_id
                 ORDER BY MAX(transaction_date) DESC`,
                [item_code, whUpper, binLocation, binLocation]
              );
              
              if (transactionCartons.length > 0) {
                // Get the current total_qty from stock ledger (source of truth for current stock)
                const ledgerTotalQty = binData.total_qty || 0;
                
                // Calculate total qty from transactions (historical - may be higher if items were picked)
                const transactionTotalQty = transactionCartons.reduce((sum, tx) => sum + (parseFloat(tx.qty) || 0), 0);
                
                logger.info(`[Stock Ledger] Bin ${binLocation}: Using tabStockTransaction fallback. Ledger total_qty=${ledgerTotalQty}, Transaction total_qty=${transactionTotalQty}`);
                
                // Distribute ledger total_qty proportionally among cartons found in transactions
                for (const txCarton of transactionCartons) {
                  const cartonId = txCarton.carton_id;
                  const txQty = parseFloat(txCarton.qty) || 0;
                  
                  if (txQty > 0 && transactionTotalQty > 0) {
                    // Calculate carton's qty proportionally based on ledger total
                    const cartonQty = (txQty / transactionTotalQty) * ledgerTotalQty;
                    
                    // Round to whole number (carton quantities are always integers)
                    const roundedQty = Math.max(0, Math.round(cartonQty));
                    
                    binData.cartons.push({
                      carton_id: cartonId,
                      qty: roundedQty,
                      status: 'PUTAWAY'
                    });
                    binData.calculation_log.push(`Added carton ${cartonId} from tabStockTransaction (fallback, scaled qty: ${cartonQty.toFixed(2)})`);
                  }
                }
                
                binData.total_qty = ledgerTotalQty;
              } else {
                // No transactions found - keep existing cartons (if any from tabCartonStock or all-cartons query)
                logger.warn(`[Stock Ledger] No transactions found for bin ${binLocation}, keeping existing cartons (count: ${binData.cartons.length})`);
              }
            } else {
              logger.info(`[Stock Ledger] Bin ${binLocation} already has ${binData.cartons.length} carton(s) from all-cartons query, skipping fallback`);
            }
          }
      } catch (txError) {
        // Silent error - continue processing other bins
        console.warn(`[Stock Ledger] Could not query tabStockTransaction for bin ${binLocation}: ${txError.message}`);
      }
    }
    
    // If no cartons found in tabCartonStock, but we have stock ledger entries, 
    // create bin entries from stock ledger and populate cartons from transactions
    // NOTE: This code is now redundant since we already create bin entries from stockLedgerRows above
    // and populate cartons from transactions in the loop above. Keeping for safety but it should be skipped.
    if (cartonStockRows.length === 0 && stockLedgerRows.length > 0) {
      for (const row of stockLedgerRows) {
        const binLocation = row.bin_location || null;
        // Skip if bin already exists (should be the case after processing stockLedgerRows above)
        if (!binLocation || binCartonMap.has(binLocation)) {
          logger.info(`[Stock Ledger] Skipping bin ${binLocation} - already exists in map`);
          continue;
        }
        
        // Get cartons from transactions for this bin
        try {
          const [qtyColumns] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabStockTransaction'
            AND COLUMN_NAME IN ('qty', 'qty_change', 'quantity')
          `);
          const qtyColumn = qtyColumns.find(c => c.COLUMN_NAME === 'qty') ? 'qty' : 
                           qtyColumns.find(c => c.COLUMN_NAME === 'qty_change') ? 'qty_change' :
                           qtyColumns.find(c => c.COLUMN_NAME === 'quantity') ? 'quantity' : '1';
          
          const [txCartons] = await connection.execute(
            `SELECT carton_id, SUM(${qtyColumn}) as qty, MAX(transaction_date) as transaction_date
             FROM tabStockTransaction
             WHERE item_code = ?
               AND warehouse = ?
               AND (target_bin = ? OR bin_location = ?)
               AND carton_id IS NOT NULL
               AND carton_id != ''
               AND transaction_type = 'Putaway'
             GROUP BY carton_id
             ORDER BY MAX(transaction_date) DESC`,
            [item_code, whUpper, binLocation, binLocation]
          );
          
          logger.info(`[Stock Ledger] Created bin entry from stock ledger with ${txCartons.length} carton(s) from tabStockTransaction`);
          
          const cartons = txCartons.map(tx => ({
            carton_id: tx.carton_id,
            qty: parseFloat(tx.qty) || 0,
            status: 'PUTAWAY'
          }));
          
          const totalQty = cartons.reduce((sum, c) => sum + c.qty, 0);
          
          binCartonMap.set(binLocation, {
            bin_location: binLocation,
            cartons: cartons,
            total_qty: totalQty,
            reserved_qty: parseFloat(row.reserved_qty) || 0,
            blocked_qty: 0,
            available_qty: 0,
            calculation_log: [`Created from tabStockTransaction: ${cartons.length} carton(s) found`]
          });
        } catch (error) {
          // Continue without this bin
        }
      }
    }
    
    // Calculate available_qty for each bin: available_qty = total_qty - reserved_qty - blocked_qty
    // Add logging to explain differences
    // CRITICAL: Filter out bins with total_qty = 0 (items moved out) - use QTY_AFTER from transaction history as source of truth
    for (const [binLocation, binData] of binCartonMap.entries()) {
      // Recalculate total_qty from cartons (QTY_AFTER is source of truth)
      const recalculatedTotalQty = binData.cartons.reduce((sum, c) => sum + (parseFloat(c.qty) || 0), 0);
      binData.total_qty = recalculatedTotalQty;
      
      // Filter out cartons with qty = 0 (moved out)
      binData.cartons = binData.cartons.filter(c => (parseFloat(c.qty) || 0) > 0);
      
      // Recalculate total_qty again after filtering
      binData.total_qty = binData.cartons.reduce((sum, c) => sum + (parseFloat(c.qty) || 0), 0);
      
      const totalQty = binData.total_qty;
      const reservedQty = binData.reserved_qty || 0;
      const blockedQty = binData.blocked_qty || 0;
      const availableQty = totalQty - reservedQty - blockedQty;
      
      binData.available_qty = Math.max(0, availableQty); // Don't go below 0
      
      // Add calculation log
      binData.calculation_log.push(`Calculation: ${totalQty} (total) - ${reservedQty} (reserved) - ${blockedQty} (blocked) = ${binData.available_qty} (available)`);
      
      // Log if there's a difference between total_qty and available_qty
      if (totalQty !== binData.available_qty) {
        const difference = totalQty - binData.available_qty;
        const reasons = [];
        if (reservedQty > 0) reasons.push(`${reservedQty} reserved`);
        if (blockedQty > 0) reasons.push(`${blockedQty} blocked`);
        
        console.log(`[Stock Ledger] Bin ${binLocation || 'NULL'}: total_qty=${totalQty}, available_qty=${binData.available_qty}, difference=${difference} (${reasons.join(', ')})`);
        binData.calculation_log.push(`Difference: ${difference} qty (${reasons.join(', ')})`);
      }
    }
    
    // Filter out bins with total_qty = 0 (items completely moved out - QTY_AFTER = 0)
    // This ensures we only show locations where items actually exist
    for (const [binLocation, binData] of Array.from(binCartonMap.entries())) {
      if (binData.total_qty <= 0) {
        logger.info(`[Stock Ledger] Filtering out bin ${binLocation} - total_qty is 0 (items moved out)`);
        binCartonMap.delete(binLocation);
      }
    }

    // Convert map to array format
    // Get location details for all unique bin locations
    const uniqueBinLocations = [...new Set(Array.from(binCartonMap.keys()).filter(Boolean))];
    const locationDetailsMap = new Map();
    
    if (uniqueBinLocations.length > 0) {
      const placeholders = uniqueBinLocations.map(() => '?').join(',');
      const [locationDetails] = await connection.execute(
        `SELECT location_id, zone, aisle, parent_rack, level, bin_id 
         FROM tabLocation 
         WHERE UPPER(TRIM(warehouse)) = ? AND location_id IN (${placeholders})`,
        [whUpper, ...uniqueBinLocations]
      );
      
      for (const loc of locationDetails) {
        locationDetailsMap.set(loc.location_id, {
          location_id: loc.location_id,
          zone: loc.zone || null,
          aisle: loc.aisle || null,
          rack: loc.parent_rack || null,
          level: loc.level || null,
          bin: loc.bin_id || null
        });
      }
    }
    
    // Option 1: Grouped by bin with cartons array (recommended)
    // Sort: NULL bin_location last, then by bin_location
    const groupedResponse = Array.from(binCartonMap.values())
      .map((binData) => {
        const locationDetails = binData.bin_location ? locationDetailsMap.get(binData.bin_location) : null;
        
        // Get carton_id for display (from binData.carton_id or first carton if multiple)
        const displayCartonId = binData.carton_id || (binData.cartons.length > 0 
          ? binData.cartons[0].carton_id 
          : null);
        
        return {
          item_code: item_code,
          warehouse: warehouse,
          bin_location: binData.bin_location, // Keep for backward compatibility
          location_id: binData.bin_location || null, // ✅ REQUIRED: Full composite location ID
          zone: locationDetails?.zone || null,
          aisle: locationDetails?.aisle || null,
          rack: locationDetails?.rack || null,
          level: locationDetails?.level || null,
          bin: locationDetails?.bin || null,
          carton_id: displayCartonId, // ✅ REQUIRED: Include carton_id for display (from binData or first carton or null)
          cartons: binData.cartons.length > 0 ? binData.cartons : null, // null if no cartons
          total_qty: binData.total_qty, // Physical on-hand at bin (sum of carton.qty)
          reserved_qty: binData.reserved_qty || 0, // Reserved at same bin scope
          blocked_qty: binData.blocked_qty || 0, // Blocked (holds/staging/damaged/in-progress)
          available_qty: binData.available_qty || 0, // total_qty - reserved_qty - blocked_qty
          calculation_log: binData.calculation_log || [], // Log explaining differences
          last_transaction_date: binData.last_transaction_date || null,
          last_transaction_type: binData.last_transaction_type || null,
          last_transaction_ref: binData.last_transaction_ref || null,
          updated_at: binData.updated_at || null,
          created_at: binData.created_at || null,
        };
      })
      .sort((a, b) => {
        // Sort: NULL bin_location last, then by bin_location
        if (a.bin_location === null && b.bin_location !== null) return 1;
        if (a.bin_location !== null && b.bin_location === null) return -1;
        if (a.bin_location === null && b.bin_location === null) return 0;
        return (a.bin_location || '').localeCompare(b.bin_location || '');
      });

    // Option 2: Flat structure with all bin+carton combinations (for backward compatibility)
    const flatResponse = [];
    for (const binData of binCartonMap.values()) {
      const locationDetails = binData.bin_location ? locationDetailsMap.get(binData.bin_location) : null;
      
      if (binData.cartons.length > 0) {
        // One entry per carton
        for (const carton of binData.cartons) {
          // For flat format, each row is one carton
          // available_qty for this carton should be the carton's qty minus its share of reserved/blocked
          const cartonQty = parseFloat(carton.qty) || 0;
          const binTotalQty = binData.total_qty || 1; // Avoid division by zero
          const binReservedQty = binData.reserved_qty || 0;
          const binBlockedQty = binData.blocked_qty || 0;
          const binAvailableQty = binData.available_qty || 0;
          
          // Calculate carton's share of reserved/blocked qty (proportional to carton qty)
          const cartonReservedQty = binTotalQty > 0 
            ? (cartonQty / binTotalQty) * binReservedQty 
            : 0;
          const cartonBlockedQty = binTotalQty > 0 
            ? (cartonQty / binTotalQty) * binBlockedQty 
            : 0;
          
          // Carton's available qty = carton qty - carton's share of reserved - carton's share of blocked
          // OR use proportional calculation if binAvailableQty is already calculated
          // For simplicity and accuracy, use: cartonQty - cartonReservedQty - cartonBlockedQty
          const cartonAvailableQty = Math.max(0, cartonQty - cartonReservedQty - cartonBlockedQty);
          
          flatResponse.push({
            item_code: item_code,
            warehouse: warehouse,
            bin_location: binData.bin_location, // Keep for backward compatibility
            location_id: binData.bin_location || null, // ✅ REQUIRED: Full composite location ID
            zone: locationDetails?.zone || null,
            aisle: locationDetails?.aisle || null,
            rack: locationDetails?.rack || null,
            level: locationDetails?.level || null,
            bin: locationDetails?.bin || null,
            carton_id: carton.carton_id,
            qty: cartonQty, // Individual carton qty (already rounded to integer)
            total_qty: Math.round(binData.total_qty), // Total at bin (sum of all cartons, rounded to integer)
            reserved_qty: Math.max(0, Math.round(cartonReservedQty)), // Carton's share of reserved qty (rounded to integer)
            blocked_qty: Math.max(0, Math.round(cartonBlockedQty)), // Carton's share of blocked qty (rounded to integer)
            available_qty: Math.max(0, Math.round(cartonAvailableQty)), // Available for THIS carton (rounded to integer)
            calculation_log: binData.calculation_log || [],
            last_transaction_date: binData.last_transaction_date || null,
            last_transaction_type: binData.last_transaction_type || null,
            last_transaction_ref: binData.last_transaction_ref || null,
            updated_at: binData.updated_at || null,
            created_at: binData.created_at || null,
          });
        }
      } else {
        // No cartons, just bin-level entry
        flatResponse.push({
          item_code: item_code,
          warehouse: warehouse,
          bin_location: binData.bin_location, // Keep for backward compatibility
          location_id: binData.bin_location || null, // ✅ REQUIRED: Full composite location ID
          zone: locationDetails?.zone || null,
          aisle: locationDetails?.aisle || null,
          rack: locationDetails?.rack || null,
          level: locationDetails?.level || null,
          bin: locationDetails?.bin || null,
          carton_id: null,
          qty: binData.total_qty, // For backward compatibility
          total_qty: binData.total_qty, // Physical on-hand
          reserved_qty: binData.reserved_qty || 0,
          blocked_qty: binData.blocked_qty || 0,
          available_qty: binData.available_qty || 0,
          calculation_log: binData.calculation_log || [],
          last_transaction_date: binData.last_transaction_date || null,
          last_transaction_type: binData.last_transaction_type || null,
          last_transaction_ref: binData.last_transaction_ref || null,
          updated_at: binData.updated_at || null,
          created_at: binData.created_at || null,
        });
      }
    }

    // Return flat response by default (one row per carton)
    // This ensures each carton at the same bin location is shown separately
    // Clients can use query parameter ?format=grouped for grouped structure
    const format = req.query.format || 'flat';
    
    // Log response for debugging
    const cartonsWithIds = flatResponse.filter(r => r.carton_id).length;
    const cartonsWithoutIds = flatResponse.filter(r => !r.carton_id).length;
    logger.info('[Stock Ledger] Item Location Breakdown response', {
      item_code: item_code,
      warehouse: warehouse,
      normalized_warehouse: normalizedWarehouse,
      bin_location_filter: bin_location || null,
      normalized_bin_location: normalizedBinLocation || null,
      format: format,
      grouped_count: groupedResponse.length,
      flat_count: flatResponse.length,
      sample_bin: flatResponse.length > 0 ? flatResponse[0].bin_location : null,
      sample_carton_id: flatResponse.length > 0 ? flatResponse[0].carton_id : null,
      cartons_with_ids: cartonsWithIds,
      cartons_without_ids: cartonsWithoutIds
    });
    
    // Log first few cartons for debugging
    if (flatResponse.length > 0) {
      logger.info('[Stock Ledger] Sample flat response entries:', JSON.stringify(
        flatResponse.slice(0, 3).map(r => ({
          location_id: r.location_id,
          carton_id: r.carton_id,
          qty: r.qty,
          available_qty: r.available_qty
        })),
        null, 2
      ));
    }
    
    if (format === 'grouped') {
      res.json(groupedResponse);
    } else {
      // Default: Return flat format (one row per carton)
      res.json(flatResponse);
    }
  } catch (error) {
    console.error("Failed to fetch stock ledger by item:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to fetch stock ledger",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/stock/sync-quantities
 * Sync tabItem.stock_qty with actual stock from tabStockLedger/tabCartonStock
 * 
 * Request Body (optional):
 * {
 *   "item_codes": ["SKU-001", "SKU-002"],  // Optional: sync specific items only
 *   "warehouse": "WH-MAIN"  // Optional: sync for specific warehouse
 * }
 * 
 * Response:
 * {
 *   "ok": true,
 *   "message": "Stock quantities synced: 150 items updated",
 *   "data": {
 *     "total_items": 200,
 *     "updated": 150,
 *     "unchanged": 50,
 *     "errors": [],
 *     "details": [...]
 *   }
 * }
 */
export const syncStockQuantities = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { item_codes, warehouse } = req.body || {};
    
    let itemsQuery = 'SELECT code FROM tabItem';
    let itemsParams = [];
    
    if (item_codes && Array.isArray(item_codes) && item_codes.length > 0) {
      itemsQuery += ' WHERE code IN (' + item_codes.map(() => '?').join(',') + ')';
      itemsParams = item_codes;
    }
    
    const [items] = await connection.execute(itemsQuery, itemsParams);
    
    const results = {
      total_items: items.length,
      updated: 0,
      unchanged: 0,
      errors: [],
      details: []
    };
    
    // Check if tabCartonStock exists
    const [cartonStockTable] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCartonStock'
    `);
    const hasCartonStockTable = cartonStockTable.length > 0;
    
    for (const item of items) {
      try {
        let totalQty = 0;
        
        if (hasCartonStockTable) {
          // Use tabCartonStock if available (more accurate for carton-level)
          let cartonQuery = `
            SELECT COALESCE(SUM(qty), 0) as total_qty
            FROM tabCartonStock
            WHERE item_code = ?
              AND qty > 0
              AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
          `;
          let cartonParams = [item.code];
          
          if (warehouse) {
            cartonQuery += ' AND warehouse = ?';
            cartonParams.push(warehouse);
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
          let ledgerParams = [item.code];
          
          if (warehouse) {
            ledgerQuery += ' AND warehouse = ?';
            ledgerParams.push(warehouse);
          }
          
          const [stockSum] = await connection.execute(ledgerQuery, ledgerParams);
          totalQty = parseFloat(stockSum[0].total_qty) || 0;
        }
        
        // Get current stock_qty
        const [currentItem] = await connection.execute(
          'SELECT stock_qty FROM tabItem WHERE code = ?',
          [item.code]
        );
        const currentStockQty = parseFloat(currentItem[0].stock_qty) || 0;
        
        // Update if different
        if (Math.abs(totalQty - currentStockQty) > 0.01) { // Allow small floating point differences
          await connection.execute(`
            UPDATE tabItem
            SET stock_qty = ?,
                updated_at = NOW()
            WHERE code = ?
          `, [totalQty, item.code]);
          
          results.updated++;
          results.details.push({
            item_code: item.code,
            old_qty: currentStockQty,
            new_qty: totalQty,
            difference: totalQty - currentStockQty
          });
        } else {
          results.unchanged++;
        }
      } catch (error) {
        results.errors.push({
          item_code: item.code,
          error: error.message
        });
      }
    }
    
    res.json({
      ok: true,
      message: `Stock quantities synced: ${results.updated} items updated, ${results.unchanged} unchanged, ${results.errors.length} errors`,
      data: results
    });
  } catch (error) {
    console.error('Failed to sync stock quantities:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to sync stock quantities',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};
