// wms-api/src/modules/stock-ledger/transactionHistoryController.js
// Transaction History API endpoints (from tabTransactionHistory table)

import { getConnection } from '../../db/connection.js';
import { logger } from '../../utils/logger.js';
import { resolveFullLocationId } from './stockLedgerController.js';
import { normalizeWarehouse } from '../../utils/warehouseUtils.js';

/**
 * GET /api/transaction-history
 * Get transaction history from tabTransactionHistory table (enhanced audit trail)
 * 
 * Query Parameters:
 * - warehouse (optional): Filter by warehouse
 * - item_code (optional): Filter by item code
 * - bin_location (optional): Filter by bin location
 * - carton_id (optional): Filter by carton ID
 * - transaction_type (optional): Filter by transaction type
 * - stock_direction (optional): Filter by stock direction (IN, OUT, ADJUSTMENT)
 * - reference_doc (optional): Filter by reference document
 * - from_date (optional): Filter from date (YYYY-MM-DD)
 * - to_date (optional): Filter to date (YYYY-MM-DD)
 * - limit (optional): Limit results (default: 10000)
 */
export const getTransactionHistory = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { 
      warehouse, 
      item_code, 
      bin_location, 
      carton_id, 
      transaction_type, 
      stock_direction,
      reference_doc, 
      from_date, 
      to_date, 
      limit 
    } = req.query;
    
    // Removed INFO-level logging - only log errors
    
    // Check if tabTransactionHistory table exists
    const [tableCheck] = await connection.execute(`
      SELECT COUNT(*) > 0 as table_exists
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransactionHistory'
    `);
    
    if (!tableCheck[0].table_exists) {
      // Fallback to tabStockTransaction if history table doesn't exist
      return res.status(404).json({
        ok: false,
        error: {
          code: 'TABLE_NOT_FOUND',
          message: 'Transaction history table not found. Please run the setup script first.'
        }
      });
    }
    
    // First, check which columns actually exist in the table
    const [columnCheck] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabTransactionHistory'
        AND COLUMN_NAME IN ('transaction_no', 'transaction_number')
    `);
    const hasTransactionNo = columnCheck.some(col => col.COLUMN_NAME === 'transaction_no');
    const hasTransactionNumber = columnCheck.some(col => col.COLUMN_NAME === 'transaction_number');
    
    // Use the correct column name based on what exists
    const transactionNoColumn = hasTransactionNumber ? 'transaction_number' : (hasTransactionNo ? 'transaction_no' : null);
    
    // Build SELECT clause with proper column handling
    let query = `
      SELECT 
        id,
        transaction_id,
        ${transactionNoColumn ? `COALESCE(${transactionNoColumn}, '') as transaction_number,` : `NULL as transaction_number,`}
        transaction_date,
        transaction_type,
        reference_doc_type,
        reference_doc,
        wms_transaction_title,
        item_code,
        item_name,
        warehouse,
        warehouse_name,
        bin_location,
        location_id,
        carton_id,
        batch_no,
        serial_no,
        qty_change,
        qty_before,
        qty_after,
        stock_direction,
        source_bin,
        target_bin,
        performed_by,
        performed_by_name,
        notes,
        reason_code,
        status,
        created_at
      FROM tabTransactionHistory
      WHERE 1=1
    `;
    
    const params = [];
    
    if (warehouse) {
      // ✅ Normalize warehouse to handle variations like "WH-Main", "Main Warehouse", etc.
      const normalizedWarehouse = normalizeWarehouse(warehouse);
      const whUpper = normalizedWarehouse ? String(normalizedWarehouse).trim().toUpperCase() : null;
      if (whUpper) {
        query += ' AND UPPER(TRIM(warehouse)) = ?';
        params.push(whUpper);
      }
    }
    
    if (item_code) {
      // Use exact match or prefix match for better index usage (LIKE 'prefix%' can use index)
      // If user wants exact match, use =; if they want search, use LIKE 'prefix%'
      if (item_code.includes('%') || item_code.includes('_')) {
        query += ' AND item_code LIKE ?';
        params.push(item_code);
      } else {
        // Try exact match first (faster), fallback to prefix match
        query += ' AND (item_code = ? OR item_code LIKE ?)';
        params.push(item_code, `${item_code}%`);
      }
    }
    
    if (bin_location) {
      query += ' AND bin_location = ?';
      params.push(bin_location);
    }
    
    if (carton_id) {
      query += ' AND carton_id = ?';
      params.push(carton_id);
    }
    
    if (transaction_type) {
      query += ' AND transaction_type = ?';
      params.push(transaction_type);
    }
    
    if (stock_direction) {
      query += ' AND stock_direction = ?';
      params.push(stock_direction);
    }
    
    if (reference_doc) {
      query += ' AND reference_doc = ?';
      params.push(reference_doc);
    }
    
    // ✅ Robust datetime range (instead of DATE()) - more reliable & index-friendly
    // Expect from_date/to_date in YYYY-MM-DD format
    // Use DATE() function for comparison to handle timezone issues
    if (from_date) {
      query += ' AND DATE(transaction_date) >= DATE(?)';
      params.push(from_date);
    }
    
    if (to_date) {
      query += ' AND DATE(transaction_date) <= DATE(?)';
      params.push(to_date);
    }
    
    query += ' ORDER BY transaction_date DESC, id DESC';
    
    // Optimize default limit - reduce from 10000 to 1000 for better performance
    const limitValue = parseInt(limit) || 1000;
    query += ` LIMIT ?`;
    params.push(limitValue);
    
    // Add debug logging to help diagnose issues
    logger.info('[Transaction History] Executing query', {
      query: query.substring(0, 500),
      params: params,
      paramsCount: params.length,
      hasTransactionNoColumn: !!transactionNoColumn,
      transactionNoColumnName: transactionNoColumn,
      filters: {
        warehouse,
        item_code,
        bin_location,
        carton_id,
        transaction_type,
        stock_direction,
        reference_doc,
        from_date,
        to_date,
        limit: limitValue
      }
    });
    
    let rows = [];
    try {
      [rows] = await connection.execute(query, params);
      
      logger.info('[Transaction History] Query executed successfully', {
        rowsReturned: rows.length,
        sampleRow: rows.length > 0 ? {
          id: rows[0].id,
          item_code: rows[0].item_code,
          transaction_date: rows[0].transaction_date,
          transaction_type: rows[0].transaction_type,
          transaction_number: rows[0].transaction_number
        } : null
      });
    } catch (queryError) {
      logger.error('[Transaction History] Query execution failed', {
        error: queryError.message,
        stack: queryError.stack,
        query: query.substring(0, 500),
        params: params
      });
      throw queryError;
    }
    
    // Resolve full location_id for all rows (batch lookup for performance)
    const uniqueBinLocations = [...new Set(rows.map(r => r.bin_location).filter(Boolean))];
    const locationMap = new Map();
    
    // Get warehouse from first row (or use provided warehouse filter)
    const warehouseForLookup = warehouse || (rows.length > 0 ? rows[0].warehouse : null);
    
    for (const binLoc of uniqueBinLocations) {
      const fullLocationId = await resolveFullLocationId(connection, binLoc, warehouseForLookup);
      locationMap.set(binLoc, fullLocationId);
    }
    
    const transactions = rows.map(row => {
      // Resolve full location_id from bin_location
      const resolvedBinLocation = row.bin_location 
        ? (locationMap.get(row.bin_location) || row.bin_location)
        : null;
      
      // Ensure transaction_number is a string (not empty string if NULL)
      const transactionNumber = row.transaction_number && row.transaction_number.trim() !== '' 
        ? row.transaction_number 
        : null;
      
      return {
        id: row.id,
        transaction_id: row.transaction_id,
        transaction_number: transactionNumber,
        transaction_date: row.transaction_date ? row.transaction_date.toISOString() : null,
        transaction_type: row.transaction_type || null,
        reference_doc_type: row.reference_doc_type || null,
        reference_doc: row.reference_doc || null,
        wms_transaction_title: row.wms_transaction_title || null,
        item_code: row.item_code || null,
        item_name: row.item_name || null,
        warehouse: row.warehouse || null,
        warehouse_name: row.warehouse_name || null,
        bin_location: resolvedBinLocation,
        location_id: row.location_id || resolvedBinLocation || null,
        carton_id: row.carton_id || null,
        batch_no: row.batch_no || null,
        serial_no: row.serial_no || null,
        qty_change: row.qty_change !== null && row.qty_change !== undefined ? parseFloat(row.qty_change) : 0,
        qty_before: row.qty_before !== null && row.qty_before !== undefined ? parseFloat(row.qty_before) : 0,
        qty_after: row.qty_after !== null && row.qty_after !== undefined ? parseFloat(row.qty_after) : 0,
        stock_direction: row.stock_direction || null,
        source_bin: row.source_bin || null,
        target_bin: row.target_bin || null,
        performed_by: row.performed_by || null,
        performed_by_name: row.performed_by_name || null,
        notes: row.notes || null,
        reason_code: row.reason_code || null,
        status: row.status || null,
        created_at: row.created_at ? row.created_at.toISOString() : null
      };
    });
    
    logger.info('[Transaction History] Returning response', {
      totalRecords: transactions.length,
      sampleRecord: transactions.length > 0 ? {
        id: transactions[0].id,
        item_code: transactions[0].item_code,
        transaction_date: transactions[0].transaction_date,
        transaction_type: transactions[0].transaction_type,
        transaction_number: transactions[0].transaction_number
      } : null,
      responseFormat: {
        ok: true,
        hasData: true,
        dataLength: transactions.length
      }
    });
    
    // Ensure response format matches desktop app expectations: { ok: true, data: [...] }
    const response = {
      ok: true,
      data: transactions,
      count: transactions.length
    };
    
    logger.info('[Transaction History] Sending response', {
      responseOk: response.ok,
      dataArrayLength: response.data.length,
      count: response.count
    });
    
    res.json(response);
    
  } catch (error) {
    logger.error('Failed to fetch transaction history', {
      error: error.message,
      stack: error.stack,
      query: req.query
    });
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch transaction history',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};
