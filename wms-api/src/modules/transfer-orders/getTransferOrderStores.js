// Get distinct stores for a specific transfer order OR ASN
// Used by mobile app BoxManagement screen to show only stores allocated in the transfer order or boxes created for ASN

import { getConnection } from '../../db/connection.js';

/**
 * GET /api/transfer-orders/:to_no/stores
 * Get distinct stores allocated in a specific transfer order
 * 
 * Purpose: Return only stores that have items allocated in the transfer order
 * This prevents showing all stores (SR-01, SR-02, SR-03) when only specific stores are allocated
 */
export const getTransferOrderStores = async (req, res) => {
  const { to_no } = req.params;

  if (!to_no) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Transfer Order number is required'
      }
    });
  }

  const connection = await getConnection();

  try {
    // First, verify transfer order exists
    const [toRows] = await connection.execute(
      `SELECT title, advance_shipping_notice FROM tabTransferOrder WHERE title = ? LIMIT 1`,
      [to_no]
    );

    if (toRows.length === 0) {
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: 'TRANSFER_ORDER_NOT_FOUND',
          message: `Transfer Order ${to_no} not found`
        }
      });
    }

    // Get distinct stores from transfer order items with warehouse details
    const [storeRows] = await connection.execute(`
      SELECT 
        toi.store,
        w.name,
        w.warehouse_type,
        COUNT(DISTINCT toi.item_code) as total_items,
        SUM(toi.allocated_qty) as total_allocated_qty
      FROM tabTransferOrderItem toi
      LEFT JOIN tabWarehouse w ON toi.store = w.code
      WHERE toi.parent_title = ?
        AND toi.store IS NOT NULL
        AND toi.store != ''
      GROUP BY toi.store, w.name, w.warehouse_type
      ORDER BY toi.store ASC
    `, [to_no]);

    // Format response
    const stores = storeRows.map(row => ({
      store: row.store,
      code: row.store, // Alias for compatibility
      name: row.name || row.store, // Use warehouse name if available, otherwise use store code
      warehouse_type: row.warehouse_type || null,
      total_items: parseInt(row.total_items) || 0,
      total_allocated_qty: parseFloat(row.total_allocated_qty) || 0
    }));

    console.log(`✅ getTransferOrderStores: Found ${stores.length} store(s) for Transfer Order "${to_no}"`);

    res.json({
      ok: true,
      transfer_order: to_no,
      asn_no: toRows[0].advance_shipping_notice || null,
      stores: stores,
      count: stores.length
    });

  } catch (error) {
    console.error(`Error fetching stores for Transfer Order ${to_no}:`, error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch stores for transfer order',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/asn/:asn_no/stores
 * Get distinct stores for an ASN (handles both ASN with TO and ASN without TO)
 * 
 * Purpose: Return stores from:
 * 1. Transfer Order items (if TO exists for ASN)
 * 2. Boxes created for ASN (if no TO exists)
 * 
 * This handles the case where ASN can exist without Transfer Order
 */
export const getAsnStores = async (req, res) => {
  const { asn_no } = req.params;

  if (!asn_no) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'ASN number is required'
      }
    });
  }

  const connection = await getConnection();

  try {
    // Check if ASN exists
    const [asnRows] = await connection.execute(
      `SELECT title FROM tabAdvanceShippingNotice WHERE title = ? LIMIT 1`,
      [asn_no]
    );

    if (asnRows.length === 0) {
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: 'ASN_NOT_FOUND',
          message: `ASN ${asn_no} not found`
        }
      });
    }

    // Try to get stores from Transfer Order first (if TO exists)
    const [toRows] = await connection.execute(
      `SELECT title FROM tabTransferOrder WHERE advance_shipping_notice = ? LIMIT 1`,
      [asn_no]
    );

    let stores = [];
    let source = 'boxes'; // Default source

    if (toRows.length > 0) {
      // ASN has Transfer Order - get stores from TO items
      const to_no = toRows[0].title;
      source = 'transfer_order';
      
      const [storeRows] = await connection.execute(`
        SELECT 
          toi.store,
          w.name,
          w.warehouse_type,
          COUNT(DISTINCT toi.item_code) as total_items,
          SUM(toi.allocated_qty) as total_allocated_qty
        FROM tabTransferOrderItem toi
        LEFT JOIN tabWarehouse w ON toi.store = w.code
        WHERE toi.parent_title = ?
          AND toi.store IS NOT NULL
          AND toi.store != ''
        GROUP BY toi.store, w.name, w.warehouse_type
        ORDER BY toi.store ASC
      `, [to_no]);

      stores = storeRows.map(row => ({
        store: row.store,
        code: row.store,
        name: row.name || row.store,
        warehouse_type: row.warehouse_type || null,
        total_items: parseInt(row.total_items) || 0,
        total_allocated_qty: parseFloat(row.total_allocated_qty) || 0
      }));

      console.log(`✅ getAsnStores: Found ${stores.length} store(s) from Transfer Order "${to_no}" for ASN "${asn_no}"`);
    } else {
      // ASN has NO Transfer Order - get stores from boxes created for this ASN
      const [boxStoreRows] = await connection.execute(`
        SELECT 
          b.store,
          w.name,
          w.warehouse_type,
          COUNT(DISTINCT b.box_id) as total_boxes,
          SUM(CASE WHEN b.status = 'Open' THEN 1 ELSE 0 END) as open_boxes,
          SUM(CASE WHEN b.status = 'Closed' THEN 1 ELSE 0 END) as closed_boxes
        FROM tabSortBox b
        LEFT JOIN tabWarehouse w ON b.store = w.code
        WHERE b.advance_shipping_notice = ?
          AND b.store IS NOT NULL
          AND b.store != ''
        GROUP BY b.store, w.name, w.warehouse_type
        ORDER BY b.store ASC
      `, [asn_no]);

      stores = boxStoreRows.map(row => ({
        store: row.store,
        code: row.store,
        name: row.name || row.store,
        warehouse_type: row.warehouse_type || null,
        total_boxes: parseInt(row.total_boxes) || 0,
        open_boxes: parseInt(row.open_boxes) || 0,
        closed_boxes: parseInt(row.closed_boxes) || 0
      }));

      console.log(`✅ getAsnStores: Found ${stores.length} store(s) from boxes for ASN "${asn_no}" (no Transfer Order)`);
    }

    res.json({
      ok: true,
      asn_no: asn_no,
      transfer_order: toRows.length > 0 ? toRows[0].title : null,
      has_transfer_order: toRows.length > 0,
      source: source, // 'transfer_order' or 'boxes'
      stores: stores,
      count: stores.length
    });

  } catch (error) {
    console.error(`Error fetching stores for ASN ${asn_no}:`, error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch stores for ASN',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};
