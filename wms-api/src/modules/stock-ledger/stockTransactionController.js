// wms-api/src/modules/stock-ledger/stockTransactionController.js
// Stock Transaction API endpoints

import { getConnection } from '../../db/connection.js';

/**
 * GET /api/stock-transactions
 * Get all stock transaction entries (audit trail of stock movements)
 * 
 * Query Parameters:
 * - warehouse (optional): Filter by warehouse
 * - item_code (optional): Filter by item code
 * - transaction_type (optional): Filter by transaction type (Receiving, Putaway, Picking, CycleCount, TransferIn, MaterialRequest)
 * - reference_doc (optional): Filter by reference document
 * - from_date (optional): Filter from date (YYYY-MM-DD)
 * - to_date (optional): Filter to date (YYYY-MM-DD)
 * - limit (optional): Limit results (default: 1000)
 * 
 * Response Format:
 * [
 *   {
 *     "id": 1,
 *     "transaction_date": "2025-12-27T10:30:00.000Z",
 *     "transaction_type": "Putaway",
 *     "reference_doc_type": "Putaway Task",
 *     "reference_doc": "PUT-0001",
 *     "wms_transaction_title": "WMS-PUT-0001",
 *     "item_code": "ITEM-001",
 *     "warehouse": "WH-MAIN",
 *     "bin_location": "RACK-A-01-BIN-05",
 *     "qty_change": 50.00,
 *     "qty_before": 0.00,
 *     "qty_after": 50.00,
 *     "source_bin": "DOCK-01",
 *     "target_bin": "RACK-A-01-BIN-05",
 *     "performed_by": "USER-001",
 *     "notes": null,
 *     "created_at": "2025-12-27T10:30:00.000Z"
 *   }
 * ]
 */
export const getStockTransactions = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { warehouse, item_code, transaction_type, reference_doc, reference_id, action, from_date, to_date, limit } = req.query;
    
    // Check if carton_id column exists
    const [cartonIdColumn] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockTransaction' 
      AND COLUMN_NAME = 'carton_id'
    `);
    const hasCartonIdColumn = cartonIdColumn.length > 0;
    
    let query = `
      SELECT 
        id,
        transaction_date,
        transaction_type,
        reference_doc_type,
        reference_doc,
        wms_transaction_title,
        item_code,
        warehouse,
        bin_location,
        qty_change,
        qty_before,
        qty_after,
        source_bin,
        target_bin,
        ${hasCartonIdColumn ? 'carton_id,' : ''}
        performed_by,
        notes,
        created_at
      FROM tabStockTransaction
      WHERE 1=1
    `;
    
    const params = [];
    
    if (warehouse) {
      query += ' AND warehouse = ?';
      params.push(warehouse);
    }
    
    if (item_code) {
      query += ' AND item_code = ?';
      params.push(item_code);
    }
    
    if (transaction_type) {
      query += ' AND transaction_type = ?';
      params.push(transaction_type);
    }
    
    if (reference_doc) {
      query += ' AND reference_doc = ?';
      params.push(reference_doc);
    }
    
    // Support reference_id alias (for putaway validation)
    if (reference_id && !reference_doc) {
      query += ' AND reference_doc = ?';
      params.push(reference_id);
    }
    
    // Support action parameter (alias for transaction_type, e.g., action=PUTAWAY)
    if (action && !transaction_type) {
      query += ' AND transaction_type = ?';
      params.push(action);
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
    
    const limitValue = parseInt(limit) || 1000;
    query += ` LIMIT ?`;
    params.push(limitValue);
    
    const [rows] = await connection.execute(query, params);
    
    const transactions = rows.map(row => ({
      id: row.id,
      transaction_date: row.transaction_date ? row.transaction_date.toISOString() : null,
      transaction_type: row.transaction_type,
      reference_doc_type: row.reference_doc_type || null,
      reference_doc: row.reference_doc || null,
      wms_transaction_title: row.wms_transaction_title || null,
      item_code: row.item_code,
      warehouse: row.warehouse,
      bin_location: row.bin_location || null,
      carton_id: hasCartonIdColumn ? (row.carton_id || null) : null,
      qty_change: parseFloat(row.qty_change) || 0,
      qty_before: parseFloat(row.qty_before) || 0,
      qty_after: parseFloat(row.qty_after) || 0,
      source_bin: row.source_bin || null,
      target_bin: row.target_bin || null,
      performed_by: row.performed_by || null,
      notes: row.notes || null,
      created_at: row.created_at ? row.created_at.toISOString() : null
    }));
    
    res.json(transactions);
    
  } catch (error) {
    console.error('Failed to fetch stock transactions:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch stock transactions',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

