// wms-api/src/modules/master/masterController.js
// GET /api/master/asns - Returns ASN list matching desktop app query
// IMPORTANT: Preserves ASN format exactly as stored in database (no normalization)

import { getConnection } from '../../db/connection.js';

/**
 * GET /api/master/asns
 * Get all ASNs with carton count - matches desktop app query exactly
 * 
 * CRITICAL: Returns ASN numbers in their ORIGINAL format from database
 * - NO normalization (preserves 3, 4, 5, 10 digits, etc.)
 * - NO formatting or transformation
 * - Returns exactly as stored in database (e.g., ASN-0001, ASN-0002, ASN-0005 for 4-digit format)
 * 
 * Response Format:
 * [
 *   {
 *     "asn_no": "ASN-0001",  // ✅ Original format from database (preserved exactly - 4-digit as stored)
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
export const getAllAsns = async (req, res) => {
  const connection = await getConnection();
  
  try {
    // Match desktop app query exactly:
    // - Same table: tabAdvanceShippingNotice
    // - Same JOIN: LEFT JOIN tabAsnItemDetails (removed carton_id filter to calculate total correctly)
    // - Calculate total_shipped_qty dynamically from item details to ensure accuracy
    // - Same GROUP BY: All ASN fields (except total_shipped_qty which is calculated)
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
        COALESCE(SUM(d.shipped_qty), 0) as total_shipped_qty,  -- ✅ Calculate dynamically from item details
        a.airway_bill_no,
        a.shipment_type,
        a.updated_on,
        COALESCE(COUNT(DISTINCT CASE WHEN d.carton_id IS NOT NULL THEN d.carton_id END), 0) as total_carton_count
      FROM tabAdvanceShippingNotice a
      LEFT JOIN tabAsnItemDetails d 
        ON a.title = d.parent_title
      GROUP BY 
        a.title, 
        a.status, 
        a.purchase_order, 
        a.supplier, 
        a.shipment_date, 
        a.expected_arrival_date, 
        a.airway_bill_no, 
        a.shipment_type, 
        a.updated_on
      ORDER BY a.shipment_date DESC, a.title
    `;

    const [rows] = await connection.execute(query);

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

    console.log(`ASN list fetched: ${asns.length} ASNs (original format preserved)`);

    res.json(asns);
    
  } catch (error) {
    console.error('Failed to fetch ASN list:', error);
    
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch ASN list',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/asn/:asn_no
 * Get single ASN details with cartons/items
 * 
 * Response Format:
 * {
 *   "asn_no": "ASN-0002",
 *   "status": "Submitted",
 *   "purchase_order": "PO-2024-001",
 *   "supplier": "Supplier ABC",
 *   "shipment_date": "2024-12-20",
 *   "expected_arrival_date": "2024-12-25",
 *   "total_shipped_qty": 150.00,
 *   "airway_bill_no": null,
 *   "shipment_type": "Road",
 *   "updated_on": "2024-12-24T16:14:04.000Z",
 *   "details": [
 *     {
 *       "item_code": "SKU-001",
 *       "po_item_reference": "PO-ITEM-001",
 *       "shipped_qty": 50.00,
 *       "carton_id": "CTN-0101",
 *       "carton_assigned_status": "Assigned"
 *     }
 *   ]
 * }
 */
export const getAsnByNumber = async (req, res) => {
  const { asn_no } = req.params;

  if (!asn_no) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'ASN number is required'
    });
  }

  const connection = await getConnection();

  try {
    // Get ASN header with calculated total_shipped_qty from item details
    const [asnRows] = await connection.execute(
      `SELECT a.title, a.status, a.purchase_order, a.supplier, 
              a.shipment_date, a.expected_arrival_date, 
              COALESCE(SUM(d.shipped_qty), 0) as total_shipped_qty, 
              a.airway_bill_no, a.shipment_type, a.updated_on
       FROM tabAdvanceShippingNotice a
       LEFT JOIN tabAsnItemDetails d ON a.title = d.parent_title
       WHERE a.title = ?
       GROUP BY a.title, a.status, a.purchase_order, a.supplier, 
                a.shipment_date, a.expected_arrival_date, 
                a.airway_bill_no, a.shipment_type, a.updated_on`,
      [asn_no]
    );

    if (!asnRows || asnRows.length === 0) {
      return res.status(404).json({
        code: 'NOT_FOUND',
        message: `ASN ${asn_no} not found`
      });
    }

    const asn = asnRows[0];

    // Get ASN item details (cartons)
    const [itemRows] = await connection.execute(
      `SELECT item_code, po_item_reference, shipped_qty, 
              carton_id, carton_assigned_status
       FROM tabAsnItemDetails
       WHERE parent_title = ?
       ORDER BY item_code, carton_id`,
      [asn_no]
    );

    // Format item details
    const details = itemRows.map(row => ({
      item_code: row.item_code,
      po_item_reference: row.po_item_reference || null,
      shipped_qty: parseFloat(row.shipped_qty) || 0,
      carton_id: row.carton_id || null,
      carton_assigned_status: row.carton_assigned_status || 'Assigned'
    }));

    // Format response
    const response = {
      asn_no: asn.title,  // ✅ Preserve original format
      status: asn.status,
      purchase_order: asn.purchase_order,
      supplier: asn.supplier,
      shipment_date: asn.shipment_date ? asn.shipment_date.toISOString().split('T')[0] : null,
      expected_arrival_date: asn.expected_arrival_date ? asn.expected_arrival_date.toISOString().split('T')[0] : null,
      total_shipped_qty: parseFloat(asn.total_shipped_qty) || 0,  // ✅ Now calculated dynamically
      airway_bill_no: asn.airway_bill_no || null,
      shipment_type: asn.shipment_type || null,
      updated_on: asn.updated_on ? asn.updated_on.toISOString() : null,
      details: details
    };

    console.log(`ASN details fetched: ${asn_no} with ${details.length} items`);

    res.json(response);

  } catch (error) {
    console.error(`Failed to fetch ASN ${asn_no}:`, error);

    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch ASN details',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/master/asns
 * Create a new ASN (Advanced Shipping Notice)
 * 
 * Request Body:
 * {
 *   "title": "ASN-0001" (optional - auto-generates if not provided),
 *   "supplier": "Supplier ABC",
 *   "shipment_date": "2026-01-24",
 *   "expected_arrival_date": "2026-01-25",
 *   "purchase_order": "PO-001" (optional),
 *   "shipment_type": "Ground" (optional),
 *   "airway_bill_no": "AWB123" (optional),
 *   "items": [
 *     { "item_code": "SKU-001", "shipped_qty": 50 },
 *     { "item_code": "SKU-002", "shipped_qty": 30 }
 *   ]
 * }
 */
export const createAsn = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { 
      title, 
      supplier, 
      shipment_date, 
      expected_arrival_date, 
      purchase_order,
      shipment_type,
      airway_bill_no,
      items 
    } = req.body;
    
    // Validation
    if (!supplier) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'supplier is required'
        }
      });
    }
    
    if (!shipment_date || !expected_arrival_date) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'shipment_date and expected_arrival_date are required'
        }
      });
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'items array is required and must not be empty'
        }
      });
    }
    
    // Generate ASN title if not provided
    let asnTitle = title;
    if (!asnTitle) {
      const [maxRows] = await connection.execute(`
        SELECT title FROM tabAdvanceShippingNotice 
        WHERE title LIKE 'ASN-%' 
        ORDER BY title DESC LIMIT 1
      `);
      
      let nextNum = 1;
      if (maxRows.length > 0) {
        const lastTitle = maxRows[0].title;
        const match = lastTitle.match(/ASN-(\d+)/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      asnTitle = `ASN-${nextNum.toString().padStart(4, '0')}`;
    }
    
    // Calculate total shipped qty
    const total_shipped_qty = items.reduce((sum, item) => sum + (parseFloat(item.shipped_qty) || 0), 0);
    
    await connection.beginTransaction();
    
    // Insert ASN header
    await connection.execute(`
      INSERT INTO tabAdvanceShippingNotice 
        (title, status, supplier, shipment_date, expected_arrival_date, 
         purchase_order, shipment_type, airway_bill_no, total_shipped_qty, 
         created_at, updated_at, updated_on)
      VALUES (?, 'Submitted', ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
    `, [
      asnTitle, 
      supplier, 
      shipment_date, 
      expected_arrival_date,
      purchase_order || null,
      shipment_type || 'Ground',
      airway_bill_no || null,
      total_shipped_qty
    ]);
    
    // Insert ASN items
    for (const item of items) {
      if (!item.item_code || !item.shipped_qty) {
        continue; // Skip invalid items
      }
      
      await connection.execute(`
        INSERT INTO tabAsnItemDetails 
          (parent_title, item_code, shipped_qty, carton_assigned_status, created_at, updated_at)
        VALUES (?, ?, ?, 'Pending', NOW(), NOW())
      `, [asnTitle, item.item_code, item.shipped_qty]);
    }
    
    await connection.commit();
    
    console.log(`✅ Created ASN: ${asnTitle} with ${items.length} item(s)`);
    
    res.status(201).json({
      ok: true,
      message: 'ASN created successfully',
      data: {
        title: asnTitle,
        status: 'Submitted',
        supplier: supplier,
        total_shipped_qty: total_shipped_qty,
        items_count: items.length
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Failed to create ASN:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        error: {
          code: 'DUPLICATE_ENTRY',
          message: `ASN with this title already exists`
        }
      });
    }
    
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to create ASN',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * DELETE /api/master/asns/:title
 * Delete an ASN and all related data (items, boxes, putaway tasks, etc.)
 * Used for clean test data setup
 */
export const deleteAsn = async (req, res) => {
  const { title } = req.params;
  
  if (!title) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'ASN title is required'
      }
    });
  }
  
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Check if ASN exists
    const [asnRows] = await connection.execute(
      `SELECT title FROM tabAdvanceShippingNotice WHERE title = ?`,
      [title]
    );
    
    if (asnRows.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `ASN ${title} not found`
        }
      });
    }
    
    // First, get all inbound sessions for this ASN (to delete related putaway tasks)
    let sessionIds = [];
    try {
      const [sessions] = await connection.execute(
        `SELECT inbound_session FROM tabInboundSession WHERE asn_no = ? OR advance_shipping_notice = ?`,
        [title, title]
      );
      sessionIds = sessions.map(s => s.inbound_session).filter(Boolean);
    } catch (err) {
      console.warn(`Could not query inbound sessions: ${err.message}`);
    }
    
    // Delete related data in order (handle missing tables gracefully)
    const deleteQueries = [
      // 1. Delete putaway task lines by ASN
      { sql: `DELETE FROM tabPutawayTaskLine WHERE parent_title IN (SELECT title FROM tabPutawayTask WHERE advance_shipping_notice = ?)`, params: [title] },
      // 2. Delete putaway lines by ASN
      { sql: `DELETE FROM tabPutawayLine WHERE parent_title IN (SELECT title FROM tabPutawayTask WHERE advance_shipping_notice = ?)`, params: [title] },
      // 3. Delete putaway tasks by ASN
      { sql: `DELETE FROM tabPutawayTask WHERE advance_shipping_notice = ?`, params: [title] },
      // 4. Delete inbound sessions
      { sql: `DELETE FROM tabInboundSession WHERE asn_no = ? OR advance_shipping_notice = ?`, params: [title, title] },
      // 5. Delete sort boxes
      { sql: `DELETE FROM tabSortBox WHERE advance_shipping_notice = ?`, params: [title] },
      // 6. Delete ASN item details
      { sql: `DELETE FROM tabAsnItemDetails WHERE parent_title = ?`, params: [title] },
      // 7. Delete the ASN header
      { sql: `DELETE FROM tabAdvanceShippingNotice WHERE title = ?`, params: [title] },
    ];
    
    // Also delete putaway tasks linked via inbound_session
    if (sessionIds.length > 0) {
      for (const sessionId of sessionIds) {
        deleteQueries.unshift(
          { sql: `DELETE FROM tabPutawayLine WHERE parent_title IN (SELECT title FROM tabPutawayTask WHERE inbound_session = ?)`, params: [sessionId] },
          { sql: `DELETE FROM tabPutawayTask WHERE inbound_session = ?`, params: [sessionId] }
        );
      }
    }
    
    // Also delete putaway tasks linked via box_id from sort boxes
    const [boxes] = await connection.execute(
      `SELECT box_id FROM tabSortBox WHERE advance_shipping_notice = ?`,
      [title]
    );
    for (const box of boxes) {
      if (box.box_id) {
        deleteQueries.unshift(
          { sql: `DELETE FROM tabPutawayLine WHERE parent_title IN (SELECT title FROM tabPutawayTask WHERE box_id = ?)`, params: [box.box_id] },
          { sql: `DELETE FROM tabPutawayTask WHERE box_id = ?`, params: [box.box_id] }
        );
      }
    }
    
    // Also delete putaway tasks that have carton_id matching the ASN pattern (CTN-ASN-XXXX-*)
    // This catches orphaned tasks where the box_id/inbound_session links were broken
    const cartonPattern = `CTN-${title}-%`;
    deleteQueries.unshift(
      { sql: `DELETE FROM tabPutawayLine WHERE carton_id LIKE ?`, params: [cartonPattern] },
      { sql: `DELETE FROM tabPutawayLine WHERE parent_title IN (SELECT title FROM tabPutawayTask WHERE box_id LIKE ?)`, params: [cartonPattern] },
      { sql: `DELETE FROM tabPutawayTask WHERE box_id LIKE ?`, params: [cartonPattern] }
    );
    
    // Delete scan events for this ASN (by ASN and by box_id pattern)
    deleteQueries.push(
      { sql: `DELETE FROM tabWmsScanEvent WHERE advance_shipping_notice = ?`, params: [title] },
      { sql: `DELETE FROM tabWmsScanEvent WHERE box_id LIKE ?`, params: [cartonPattern] },
      { sql: `DELETE FROM tabWmsScanEvent WHERE carton_id LIKE ?`, params: [cartonPattern] }
    );
    
    // AGGRESSIVE CLEANUP: Delete ALL putaway tasks that have inbound_session containing the ASN pattern
    // This catches orphaned tasks where advance_shipping_notice is NULL but inbound_session references the ASN
    const sessionPattern = `%${title}%`;
    deleteQueries.unshift(
      { sql: `DELETE FROM tabPutawayLine WHERE parent_title IN (SELECT title FROM tabPutawayTask WHERE inbound_session LIKE ?)`, params: [sessionPattern] },
      { sql: `DELETE FROM tabPutawayTask WHERE inbound_session LIKE ?`, params: [sessionPattern] }
    );
    
    for (const query of deleteQueries) {
      try {
        await connection.execute(query.sql, query.params);
      } catch (err) {
        // Ignore "table doesn't exist" errors, continue with other deletions
        if (!err.message.includes("doesn't exist") && !err.code?.includes('ER_NO_SUCH_TABLE')) {
          console.warn(`Delete query warning: ${err.message}`);
        }
      }
    }
    
    await connection.commit();
    
    console.log(`🗑️  Deleted ASN: ${title} and all related data`);
    
    res.status(200).json({
      ok: true,
      message: `ASN ${title} and all related data deleted successfully`
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Failed to delete ASN:', error);
    
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to delete ASN',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/master/transfer-orders
 * Get all transfer orders
 */
export const getAllTransferOrders = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const [rows] = await connection.execute(`
      SELECT 
        title as transfer_order,
        status,
        advance_shipping_notice as asn_no,
        from_warehouse,
        prepared_by,
        required_date,
        total_allocated_qty,
        created_at,
        updated_at
      FROM tabTransferOrder
      ORDER BY created_at DESC
    `);

    const transferOrders = rows.map(row => ({
      transfer_order: row.transfer_order,
      status: row.status,
      asn_no: row.asn_no,
      from_warehouse: row.from_warehouse,
      prepared_by: row.prepared_by,
      required_date: row.required_date ? row.required_date.toISOString().split('T')[0] : null,
      total_allocated_qty: parseFloat(row.total_allocated_qty) || 0,
      created_at: row.created_at ? row.created_at.toISOString() : null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null
    }));

    res.json(transferOrders);
    
  } catch (error) {
    console.error('Failed to fetch transfer orders:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch transfer orders',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/transfer-order/by-asn/:asn_no
 * Get transfer order for a specific ASN
 * 
 * ⚠️ CRITICAL: Uses exact ASN format from request (e.g., "ASN-0002"), no normalization
 * 
 * ✅ NOTE: ASN can exist without Transfer Order - this is a valid scenario
 * Returns 200 with has_transfer_order: false if no TO exists (not a 404 error)
 * 
 * Request:
 * GET /api/transfer-order/by-asn/ASN-0002
 * 
 * Response (ASN with Transfer Order):
 * {
 *   "ok": true,
 *   "asn_no": "ASN-0002",
 *   "transfer_order": "TO-0001",
 *   "to_no": "TO-0001",
 *   "has_transfer_order": true,
 *   "allocations": [
 *     {
 *       "store": "STORE-001",
 *       "item_code": "SKU-001",
 *       "allocated_qty": 50.0
 *     }
 *   ]
 * }
 * 
 * Response (ASN without Transfer Order):
 * {
 *   "ok": true,
 *   "asn_no": "ASN-0002",
 *   "transfer_order": null,
 *   "has_transfer_order": false,
 *   "allocations": []
 * }
 */
export const getTransferOrderByAsn = async (req, res) => {
  const { asn_no } = req.params; // e.g., "ASN-0002" (use exact format)

  if (!asn_no) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'ASN number is required'
    });
  }

  const connection = await getConnection();

  try {
    // Get Transfer Order header
    const [rows] = await connection.execute(`
      SELECT 
        title as transfer_order,
        status,
        advance_shipping_notice as asn_no,
        from_warehouse,
        prepared_by,
        required_date,
        total_allocated_qty,
        created_at,
        updated_at
      FROM tabTransferOrder
      WHERE advance_shipping_notice = ?
      LIMIT 1
    `, [asn_no]); // Use exact format

    // ASN can exist without Transfer Order - this is a valid scenario
    // Return null/empty response instead of 404 error
    if (rows.length === 0) {
      return res.status(200).json({
        ok: true,
        asn_no: asn_no,
        transfer_order: null,
        has_transfer_order: false,
        allocations: []
      });
    }

    const toTitle = rows[0].transfer_order;

    // Get Transfer Order Items (allocations)
    const [items] = await connection.execute(`
      SELECT 
        store,
        item_code,
        allocated_qty
      FROM tabTransferOrderItem
      WHERE parent_title = ?
      ORDER BY store, item_code
    `, [toTitle]);

    // Format allocations array
    const allocations = items.map(item => ({
      store: item.store,
      item_code: item.item_code,
      allocated_qty: parseFloat(item.allocated_qty) || 0
    }));

    const transferOrder = {
      ok: true,
      asn_no: asn_no,
      transfer_order: toTitle,
      to_no: toTitle,
      has_transfer_order: true,
      allocations: allocations
    };

    res.json(transferOrder);

  } catch (error) {
    console.error(`Error fetching transfer order for ASN ${asn_no}:`, error);
    res.status(500).json({
      ok: false,
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch transfer order',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/master/boxes
 * Get all sort boxes
 */
export const getAllBoxes = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const [rows] = await connection.execute(`
      SELECT 
        box_id,
        status,
        advance_shipping_notice as asn_no,
        transfer_order,
        store,
        purpose,
        created_by,
        created_on,
        closed_by,
        closed_on,
        dispatched_on,
        received_at_store_on,
        updated_on,
        remarks
      FROM tabSortBox
      ORDER BY created_on DESC
    `);

    const boxes = rows.map(row => ({
      box_id: row.box_id,
      status: row.status,
      asn_no: row.asn_no,
      transfer_order: row.transfer_order,
      store: row.store,
      purpose: row.purpose,
      created_by: row.created_by,
      created_on: row.created_on ? row.created_on.toISOString() : null,
      closed_by: row.closed_by || null,
      closed_on: row.closed_on ? row.closed_on.toISOString() : null,
      dispatched_on: row.dispatched_on ? row.dispatched_on.toISOString() : null,
      received_at_store_on: row.received_at_store_on ? row.received_at_store_on.toISOString() : null,
      updated_on: row.updated_on ? row.updated_on.toISOString() : null,
      remarks: row.remarks || null
    }));

    res.json(boxes);
    
  } catch (error) {
    console.error('Failed to fetch boxes:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch boxes',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/master/transfer-cartons
 * Get all transfer cartons
 * 
 * Detects schema dynamically to handle both column name variations:
 * - advance_shipping_notice / asn_no
 * - transfer_order / to_no
 */
export const getAllTransferCartons = async (req, res) => {
  const connection = await getConnection();
  
  try {
    // Detect which columns exist in the table
    let asnColumn = 'asn_no'; // Default to asn_no
    let toColumn = 'to_no'; // Default to to_no
    
    try {
      const [columnRows] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabTransferCarton'
        AND COLUMN_NAME IN ('advance_shipping_notice', 'asn_no', 'transfer_order', 'to_no')
      `);

      const existingColumns = new Set(columnRows.map(row => row.COLUMN_NAME));
      
      // Determine ASN column name (prefer asn_no, fallback to advance_shipping_notice)
      if (existingColumns.has('asn_no')) {
        asnColumn = 'asn_no';
      } else if (existingColumns.has('advance_shipping_notice')) {
        asnColumn = 'advance_shipping_notice';
      }
      
      // Determine Transfer Order column name (prefer to_no, fallback to transfer_order)
      if (existingColumns.has('to_no')) {
        toColumn = 'to_no';
      } else if (existingColumns.has('transfer_order')) {
        toColumn = 'transfer_order';
      }
      
      console.log(`Transfer Carton schema detected: ASN column=${asnColumn}, TO column=${toColumn}`);
    } catch (detectError) {
      console.warn('Schema detection failed, using defaults (asn_no, to_no):', detectError.message);
      // Use defaults (asn_no, to_no)
    }

    // Try query with detected/default column names
    let rows;
    let query;
    
    try {
      query = `
        SELECT 
          tc_id,
          status,
          ${asnColumn} as asn_no,
          ${toColumn} as transfer_order,
          store,
          created_by,
          created_on,
          sealed_by,
          sealed_on,
          dispatched_on,
          updated_on,
          remarks
        FROM tabTransferCarton
        ORDER BY created_on DESC
      `;
      
      console.log('Executing query with columns:', { asnColumn, toColumn });
      [rows] = await connection.execute(query);
    } catch (queryError) {
      // If query fails, try the alternative column names
      if (queryError.code === 'ER_BAD_FIELD_ERROR') {
        console.log('Query failed with detected columns, trying alternative schema...');
        
        // Swap to alternative column names
        const altAsnColumn = asnColumn === 'asn_no' ? 'advance_shipping_notice' : 'asn_no';
        const altToColumn = toColumn === 'to_no' ? 'transfer_order' : 'to_no';
        
        query = `
          SELECT 
            tc_id,
            status,
            ${altAsnColumn} as asn_no,
            ${altToColumn} as transfer_order,
            store,
            created_by,
            created_on,
            sealed_by,
            sealed_on,
            dispatched_on,
            updated_on,
            remarks
          FROM tabTransferCarton
          ORDER BY created_on DESC
        `;
        
        console.log('Retrying with alternative columns:', { asnColumn: altAsnColumn, toColumn: altToColumn });
        [rows] = await connection.execute(query);
      } else {
        throw queryError; // Re-throw if it's not a column error
      }
    }

    const transferCartons = rows.map(row => ({
      tc_id: row.tc_id,
      status: row.status,
      asn_no: row.asn_no,
      transfer_order: row.transfer_order,
      store: row.store,
      created_by: row.created_by,
      created_on: row.created_on ? row.created_on.toISOString() : null,
      sealed_by: row.sealed_by || null,
      sealed_on: row.sealed_on ? row.sealed_on.toISOString() : null,
      dispatched_on: row.dispatched_on ? row.dispatched_on.toISOString() : null,
      updated_on: row.updated_on ? row.updated_on.toISOString() : null,
      remarks: row.remarks || null
    }));

    res.json(transferCartons);
    
  } catch (error) {
    console.error('Failed to fetch transfer cartons:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch transfer cartons',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/master/warehouse-racks
 * Get all warehouse racks (from tabLocation where parent_rack is not null)
 */
export const getAllWarehouseRacks = async (req, res) => {
  const connection = await getConnection();
  
  try {
    // Get distinct racks from locations
    const [rows] = await connection.execute(`
      SELECT DISTINCT
        parent_rack as rack_id,
        warehouse,
        zone,
        aisle
      FROM tabLocation
      WHERE parent_rack IS NOT NULL
      ORDER BY warehouse, zone, aisle, parent_rack
    `);

    const racks = rows.map(row => ({
      rack_id: row.rack_id,
      warehouse: row.warehouse,
      zone: row.zone || null,
      aisle: row.aisle || null
    }));

    res.json(racks);
    
  } catch (error) {
    console.error('Failed to fetch warehouse racks:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch warehouse racks',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/master/warehouses
 * Get all warehouses
 */
export const getAllWarehouses = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const [rows] = await connection.execute(`
      SELECT 
        code,
        name,
        warehouse_type,
        is_group,
        parent_warehouse,
        created_at,
        updated_at
      FROM tabWarehouse
      ORDER BY code
    `);

    const warehouses = rows.map(row => ({
      code: row.code,
      name: row.name,
      warehouse_type: row.warehouse_type || null,
      is_group: Boolean(row.is_group),
      parent_warehouse: row.parent_warehouse || null,
      created_at: row.created_at ? row.created_at.toISOString() : null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null
    }));

    res.json(warehouses);
    
  } catch (error) {
    console.error('Failed to fetch warehouses:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch warehouses',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/master/users
 * Get all users from tabUser master table
 * 
 * Response Format:
 * [
 *   {
 *     "user_code": "USER-001",
 *     "name": "John Doe",
 *     "role": "operator",
 *     "active": true,
 *     "created_at": "2025-12-23T11:32:15.000Z",
 *     "updated_at": "2025-12-23T11:32:15.000Z"
 *   }
 * ]
 */
export const getAllUsers = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const [rows] = await connection.execute(`
      SELECT 
        user_code,
        name,
        role,
        active,
        created_at,
        updated_at
      FROM tabUser
      ORDER BY user_code
    `);

    const users = rows.map(row => ({
      user_code: row.user_code,
      name: row.name,
      role: row.role || null,
      active: Boolean(row.active),
      created_at: row.created_at ? row.created_at.toISOString() : null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null
    }));

    res.json(users);
    
  } catch (error) {
    console.error('Failed to fetch users:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch users',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/master/items
 * Get all items from tabItem master table
 * 
 * Purpose: Fetch all items for mobile and desktop apps
 * 
 * Response Format:
 * [
 *   {
 *     "code": "ITEM-001",
 *     "name": "Product Name",
 *     "item_group": "Electronics",
 *     "brand": "Brand Name",
 *     "default_uom": "Nos",
 *     "stock_uom": "Nos",
 *     "barcode": "1234567890123",
 *     "maintain_stock": true,
 *     "stock_qty": 100.00,
 *     "reserved_qty": 10.00,
 *     "updated_on": "2025-12-23T11:32:15.000Z",
 *     "created_at": "2025-12-23T11:32:15.000Z",
 *     "updated_at": "2025-12-23T11:32:15.000Z"
 *   }
 * ]
 */
export const getAllItems = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const [rows] = await connection.execute(`
      SELECT 
        code,
        name,
        item_group,
        brand,
        default_uom,
        stock_uom,
        barcode,
        maintain_stock,
        stock_qty,
        reserved_qty,
        updated_on,
        created_at,
        updated_at
      FROM tabItem
      ORDER BY code
    `);

    const items = rows.map(row => ({
      item_code: row.code,
      code: row.code, // Keep for backward compatibility
      item_name: row.name,
      name: row.name, // Keep for backward compatibility
      item_group: row.item_group || null,
      brand: row.brand || null,
      default_uom: row.default_uom || null,
      stock_uom: row.stock_uom || null,
      barcode: row.barcode || null,
      maintain_stock: Boolean(row.maintain_stock),
      stock_qty: parseFloat(row.stock_qty) || 0,
      reserved_qty: parseFloat(row.reserved_qty) || 0,
      updated_on: row.updated_on ? row.updated_on.toISOString() : null,
      created_at: row.created_at ? row.created_at.toISOString() : null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null
    }));

    res.json(items);
    
  } catch (error) {
    console.error('Failed to fetch items:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch items',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/master/warehouses-stores
 * Get all warehouses and stores from tabWarehouse master table
 * 
 * Purpose: Fetch all warehouses and stores for dropdown/selection in mobile and desktop apps
 * 
 * Response Format:
 * [
 *   {
 *     "code": "STORE-001",
 *     "name": "Downtown Store",
 *     "warehouse_type": "Store",
 *     "is_group": 0,
 *     "parent_warehouse": null,
 *     "created_at": "2025-12-23T11:32:15.000Z",
 *     "updated_at": "2025-12-23T11:32:15.000Z"
 *   },
 *   {
 *     "code": "WH-MAIN",
 *     "name": "Main Warehouse",
 *     "warehouse_type": "Warehouse",
 *     "is_group": 0,
 *     "parent_warehouse": null,
 *     "created_at": "2025-12-23T11:32:15.000Z",
 *     "updated_at": "2025-12-23T11:32:15.000Z"
 *   }
 * ]
 */
export const getWarehousesStores = async (req, res) => {
  const connection = await getConnection();
  
  try {
    // Order by warehouse_type DESC (Warehouse first), then code ASC
    const [rows] = await connection.execute(`
      SELECT 
        code,
        name,
        warehouse_type,
        is_group,
        parent_warehouse,
        created_at,
        updated_at
      FROM tabWarehouse
      ORDER BY warehouse_type DESC, code ASC
    `);

    const warehousesStores = rows.map(row => ({
      code: row.code,
      name: row.name,
      warehouse_type: row.warehouse_type || null,
      is_group: row.is_group ? 1 : 0, // Return as 0/1 integer (not boolean) to match sample format
      parent_warehouse: row.parent_warehouse || null,
      created_at: row.created_at ? row.created_at.toISOString() : null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null
    }));

    res.json(warehousesStores);
    
  } catch (error) {
    console.error('Failed to fetch warehouses and stores:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch warehouses and stores',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/master/locations
 * Get all locations
 */
export const getAllLocations = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const [rows] = await connection.execute(`
      SELECT 
        location_id,
        warehouse,
        zone,
        aisle,
        parent_rack,
        level,
        bin_id,
        location_type,
        location_type_detailed,
        is_available,
        capacity_volume_weight,
        created_at,
        updated_at
      FROM tabLocation
      ORDER BY warehouse, zone, aisle, parent_rack, level, bin_id
    `);

    const locations = rows.map(row => ({
      location_id: row.location_id,
      warehouse: row.warehouse,
      zone: row.zone || null,
      aisle: row.aisle || null,
      parent_rack: row.parent_rack || null,
      level: row.level || null,
      bin_id: row.bin_id || null,
      location_type: row.location_type || null,
      location_type_detailed: row.location_type_detailed || null,
      is_available: Boolean(row.is_available),
      capacity_volume_weight: row.capacity_volume_weight ? parseFloat(row.capacity_volume_weight) : null,
      created_at: row.created_at ? row.created_at.toISOString() : null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null
    }));

    res.json(locations);
    
  } catch (error) {
    console.error('Failed to fetch locations:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch locations',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/master/bin-master
 * Get all bin/location master data from tabLocation
 * 
 * Purpose: Fetch all bin locations for mobile app
 * 
 * Response Format:
 * [
 *   {
 *     "location_id": "A1-R01-L1-B1",
 *     "warehouse": "WH-MAIN",
 *     "zone": "ZONE-A",
 *     "aisle": "A1",
 *     "parent_rack": "R01",
 *     "level": "L1",
 *     "bin_id": "B1",
 *     "location_type": "Storage",
 *     "location_type_detailed": "Rack Bin",
 *     "is_available": true,
 *     "capacity_volume_weight": 1000.00,
 *     "created_at": "2025-01-20T10:30:00.000Z",
 *     "updated_at": "2025-01-20T10:30:00.000Z"
 *   }
 * ]
 */
export const getBinMaster = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const [rows] = await connection.execute(`
      SELECT 
        location_id,
        warehouse,
        zone,
        aisle,
        parent_rack,
        level,
        bin_id,
        location_type,
        location_type_detailed,
        is_available,
        capacity_volume_weight,
        created_at,
        updated_at
      FROM tabLocation
      ORDER BY warehouse, zone, aisle, parent_rack, level, bin_id
    `);

    const bins = rows.map(row => ({
      location_id: row.location_id,
      bin_code: row.location_id, // Mobile app uses bin_code to match location_id
      bin_id: row.bin_id || null,
      warehouse: row.warehouse,
      zone: row.zone || null,
      aisle: row.aisle || null,
      parent_rack: row.parent_rack || null,
      rack: row.parent_rack || null, // Alias for mobile app compatibility
      level: row.level || null,
      location_type: row.location_type || null,
      location_type_detailed: row.location_type_detailed || null,
      is_available: Boolean(row.is_available),
      capacity_volume_weight: row.capacity_volume_weight ? parseFloat(row.capacity_volume_weight) : null,
      created_at: row.created_at ? row.created_at.toISOString() : null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null
    }));

    console.log(`[Bin Master] Returning ${bins.length} bins to client`);
    console.log(`[Bin Master] First bin: ${bins[0]?.bin_code || 'N/A'}, Last bin: ${bins[bins.length - 1]?.bin_code || 'N/A'}`);
    console.log(`[Bin Master] Response size: ${JSON.stringify(bins).length} bytes`);
    
    // Verify all bins are included
    if (bins.length !== rows.length) {
      console.error(`[Bin Master] WARNING: Bin count mismatch! Rows: ${rows.length}, Bins: ${bins.length}`);
    }
    
    res.json(bins);
    
  } catch (error) {
    console.error('Failed to fetch bin master:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch bin master',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/master/stock-ledger
 * Get all stock ledger entries
 * 
 * Purpose: Fetch stock ledger data for mobile app (same as /api/stock-ledger)
 * 
 * Response Format:
 * [
 *   {
 *     "id": 1,
 *     "item_code": "ITEM-001",
 *     "warehouse": "WH-MAIN",
 *     "bin_location": "A1-R01-L1-B1",
 *     "qty": 100.00,
 *     "reserved_qty": 10.00,
 *     "available_qty": 90.00,
 *     "last_transaction_date": "2025-01-20T10:30:00.000Z",
 *     "last_transaction_type": "Putaway",
 *     "last_transaction_ref": "PUT-0001",
 *     "updated_at": "2025-01-20T10:30:00.000Z",
 *     "created_at": "2025-01-20T10:30:00.000Z"
 *   }
 * ]
 */
export const getStockLedgerMaster = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { warehouse, item_code, bin_location } = req.query;
    
    let query = `
      SELECT 
        id,
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
    
    if (bin_location !== undefined) {
      if (bin_location === null || bin_location === "null" || bin_location === "") {
        query += ' AND bin_location IS NULL';
      } else {
        query += ' AND bin_location = ?';
        params.push(bin_location);
      }
    }
    
    query += ' ORDER BY last_transaction_date DESC, warehouse, item_code, bin_location IS NULL, bin_location';
    
    const [rows] = await connection.execute(query, params);
    
    const stockLedger = rows.map(row => ({
      id: row.id,
      item_code: row.item_code,
      warehouse: row.warehouse,
      bin_location: row.bin_location || null,
      qty: parseFloat(row.qty) || 0,
      reserved_qty: parseFloat(row.reserved_qty) || 0,
      available_qty: parseFloat(row.available_qty) || 0,
      last_transaction_date: row.last_transaction_date ? row.last_transaction_date.toISOString() : null,
      last_transaction_type: row.last_transaction_type || null,
      last_transaction_ref: row.last_transaction_ref || null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null,
      created_at: row.created_at ? row.created_at.toISOString() : null
    }));
    
    res.json(stockLedger);
    
  } catch (error) {
    console.error('Failed to fetch stock ledger:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch stock ledger',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/master/bin-master/:bin_code
 * Get a specific bin by bin_code (location_id)
 * 
 * Purpose: Lookup a specific bin for mobile app validation
 * 
 * Response Format:
 * {
 *   "location_id": "A1-R01-L1-B1",
 *   "bin_code": "A1-R01-L1-B1",
 *   "warehouse": "WH-MAIN",
 *   "is_available": true,
 *   ...
 * }
 */
export const getBinByCode = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { bin_code } = req.params;
    
    const [rows] = await connection.execute(`
      SELECT 
        location_id,
        warehouse,
        zone,
        aisle,
        parent_rack,
        level,
        bin_id,
        location_type,
        location_type_detailed,
        is_available,
        capacity_volume_weight,
        created_at,
        updated_at
      FROM tabLocation
      WHERE location_id = ?
    `, [bin_code]);

    if (rows.length === 0) {
      return res.status(404).json({
        code: 'NOT_FOUND',
        message: `Bin "${bin_code}" not found in system`
      });
    }

    const row = rows[0];
    const bin = {
      location_id: row.location_id,
      bin_code: row.location_id, // Mobile app uses bin_code
      bin_id: row.bin_id || null,
      warehouse: row.warehouse,
      zone: row.zone || null,
      aisle: row.aisle || null,
      parent_rack: row.parent_rack || null,
      rack: row.parent_rack || null,
      level: row.level || null,
      location_type: row.location_type || null,
      location_type_detailed: row.location_type_detailed || null,
      is_available: Boolean(row.is_available),
      capacity_volume_weight: row.capacity_volume_weight ? parseFloat(row.capacity_volume_weight) : null,
      created_at: row.created_at ? row.created_at.toISOString() : null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null
    };

    res.json(bin);
    
  } catch (error) {
    console.error('Failed to fetch bin by code:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch bin by code',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/master/item-barcode-map
 * Get item code to barcode mapping
 * 
 * Purpose: Fetch item barcode mapping for mobile app barcode scanning
 * 
 * Response Format:
 * [
 *   {
 *     "item_code": "ITEM-001",
 *     "barcode": "1234567890123",
 *     "item_name": "Product Name"
 *   }
 * ]
 */
export const getItemBarcodeMap = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const [rows] = await connection.execute(`
      SELECT 
        code as item_code,
        name as item_name,
        barcode
      FROM tabItem
      WHERE barcode IS NOT NULL AND barcode != ''
      ORDER BY code
    `);

    const barcodeMap = rows.map(row => ({
      item_code: row.item_code,
      barcode: row.barcode,
      item_name: row.item_name || null
    }));
    
    res.json(barcodeMap);
    
  } catch (error) {
    console.error('Failed to fetch item barcode map:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to fetch item barcode map',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/master/items/lookup?barcode=XXX or ?item_code=XXX
 * Lookup item by barcode or item_code (for real-time validation in mobile app)
 * 
 * Purpose: Allow mobile app to validate items in real-time when scanning barcodes
 * 
 * Query Parameters:
 * - barcode: Barcode to lookup (optional)
 * - item_code: Item code to lookup (optional)
 * 
 * Response Format:
 * {
 *   "found": true,
 *   "item": {
 *     "item_code": "SKU-SHIRT-001-WHT-M",
 *     "item_name": "Shirt White Medium",
 *     "barcode": "SKU-SHIRT-001-WHT-M",
 *     ...
 *   }
 * }
 * OR
 * {
 *   "found": false,
 *   "message": "Item not found"
 * }
 */
export const lookupItem = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { barcode, item_code } = req.query;
    
    // Validation: at least one parameter required
    if (!barcode && !item_code) {
      return res.status(400).json({
        found: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Either barcode or item_code query parameter is required'
        }
      });
    }
    
    let query = `
      SELECT 
        code as item_code,
        name as item_name,
        item_group,
        brand,
        default_uom,
        stock_uom,
        barcode,
        maintain_stock,
        stock_qty,
        reserved_qty,
        updated_on,
        created_at,
        updated_at
      FROM tabItem
      WHERE 1=1
    `;
    const params = [];
    
    // Lookup by barcode (exact match or item_code match)
    if (barcode) {
      query += ` AND (barcode = ? OR code = ?)`;
      params.push(barcode, barcode);
    }
    
    // Lookup by item_code
    if (item_code) {
      query += ` AND code = ?`;
      params.push(item_code);
    }
    
    query += ` LIMIT 1`;
    
    const [rows] = await connection.execute(query, params);
    
    if (rows.length > 0) {
      const item = rows[0];
      res.json({
        found: true,
        item: {
          item_code: item.item_code,
          code: item.item_code, // Backward compatibility
          item_name: item.item_name,
          name: item.item_name, // Backward compatibility
          item_group: item.item_group || null,
          brand: item.brand || null,
          default_uom: item.default_uom || null,
          stock_uom: item.stock_uom || null,
          barcode: item.barcode || item.item_code, // Use item_code as barcode if barcode is null
          maintain_stock: Boolean(item.maintain_stock),
          stock_qty: parseFloat(item.stock_qty) || 0,
          reserved_qty: parseFloat(item.reserved_qty) || 0,
          updated_on: item.updated_on ? item.updated_on.toISOString() : null,
          created_at: item.created_at ? item.created_at.toISOString() : null,
          updated_at: item.updated_at ? item.updated_at.toISOString() : null
        }
      });
    } else {
      res.json({
        found: false,
        message: barcode 
          ? `Barcode '${barcode}' not found in system`
          : `Item code '${item_code}' not found in system`
      });
    }
    
  } catch (error) {
    console.error('Failed to lookup item:', error);
    res.status(500).json({
      found: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to lookup item',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};
