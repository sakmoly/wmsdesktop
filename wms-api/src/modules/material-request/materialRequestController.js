// wms-api/src/modules/material-request/materialRequestController.js
// Material Request API endpoints (Warehouse to Showroom)

import { getConnection } from '../../db/connection.js';

/**
 * GET /api/material-requests
 * Get all Material Request documents
 * 
 * Query Parameters:
 * - status (optional): Filter by status (Draft, Submitted, In Progress, Completed, Cancelled)
 * - from_warehouse (optional): Filter by source warehouse
 * - to_showroom (optional): Filter by destination showroom
 * 
 * Response Format:
 * [
 *   {
 *     "title": "MR-0001",
 *     "status": "In Progress",
 *     "from_warehouse": "WH-MAIN",
 *     "to_showroom": "SHOWROOM-001",
 *     "request_date": "2025-12-27",
 *     "required_date": "2025-12-28",
 *     "requested_by": "USER-001",
 *     "total_requested_qty": 150.00,
 *     "total_picked_qty": 100.00,
 *     "items": [
 *       {
 *         "item_code": "ITEM-001",
 *         "requested_qty": 50.00,
 *         "picked_qty": 50.00
 *       }
 *     ],
 *     "created_at": "2025-12-27T08:00:00.000Z",
 *     "updated_at": "2025-12-27T10:30:00.000Z"
 *   }
 * ]
 */
export const getMaterialRequests = async (req, res) => {
  const connection = await getConnection();
  
  try {
    // Check if table exists
    const [tableCheck] = await connection.execute(`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabMaterialRequest'
    `);
    
    if (tableCheck[0].count === 0) {
      connection.release();
      return res.json([]); // Return empty array if table doesn't exist
    }
    
    const { status, from_warehouse, to_showroom } = req.query;
    
    let query = `
      SELECT 
        title,
        status,
        from_warehouse,
        to_showroom,
        requested_date,
        required_date,
        requested_by,
        total_requested_qty,
        total_picked_qty,
        created_at,
        updated_at
      FROM tabMaterialRequest
      WHERE 1=1
    `;
    
    const params = [];
    
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    if (from_warehouse) {
      query += ' AND from_warehouse = ?';
      params.push(from_warehouse);
    }
    
    if (to_showroom) {
      query += ' AND to_showroom = ?';
      params.push(to_showroom);
    }
    
    query += ' ORDER BY requested_date DESC, title';
    
    const [rows] = await connection.execute(query, params);
    
    // Get items for each Material Request
    const materialRequests = await Promise.all(rows.map(async (row) => {
      const [itemRows] = await connection.execute(`
        SELECT item_code, requested_qty, picked_qty, status
        FROM tabMaterialRequestItem
        WHERE parent_title = ?
        ORDER BY item_code
      `, [row.title]);
      
      // Use status from database
      const items = itemRows.map(item => {
        const requestedQty = parseFloat(item.requested_qty) || 0;
        const pickedQty = parseFloat(item.picked_qty) || 0;
        const itemStatus = item.status || 'Pending'; // Use status from database
        
        return {
          item_code: item.item_code,
          requested_qty: requestedQty,
          picked_qty: pickedQty,
          pending_qty: requestedQty - pickedQty,
          status: itemStatus // Status from database
        };
      });
      
      // Calculate actual total_picked_qty from items (more accurate)
      const actualTotalPicked = items.reduce((sum, item) => sum + item.picked_qty, 0);
      
      // Compute header status from item-level statuses
      // Check if all items are fully picked based on picked_qty >= requested_qty (not just status)
      const allItemsFullyPicked = items.length > 0 && items.every(item => item.picked_qty >= item.requested_qty && item.requested_qty > 0);
      const allItemsPickedStatus = items.length > 0 && items.every(item => item.status === 'Picked' || item.status === 'Sealed');
      const someItemsPicked = items.some(item => item.picked_qty > 0);
      
      let status = row.status;
      
      // Fix status if it's "Picked" but no items are picked
      if (status === 'Picked' && actualTotalPicked === 0) {
        const correctStatus = row.status === 'Submitted' ? 'Submitted' : 'In Progress';
        await connection.execute(`
          UPDATE tabMaterialRequest
          SET status = ?,
              updated_at = NOW()
          WHERE title = ?
        `, [correctStatus, row.title]);
        status = correctStatus;
        console.log(`⚠️  Fixed Material Request ${row.title} status from "Picked" to "${correctStatus}" (no items picked)`);
      }
      // Fix status if it's "Picked" but not all items are fully picked
      else if (status === 'Picked' && !allItemsFullyPicked) {
        status = 'In Progress';
        await connection.execute(`
          UPDATE tabMaterialRequest
          SET status = ?,
              updated_at = NOW()
          WHERE title = ?
        `, [status, row.title]);
        console.log(`⚠️  Fixed Material Request ${row.title} status from "Picked" to "In Progress" (not all items fully picked: ${items.filter(item => item.picked_qty < item.requested_qty).length} item(s) still pending)`);
      }
      // Check if all transfer cartons are sealed
      // Detect schema for tabTransferCarton to find the correct column name
      const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
      const allColumns = new Set(tableInfo.map(row => row.Field));
      
      let toColumn;
      if (allColumns.has('to_no')) {
        toColumn = 'to_no';
      } else if (allColumns.has('transfer_order')) {
        toColumn = 'transfer_order';
      } else {
        toColumn = null; // No TO column found
      }
      
      let tcStatus = [{ total_tcs: 0, sealed_tcs: 0 }];
      if (toColumn) {
        [tcStatus] = await connection.execute(`
          SELECT 
            COUNT(*) as total_tcs,
            SUM(CASE WHEN status = 'Sealed' OR status = 'Dispatched' THEN 1 ELSE 0 END) as sealed_tcs
          FROM tabTransferCarton
          WHERE ${toColumn} = ?
        `, [row.title]);
      }
      
      const totalTCs = tcStatus[0].total_tcs || 0;
      const sealedTCs = tcStatus[0].sealed_tcs || 0;
      
      // Status "Picked" only when ALL items are fully picked (picked_qty >= requested_qty) AND ALL transfer cartons are sealed
      if (allItemsFullyPicked && items.length > 0 && sealedTCs === totalTCs && totalTCs > 0 && status !== 'Picked') {
        status = 'Picked';
        await connection.execute(`
          UPDATE tabMaterialRequest
          SET status = ?,
              updated_at = NOW()
          WHERE title = ?
        `, [status, row.title]);
        console.log(`✅ Material Request ${row.title} status updated to "Picked" (all items fully picked, all TCs sealed)`);
      } else if (someItemsPicked && status === 'Submitted') {
        status = 'In Progress';
        await connection.execute(`
          UPDATE tabMaterialRequest
          SET status = ?,
              updated_at = NOW()
          WHERE title = ?
        `, [status, row.title]);
        console.log(`✅ Material Request ${row.title} status updated to "In Progress" (picking started)`);
      } else if (allItemsFullyPicked && items.length > 0 && (sealedTCs < totalTCs || totalTCs === 0) && status === 'Picked') {
        // All items are picked but not all sealed - should be "In Progress", not "Picked"
        status = 'In Progress';
        await connection.execute(`
          UPDATE tabMaterialRequest
          SET status = ?,
              updated_at = NOW()
          WHERE title = ?
        `, [status, row.title]);
        console.log(`⚠️  Material Request ${row.title} status changed from "Picked" to "In Progress" (all items picked but ${sealedTCs}/${totalTCs} TCs sealed)`);
      } else if (!allItemsFullyPicked && status === 'Picked') {
        // Not all items are fully picked but status is "Picked" - should be "In Progress"
        status = 'In Progress';
        await connection.execute(`
          UPDATE tabMaterialRequest
          SET status = ?,
              updated_at = NOW()
          WHERE title = ?
        `, [status, row.title]);
        const pendingItems = items.filter(item => item.picked_qty < item.requested_qty);
        console.log(`⚠️  Material Request ${row.title} status changed from "Picked" to "In Progress" (${pendingItems.length} item(s) not fully picked: ${pendingItems.map(i => i.item_code).join(', ')})`);
      }
      
      return {
        title: row.title,
        status: status,
        from_warehouse: row.from_warehouse,
        to_showroom: row.to_showroom,
        request_date: row.requested_date ? row.requested_date.toISOString().split('T')[0] : null,
        required_date: row.required_date ? row.required_date.toISOString().split('T')[0] : null,
        requested_by: row.requested_by,
        total_requested_qty: parseFloat(row.total_requested_qty) || 0,
        total_picked_qty: actualTotalPicked, // Use calculated value from items
        items: items,
        created_at: row.created_at ? row.created_at.toISOString() : null,
        updated_at: row.updated_at ? row.updated_at.toISOString() : null
      };
    }));
    
    res.json(materialRequests);
    
  } catch (error) {
    console.error('Failed to fetch Material Requests:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch Material Requests',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/material-requests/:title
 * Get a single Material Request document by title
 */
export const getMaterialRequestByTitle = async (req, res) => {
  const connection = await getConnection();
  
  try {
    // Check if table exists
    const [tableCheck] = await connection.execute(`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabMaterialRequest'
    `);
    
    if (tableCheck[0].count === 0) {
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Material Request ${req.params.title} not found`
        }
      });
    }
    
    const { title } = req.params;
    
    const [rows] = await connection.execute(`
      SELECT 
        title,
        status,
        from_warehouse,
        to_showroom,
        requested_date,
        required_date,
        requested_by,
        total_requested_qty,
        total_picked_qty,
        created_at,
        updated_at
      FROM tabMaterialRequest
      WHERE title = ?
    `, [title]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Material Request ${title} not found`
        }
      });
    }
    
    const row = rows[0];
    
    // Get items
    const [itemRows] = await connection.execute(`
      SELECT item_code, requested_qty, picked_qty, status
      FROM tabMaterialRequestItem
      WHERE parent_title = ?
      ORDER BY item_code
    `, [title]);
    
    // Use status from database
    const items = itemRows.map(item => {
      const requestedQty = parseFloat(item.requested_qty) || 0;
      const pickedQty = parseFloat(item.picked_qty) || 0;
      const itemStatus = item.status || 'Pending'; // Use status from database
      
      return {
        item_code: item.item_code,
        requested_qty: requestedQty,
        picked_qty: pickedQty,
        pending_qty: requestedQty - pickedQty,
        status: itemStatus // Status from database
      };
    });
    
    // Calculate actual total_picked_qty from items (more accurate)
    const actualTotalPicked = items.reduce((sum, item) => sum + item.picked_qty, 0);
    
    // Compute header status from item-level statuses
    // Check if all items are fully picked based on picked_qty >= requested_qty (not just status)
    const allItemsFullyPicked = items.length > 0 && items.every(item => item.picked_qty >= item.requested_qty && item.requested_qty > 0);
    const allItemsPickedStatus = items.length > 0 && items.every(item => item.status === 'Picked' || item.status === 'Sealed');
    const someItemsPicked = items.some(item => item.picked_qty > 0);
    
    let status = row.status;
    
    // Fix status if it's "Picked" but no items are picked
    if (status === 'Picked' && actualTotalPicked === 0) {
      const correctStatus = row.status === 'Submitted' ? 'Submitted' : 'In Progress';
      await connection.execute(`
        UPDATE tabMaterialRequest
        SET status = ?,
            updated_at = NOW()
        WHERE title = ?
      `, [correctStatus, title]);
      status = correctStatus;
      console.log(`⚠️  Fixed Material Request ${title} status from "Picked" to "${correctStatus}" (no items picked)`);
    }
    // Fix status if it's "Picked" but not all items are fully picked
    else if (status === 'Picked' && !allItemsFullyPicked) {
      status = 'In Progress';
      await connection.execute(`
        UPDATE tabMaterialRequest
        SET status = ?,
            updated_at = NOW()
        WHERE title = ?
      `, [status, title]);
      const pendingItems = items.filter(item => item.picked_qty < item.requested_qty);
      console.log(`⚠️  Fixed Material Request ${title} status from "Picked" to "In Progress" (not all items fully picked: ${pendingItems.length} item(s) still pending)`);
    }
    // Check if all transfer cartons are sealed
    // Detect schema for tabTransferCarton to find the correct column name
    const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
    const allColumns = new Set(tableInfo.map(row => row.Field));
    
    let toColumn;
    if (allColumns.has('to_no')) {
      toColumn = 'to_no';
    } else if (allColumns.has('transfer_order')) {
      toColumn = 'transfer_order';
    } else {
      toColumn = null; // No TO column found
    }
    
    let tcStatus = [{ total_tcs: 0, sealed_tcs: 0 }];
    if (toColumn) {
      [tcStatus] = await connection.execute(`
        SELECT 
          COUNT(*) as total_tcs,
          SUM(CASE WHEN status = 'Sealed' OR status = 'Dispatched' THEN 1 ELSE 0 END) as sealed_tcs
        FROM tabTransferCarton
        WHERE ${toColumn} = ?
      `, [title]);
    }
    
    const totalTCs = tcStatus[0].total_tcs || 0;
    const sealedTCs = tcStatus[0].sealed_tcs || 0;
    
    // Status "Picked" only when ALL items are fully picked (picked_qty >= requested_qty) AND ALL transfer cartons are sealed
    if (allItemsFullyPicked && items.length > 0 && sealedTCs === totalTCs && totalTCs > 0 && status !== 'Picked') {
      status = 'Picked';
      await connection.execute(`
        UPDATE tabMaterialRequest
        SET status = ?,
            updated_at = NOW()
        WHERE title = ?
      `, [status, title]);
      console.log(`✅ Material Request ${title} status updated to "Picked" (all items fully picked, all TCs sealed)`);
    } else if (someItemsPicked && status === 'Submitted') {
      status = 'In Progress';
      await connection.execute(`
        UPDATE tabMaterialRequest
        SET status = ?,
            updated_at = NOW()
        WHERE title = ?
      `, [status, title]);
      console.log(`✅ Material Request ${title} status updated to "In Progress" (picking started)`);
    } else if (allItemsFullyPicked && items.length > 0 && (sealedTCs < totalTCs || totalTCs === 0) && status === 'Picked') {
      // All items are picked but not all sealed - should be "In Progress", not "Picked"
      status = 'In Progress';
      await connection.execute(`
        UPDATE tabMaterialRequest
        SET status = ?,
            updated_at = NOW()
        WHERE title = ?
      `, [status, title]);
      console.log(`⚠️  Material Request ${title} status changed from "Picked" to "In Progress" (all items picked but ${sealedTCs}/${totalTCs} TCs sealed)`);
    } else if (!allItemsFullyPicked && status === 'Picked') {
      // Not all items are fully picked but status is "Picked" - should be "In Progress"
      status = 'In Progress';
      await connection.execute(`
        UPDATE tabMaterialRequest
        SET status = ?,
            updated_at = NOW()
        WHERE title = ?
      `, [status, title]);
      const pendingItems = items.filter(item => item.picked_qty < item.requested_qty);
      console.log(`⚠️  Material Request ${title} status changed from "Picked" to "In Progress" (${pendingItems.length} item(s) not fully picked: ${pendingItems.map(i => i.item_code).join(', ')})`);
    }
    
    res.json({
      title: row.title,
      status: status,
      from_warehouse: row.from_warehouse,
      to_showroom: row.to_showroom,
      request_date: row.requested_date ? row.requested_date.toISOString().split('T')[0] : null,
      required_date: row.required_date ? row.required_date.toISOString().split('T')[0] : null,
      requested_by: row.requested_by,
      total_requested_qty: parseFloat(row.total_requested_qty) || 0,
      total_picked_qty: actualTotalPicked, // Use calculated value from items
      items: items,
      created_at: row.created_at ? row.created_at.toISOString() : null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null
    });
    
  } catch (error) {
    console.error('Failed to fetch Material Request:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch Material Request',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/material-requests
 * Create a new Material Request document
 * 
 * Request Body:
 * {
 *   "title": "MR-0001",
 *   "from_warehouse": "WH-MAIN",
 *   "to_showroom": "SHOWROOM-001",
 *   "request_date": "2025-12-27",
 *   "required_date": "2025-12-28",
 *   "requested_by": "USER-001",
 *   "items": [
 *     {
 *       "item_code": "ITEM-001",
 *       "requested_qty": 50.00
 *     }
 *   ]
 * }
 */
export const createMaterialRequest = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title, from_warehouse, to_showroom, request_date, required_date, requested_by, items } = req.body;
    
    // Validation
    if (!title || !from_warehouse || !to_showroom || !request_date || !requested_by) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'title, from_warehouse, to_showroom, request_date, and requested_by are required'
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
    
    // Calculate total_requested_qty
    const total_requested_qty = items.reduce((sum, item) => sum + (parseFloat(item.requested_qty) || 0), 0);
    
    // Insert Material Request
    await connection.execute(`
      INSERT INTO tabMaterialRequest 
        (title, status, from_warehouse, to_showroom, requested_date, required_date, requested_by, total_requested_qty, total_picked_qty)
      VALUES (?, 'Draft', ?, ?, ?, ?, ?, ?, 0)
    `, [title, from_warehouse, to_showroom, request_date, required_date || null, requested_by, total_requested_qty]);
    
    // Insert items
    for (const item of items) {
      await connection.execute(`
        INSERT INTO tabMaterialRequestItem 
          (parent_title, item_code, requested_qty, picked_qty, status)
        VALUES (?, ?, ?, 0, 'Pending')
      `, [title, item.item_code, item.requested_qty]);
    }
    
    res.status(201).json({
      ok: true,
      message: 'Material Request created successfully',
      data: {
        title: title,
        status: 'Draft',
        total_requested_qty: total_requested_qty
      }
    });
    
  } catch (error) {
    console.error('Failed to create Material Request:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        error: {
          code: 'DUPLICATE_ENTRY',
          message: 'Material Request with this title already exists'
        }
      });
    }
    
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to create Material Request',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/material-requests/:title/update-status
 * Update Material Request status
 * 
 * Request Body:
 * {
 *   "status": "Submitted",
 *   "dispatched_by": "USER-004",  // Optional
 *   "dispatched_on": "2026-01-03T11:00:00Z"  // Optional, ISO format
 * }
 */
export const updateMaterialRequestStatus = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    const { status, dispatched_by, dispatched_on } = req.body;
    
    // Validation
    if (!status) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'status is required'
        }
      });
    }
    
    // Valid status values
    const validStatuses = ['Draft', 'Submitted', 'In Progress', 'Picked', 'Dispatched', 'Completed', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        }
      });
    }
    
    // Check if Material Request exists
    const [rows] = await connection.execute(
      'SELECT title FROM tabMaterialRequest WHERE title = ?',
      [title]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Material Request ${title} not found`
        }
      });
    }
    
    // Build update query
    let updateQuery = 'UPDATE tabMaterialRequest SET status = ?, updated_at = NOW()';
    const params = [status];
    
    // Add dispatched_by and dispatched_on if status is Dispatched
    if (status === 'Dispatched') {
      if (dispatched_by) {
        // Check if dispatched_by column exists
        const [columns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabMaterialRequest' 
          AND COLUMN_NAME = 'dispatched_by'
        `);
        
        if (columns.length > 0) {
          updateQuery += ', dispatched_by = ?';
          params.push(dispatched_by);
        }
      }
      
      if (dispatched_on) {
        // Check if dispatched_on column exists
        const [columns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabMaterialRequest' 
          AND COLUMN_NAME = 'dispatched_on'
        `);
        
        if (columns.length > 0) {
          updateQuery += ', dispatched_on = ?';
          params.push(dispatched_on);
        }
      }
    }
    
    updateQuery += ' WHERE title = ?';
    params.push(title);
    
    await connection.execute(updateQuery, params);
    
    res.json({
      ok: true,
      message: 'Material Request status updated successfully',
      data: {
        title: title,
        status: status
      }
    });
    
  } catch (error) {
    console.error('Failed to update Material Request status:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to update Material Request status',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/material-requests/:title/pick-items
 * Update picked quantities for Material Request items and reduce stock
 * 
 * Request Body:
 * {
 *   "items": [
 *     {
 *       "item_code": "SKU-HAT-301-GRN-OS",
 *       "picked_qty": 20.00,
 *       "source_bin": "A1-R01-L1-B1"  // location_id where item was picked from
 *     }
 *   ],
 *   "warehouse": "WH-MAIN"  // Optional, defaults to from_warehouse
 * }
 */
export const pickMaterialRequestItems = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    const { items, warehouse } = req.body;
    
    // Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'items array is required and must not be empty'
        }
      });
    }
    
    // Get Material Request details
    const [mrRows] = await connection.execute(`
      SELECT title, from_warehouse, to_showroom, status
      FROM tabMaterialRequest
      WHERE title = ?
    `, [title]);
    
    if (mrRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Material Request ${title} not found`
        }
      });
    }
    
    const materialRequest = mrRows[0];
    const targetWarehouse = warehouse || materialRequest.from_warehouse;
    
    await connection.beginTransaction();
    
    try {
      let totalPickedQty = 0;
      const stockUpdates = [];
      
      // Process each item
      for (const item of items) {
        const { item_code, picked_qty, source_bin } = item;
        const pickedQty = parseFloat(picked_qty) || 0;
        
        if (!item_code || pickedQty <= 0) {
          continue; // Skip invalid items
        }
        
        // Get current picked_qty for this item
        const [currentItem] = await connection.execute(`
          SELECT picked_qty, requested_qty
          FROM tabMaterialRequestItem
          WHERE parent_title = ? AND item_code = ?
        `, [title, item_code]);
        
        if (currentItem.length === 0) {
          console.warn(`Item ${item_code} not found in Material Request ${title}`);
          continue;
        }
        
        const currentPickedQty = parseFloat(currentItem[0].picked_qty) || 0;
        const requestedQty = parseFloat(currentItem[0].requested_qty) || 0;
        
        // Check if already fully picked
        if (currentPickedQty >= requestedQty && requestedQty > 0) {
          console.log(`ℹ️  Item ${item_code} already fully picked (${currentPickedQty}/${requestedQty}). Skipping.`);
          continue; // Skip this item - already fully picked
        }
        
        const newPickedQty = currentPickedQty + pickedQty;
        
        // Validate: Don't allow picking more than requested
        if (newPickedQty > requestedQty) {
          await connection.rollback();
          return res.status(400).json({
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Cannot pick ${pickedQty} for ${item_code}. Already picked: ${currentPickedQty}, Requested: ${requestedQty}. Maximum additional quantity: ${requestedQty - currentPickedQty}`
            }
          });
        }
        
        // Compute item status based on picked_qty
        let itemStatus = 'Pending';
        if (newPickedQty >= requestedQty && requestedQty > 0) {
          itemStatus = 'Picked';
        } else if (newPickedQty > 0) {
          itemStatus = 'In Progress';
        }
        
        // Update Material Request Item picked_qty and status
        await connection.execute(`
          UPDATE tabMaterialRequestItem
          SET picked_qty = ?,
              status = ?,
              updated_at = NOW()
          WHERE parent_title = ? AND item_code = ?
        `, [newPickedQty, itemStatus, title, item_code]);
        
        console.log(`✅ Updated picked_qty for ${item_code}: ${currentPickedQty} → ${newPickedQty} (added ${pickedQty}), status: ${itemStatus}`);
        totalPickedQty += pickedQty;
        
        // Reduce stock from source bin if source_bin is provided
        if (source_bin) {
          // Get current stock from source bin
          const [currentStock] = await connection.execute(`
            SELECT qty, reserved_qty
            FROM tabStockLedger
            WHERE item_code = ?
              AND warehouse = ?
              AND bin_location = ?
          `, [item_code, targetWarehouse, source_bin]);
          
          const currentQty = currentStock.length > 0 ? parseFloat(currentStock[0].qty) || 0 : 0;
          const currentReservedQty = currentStock.length > 0 ? parseFloat(currentStock[0].reserved_qty) || 0 : 0;
          
          // Validate: Check if sufficient stock available
          if (currentQty < pickedQty) {
            await connection.rollback();
            return res.status(400).json({
              ok: false,
              error: {
                code: 'INSUFFICIENT_STOCK',
                message: `Insufficient stock for ${item_code} at ${source_bin}. Available: ${currentQty}, Required: ${pickedQty}`
              }
            });
          }
          
          const newQty = currentQty - pickedQty;
          
          // Update stock ledger (decrease from source bin)
          await connection.execute(`
            INSERT INTO tabStockLedger 
              (item_code, warehouse, bin_location, qty, reserved_qty,
               last_transaction_date, last_transaction_type, last_transaction_ref,
               updated_at, created_at)
            VALUES (?, ?, ?, ?, ?,
                    NOW(), 'Picking', ?,
                    NOW(), NOW())
            ON DUPLICATE KEY UPDATE
              qty = ?,
              last_transaction_date = NOW(),
              last_transaction_type = 'Picking',
              last_transaction_ref = ?,
              updated_at = NOW()
          `, [
            item_code,
            targetWarehouse,
            source_bin,
            newQty,
            currentReservedQty,
            title,
            newQty,
            title
          ]);
          
          // Insert stock transaction log
          await connection.execute(`
            INSERT INTO tabStockTransaction 
              (transaction_date, transaction_type, reference_doc_type, reference_doc,
               item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
               source_bin, target_bin, performed_by, created_at)
            VALUES 
              (NOW(), 'Picking', 'Material Request', ?,
               ?, ?, ?, ?, ?, ?,
               ?, NULL, NULL, NOW())
          `, [
            title,
            item_code,
            targetWarehouse,
            source_bin,
            -pickedQty, // Negative (decrease)
            currentQty,
            newQty,
            source_bin
          ]);
          
          stockUpdates.push({
            item_code,
            source_bin,
            qty_reduced: pickedQty,
            qty_before: currentQty,
            qty_after: newQty
          });
        }
      }
      
      // Recalculate total_picked_qty from items (more accurate than incrementing)
      await connection.execute(`
        UPDATE tabMaterialRequest
        SET total_picked_qty = (
            SELECT COALESCE(SUM(picked_qty), 0)
            FROM tabMaterialRequestItem
            WHERE parent_title = ?
          ),
          updated_at = NOW()
        WHERE title = ?
      `, [title, title]);
      
      // Get the recalculated total for response
      const [updatedTotal] = await connection.execute(`
        SELECT total_picked_qty
        FROM tabMaterialRequest
        WHERE title = ?
      `, [title]);
      
      const newTotalPicked = parseFloat(updatedTotal[0].total_picked_qty) || 0;
      console.log(`✅ Material Request ${title} total_picked_qty updated to: ${newTotalPicked}`);
      
      // Update status based on picking progress at item level
      // Status is tracked at item level - header status is computed from all items
      // Status should only be "Picked" when ALL items are fully picked (picked_qty >= requested_qty for ALL items)
      // Individual item/carton completion does NOT change header status
      
      // Check if all items are fully picked
      const [allItems] = await connection.execute(`
        SELECT 
          COUNT(*) as total_items,
          SUM(CASE WHEN picked_qty >= requested_qty THEN 1 ELSE 0 END) as fully_picked_items
        FROM tabMaterialRequestItem
        WHERE parent_title = ?
      `, [title]);
      
      const totalItems = allItems[0].total_items || 0;
      const fullyPickedItems = allItems[0].fully_picked_items || 0;
      
      let newStatus = materialRequest.status;
      
      // Fix incorrect status: if status is "Picked" but no items are picked
      if (newTotalPicked === 0 && newStatus === 'Picked') {
        newStatus = materialRequest.status === 'Submitted' ? 'Submitted' : 'In Progress';
        await connection.execute(`
          UPDATE tabMaterialRequest
          SET status = ?,
              updated_at = NOW()
          WHERE title = ?
        `, [newStatus, title]);
        console.log(`⚠️  Material Request ${title} status reset from "Picked" to "${newStatus}" (no items picked)`);
      }
      // Update to "In Progress" when picking starts
      else if (materialRequest.status === 'Submitted' && newTotalPicked > 0) {
        newStatus = 'In Progress';
        await connection.execute(`
          UPDATE tabMaterialRequest
          SET status = ?,
              updated_at = NOW()
          WHERE title = ?
        `, [newStatus, title]);
        console.log(`✅ Material Request ${title} status updated to "In Progress" (picking started)`);
      }
      // Only set to "Picked" when ALL items are fully picked AND ALL transfer cartons are sealed
      // Check if all transfer cartons are sealed
      // Detect schema for tabTransferCarton to find the correct column name
      const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
      const allColumns = new Set(tableInfo.map(row => row.Field));
      
      let toColumn;
      if (allColumns.has('to_no')) {
        toColumn = 'to_no';
      } else if (allColumns.has('transfer_order')) {
        toColumn = 'transfer_order';
      } else {
        toColumn = null; // No TO column found
      }
      
      let tcStatus = [{ total_tcs: 0, sealed_tcs: 0 }];
      if (toColumn) {
        [tcStatus] = await connection.execute(`
          SELECT 
            COUNT(*) as total_tcs,
            SUM(CASE WHEN status = 'Sealed' OR status = 'Dispatched' THEN 1 ELSE 0 END) as sealed_tcs
          FROM tabTransferCarton
          WHERE ${toColumn} = ?
        `, [title]);
      }
      
      const totalTCs = tcStatus[0].total_tcs || 0;
      const sealedTCs = tcStatus[0].sealed_tcs || 0;
      
      // Status "Picked" only when ALL items are fully picked AND ALL transfer cartons are sealed
      if (fullyPickedItems === totalItems && totalItems > 0 && sealedTCs === totalTCs && totalTCs > 0 && newTotalPicked > 0 && newStatus !== 'Picked') {
        newStatus = 'Picked';
        await connection.execute(`
          UPDATE tabMaterialRequest
          SET status = ?,
              updated_at = NOW()
          WHERE title = ?
        `, [newStatus, title]);
        console.log(`✅ Material Request ${title} status updated to "Picked" (all ${totalItems} items fully picked, all ${totalTCs} TCs sealed)`);
      } else if (fullyPickedItems === totalItems && totalItems > 0 && (sealedTCs < totalTCs || totalTCs === 0)) {
        // All items are picked but not all sealed - keep as "In Progress"
        if (newStatus !== 'In Progress') {
          newStatus = 'In Progress';
          await connection.execute(`
            UPDATE tabMaterialRequest
            SET status = ?,
                updated_at = NOW()
            WHERE title = ?
          `, [newStatus, title]);
          console.log(`ℹ️  Material Request ${title} status remains "In Progress" (all ${totalItems} items picked, but ${sealedTCs}/${totalTCs} TCs sealed)`);
        }
      }
      // Keep status as "In Progress" if some items are picked but not all
      else if (newTotalPicked > 0 && fullyPickedItems < totalItems && newStatus !== 'In Progress') {
        newStatus = 'In Progress';
        await connection.execute(`
          UPDATE tabMaterialRequest
          SET status = ?,
              updated_at = NOW()
          WHERE title = ?
        `, [newStatus, title]);
      }
      
      // Update tabItem.stock_qty for affected items
      const itemCodes = [...new Set(items.map(item => item.item_code).filter(Boolean))];
      for (const itemCode of itemCodes) {
        const [stockSum] = await connection.execute(`
          SELECT COALESCE(SUM(qty), 0) as total_qty
          FROM tabStockLedger
          WHERE item_code = ? AND warehouse = ?
        `, [itemCode, targetWarehouse]);
        
        const totalStockQty = parseFloat(stockSum[0].total_qty) || 0;
        
        await connection.execute(`
          UPDATE tabItem
          SET stock_qty = ?,
              updated_at = NOW()
          WHERE code = ?
        `, [totalStockQty, itemCode]);
      }
      
      await connection.commit();
      
      res.json({
        ok: true,
        message: 'Material Request items picked successfully',
        data: {
          material_request: title,
          status: newStatus,
          total_picked_qty: newTotalPicked,
          items_picked: items.length,
          stock_updates: stockUpdates
        }
      });
      
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    
  } catch (error) {
    console.error('Failed to pick Material Request items:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to pick Material Request items',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

