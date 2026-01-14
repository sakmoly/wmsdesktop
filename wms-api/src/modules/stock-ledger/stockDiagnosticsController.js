// wms-api/src/modules/stock-ledger/stockDiagnosticsController.js
// Stock Diagnostics API endpoints

import { diagnoseStock } from './stockPostingService.js';

/**
 * GET /api/wms/stock/diagnose
 * Diagnose stock discrepancies for an item/warehouse
 * 
 * Query Parameters:
 * - item_code (required): Item code to diagnose
 * - warehouse (required): Warehouse code
 * 
 * Response:
 * {
 *   "ok": true,
 *   "data": {
 *     "item_code": "SKU-001",
 *     "warehouse": "WH-MAIN",
 *     "ledger_total": 96.00,
 *     "item_stock_total": 98.00,
 *     "bin_stock_total": 96.00,
 *     "bin_breakdown": [
 *       { "bin_location": "A1-R01-L3-B1", "qty": 96.00 }
 *     ],
 *     "matches": {
 *       "ledger_vs_item": "mismatch",
 *       "ledger_vs_bin": "match"
 *     },
 *     "discrepancies": {
 *       "item_difference": 2.00,
 *       "bin_difference": 0.00
 *     },
 *     "duplicates": []
 *   }
 * }
 */
export const diagnoseStockDiscrepancy = async (req, res) => {
  try {
    const { item_code, warehouse } = req.query;
    
    if (!item_code || !warehouse) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'item_code and warehouse query parameters are required'
        }
      });
    }
    
    const diagnosis = await diagnoseStock(item_code, warehouse);
    
    res.json({
      ok: true,
      data: diagnosis
    });
    
  } catch (error) {
    console.error('Failed to diagnose stock:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to diagnose stock',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  }
};
