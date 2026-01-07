// wms-api/src/modules/stock-ledger/stockLedgerController.js
// Stock Ledger API endpoints

import { getConnection } from "../../db/connection.js";

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

    const stockLedger = rows.map((row) => ({
      item_code: row.item_code,
      warehouse: row.warehouse,
      bin_location: row.bin_location || null,
      qty: parseFloat(row.qty) || 0,
      reserved_qty: parseFloat(row.reserved_qty) || 0,
      available_qty:
        (parseFloat(row.qty) || 0) - (parseFloat(row.reserved_qty) || 0),
      qty_before: row.qty_before != null ? parseFloat(row.qty_before) : null,
      qty_reduced: row.qty_reduced != null ? parseFloat(row.qty_reduced) : null,
      last_transaction_date: row.last_transaction_date
        ? row.last_transaction_date.toISOString()
        : null,
      last_transaction_type: row.last_transaction_type || null,
      last_transaction_ref: row.last_transaction_ref || null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null,
      created_at: row.created_at ? row.created_at.toISOString() : null,
    }));

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

    const [rows] = await connection.execute(
      `
      SELECT 
        item_code,
        warehouse,
        bin_location,
        qty,
        reserved_qty,
        available_qty,
        last_transaction_date,
        last_transaction_type,
        last_transaction_ref,
        updated_at,
        created_at
      FROM tabStockLedger
      WHERE item_code = ? AND warehouse = ?
      ORDER BY bin_location IS NULL, bin_location
    `,
      [item_code, warehouse]
    );

    const stockLedger = rows.map((row) => ({
      item_code: row.item_code,
      warehouse: row.warehouse,
      bin_location: row.bin_location || null,
      qty: parseFloat(row.qty) || 0,
      reserved_qty: parseFloat(row.reserved_qty) || 0,
      available_qty: parseFloat(row.available_qty) || 0,
      last_transaction_date: row.last_transaction_date
        ? row.last_transaction_date.toISOString()
        : null,
      last_transaction_type: row.last_transaction_type || null,
      last_transaction_ref: row.last_transaction_ref || null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null,
      created_at: row.created_at ? row.created_at.toISOString() : null,
    }));

    res.json(stockLedger);
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
