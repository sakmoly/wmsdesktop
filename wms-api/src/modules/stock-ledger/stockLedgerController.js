// wms-api/src/modules/stock-ledger/stockLedgerController.js
// Stock Ledger API endpoints

import { getConnection } from "../../db/connection.js";

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
      query = `
        SELECT 
          sl.item_code,
          sl.qty,
          sl.bin_location,
          NULL as carton_id,
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

    // Format response according to specification
    const stockLedger = rows.map((row) => ({
      item_code: row.item_code,
      item_name: row.item_name || null,
      barcode: row.barcode || row.item_code, // Use item_code as barcode if barcode is null
      qty: parseFloat(row.qty) || 0,
      bin_location: row.bin_location || normalizedBinLocation,
      carton_id: row.carton_id || normalizedCartonId || null,
      warehouse: row.warehouse || null,
      warehouse_id: row.warehouse_id || row.warehouse || null,
      uom: row.uom || 'EA',
      last_updated: row.last_updated ? row.last_updated.toISOString() : null,
      batch_no: row.batch_no || null,
      serial_no: row.serial_no || null,
      expiry_date: row.expiry_date || null
    }));

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
      page = "1",
      page_size = "100",
    } = req.query;

    // Parse pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(page_size) || 100));
    const offset = (pageNum - 1) * pageSize;

    // Build WHERE clause
    const conditions = ["1=1"];
    const params = [];

    if (warehouse) {
      conditions.push("warehouse = ?");
      params.push(warehouse);
    }

    if (item_code) {
      conditions.push("item_code LIKE ?");
      params.push(`%${item_code}%`);
    }

    if (bin_location !== undefined) {
      if (
        bin_location === null ||
        bin_location === "null" ||
        bin_location === ""
      ) {
        conditions.push("bin_location IS NULL");
      } else {
        conditions.push("bin_location = ?");
        params.push(bin_location);
      }
    }

    if (from_date) {
      conditions.push("DATE(last_transaction_date) >= ?");
      params.push(from_date);
    }

    if (to_date) {
      conditions.push("DATE(last_transaction_date) <= ?");
      params.push(to_date);
    }

    const whereClause = conditions.join(" AND ");

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

    const qtyBeforeSelect = hasQtyBefore ? "qty_before" : "NULL as qty_before";
    const qtyReducedSelect = hasQtyReduced
      ? "qty_reduced"
      : "NULL as qty_reduced";

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM tabStockLedger WHERE ${whereClause}`;
    const [countRows] = await connection.execute(countQuery, params);
    const totalCount = countRows[0].total;
    const totalPages = Math.ceil(totalCount / pageSize);

    // Get paginated data
    let dataQuery = `
      SELECT 
        item_code,
        warehouse,
        bin_location,
        qty,
        reserved_qty,
        ${qtyBeforeSelect},
        ${qtyReducedSelect},
        last_transaction_date,
        last_transaction_type,
        last_transaction_ref,
        updated_at,
        created_at
      FROM tabStockLedger
      WHERE ${whereClause}
      ORDER BY last_transaction_date DESC, warehouse, item_code, bin_location IS NULL, bin_location
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, pageSize, offset];
    const [rows] = await connection.execute(dataQuery, dataParams);

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
      let transactionQty = null;
      if (qtyReduced != null) {
        transactionQty = Math.abs(qtyReduced); // Transaction Qty (absolute value)
      } else if (qtyBefore != null) {
        transactionQty = Math.abs(qtyBefore - qtyAfter); // Calculate from before/after
      } else {
        transactionQty = qtyAfter; // Fallback to remaining stock if no transaction data
      }
      
      // Available Qty = Qty after Deduction of this Transaction
      const availableQty = qtyAfter - reservedQty;
      
      return {
        item_code: row.item_code,
        warehouse: row.warehouse,
        bin_location: row.bin_location || null,
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

    if (!item_code || !warehouse) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "item_code and warehouse are required",
        },
      });
    }

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
    
    stockLedgerSelect += `
      FROM tabStockLedger sl
      WHERE sl.item_code = ? AND sl.warehouse = ?
      ORDER BY sl.bin_location IS NULL, sl.bin_location
    `;

    const [stockLedgerRowsRaw] = await connection.execute(
      stockLedgerSelect,
      [item_code, warehouse]
    );
    
    // Process each row to find matching location_id
    const stockLedgerRows = [];
    for (const row of stockLedgerRowsRaw) {
      let matchedLocationId = null;
      const binLocation = row.bin_location || '';
      
      // Try exact match first
      if (binLocation) {
        const [exactMatch] = await connection.execute(
          `SELECT location_id FROM tabLocation WHERE location_id = ? AND warehouse = ? LIMIT 1`,
          [binLocation, warehouse]
        );
        
        if (exactMatch.length > 0) {
          matchedLocationId = exactMatch[0].location_id;
        } else {
          // Try to parse "Rack 02-B2" format
          // Extract rack part (before last '-') and bin part (after last '-')
          const parts = binLocation.split('-');
          if (parts.length >= 2) {
            // "Rack 02-B2" -> rackPart = "Rack 02", binPart = "B2"
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
              matchedLocationId = matchByRackBin[0].location_id;
              console.log(`[Stock Ledger] Matched "${binLocation}" to location_id "${matchedLocationId}"`);
            }
          }
        }
      }
      
      // Use matched location_id or fall back to stored bin_location
      stockLedgerRows.push({
        ...row,
        bin_location: matchedLocationId || row.bin_location
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
            WHERE item_code = ? AND warehouse = ? AND qty > 0 AND status = 'PUTAWAY'
            GROUP BY carton_id, item_code, warehouse, bin_location
          ) latest
            ON cs.carton_id = latest.carton_id
            AND cs.item_code = latest.item_code
            AND cs.warehouse = latest.warehouse
            AND cs.bin_location = latest.bin_location
            AND cs.id = latest.max_id
          WHERE cs.qty > 0 AND cs.status = 'PUTAWAY'
          ORDER BY cs.bin_location, cs.carton_id
        `,
          [item_code, warehouse]
        );
        
        // OPTIMIZED: Batch location matching instead of N+1 queries
        cartonStockRows = [];
        
        // Collect all unique bin_locations
        const uniqueBinLocations = [...new Set(cartonRowsRaw.map(r => r.bin_location).filter(Boolean))];
        
        // Batch fetch all location matches in one query
        const locationMap = new Map();
        if (uniqueBinLocations.length > 0) {
          // First, try exact matches
          const placeholders = uniqueBinLocations.map(() => '?').join(',');
          const [exactMatches] = await connection.execute(
            `SELECT location_id, location_id as bin_location FROM tabLocation 
             WHERE warehouse = ? AND location_id IN (${placeholders})`,
            [warehouse, ...uniqueBinLocations]
          );
          
          for (const match of exactMatches) {
            locationMap.set(match.bin_location, match.location_id);
          }
          
          // For unmatched locations, try parsing "Rack 02-B2" format
          const unmatchedLocations = uniqueBinLocations.filter(loc => !locationMap.has(loc));
          if (unmatchedLocations.length > 0) {
            // Build a query that matches by parent_rack and bin_id
            // This is more complex but still better than N+1 queries
            for (const binLocation of unmatchedLocations) {
              const parts = binLocation.split('-');
              if (parts.length >= 2) {
                const binPart = parts[parts.length - 1].trim();
                const rackPart = parts.slice(0, -1).join('-').trim();
                
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
                    rackPart,
                    `%${rackPart.replace('Rack ', '').trim()}%`,
                    `%${rackPart}%`,
                    binPart
                  ]
                );
                
                if (matchByRackBin.length > 0) {
                  locationMap.set(binLocation, matchByRackBin[0].location_id);
                }
              }
            }
          }
        }
        
        // Map rows with matched location_id
        for (const row of cartonRowsRaw) {
          const binLocation = row.bin_location || '';
          const matchedLocationId = locationMap.get(binLocation) || binLocation;
          
          cartonStockRows.push({
            ...row,
            bin_location: matchedLocationId
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
    // Otherwise, use stock ledger data for both
    for (const row of stockLedgerRows) {
      const binLocation = row.bin_location || null;
      const stockLedgerQty = parseFloat(row.qty) || 0;
      const reservedQty = parseFloat(row.reserved_qty) || 0;
      const stockLedgerCartonId = hasStockLedgerCartonIdColumn ? (row.carton_id || null) : null;

      // If we already have carton stock for this bin, update reserved_qty from stock ledger
      if (binCartonMap.has(binLocation)) {
        const binData = binCartonMap.get(binLocation);
        // Use reserved_qty from stock ledger (per bin)
        binData.reserved_qty = reservedQty;
        if (reservedQty > 0) {
          binData.calculation_log.push(`Reserved: ${reservedQty} qty (from tabStockLedger)`);
        }
        continue;
      }

      // No carton stock for this bin, use stock ledger entry
      // For bin-level mode: total_qty = stock ledger qty
      if (!binCartonMap.has(binLocation)) {
        binCartonMap.set(binLocation, {
          bin_location: binLocation,
          cartons: stockLedgerCartonId ? [{ carton_id: stockLedgerCartonId, qty: stockLedgerQty, status: 'PUTAWAY' }] : [],
          total_qty: stockLedgerQty, // Physical on-hand
          reserved_qty: reservedQty, // Reserved at this bin
          blocked_qty: 0, // No blocked qty for bin-level (no status field)
          available_qty: 0, // Will be calculated below
          calculation_log: [],
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
    
    // Calculate available_qty for each bin: available_qty = total_qty - reserved_qty - blocked_qty
    // Add logging to explain differences
    for (const [binLocation, binData] of binCartonMap.entries()) {
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

    // Convert map to array format
    // Option 1: Grouped by bin with cartons array (recommended)
    // Sort: NULL bin_location last, then by bin_location
    const groupedResponse = Array.from(binCartonMap.values())
      .map((binData) => ({
        item_code: item_code,
        warehouse: warehouse,
        bin_location: binData.bin_location,
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
      }))
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
      if (binData.cartons.length > 0) {
        // One entry per carton
        for (const carton of binData.cartons) {
          flatResponse.push({
            item_code: item_code,
            warehouse: warehouse,
            bin_location: binData.bin_location,
            carton_id: carton.carton_id,
            qty: carton.qty, // Individual carton qty
            total_qty: binData.total_qty, // Total at bin (sum of all cartons)
            reserved_qty: binData.reserved_qty || 0, // Reserved at bin
            blocked_qty: binData.blocked_qty || 0, // Blocked at bin
            available_qty: binData.available_qty || 0, // Available at bin
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
          bin_location: binData.bin_location,
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

    // Return grouped response by default (more structured)
    // Clients can use query parameter ?format=flat for flat structure
    const format = req.query.format || 'grouped';
    if (format === 'flat') {
      res.json(flatResponse);
    } else {
      res.json(groupedResponse);
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
