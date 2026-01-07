// wms-api/src/modules/master/masterController.js
// GET /api/master/asns - Returns ASN list matching desktop app query
// IMPORTANT: Preserves ASN format exactly as stored in database (no normalization)

import pool from '../../config/database.js';
import logger from '../../config/logger.js';
import { asyncHandler } from '../../utils/response.js';

/**
 * GET /api/master/asns
 * Get all ASNs with carton count - matches desktop app query exactly
 * 
 * CRITICAL: Returns ASN numbers in their ORIGINAL format from database
 * - NO normalization (preserves 3, 4, 5, 10 digits, etc.)
 * - NO formatting or transformation
 * - Returns exactly as stored: ASN-00001, ASN-00002, ASN-00005, etc.
 * 
 * Response Format:
 * [
 *   {
 *     "asn_no": "ASN-00001",  // ✅ Original format from database (preserved exactly)
 *     "status": "Submitted",
 *     "purchase_order": "PO-2024-001",
 *     "supplier": "Supplier ABC",
 *     "shipment_date": "2024-12-20",
 *     "expected_arrival_date": "2024-12-25",
 *     "total_shipped_qty": 150.00,
 *     "airway_bill_no": null,
 *     "shipment_type": "Road",
 *     "updated_on": "2024-12-24T16:14:04.000Z",
 *     "total_carton_count": 2
 *   }
 * ]
 */
export const getAllAsns = asyncHandler(async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    // Match desktop app query exactly:
    // - Same table: tabAdvanceShippingNotice
    // - Same JOIN: LEFT JOIN tabAsnItemDetails with carton_id IS NOT NULL
    // - Same GROUP BY: All ASN fields
    // - Same ORDER BY: shipment_date DESC, title
    // - Same carton count: COUNT(DISTINCT d.carton_id)
    // 
    // CRITICAL: Use a.title directly - NO normalization, NO formatting
    // Preserves original format exactly as stored in database
    const query = `
      SELECT 
        a.title,  -- ✅ Use original format from database (no normalization)
        a.status,
        a.purchase_order,
        a.supplier,
        a.shipment_date,
        a.expected_arrival_date,
        a.total_shipped_qty,
        a.airway_bill_no,
        a.shipment_type,
        a.updated_on,
        COALESCE(COUNT(DISTINCT d.carton_id), 0) as total_carton_count
      FROM tabAdvanceShippingNotice a
      LEFT JOIN tabAsnItemDetails d 
        ON a.title = d.parent_title 
        AND d.carton_id IS NOT NULL
      GROUP BY 
        a.title, 
        a.status, 
        a.purchase_order, 
        a.supplier, 
        a.shipment_date, 
        a.expected_arrival_date, 
        a.total_shipped_qty, 
        a.airway_bill_no, 
        a.shipment_type, 
        a.updated_on
      ORDER BY a.shipment_date DESC, a.title
    `;

    const [rows] = await connection.query(query);

    // Format response - CRITICAL: Preserve ASN format exactly as from database
    // DO NOT normalize, format, or transform ASN numbers
    const asns = rows.map(row => ({
      asn_no: row.title,  // ✅ Return original format (no normalization)
      status: row.status,
      purchase_order: row.purchase_order,
      supplier: row.supplier,
      shipment_date: row.shipment_date ? row.shipment_date.toISOString().split('T')[0] : null,
      expected_arrival_date: row.expected_arrival_date ? row.expected_arrival_date.toISOString().split('T')[0] : null,
      total_shipped_qty: parseFloat(row.total_shipped_qty) || 0,
      airway_bill_no: row.airway_bill_no || null,
      shipment_type: row.shipment_type || null,
      updated_on: row.updated_on ? row.updated_on.toISOString() : null,
      total_carton_count: parseInt(row.total_carton_count) || 0
    }));

    logger.info({ count: asns.length }, 'ASN list fetched (original format preserved)');

    res.json(asns);
    
  } catch (error) {
    logger.error({ error, errorMessage: error.message, errorCode: error.code }, 'Failed to fetch ASN list');
    
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch ASN list',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
});

