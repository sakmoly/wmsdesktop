// wms-api/src/modules/material-request/materialRequestController.js
// Material Request API endpoints (Warehouse to Showroom)

import { getConnection } from '../../db/connection.js';
import { postStock } from '../stock-ledger/stockPostingService.js';

/** ERPNext uses "Pending" for submitted MRs; WMS/mobile use "Submitted" for Start Picking. */
const statusForClient = (s) => {
  if (s === 'Pending') return 'Submitted';
  if (s === 'Dispatched') return 'Transferred';
  return s;
};

const formatDateOnly = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[0];
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value);
};

/**
 * Keep line status aligned with picked quantities when the header is changed directly.
 * This uses the same status rules as pick-items.
 */
async function syncMaterialRequestLineStatusesFromPickedQty(connection, title) {
  const [rows] = await connection.execute(
    `SELECT item_code, requested_qty, COALESCE(picked_qty, 0) AS picked_qty
     FROM tabMaterialRequestItem
     WHERE parent_title = ?`,
    [title]
  );

  for (const row of rows) {
    const requestedQty = parseFloat(row.requested_qty) || 0;
    const pickedQty = parseFloat(row.picked_qty) || 0;
    let itemStatus = 'Pending';

    if (pickedQty >= requestedQty && requestedQty > 0) {
      itemStatus = 'Picked';
    } else if (pickedQty > 0) {
      itemStatus = 'In Progress';
    }

    await connection.execute(
      `UPDATE tabMaterialRequestItem
       SET status = ?, updated_at = NOW()
       WHERE parent_title = ? AND item_code = ?`,
      [itemStatus, title, row.item_code]
    );
  }
}

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
    const [mrColumns] = await connection.execute(`DESCRIBE tabMaterialRequest`);
    const mrColumnNames = new Set(mrColumns.map(row => row.Field));
    const stockEntrySelect = mrColumnNames.has('stock_entry_no')
      ? 'stock_entry_no,'
      : mrColumnNames.has('stock_entry')
        ? 'stock_entry AS stock_entry_no,'
        : "NULL AS stock_entry_no,";
    
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
        ${stockEntrySelect}
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
      
      // REMOVED: Auto-status update to "Picked"
      // Status is now managed manually via update-status endpoint
      // Users control status transitions through the mobile app buttons:
      // 1. User clicks "Complete Picking" → POST /api/material-requests/:title/update-status { "status": "Picked" }
      // 2. User clicks "Seal Transfer Carton" → POST /api/material-requests/:title/update-status { "status": "Sealed TC" }
      // if (allItemsFullyPicked && items.length > 0 && sealedTCs === totalTCs && totalTCs > 0 && status !== 'Picked') {
      //   status = 'Picked';
      //   await connection.execute(`
      //     UPDATE tabMaterialRequest
      //     SET status = ?,
      //         updated_at = NOW()
      //     WHERE title = ?
      //   `, [status, row.title]);
      //   console.log(`✅ Material Request ${row.title} status updated to "Picked" (all items fully picked, all TCs sealed)`);
      // }
      // REMOVED: Auto-status correction from "Submitted" to "In Progress"
      // Status is now managed manually via update-status endpoint
      // else if (someItemsPicked && status === 'Submitted') {
      //   status = 'In Progress';
      //   ...
      // }
      // REMOVED: Auto-status correction from "Picked" to "In Progress"
      // Status is now managed manually via update-status endpoint
      // The workflow allows:
      // - Status "Picked" even if not all TCs are sealed (user will seal them manually)
      // - Status "Picked" even if items are not fully picked (user controls status explicitly)
      // Status changes are handled by:
      // 1. User clicks "Start Picking" → POST /api/material-requests/:title/update-status { "status": "In Progress" }
      // 2. User clicks "Complete Picking" → POST /api/material-requests/:title/update-status { "status": "Picked" }
      // 3. User clicks "Seal Transfer Carton" → POST /api/material-requests/:title/update-status { "status": "Sealed TC" }
      // else if (allItemsFullyPicked && items.length > 0 && (sealedTCs < totalTCs || totalTCs === 0) && status === 'Picked') {
      //   // All items are picked but not all sealed - should be "In Progress", not "Picked"
      //   status = 'In Progress';
      //   await connection.execute(`
      //     UPDATE tabMaterialRequest
      //     SET status = ?,
      //         updated_at = NOW()
      //     WHERE title = ?
      //   `, [status, row.title]);
      //   console.log(`⚠️  Material Request ${row.title} status changed from "Picked" to "In Progress" (all items picked but ${sealedTCs}/${totalTCs} TCs sealed)`);
      // } else if (!allItemsFullyPicked && status === 'Picked') {
      //   // Not all items are fully picked but status is "Picked" - should be "In Progress"
      //   status = 'In Progress';
      //   await connection.execute(`
      //     UPDATE tabMaterialRequest
      //     SET status = ?,
      //         updated_at = NOW()
      //     WHERE title = ?
      //   `, [status, row.title]);
      //   const pendingItems = items.filter(item => item.picked_qty < item.requested_qty);
      //   console.log(`⚠️  Material Request ${row.title} status changed from "Picked" to "In Progress" (${pendingItems.length} item(s) not fully picked: ${pendingItems.map(i => i.item_code).join(', ')})`);
      // }
      
      return {
        title: row.title,
        status: statusForClient(status),
        from_warehouse: row.from_warehouse,
        to_showroom: row.to_showroom,
        request_date: formatDateOnly(row.requested_date),
        required_date: formatDateOnly(row.required_date),
        requested_by: row.requested_by,
        stock_entry_no: row.stock_entry_no || null,
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
    const [mrColumns] = await connection.execute(`DESCRIBE tabMaterialRequest`);
    const mrColumnNames = new Set(mrColumns.map(row => row.Field));
    const stockEntrySelect = mrColumnNames.has('stock_entry_no')
      ? 'stock_entry_no,'
      : mrColumnNames.has('stock_entry')
        ? 'stock_entry AS stock_entry_no,'
        : "NULL AS stock_entry_no,";
    
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
        ${stockEntrySelect}
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
    
    // REMOVED: Auto-status correction
    // Status is now managed manually via update-status endpoint
    // The workflow allows users to control status explicitly:
    // - Status "Picked" can remain even if items are not fully picked (user controls status)
    // - Status "Picked" can remain even if no items are picked (user controls status)
    // Status changes are handled by:
    // 1. User clicks "Start Picking" → POST /api/material-requests/:title/update-status { "status": "In Progress" }
    // 2. User clicks "Complete Picking" → POST /api/material-requests/:title/update-status { "status": "Picked" }
    // 3. User clicks "Seal Transfer Carton" → POST /api/material-requests/:title/update-status { "status": "Sealed TC" }
    // if (status === 'Picked' && actualTotalPicked === 0) {
    //   const correctStatus = row.status === 'Submitted' ? 'Submitted' : 'In Progress';
    //   await connection.execute(`
    //     UPDATE tabMaterialRequest
    //     SET status = ?,
    //         updated_at = NOW()
    //     WHERE title = ?
    //   `, [correctStatus, title]);
    //   status = correctStatus;
    //   console.log(`⚠️  Fixed Material Request ${title} status from "Picked" to "${correctStatus}" (no items picked)`);
    // }
    // // Fix status if it's "Picked" but not all items are fully picked
    // else if (status === 'Picked' && !allItemsFullyPicked) {
    //   status = 'In Progress';
    //   await connection.execute(`
    //     UPDATE tabMaterialRequest
    //     SET status = ?,
    //         updated_at = NOW()
    //     WHERE title = ?
    //   `, [status, title]);
    //   const pendingItems = items.filter(item => item.picked_qty < item.requested_qty);
    //   console.log(`⚠️  Fixed Material Request ${title} status from "Picked" to "In Progress" (not all items fully picked: ${pendingItems.length} item(s) still pending)`);
    // }
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
    
    // REMOVED: Auto-status update to "Picked"
    // Status is now managed manually via update-status endpoint
    // Users control status transitions through the mobile app buttons:
    // 1. User clicks "Complete Picking" → POST /api/material-requests/:title/update-status { "status": "Picked" }
    // 2. User clicks "Seal Transfer Carton" → POST /api/material-requests/:title/update-status { "status": "Sealed TC" }
    // if (allItemsFullyPicked && items.length > 0 && sealedTCs === totalTCs && totalTCs > 0 && status !== 'Picked') {
    //   status = 'Picked';
    //   await connection.execute(`
    //     UPDATE tabMaterialRequest
    //     SET status = ?,
    //         updated_at = NOW()
    //     WHERE title = ?
    //   `, [status, title]);
    //   console.log(`✅ Material Request ${title} status updated to "Picked" (all items fully picked, all TCs sealed)`);
    // }
    // REMOVED: Auto-status correction from "Submitted" to "In Progress"
    // REMOVED: Auto-status correction from "Picked" to "In Progress"
    // Status is now managed manually via update-status endpoint
    // Users control status transitions through the mobile app buttons
    
    res.json({
      title: row.title,
      status: statusForClient(status),
      from_warehouse: row.from_warehouse,
      to_showroom: row.to_showroom,
      request_date: formatDateOnly(row.requested_date),
      required_date: formatDateOnly(row.required_date),
      requested_by: row.requested_by,
      stock_entry_no: row.stock_entry_no || null,
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

    const { findMissingItemCodesInMaster } = await import('../../utils/itemMasterValidate.js');
    const missMrCreate = await findMissingItemCodesInMaster(
      connection,
      items.map((i) => i.item_code)
    );
    if (missMrCreate.length > 0) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'ITEM_NOT_IN_MASTER',
          message: `Item code(s) not in Item master (tabItem): ${missMrCreate.join(', ')}`,
          missing_item_codes: missMrCreate,
        },
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
    const validStatuses = ['Draft', 'Submitted', 'In Progress', 'Picked', 'Dispatched', 'Transferred', 'Completed', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        }
      });
    }
    
    // Check if Material Request exists and get current status
    const [mrColumns] = await connection.execute(`DESCRIBE tabMaterialRequest`);
    const mrColumnNames = new Set(mrColumns.map(row => row.Field));
    const stockEntrySelect = mrColumnNames.has('stock_entry_no')
      ? 'stock_entry_no'
      : mrColumnNames.has('stock_entry')
        ? 'stock_entry AS stock_entry_no'
        : 'NULL AS stock_entry_no';
    const [rows] = await connection.execute(
      `SELECT title, status, ${stockEntrySelect} FROM tabMaterialRequest WHERE title = ?`,
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
    
    const currentStatus = rows[0].status;
    const stockEntryNo = String(rows[0].stock_entry_no || '').trim();
    
    // Validate status transitions
    if (status === 'Picked') {
      // Only allow status change to "Picked" if ALL items are fully picked
      const [itemRows] = await connection.execute(
        `SELECT 
          item_code,
          requested_qty,
          COALESCE(picked_qty, 0) as picked_qty
        FROM tabMaterialRequestItem
        WHERE parent_title = ?`,
        [title]
      );
      
      const allItemsFullyPicked = itemRows.length > 0 && itemRows.every(item => 
        parseFloat(item.picked_qty) >= parseFloat(item.requested_qty)
      );
      
      if (!allItemsFullyPicked) {
        const pendingItems = itemRows.filter(item => 
          parseFloat(item.picked_qty) < parseFloat(item.requested_qty)
        );
        return res.status(400).json({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Cannot set status to "Picked". Not all items are fully picked.',
            details: {
              pending_items: pendingItems.map(item => ({
                item_code: item.item_code,
                requested_qty: parseFloat(item.requested_qty),
                picked_qty: parseFloat(item.picked_qty),
                remaining_qty: parseFloat(item.requested_qty) - parseFloat(item.picked_qty)
              }))
            }
          }
        });
      }
    }
    
    // Validate "In Progress" status transition
    // Allow changing from "Picked" to "In Progress" to resume picking
    // This is needed when users want to continue picking or adjust quantities
    // No validation needed - users can always resume picking regardless of completion status
    // if (status === 'In Progress' && currentStatus === 'Picked') {
    //   // REMOVED: This validation was too restrictive
    //   // Users should be able to resume picking even if all items are fully picked
    //   // (e.g., to pick more items, adjust quantities, or correct mistakes)
    // }
    
    if (status === 'Transferred' && !stockEntryNo) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'STOCK_ENTRY_REQUIRED',
          message: 'Cannot set status to "Transferred". Stock Entry Number is required.'
        }
      });
    }
    
    // Build update query
    let updateQuery = 'UPDATE tabMaterialRequest SET status = ?, updated_at = NOW()';
    const params = [status];
    
    // Add dispatched_by and dispatched_on if status is Dispatched/Transferred
    if (status === 'Dispatched' || status === 'Transferred') {
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

    await syncMaterialRequestLineStatusesFromPickedQty(connection, title);
    
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
 *   "warehouse": "WH-MAIN",  // Optional, defaults to from_warehouse
 *   "user_id": "USER-001",  // Optional: from body, else from JWT (req.user.user_id), else "MOBILE-USER"
 *   "created_by": "USER-001" // Optional: alias for user_id
 * }
 */
export const pickMaterialRequestItems = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    const { items, warehouse, user_id, created_by } = req.body;
    
    // Normalize user: body (user_id/created_by) > JWT (req.user.user_id) > fallback for audit
    const userId = user_id || created_by || req.user?.user_id || 'MOBILE-USER';
    const normalizedCreatedBy = (typeof userId === 'string' ? userId : String(userId || '')).trim() || 'MOBILE-USER';
    
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
    
    // Normalize warehouse to code (handle both name and code)
    const normalizeWarehouseToCode = async (warehouseValue) => {
      if (!warehouseValue || typeof warehouseValue !== 'string') {
        // Use Material Request's from_warehouse as default
        return materialRequest.from_warehouse || 'WH-MAIN';
      }

      const normalized = warehouseValue.trim();
      
      // If it's already a code (check if exists in tabWarehouse by code), return it
      const [codeCheck] = await connection.execute(
        `SELECT code FROM tabWarehouse WHERE code = ? LIMIT 1`,
        [normalized]
      );
      
      if (codeCheck.length > 0) {
        return codeCheck[0].code;
      }
      
      // Try to find by name
      const [nameCheck] = await connection.execute(
        `SELECT code FROM tabWarehouse WHERE name = ? LIMIT 1`,
        [normalized]
      );
      
      if (nameCheck.length > 0) {
        return nameCheck[0].code;
      }
      
      // If not found, return the Material Request's from_warehouse or default
      console.warn(`[Material Request Picking] ⚠️ Warehouse "${normalized}" not found in master data. Using Material Request's from_warehouse: ${materialRequest.from_warehouse}`);
      return materialRequest.from_warehouse || 'WH-MAIN';
    };
    
    const targetWarehouse = await normalizeWarehouseToCode(warehouse || materialRequest.from_warehouse);

    const { findMissingItemCodesInMaster } = await import('../../utils/itemMasterValidate.js');
    const missMrPick = await findMissingItemCodesInMaster(
      connection,
      items.map((i) => i.item_code)
    );
    if (missMrPick.length > 0) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'ITEM_NOT_IN_MASTER',
          message: `Item code(s) not in Item master (tabItem): ${missMrPick.join(', ')}`,
          missing_item_codes: missMrPick,
        },
      });
    }
    
    await connection.beginTransaction();
    
    try {
      let totalPickedQty = 0;
      const stockUpdates = [];
      
      // Check if carton tables exist (for carton-level inventory)
      const [cartonTables] = await connection.execute(`
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME IN ('tabCarton', 'tabCartonItem', 'tabCartonStock', 'tabBin')
      `);
      const isCartonLevelMode = cartonTables[0].count === 4;
      
      // Process each item
      for (const item of items) {
        const { item_code, picked_qty, source_bin, carton_id } = item;
        const pickedQty = parseFloat(picked_qty) || 0;
        
        // Validate required fields
        // NOTE: Allow negative values to support decreasing quantities
        // Negative values will decrease picked_qty (e.g., -5 decreases by 5)
        if (!item_code || isNaN(pickedQty)) {
          console.warn(`Skipping invalid item: ${JSON.stringify(item)}`);
          continue; // Skip invalid items
        }
        
        // Allow zero, positive, and negative values
        // Zero is allowed (no change, but still processed for validation)
        
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
        
        // NOTE: Removed check for "already fully picked" - backend now allows over-picking
        // Users can continue to scan items even if picked_qty already exceeds requested_qty
        
        // CRITICAL: Always increment/decrement picked_qty (add to existing), never set to absolute value
        // Calculate new total (supports both positive and negative pickedQty)
        const newPickedQty = Math.max(0, currentPickedQty + pickedQty); // Ensure picked_qty doesn't go below 0
        
        // NOTE: Backend now allows:
        // - Picking more than requested quantity (over-picking)
        // - Decreasing picked quantity (negative pickedQty values)
        // - Setting picked_qty to 0 (by sending negative value equal to current)
        
        // Check if scan_qty column exists
        const [scanQtyColumn] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabMaterialRequestItem' 
            AND COLUMN_NAME = 'scan_qty'
        `);
        const hasScanQtyColumn = scanQtyColumn.length > 0;
        
        // Compute item status based on new picked_qty
        // Status is "Picked" if picked_qty >= requested_qty (allows over-picking)
        let itemStatus = 'Pending';
        if (newPickedQty >= requestedQty && requestedQty > 0) {
          itemStatus = 'Picked';
        } else if (newPickedQty > 0) {
          itemStatus = 'In Progress';
        }
        
        // Log warning if over-picking (informational only, not blocking)
        if (newPickedQty > requestedQty && requestedQty > 0) {
          console.log(`ℹ️  Over-picked item ${item_code}: Requested ${requestedQty}, Picked ${newPickedQty} (excess: ${newPickedQty - requestedQty})`);
        }
        
        // Update Material Request Item picked_qty, scan_qty, and status
        // CRITICAL: Always increment picked_qty (add to existing), never set to absolute value
        // Set scan_qty = picked_qty (for tracking scanned quantity)
        if (hasScanQtyColumn) {
          await connection.execute(`
            UPDATE tabMaterialRequestItem
            SET picked_qty = picked_qty + ?,
                scan_qty = picked_qty + ?,
                status = ?,
                updated_at = NOW()
            WHERE parent_title = ? AND item_code = ?
          `, [pickedQty, pickedQty, itemStatus, title, item_code]);
        } else {
          await connection.execute(`
            UPDATE tabMaterialRequestItem
            SET picked_qty = picked_qty + ?,
                status = ?,
                updated_at = NOW()
            WHERE parent_title = ? AND item_code = ?
          `, [pickedQty, itemStatus, title, item_code]);
        }
        
        // Log update with appropriate message
        if (pickedQty > 0) {
          console.log(`✅ Updated picked_qty for ${item_code}: ${currentPickedQty} → ${newPickedQty} (added ${pickedQty}), status: ${itemStatus}`);
        } else if (pickedQty < 0) {
          console.log(`✅ Updated picked_qty for ${item_code}: ${currentPickedQty} → ${newPickedQty} (decreased by ${Math.abs(pickedQty)}), status: ${itemStatus}`);
        } else {
          console.log(`ℹ️  No change to picked_qty for ${item_code}: ${currentPickedQty} (pickedQty was 0)`);
        }
        totalPickedQty += pickedQty;
        
        // Handle stock updates: reduce stock if increasing, add stock back if decreasing
        // Only process stock updates if source_bin is provided and pickedQty is not zero
        if (source_bin && pickedQty !== 0) {
          // Determine if we're increasing or decreasing picked quantity
          const isDecreasing = pickedQty < 0;
          const absoluteQty = Math.abs(pickedQty);
          let currentQty = 0;
          let currentReservedQty = 0;
          let newQty = 0;
          let cartonStockUpdated = false;
          
          // If carton-level mode and carton_id provided, update carton stock
          if (isCartonLevelMode && carton_id) {
            // Helper function to find matching bin_location (handles incomplete formats)
            const findMatchingBinLocation = async (itemCode, cartonId, binLocation, warehouse) => {
              // First try exact match
              let [exactMatch] = await connection.execute(`
                SELECT carton_id, item_code, bin_location, qty, status, warehouse
                FROM tabCartonStock
                WHERE carton_id = ?
                  AND item_code = ?
                  AND bin_location = ?
                  AND warehouse = ?
                  AND qty > 0
                  AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
                LIMIT 1
              `, [cartonId, itemCode, binLocation, warehouse]);
              
              if (exactMatch.length > 0) {
                return exactMatch[0];
              }
              
              // If no exact match, try to parse and match by components
              // Example: "A1-R02-L1-B2" -> try to match "Rack 02-B2" or similar
              const parts = binLocation.split('-');
              if (parts.length >= 2) {
                const lastPart = parts[parts.length - 1]; // "B2"
                // Extract rack number from full format (e.g., "A1-R02-L1-B2" -> "R02" or "02")
                let rackNumber = null;
                for (const part of parts) {
                  if (part.startsWith('R') || part.match(/^Rack\s*\d+/i)) {
                    rackNumber = part.replace(/^R/i, '').replace(/^Rack\s*/i, '').trim();
                    break;
                  }
                }
                
                // Try matching with LIKE for partial bin_location
                // Match patterns like "Rack 02-B2", "R02-B2", "02-B2", etc.
                const likePatterns = [];
                if (rackNumber && lastPart) {
                  likePatterns.push(`%Rack ${rackNumber}-${lastPart}%`);
                  likePatterns.push(`%R${rackNumber}-${lastPart}%`);
                  likePatterns.push(`%${rackNumber}-${lastPart}%`);
                }
                if (lastPart) {
                  likePatterns.push(`%-${lastPart}`);
                }
                
                if (likePatterns.length > 0) {
                  const placeholders = likePatterns.map(() => '?').join(',');
                  const [partialMatch] = await connection.execute(`
                    SELECT carton_id, item_code, bin_location, qty, status, warehouse
                    FROM tabCartonStock
                    WHERE carton_id = ?
                      AND item_code = ?
                      AND warehouse = ?
                      AND (${likePatterns.map(() => 'bin_location LIKE ?').join(' OR ')})
                      AND qty > 0
                      AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
                    LIMIT 1
                  `, [cartonId, itemCode, warehouse, ...likePatterns]);
                  
                  if (partialMatch.length > 0) {
                    return partialMatch[0];
                  }
                }
              }
              
              return null;
            };
            
            // Find matching carton stock (handles incomplete bin_location formats)
            const cartonStock = await findMatchingBinLocation(item_code, carton_id, source_bin, targetWarehouse);
            
            // Only check for carton stock when increasing (not when decreasing)
            if (!isDecreasing && !cartonStock) {
              await connection.rollback();
              return res.status(400).json({
                ok: false,
                error: {
                  code: 'INSUFFICIENT_STOCK',
                  message: `Insufficient stock for ${item_code} at ${source_bin}. Available: 0, Required: ${absoluteQty}. Carton ${carton_id} not found or has no stock at this location.`
                }
              });
            }
            
            // When decreasing, if carton stock doesn't exist, create it or use source_bin directly
            let cartonStockQty = 0;
            let actualBinLocation = source_bin;
            
            if (cartonStock) {
              cartonStockQty = parseFloat(cartonStock.qty) || 0;
              actualBinLocation = cartonStock.bin_location; // Use the actual bin_location from database
            } else if (isDecreasing) {
              // When decreasing and carton stock doesn't exist, we'll create/update it with the added quantity
              cartonStockQty = 0; // Start from 0, will add absoluteQty
              actualBinLocation = source_bin; // Use provided source_bin
              console.log(`ℹ️  Decreasing quantity: Carton ${carton_id} not found at ${source_bin}, will create/update carton stock entry`);
            }
            
            // Validate: Check if sufficient stock available in carton (only when increasing)
            if (!isDecreasing && cartonStockQty < absoluteQty) {
              await connection.rollback();
              return res.status(400).json({
                ok: false,
                error: {
                  code: 'INSUFFICIENT_STOCK',
                  message: `Insufficient stock for ${item_code} at ${source_bin}. Available: ${cartonStockQty}, Required: ${absoluteQty}`
                }
              });
            }
            
            // Calculate new quantity: subtract if increasing, add if decreasing
            newQty = isDecreasing ? cartonStockQty + absoluteQty : cartonStockQty - absoluteQty;
            currentQty = cartonStockQty;
            
            // Update or insert carton stock (use actual bin_location from database, not source_bin)
            // Use INSERT ... ON DUPLICATE KEY UPDATE to handle both cases
            await connection.execute(`
              INSERT INTO tabCartonStock 
                (carton_id, item_code, bin_location, warehouse, qty, status, updated_at)
              VALUES (?, ?, ?, ?, ?, 'PUTAWAY', NOW())
              ON DUPLICATE KEY UPDATE
                qty = ?,
                updated_at = NOW(),
                status = 'PUTAWAY'
            `, [carton_id, item_code, actualBinLocation, targetWarehouse, newQty, newQty]);
            
            // Update carton status to PICKED if fully picked
            if (newQty <= 0) {
              await connection.execute(`
                UPDATE tabCarton
                SET status = 'PICKED',
                    last_moved_on = NOW()
                WHERE carton_id = ?
              `, [carton_id]);
            }
            
            cartonStockUpdated = true;
            console.log(`✅ Updated carton stock for ${carton_id}: ${currentQty} → ${newQty}`);
          } else {
            // Bin-level mode: Update stock ledger
            // CRITICAL: source_bin is required for bin-level stock reduction
            if (!source_bin || source_bin.trim() === '') {
              await connection.rollback();
              return res.status(400).json({
                ok: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: `source_bin is required for bin-level stock reduction. Item: ${item_code}`,
                  details: {
                    item_code: item_code,
                    source_bin: source_bin || null,
                    note: 'Please provide the bin location (location_id) where the item is being picked from'
                  }
                }
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

            // Helper function to find matching bin_location in tabStockLedger (handles format differences)
            const findMatchingStockLedgerBin = async (itemCode, binLocation, warehouse) => {
              // First try exact match
              let stockQuery = `
                SELECT qty, reserved_qty, bin_location
              `;
              if (hasStockLedgerCartonIdColumn) {
                stockQuery += `, carton_id`;
              }
              stockQuery += `
                FROM tabStockLedger
                WHERE item_code = ?
                  AND warehouse = ?
                  AND bin_location = ?
                LIMIT 1
              `;
              
              let [exactMatch] = await connection.execute(
                stockQuery,
                [itemCode, warehouse, binLocation]
              );
              
              if (exactMatch.length > 0) {
                return exactMatch[0];
              }
              
              // If no exact match, try fuzzy matching by components
              // Example: "A1-R02-L1-B2" might match "Rack 02-B2" or "R02-L1-B2"
              const parts = binLocation.split('-');
              if (parts.length >= 2) {
                // Try matching last 2 parts (e.g., "L1-B2" from "A1-R02-L1-B2")
                const lastTwoParts = parts.slice(-2).join('-');
                let fuzzyQuery = `
                  SELECT qty, reserved_qty, bin_location
                `;
                if (hasStockLedgerCartonIdColumn) {
                  fuzzyQuery += `, carton_id`;
                }
                fuzzyQuery += `
                  FROM tabStockLedger
                  WHERE item_code = ?
                    AND warehouse = ?
                    AND (bin_location LIKE ? OR bin_location LIKE ?)
                  LIMIT 1
                `;
                
                let [fuzzyMatch] = await connection.execute(
                  fuzzyQuery,
                  [itemCode, warehouse, `%${lastTwoParts}%`, `%-${lastTwoParts}`]
                );
                
                if (fuzzyMatch.length > 0) {
                  return fuzzyMatch[0];
                }
              }
              
              // If still no match, return null (will create new record)
              return null;
            };

            // Find matching bin_location in stock ledger
            const stockLedgerEntry = await findMatchingStockLedgerBin(item_code, source_bin, targetWarehouse);
            
            // Use actual bin_location from stock ledger if found, otherwise use source_bin from request
            const actualBinLocation = stockLedgerEntry ? stockLedgerEntry.bin_location : source_bin;
            
            // Get current stock from matched bin (including carton_id if available)
            let stockQuery = `
              SELECT qty, reserved_qty
            `;
            if (hasStockLedgerCartonIdColumn) {
              stockQuery += `, carton_id`;
            }
            stockQuery += `
              FROM tabStockLedger
              WHERE item_code = ?
                AND warehouse = ?
                AND bin_location = ?
            `;

            const [currentStock] = await connection.execute(
              stockQuery,
              [item_code, targetWarehouse, actualBinLocation]
            );
            
            currentQty = currentStock.length > 0 ? parseFloat(currentStock[0].qty) || 0 : 0;
            currentReservedQty = currentStock.length > 0 ? parseFloat(currentStock[0].reserved_qty) || 0 : 0;
            const stockLedgerCartonId = hasStockLedgerCartonIdColumn && currentStock.length > 0
              ? (currentStock[0].carton_id || null)
              : null;
            
            // Validate: Check if sufficient stock available (only when increasing)
            if (!isDecreasing && currentQty < absoluteQty) {
              await connection.rollback();
              return res.status(400).json({
                ok: false,
                error: {
                  code: 'INSUFFICIENT_STOCK',
                  message: `Insufficient stock for ${item_code} at ${source_bin}. Available: ${currentQty}, Required: ${absoluteQty}`
                }
              });
            }
            
            // Calculate new quantity: subtract if increasing, add if decreasing
            newQty = isDecreasing ? currentQty + absoluteQty : currentQty - absoluteQty;
            
            // Store transaction details for Stock Ledger display
            // qty_before = stock before transaction
            // qty_reduced = transaction amount (negative for picking/reduction, positive for increase)
            // qty = remaining stock after transaction
            // IMPORTANT: Use pickedQty (actual transaction qty) not absoluteQty
            const qtyBefore = currentQty;
            const qtyReduced = isDecreasing ? pickedQty : -pickedQty; // Negative for picking (reduction), positive for decrease (stock added back)
            // pickedQty is the actual transaction quantity (e.g., 2 items), not the absolute value
            
            // Check if qty_before and qty_reduced columns exist
            const [qtyColumns] = await connection.execute(`
              SELECT COLUMN_NAME 
              FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'tabStockLedger' 
              AND COLUMN_NAME IN ('qty_before', 'qty_reduced')
            `);
            const hasQtyBefore = qtyColumns.some(col => col.COLUMN_NAME === 'qty_before');
            const hasQtyReduced = qtyColumns.some(col => col.COLUMN_NAME === 'qty_reduced');
            
            // Build stock ledger update query with optional carton_id, qty_before, qty_reduced
            // IMPORTANT: Use actualBinLocation (matched from database) instead of source_bin (from request)
            let insertFields = `item_code, warehouse, bin_location, qty, reserved_qty, last_transaction_date, last_transaction_type, last_transaction_ref, updated_at, created_at`;
            let insertValues = `?, ?, ?, ?, ?, NOW(), 'Picking', ?, NOW(), NOW()`;
            let insertParams = [item_code, targetWarehouse, actualBinLocation, newQty, currentReservedQty, title];
            
            let updateFields = `qty = ?, last_transaction_date = NOW(), last_transaction_type = 'Picking', last_transaction_ref = ?, updated_at = NOW()`;
            let updateParams = [newQty, title];
            
            // Add qty_before if column exists
            if (hasQtyBefore) {
              insertFields += `, qty_before`;
              insertValues += `, ?`;
              insertParams.push(qtyBefore);
              updateFields += `, qty_before = ?`;
              updateParams.push(qtyBefore);
            }
            
            // Add qty_reduced if column exists
            // CRITICAL FIX: Get aggregated qty_change from tabTransactionHistory instead of using incremental value
            // This ensures stock ledger shows total picked quantity (e.g., -5.00) instead of last scan (e.g., -1.00)
            let finalQtyReduced = qtyReduced; // Default to incremental value
            if (hasQtyReduced) {
              // Get aggregated qty_change from tabTransactionHistory (after trigger has aggregated it)
              // The trigger runs AFTER INSERT on tabStockTransaction, so we need to query after inserting
              // We'll update this after inserting the transaction record
              insertFields += `, qty_reduced`;
              insertValues += `, ?`;
              insertParams.push(finalQtyReduced); // Will be updated after transaction insert
              updateFields += `, qty_reduced = ?`;
              updateParams.push(finalQtyReduced); // Will be updated after transaction insert
            }

            // Use carton_id from request if provided, otherwise use from stock ledger
            const finalCartonId = carton_id || stockLedgerCartonId || null;
            
            // Include carton_id if column exists and carton_id is present (from request or stock ledger)
            if (hasStockLedgerCartonIdColumn && finalCartonId) {
              insertFields += `, carton_id`;
              insertValues += `, ?`;
              insertParams.push(finalCartonId);
              updateFields += `, carton_id = ?`;
              updateParams.push(finalCartonId);
            }
            
            // ALWAYS create a transaction log entry (for history/audit trail)
            // This must be done BEFORE updating stock ledger so the aggregation trigger can run
            // Use actualBinLocation for bin_location, but keep source_bin in source_bin field for reference
            // Check if carton_id column exists in tabStockTransaction
            const [cartonIdColumn] = await connection.execute(`
              SELECT COLUMN_NAME 
              FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'tabStockTransaction' 
              AND COLUMN_NAME = 'carton_id'
            `);
            const hasCartonIdColumn = cartonIdColumn.length > 0;
            
            // finalCartonId already declared above (line 1298), reuse it
            
            if (hasCartonIdColumn && finalCartonId) {
              // Insert with carton_id
              await connection.execute(`
                INSERT INTO tabStockTransaction 
                  (transaction_date, transaction_type, reference_doc_type, reference_doc,
                   item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
                   source_bin, target_bin, carton_id, performed_by, created_at)
                VALUES 
                  (NOW(), 'Picking', 'Material Request', ?,
                   ?, ?, ?, ?, ?, ?,
                   ?, NULL, ?, ?, NOW())
              `, [
                title,
                item_code,
                targetWarehouse,
                actualBinLocation, // Use matched bin_location
                qtyReduced, // qty_change (negative for picking)
                qtyBefore, // qty_before
                newQty, // qty_after
                source_bin, // Keep original source_bin from request for reference
                finalCartonId, // carton_id
                normalizedCreatedBy || null // performed_by
              ]);
            } else {
              // Insert without carton_id
              await connection.execute(`
                INSERT INTO tabStockTransaction 
                  (transaction_date, transaction_type, reference_doc_type, reference_doc,
                   item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
                   source_bin, target_bin, performed_by, created_at)
                VALUES 
                  (NOW(), 'Picking', 'Material Request', ?,
                   ?, ?, ?, ?, ?, ?,
                   ?, NULL, ?, NOW())
              `, [
                title,
                item_code,
                targetWarehouse,
                actualBinLocation, // Use matched bin_location
                qtyReduced, // qty_change (negative for picking)
                qtyBefore, // qty_before
                newQty, // qty_after
                source_bin, // Keep original source_bin from request for reference
                normalizedCreatedBy || null // performed_by
              ]);
            }

            // CRITICAL FIX: Get aggregated qty_change from tabTransactionHistory after trigger has aggregated it
            // This ensures stock ledger shows total picked quantity (e.g., -5.00) instead of last scan (e.g., -1.00)
            if (hasQtyReduced) {
              try {
                // Query aggregated qty_change from tabTransactionHistory
                // The trigger aggregates by: item_code, location (bin_location/location_id), carton_id, reference_doc, transaction_type, same day
                const [aggregatedHistory] = await connection.execute(`
                  SELECT 
                    qty_change,
                    qty_before,
                    qty_after
                  FROM tabTransactionHistory
                  WHERE item_code = ?
                    AND warehouse = ?
                    AND (
                      (location_id = ? OR bin_location = ?)
                      OR (location_id IS NULL AND ? IS NULL)
                      OR (bin_location IS NULL AND ? IS NULL)
                    )
                    AND (
                      (carton_id = ?)
                      OR (carton_id IS NULL AND ? IS NULL)
                    )
                    AND reference_doc = ?
                    AND transaction_type = 'Picking'
                    AND DATE(transaction_date) = CURDATE()
                  ORDER BY transaction_date DESC
                  LIMIT 1
                `, [
                  item_code,
                  targetWarehouse,
                  actualBinLocation,
                  actualBinLocation,
                  actualBinLocation,
                  actualBinLocation,
                  finalCartonId,
                  finalCartonId,
                  title
                ]);

                if (aggregatedHistory.length > 0) {
                  // Use aggregated qty_change from transaction history
                  finalQtyReduced = parseFloat(aggregatedHistory[0].qty_change) || qtyReduced;
                  // Also update qty_before from aggregated history (first transaction's qty_before)
                  if (hasQtyBefore && aggregatedHistory[0].qty_before != null) {
                    const aggregatedQtyBefore = parseFloat(aggregatedHistory[0].qty_before);
                    // Update qty_before in insertParams (it's added after item_code, warehouse, bin_location, qty, reserved_qty, title)
                    // insertParams order: [item_code, warehouse, bin_location, newQty, currentReservedQty, title, qty_before?, qty_reduced?]
                    if (hasQtyBefore) {
                      const qtyBeforeIndex = insertParams.length - (hasQtyReduced ? 2 : 1);
                      if (qtyBeforeIndex >= 0 && qtyBeforeIndex < insertParams.length) {
                        insertParams[qtyBeforeIndex] = aggregatedQtyBefore;
                      }
                      // updateParams order: [newQty, title, qty_before?, qty_reduced?]
                      const updateQtyBeforeIndex = updateParams.length - (hasQtyReduced ? 2 : 1);
                      if (updateQtyBeforeIndex >= 0 && updateQtyBeforeIndex < updateParams.length) {
                        updateParams[updateQtyBeforeIndex] = aggregatedQtyBefore;
                      }
                    }
                  }
                  console.log(`[MR Picking] ✅ Using aggregated qty_change from transaction history: ${finalQtyReduced} (incremental was: ${qtyReduced})`);
                } else {
                  console.log(`[MR Picking] ⚠️ No aggregated history found yet, using incremental qty_reduced: ${qtyReduced}`);
                }
              } catch (historyError) {
                console.error(`[MR Picking] ❌ Error fetching aggregated history, using incremental value:`, historyError);
                // Fallback to incremental value if query fails
              }
            }

            // Update stock ledger (decrease from source bin)
            // NOTE: tabStockLedger has UNIQUE KEY on (item_code, warehouse, bin_location)
            // This means it will UPDATE the existing record for that bin, not create a new one
            // This is CORRECT - tabStockLedger shows CURRENT stock at each bin
            // Transaction history is stored in tabStockTransaction table
            // CRITICAL: Update insertParams and updateParams with final aggregated qty_reduced
            if (hasQtyReduced) {
              // Find and update qty_reduced in params
              const qtyReducedIndex = insertParams.length - (hasQtyBefore ? 2 : 1);
              if (qtyReducedIndex >= 0 && qtyReducedIndex < insertParams.length) {
                insertParams[qtyReducedIndex] = finalQtyReduced;
              }
              const updateQtyReducedIndex = updateParams.length - 1;
              if (updateQtyReducedIndex >= 0 && updateQtyReducedIndex < updateParams.length) {
                updateParams[updateQtyReducedIndex] = finalQtyReduced;
              }
            }

            await connection.execute(`
              INSERT INTO tabStockLedger 
                (${insertFields})
              VALUES (${insertValues})
              ON DUPLICATE KEY UPDATE
                ${updateFields}
            `, [...insertParams, ...updateParams]);

            // Update tabCartonStock if carton_id is provided (from request or stock ledger) and tabCartonStock table exists
            if (finalCartonId) {
              const [cartonStockTable] = await connection.execute(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'tabCartonStock'
              `);

              if (cartonStockTable.length > 0) {
                try {
                  // Get current carton stock at the actual bin_location (matched from stock ledger)
                  // IMPORTANT: Use actualBinLocation instead of source_bin to ensure correct matching
                  const [currentCartonStock] = await connection.execute(
                    `SELECT qty, bin_location FROM tabCartonStock 
                     WHERE carton_id = ? AND item_code = ? AND warehouse = ? AND bin_location = ?`,
                    [finalCartonId, item_code, targetWarehouse, actualBinLocation]
                  );

                  const currentCartonQty = currentCartonStock.length > 0 
                    ? parseFloat(currentCartonStock[0].qty) || 0 
                    : 0;
                  
                  // Calculate new quantity: subtract if increasing, add if decreasing
                  const newCartonQty = isDecreasing ? currentCartonQty + absoluteQty : Math.max(0, currentCartonQty - absoluteQty);

                  // Update or insert carton stock (use INSERT ... ON DUPLICATE KEY UPDATE)
                  // IMPORTANT: Use actualBinLocation (matched from database) instead of source_bin (from request)
                  // NOTE: UNIQUE KEY is on (carton_id, item_code, batch_no), so we need to include batch_no (NULL if not provided)
                  // First, try to get existing batch_no if record exists
                  const [existingCartonStock] = await connection.execute(
                    `SELECT batch_no FROM tabCartonStock 
                     WHERE carton_id = ? AND item_code = ? AND bin_location = ? AND warehouse = ?
                     LIMIT 1`,
                    [finalCartonId, item_code, actualBinLocation, targetWarehouse]
                  );
                  
                  const existingBatchNo = existingCartonStock.length > 0 
                    ? (existingCartonStock[0].batch_no || null)
                    : null;
                  
                  // Use existing batch_no if available, otherwise NULL
                  // This ensures ON DUPLICATE KEY UPDATE matches correctly
                  await connection.execute(`
                    INSERT INTO tabCartonStock 
                      (carton_id, item_code, bin_location, warehouse, qty, status, batch_no, updated_at)
                    VALUES (?, ?, ?, ?, ?, 'PUTAWAY', ?, NOW())
                    ON DUPLICATE KEY UPDATE
                      qty = ?,
                      updated_at = NOW(),
                      status = 'PUTAWAY'
                  `, [finalCartonId, item_code, actualBinLocation, targetWarehouse, newCartonQty, existingBatchNo, newCartonQty]);

                  cartonStockUpdated = true;
                  console.log(`[Material Request Picking] 📦 Updated tabCartonStock: carton_id=${finalCartonId}, item=${item_code}, qty=${currentCartonQty} → ${newCartonQty}, bin=${actualBinLocation} (matched from stock ledger, original: ${source_bin})`);
                } catch (cartonStockError) {
                  console.warn(`[Material Request Picking] ⚠️ Could not update tabCartonStock: ${cartonStockError.message}`);
                  // Don't fail the transaction - stock ledger is already updated
                }
              }
            }
          }
          
          // NOTE: Transaction log entry already created above (line 1324-1343)
          // No need to insert again here - this was causing duplicate entries
          
          stockUpdates.push({
            item_code,
            carton_id: carton_id || null,
            source_bin,
            qty_reduced: isDecreasing ? -absoluteQty : absoluteQty, // Negative if decreasing (stock added back)
            qty_before: currentQty,
            qty_after: newQty,
            carton_stock_updated: cartonStockUpdated
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
      // REMOVED: Auto-status changes - status is now managed manually via update-status endpoint
      // Status changes are handled by:
      // 1. User clicks "Start Picking" → POST /api/material-requests/:title/update-status { "status": "In Progress" }
      // 2. User clicks "Complete Picking" → POST /api/material-requests/:title/update-status { "status": "Picked" }
      // This allows multiple users to pick items without automatic status changes
      
      // Post stock updates (rebuild summaries from ledger)
      // This is the ONLY place that should update tabItem.stock_qty to ensure consistency
      // The stock posting service will:
      // 1. Rebuild item stock summary from tabStockLedger/tabCartonStock (across ALL warehouses)
      // 2. Rebuild bin stock summary
      // 3. Ensure all stock quantities are consistent
      // NOTE: Do NOT pass warehouse filter - tabItem.stock_qty should be total across ALL warehouses
      const itemCodes = [...new Set(items.map(item => item.item_code).filter(Boolean))];
      try {
        // Generate unique posting key per API call to allow multiple picks for same MR
        // Use timestamp + item codes to ensure uniqueness while maintaining idempotency within same call
        const timestamp = Date.now();
        const uniqueTransactionId = `${title}:${timestamp}:${itemCodes.sort().join(',')}`;
        const postingResult = await postStock('MR_PICK', uniqueTransactionId, {
          itemCodes,
          warehouse: null, // Don't filter by warehouse - calculate total across all warehouses
          postedBy: normalizedCreatedBy,
          connection // Use existing transaction
        });
        
        if (postingResult.posted) {
          console.log(`✅ Stock posted for Material Request ${title}: ${postingResult.affectedItems.length} items updated`);
        } else {
          console.log(`⏭️  Stock posting skipped for ${title}: ${postingResult.reason}`);
        }
      } catch (postingError) {
        console.error(`⚠️  Stock posting failed for Material Request ${title}:`, postingError);
        // Don't fail the entire operation, but log the error
      }
      
      await connection.commit();
      
      res.json({
        ok: true,
        message: 'Material Request items picked successfully',
        data: {
          material_request: title,
          status: newStatus,
          total_picked_qty: newTotalPicked,
          items_picked: stockUpdates.length,
          carton_stock_updated: stockUpdates.some(s => s.carton_stock_updated),
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

/**
 * GET /api/material-requests/:title/picking-status
 * Get picking status for Material Request (check if all items are fully picked)
 * 
 * Response:
 * {
 *   "ok": true,
 *   "data": {
 *     "title": "MR-123459",
 *     "total_items": 5,
 *     "fully_picked_items": 5,
 *     "all_items_fully_picked": true,
 *     "pending_items": []
 *   }
 * }
 */
export const getPickingStatus = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    
    // Check if Material Request exists
    const [mrRows] = await connection.execute(
      'SELECT title FROM tabMaterialRequest WHERE title = ?',
      [title]
    );
    
    if (mrRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Material Request ${title} not found`
        }
      });
    }
    
    // Get all items with picking status
    const [itemRows] = await connection.execute(
      `SELECT 
        item_code,
        requested_qty,
        COALESCE(picked_qty, 0) as picked_qty,
        (requested_qty - COALESCE(picked_qty, 0)) as remaining_qty
      FROM tabMaterialRequestItem
      WHERE parent_title = ?
      ORDER BY item_code`,
      [title]
    );
    
    const totalItems = itemRows.length;
    const fullyPickedItems = itemRows.filter(item => 
      parseFloat(item.picked_qty) >= parseFloat(item.requested_qty)
    ).length;
    const allItemsFullyPicked = fullyPickedItems === totalItems && totalItems > 0;
    
    const pendingItems = itemRows.filter(item => 
      parseFloat(item.picked_qty) < parseFloat(item.requested_qty)
    );
    
    res.json({
      ok: true,
      data: {
        title: title,
        total_items: totalItems,
        fully_picked_items: fullyPickedItems,
        all_items_fully_picked: allItemsFullyPicked,
        pending_items: pendingItems.map(item => ({
          item_code: item.item_code,
          requested_qty: parseFloat(item.requested_qty),
          picked_qty: parseFloat(item.picked_qty),
          remaining_qty: parseFloat(item.remaining_qty)
        }))
      }
    });
  } catch (error) {
    console.error('Failed to get picking status:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to get picking status',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};
