// wms-api/src/modules/stock-ledger/transactionHistoryController.js
// Transaction History API endpoints (from tabTransactionHistory table)

import { getConnection } from '../../db/connection.js';

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
    
    console.log('[Transaction History API] Request params:', {
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
    });
    
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
    
    let query = `
      SELECT 
        id,
        transaction_id,
        transaction_number,
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
      query += ' AND warehouse = ?';
      params.push(warehouse);
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
    
    if (from_date) {
      query += ' AND DATE(transaction_date) >= ?';
      params.push(from_date);
    }
    
    if (to_date) {
      query += ' AND DATE(transaction_date) <= ?';
      params.push(to_date);
    }
    
    query += ' ORDER BY transaction_date DESC, id DESC';
    
    // Optimize default limit - reduce from 10000 to 1000 for better performance
    const limitValue = parseInt(limit) || 1000;
    query += ` LIMIT ?`;
    params.push(limitValue);
    
    console.log('[Transaction History API] Executing query:', query);
    console.log('[Transaction History API] Query params:', params);
    
    const [rows] = await connection.execute(query, params);
    
    console.log(`[Transaction History API] Found ${rows.length} transactions`);
    
    const transactions = rows.map(row => ({
      id: row.id,
      transaction_id: row.transaction_id,
      transaction_number: row.transaction_number || null,
      transaction_date: row.transaction_date ? row.transaction_date.toISOString() : null,
      transaction_type: row.transaction_type,
      reference_doc_type: row.reference_doc_type || null,
      reference_doc: row.reference_doc || null,
      wms_transaction_title: row.wms_transaction_title || null,
      item_code: row.item_code,
      item_name: row.item_name || null,
      warehouse: row.warehouse,
      warehouse_name: row.warehouse_name || null,
      bin_location: row.bin_location || null,
      location_id: row.location_id || null,
      carton_id: row.carton_id || null,
      batch_no: row.batch_no || null,
      serial_no: row.serial_no || null,
      qty_change: parseFloat(row.qty_change) || 0,
      qty_before: parseFloat(row.qty_before) || 0,
      qty_after: parseFloat(row.qty_after) || 0,
      stock_direction: row.stock_direction || null,
      source_bin: row.source_bin || null,
      target_bin: row.target_bin || null,
      performed_by: row.performed_by || null,
      performed_by_name: row.performed_by_name || null,
      notes: row.notes || null,
      reason_code: row.reason_code || null,
      status: row.status || null,
      created_at: row.created_at ? row.created_at.toISOString() : null
    }));
    
    res.json({
      ok: true,
      data: transactions
    });
    
  } catch (error) {
    console.error('Failed to fetch transaction history:', error);
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
