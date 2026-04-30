// wms-api/src/modules/boxes/boxController.js
// Box operations

import { getConnection } from '../../db/connection.js';

/** @returns {Promise<object>} column flags for SORT_TO_BOX reads */
export async function getWmsScanEventSortColumns(connection) {
  const [eventColumns] = await connection.execute(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabWmsScanEvent'
      AND COLUMN_NAME IN (
        'advance_shipping_notice', 'asn_no', 'carton_id', 'item_code', 'qty',
        'user_id', 'event_time', 'box_id', 'created_at'
      )
  `);
  const eventCols = new Set(eventColumns.map((r) => r.COLUMN_NAME));
  return {
    asnCol: eventCols.has('asn_no') ? 'asn_no' : 'advance_shipping_notice',
    hasAsnCol: eventCols.has('asn_no') || eventCols.has('advance_shipping_notice'),
    hasCartonId: eventCols.has('carton_id'),
    hasItemCode: eventCols.has('item_code'),
    hasQty: eventCols.has('qty'),
    hasUserId: eventCols.has('user_id'),
    hasEventTime: eventCols.has('event_time'),
    hasBoxId: eventCols.has('box_id'),
    hasCreatedAt: eventCols.has('created_at'),
  };
}

function formatSortedOn(d) {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}`;
}

/**
 * Same merge rules as desktop SortBoxService.GetBoxContentsAsync (WMS.Desktop):
 * ORDER BY event_time DESC; group (item_code, carton_id); sum qty; latest event wins for sorted_on / sorted_by.
 * @param {Array<{ item_code: string, carton_id?: string|null, qty: any, event_time: Date, user_id?: string|null }>} events rows already newest-first per box
 * @param {boolean} hasCartonId
 * @returns {Array<{ item_code: string, source_carton: string|null, scanned_qty: number, sorted_on: Date, sorted_by: string }>}
 */
function mergeSortToBoxEventsDesktopOrderDesc(events, hasCartonId) {
  const map = new Map();
  for (const row of events) {
    const itemCode = row.item_code;
    if (!itemCode) continue;
    const cartonId =
      hasCartonId && row.carton_id != null && row.carton_id !== ''
        ? String(row.carton_id)
        : null;
    const qty = parseFloat(row.qty) || 0;
    const eventTime =
      row.event_time instanceof Date ? row.event_time : new Date(row.event_time);
    const userId = row.user_id != null ? String(row.user_id) : '';
    const key = `${itemCode}\0${cartonId ?? ''}`;
    if (map.has(key)) {
      const existing = map.get(key);
      map.set(key, {
        item_code: itemCode,
        source_carton: cartonId,
        scanned_qty: existing.scanned_qty + qty,
        sorted_on:
          eventTime > existing.sorted_on ? eventTime : existing.sorted_on,
        sorted_by:
          eventTime > existing.sorted_on ? userId : existing.sorted_by,
      });
    } else {
      map.set(key, {
        item_code: itemCode,
        source_carton: cartonId,
        scanned_qty: qty,
        sorted_on: eventTime,
        sorted_by: userId,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    (a.item_code || '').localeCompare(b.item_code || '')
  );
}

/**
 * Desktop-identical "Box Contents" lines from SORT_TO_BOX (single box_id).
 */
export async function getSortToBoxContentsDesktop(connection, boxId, cols) {
  if (!cols.hasBoxId || !cols.hasItemCode || !cols.hasQty) {
    return [];
  }
  const timeCol = cols.hasEventTime
    ? 'event_time'
    : cols.hasCreatedAt
      ? 'created_at'
      : null;
  if (!timeCol) {
    return [];
  }
  const hasCartonId = cols.hasCartonId;
  const [events] = await connection.execute(
    `
    SELECT item_code,
           ${hasCartonId ? 'carton_id' : 'NULL AS carton_id'},
           qty,
           ${timeCol} AS event_time,
           ${cols.hasUserId ? 'user_id' : 'NULL AS user_id'}
    FROM tabWmsScanEvent
    WHERE event_type = 'SORT_TO_BOX'
      AND box_id = ?
      AND item_code IS NOT NULL
    ORDER BY ${timeCol} DESC
  `,
    [boxId]
  );
  return mergeSortToBoxEventsDesktopOrderDesc(events, hasCartonId);
}

/**
 * units_scanned + item_count per box using the same merge as desktop (not raw SQL DISTINCT).
 */
async function getBoxScanStatsDesktopBatch(connection, boxIds, cols) {
  const map = new Map();
  for (const id of boxIds) {
    map.set(id, { units_scanned: 0, item_count: 0 });
  }
  if (!boxIds.length || !cols.hasBoxId || !cols.hasItemCode || !cols.hasQty) {
    return map;
  }
  const timeCol = cols.hasEventTime
    ? 'event_time'
    : cols.hasCreatedAt
      ? 'created_at'
      : null;
  if (!timeCol) {
    return map;
  }
  const hasCartonId = cols.hasCartonId;
  const placeholders = boxIds.map(() => '?').join(',');
  const [allEvents] = await connection.execute(
    `
    SELECT box_id,
           item_code,
           ${hasCartonId ? 'carton_id' : 'NULL AS carton_id'},
           qty,
           ${timeCol} AS event_time,
           ${cols.hasUserId ? 'user_id' : 'NULL AS user_id'}
    FROM tabWmsScanEvent
    WHERE event_type = 'SORT_TO_BOX'
      AND item_code IS NOT NULL
      AND box_id IN (${placeholders})
    ORDER BY box_id ASC, ${timeCol} DESC
  `,
    boxIds
  );
  const byBox = new Map();
  for (const e of allEvents) {
    if (!byBox.has(e.box_id)) {
      byBox.set(e.box_id, []);
    }
    byBox.get(e.box_id).push(e);
  }
  for (const id of boxIds) {
    const evs = byBox.get(id) || [];
    const lines = mergeSortToBoxEventsDesktopOrderDesc(evs, hasCartonId);
    const units = lines.reduce((s, l) => s + (Number(l.scanned_qty) || 0), 0);
    map.set(id, { units_scanned: units, item_count: lines.length });
  }
  return map;
}

/**
 * Latest tc_id from item-level PACK_BOX_TO_TC per box (first row wins when ordered newest-first).
 * @returns {Promise<Map<string, string>>}
 */
async function getLatestPackedTcByBoxIds(connection, boxIds) {
  const map = new Map();
  if (!boxIds.length) {
    return map;
  }
  const [colCheck] = await connection.execute(`
    SELECT COUNT(*) AS c
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabWmsScanEvent'
      AND COLUMN_NAME = 'tc_id'
  `);
  if (!colCheck[0]?.c) {
    return map;
  }
  const placeholders = boxIds.map(() => '?').join(',');
  const [evs] = await connection.execute(
    `
    SELECT box_id, tc_id, event_time
    FROM tabWmsScanEvent
    WHERE event_type = 'PACK_BOX_TO_TC'
      AND item_code IS NOT NULL
      AND box_id IN (${placeholders})
    ORDER BY event_time DESC
  `,
    boxIds
  );
  for (const ev of evs) {
    if (ev.tc_id && !map.has(ev.box_id)) {
      map.set(ev.box_id, String(ev.tc_id));
    }
  }
  return map;
}

/** ORDER BY for tabSortBox list (schema may use created_on or created_at). */
async function getTabSortBoxOrderColumn(connection) {
  const [cols] = await connection.execute(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabSortBox'
      AND COLUMN_NAME IN ('created_on', 'created_at')
  `);
  const set = new Set(cols.map((r) => r.COLUMN_NAME));
  if (set.has('created_on')) return 'created_on';
  if (set.has('created_at')) return 'created_at';
  return 'box_id';
}

/**
 * POST /api/boxes/create
 * POST /api/sort-box/create (alias)
 * Create a new sort box
 * 
 * Request Body (Mobile App Format):
 * {
 *   "asn_no": "ASN-0001",
 *   "to_no": "TO-0001",
 *   "store": "STORE-001",
 *   "purpose": "STORE",
 *   "user_id": "USER-001"
 * }
 * 
 * OR (Desktop App Format):
 * {
 *   "box_id": "BOX-001",
 *   "advance_shipping_notice": "ASN-0001",
 *   "transfer_order": "TO-0001",
 *   "store": "STORE-001",
 *   "purpose": "STORE",
 *   "created_by": "USER-001"
 * }
 * 
 * OR (Transfer In Format - carton_id as box_id):
 * {
 *   "box_id": "CTN-TI-123457-20260120-160936-988",  // Carton ID (generated ID)
 *   "advance_shipping_notice": "INSLIP-123457",
 *   "store": "WH-MAIN",
 *   "purpose": "PUTAWAY",
 *   "created_by": "USER-001"
 * }
 * 
 * Note: For Transfer In Putaway, box_id should be the carton_id (e.g., CTN-TI-*)
 */
export const createBox = async (req, res) => {
  // Support both mobile app format (asn_no, to_no, user_id) and desktop format (advance_shipping_notice, transfer_order, created_by, box_id)
  // Also supports Transfer In format where box_id = carton_id (e.g., CTN-TI-123457-20260120-160936-988)
  const {
    // Mobile app format
    asn_no,
    to_no,
    user_id,
    // Desktop app format
    box_id: providedBoxId,
    advance_shipping_notice,
    transfer_order,
    created_by,
    // Transfer In format - carton_id can be passed as box_id
    carton_id, // For Transfer In, carton_id is used as box_id
    // Common fields
    store,
    purpose // Will default to PUTAWAY if carton_id provided, otherwise STORE
  } = req.body;
  
  // For Transfer In: if carton_id is provided, use it as box_id
  const finalBoxId = providedBoxId || carton_id;

  // Normalize field names (prefer mobile app format, fallback to desktop format)
  const normalizedASN = asn_no || advance_shipping_notice;
  let normalizedTO = to_no || transfer_order;
  const normalizedCreatedBy = user_id || created_by;

  // Validation
  if (!normalizedASN || !store || !normalizedCreatedBy) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'asn_no (or advance_shipping_notice), store, and user_id (or created_by) are required'
      }
    });
  }

  const connection = await getConnection();

  try {
    // Auto-populate Transfer Order from ASN if not provided
    if ((!normalizedTO || normalizedTO.trim() === '') && normalizedASN) {
      try {
        const [toRows] = await connection.execute(
          `SELECT title FROM tabTransferOrder WHERE advance_shipping_notice = ? LIMIT 1`,
          [normalizedASN]
        );
        if (toRows.length > 0) {
          normalizedTO = toRows[0].title;
          console.log(`📋 Auto-populated transfer_order "${normalizedTO}" for ASN "${normalizedASN}"`);
        }
      } catch (toError) {
        console.warn(`Could not auto-populate transfer_order for ASN ${normalizedASN}:`, toError.message);
      }
    }

    // Look up store in tabWarehouse table to check warehouse_type
    // Store code from request (e.g., "WH-MAIN", "STORE-001")
    const [storeInfo] = await connection.execute(
      'SELECT warehouse_type FROM tabWarehouse WHERE code = ?',
      [store]
    );

    if (storeInfo.length === 0) {
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Store ${store} not found in warehouse master table`
        }
      });
    }

    const warehouseType = storeInfo[0].warehouse_type;
    const isWarehouse = warehouseType === 'Warehouse';

    // Only validate to_no for stores (warehouse_type = "Store"), not for warehouses
    if (!isWarehouse && (!normalizedTO || normalizedTO.trim() === '')) {
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'to_no (or transfer_order) is required for distribution stores'
        }
      });
    }

    // Auto-generate box_id if not provided (format: BOX-{STORE}-{TIMESTAMP})
    // Note: For Transfer In, box_id should be the carton_id (already set above if carton_id was provided)
    let boxIdToUse = finalBoxId;
    if (!boxIdToUse) {
      const timestamp = Date.now();
      const storeCode = store.replace(/[^A-Z0-9]/g, '').substring(0, 10); // Clean store code
      boxIdToUse = `BOX-${storeCode}-${timestamp.toString().slice(-6)}`;
    }
    
    // Use the determined purpose (PUTAWAY for Transfer In if carton_id provided, otherwise STORE or provided value)
    const finalPurpose = purpose || (carton_id ? 'PUTAWAY' : 'STORE');

    // Convert empty string to empty string (not null) for database
    // IMPORTANT: transfer_order column has NOT NULL constraint, so use empty string "" instead of null
    const toNoValue = normalizedTO && normalizedTO.trim() !== '' ? normalizedTO.trim() : '';

    // Insert box
    await connection.execute(`
      INSERT INTO tabSortBox 
        (box_id, status, advance_shipping_notice, transfer_order, store, purpose, created_by, created_on)
      VALUES (?, 'Open', ?, ?, ?, ?, ?, NOW())
    `, [boxIdToUse, normalizedASN, toNoValue, store, finalPurpose, normalizedCreatedBy]);

    res.json({
      ok: true,
      message: 'Box created successfully',
      box_id: boxIdToUse, // Return at root level for mobile app compatibility
      status: 'Open',
      data: {
        box_id: boxIdToUse,
        status: 'Open',
        purpose: finalPurpose,
        // Include carton_id if it was used as box_id (for Transfer In)
        ...(carton_id && { carton_id: carton_id })
      }
    });

  } catch (error) {
    console.error('Failed to create box:', error);
    
    // Handle duplicate key error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        error: {
          code: 'DUPLICATE_ENTRY',
          message: `Box already exists`
        }
      });
    }

    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to create box',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/boxes/close
 * Close a sort box
 * 
 * Request Body:
 * {
 *   "box_id": "BOX-001",
 *   "closed_by": "USER-001"
 * }
 * 
 * Enhanced: Automatically creates putaway task if box destination store has warehouse_type = 'Warehouse'
 */
export const closeBox = async (req, res) => {
  const { box_id, closed_by } = req.body;

  // Validation
  if (!box_id) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'box_id is required'
      }
    });
  }

  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    // Get box details
    const [boxRows] = await connection.execute(`
      SELECT 
        box_id, 
        advance_shipping_notice as asn_no, 
        transfer_order as to_no,
        store, 
        status, 
        purpose
      FROM tabSortBox 
      WHERE box_id = ?
    `, [box_id]);

    if (boxRows.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: 'BOX_NOT_FOUND',
          message: `Box ${box_id} not found`
        }
      });
    }

    const box = boxRows[0];

    // Update box status to Closed
    await connection.execute(`
      UPDATE tabSortBox 
      SET status = 'Closed',
          closed_by = ?,
          closed_on = NOW()
      WHERE box_id = ?
    `, [closed_by || null, box_id]);

    // Check if store is a warehouse (MANDATORY: use ONLY warehouse_type = 'Warehouse')
    const [warehouseRows] = await connection.execute(
      `SELECT warehouse_type FROM tabWarehouse WHERE code = ?`,
      [box.store]
    );

    let putawayTaskId = null;
    let linesCreated = 0; // Track lines created for response
    const isWarehouseBox = warehouseRows.length > 0 && warehouseRows[0].warehouse_type === 'Warehouse';

    console.log(`[closeBox] Box ${box_id}: store=${box.store}, isWarehouseBox=${isWarehouseBox}, warehouse_type=${warehouseRows.length > 0 ? warehouseRows[0].warehouse_type : 'N/A'}`);

    if (isWarehouseBox) {
      try {
        // Create putaway task automatically for warehouse boxes
        // Generate putaway task ID: PUT-YYYYMMDD-XXXX
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        
        // Get next sequence number for today
        const [existingTasks] = await connection.execute(
          `SELECT title FROM tabPutawayTask WHERE title LIKE ? ORDER BY title DESC LIMIT 1`,
          [`PUT-${dateStr}-%`]
        );

        let sequence = 1;
        if (existingTasks.length > 0) {
          const lastTask = existingTasks[0].title;
          const lastSeq = parseInt(lastTask.substring(lastTask.length - 4)) || 0;
          sequence = lastSeq + 1;
        }

        putawayTaskId = `PUT-${dateStr}-${String(sequence).padStart(4, '0')}`;
        console.log(`[closeBox] Generated putaway task ID: ${putawayTaskId} for box ${box_id}`);

        // Get inbound session (optional for warehouse boxes - they may not go through inbound flow)
        let inboundSession = null;
        if (box.asn_no) {
          try {
            const [sessionRows] = await connection.execute(`
              SELECT inbound_session
              FROM tabInboundSession
              WHERE asn_no = ?
              ORDER BY started_at DESC
              LIMIT 1
            `, [box.asn_no]);
            if (sessionRows.length > 0) {
              inboundSession = sessionRows[0].inbound_session;
            }
          } catch (sessionError) {
            console.warn(`[closeBox] Could not fetch inbound session for ASN ${box.asn_no}:`, sessionError.message);
            // Continue without inbound session - it's optional for warehouse boxes
          }
        }
        
        // Provide default inbound_session if none found (required for desktop app compatibility)
        if (!inboundSession) {
          inboundSession = box.asn_no ? `ASN-${box.asn_no}` : 'WAREHOUSE-PUTAWAY';
        }

        // Check if source_type column exists
        const [columns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabPutawayTask' 
          AND COLUMN_NAME = 'source_type'
        `);
        const hasSourceType = columns.length > 0;

        // Check if box_id column exists
        const [boxIdColumns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabPutawayTask' 
          AND COLUMN_NAME = 'box_id'
        `);
        const hasBoxId = boxIdColumns.length > 0;

        console.log(`[closeBox] Table columns: hasSourceType=${hasSourceType}, hasBoxId=${hasBoxId}, inboundSession=${inboundSession || 'NULL'}`);

        // Determine source_type: If box has ASN, use 'ASN', otherwise use 'Box'
        // This ensures ASN boxes appear in putaway task list when filtered by source_type='ASN'
        const sourceType = box.asn_no ? 'ASN' : 'Box';
        console.log(`[closeBox] Determined source_type: ${sourceType} (box.asn_no=${box.asn_no || 'NULL'})`);

        // Create putaway task
        if (hasSourceType && hasBoxId) {
          await connection.execute(`
            INSERT INTO tabPutawayTask 
            (title, status, source_type, box_id, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
            VALUES (?, 'Open', ?, ?, ?, ?, ?, NOW(), NOW())
          `, [putawayTaskId, sourceType, box_id, box.asn_no || null, inboundSession, closed_by || 'SYSTEM']);
          console.log(`[closeBox] Created putaway task with source_type='${sourceType}' and box_id columns`);
        } else if (hasSourceType) {
          await connection.execute(`
            INSERT INTO tabPutawayTask 
            (title, status, source_type, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
            VALUES (?, 'Open', ?, ?, ?, ?, NOW(), NOW())
          `, [putawayTaskId, sourceType, box.asn_no || null, inboundSession, closed_by || 'SYSTEM']);
          console.log(`[closeBox] Created putaway task with source_type='${sourceType}' column only`);
        } else if (hasBoxId) {
          await connection.execute(`
            INSERT INTO tabPutawayTask 
            (title, status, box_id, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
            VALUES (?, 'Open', ?, ?, ?, ?, NOW(), NOW())
          `, [putawayTaskId, box_id, box.asn_no || null, inboundSession, closed_by || 'SYSTEM']);
          console.log(`[closeBox] Created putaway task with box_id column only (source_type column not available)`);
        } else {
          await connection.execute(`
            INSERT INTO tabPutawayTask 
            (title, status, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
            VALUES (?, 'Open', ?, ?, ?, NOW(), NOW())
          `, [putawayTaskId, box.asn_no || null, inboundSession, closed_by || 'SYSTEM']);
          console.log(`[closeBox] Created putaway task without source_type or box_id columns`);
        }

        // Get items from box (from tabWmsScanEvent where event_type = 'SORT_TO_BOX')
        // CRITICAL FIX: Group by item_code and box_id (not carton_id) for warehouse boxes
        // Use box_id as carton_id when inserting lines (required for warehouse boxes)
        // Handle case-insensitive box_id comparison and NULL carton_id
        
        // First, let's check if any events exist for this box (for debugging)
        const [debugEvents] = await connection.execute(`
          SELECT 
            event_type, 
            COUNT(*) as event_count,
            COUNT(DISTINCT item_code) as distinct_items,
            GROUP_CONCAT(DISTINCT box_id) as box_ids
          FROM tabWmsScanEvent
          WHERE box_id = ? OR UPPER(TRIM(box_id)) = UPPER(TRIM(?))
          GROUP BY event_type
        `, [box_id, box_id]);
        
        console.log(`[closeBox] 🔍 Debug: Events for box ${box_id}:`, JSON.stringify(debugEvents, null, 2));
        
        // Query for items
        const [boxItems] = await connection.execute(`
          SELECT 
            item_code, 
            SUM(qty) as total_qty,
            box_id
          FROM tabWmsScanEvent
          WHERE UPPER(TRIM(box_id)) = UPPER(TRIM(?))
            AND event_type = 'SORT_TO_BOX'
            AND item_code IS NOT NULL
            AND item_code != ''
          GROUP BY item_code, box_id
          HAVING SUM(qty) > 0
        `, [box_id]);

        console.log(`[closeBox] ✅ Found ${boxItems.length} items in box ${box_id}`);
        
        // Log detailed item info for debugging
        if (boxItems.length > 0) {
          console.log(`[closeBox] 📦 Items found:`, JSON.stringify(boxItems, null, 2));
        } else {
          console.warn(`[closeBox] ⚠️ No items found in tabWmsScanEvent for box ${box_id}`);
          
          // Additional diagnostic: Check raw events
          const [rawEvents] = await connection.execute(`
            SELECT 
              id, event_type, item_code, qty, box_id, created_at
            FROM tabWmsScanEvent
            WHERE box_id = ? OR UPPER(TRIM(box_id)) = UPPER(TRIM(?))
            ORDER BY created_at DESC
            LIMIT 10
          `, [box_id, box_id]);
          
          console.log(`[closeBox] 🔍 Raw events for box ${box_id}:`, JSON.stringify(rawEvents, null, 2));
          console.warn(`[closeBox] ⚠️ This may indicate events are not synced yet. Events must be synced BEFORE closing box.`);
        }

        // Verify putaway task exists before creating lines
        const [taskVerify] = await connection.execute(
          `SELECT title FROM tabPutawayTask WHERE title = ?`,
          [putawayTaskId]
        );
        
        if (taskVerify.length === 0) {
          console.error(`[closeBox] ❌ CRITICAL: Putaway task ${putawayTaskId} was not found in database!`);
          throw new Error(`Putaway task ${putawayTaskId} does not exist`);
        }
        
        console.log(`[closeBox] ✅ Verified putaway task exists: ${putawayTaskId}`);
        
        // Create putaway task lines
        linesCreated = 0; // Reset for this task
        const linesErrors = [];
        
        for (const item of boxItems) {
          const itemCode = item.item_code?.trim();
          // CRITICAL FIX: Use box_id as carton_id for warehouse boxes (not carton_id from events)
          // This is required because warehouse boxes use box_id as the carton identifier
          const cartonIdForLine = box_id; // Always use box_id as carton_id for warehouse box lines
          const qty = parseFloat(item.total_qty) || 0;

          if (!itemCode || itemCode === '') {
            console.warn(`[closeBox] ⚠️ Skipping item with empty item_code in box ${box_id}`);
            continue;
          }

          if (qty <= 0) {
            console.warn(`[closeBox] ⚠️ Skipping item ${itemCode} with qty ${qty} <= 0 in box ${box_id}`);
            continue;
          }

          try {
            // Use empty string for rack and bin if they're NOT NULL columns
            // They will be updated when location is scanned
            // Debug: Log what we're trying to insert
            console.log(`[closeBox] 🔍 Attempting to insert line:`, {
              parent_title: putawayTaskId,
              item_code: itemCode,
              carton_id: cartonIdForLine,
              qty: qty
            });
            
            const insertResult = await connection.execute(`
              INSERT INTO tabPutawayLine
              (parent_title, item_code, carton_id, qty, rack, bin, created_at, updated_at)
              VALUES (?, ?, ?, ?, '', '', NOW(), NOW())
            `, [putawayTaskId, itemCode, cartonIdForLine, qty]);
            
            // Verify the insert actually worked by checking affected rows
            if (insertResult[0]?.affectedRows > 0) {
              linesCreated++;
              console.log(`[closeBox] ✅ Created line: ${itemCode} (qty: ${qty}, carton_id: ${cartonIdForLine}) - Insert ID: ${insertResult[0].insertId}`);
              
              // Double-check by querying the database
              const [verifyRows] = await connection.execute(`
                SELECT id, item_code, qty FROM tabPutawayLine 
                WHERE parent_title = ? AND item_code = ? AND carton_id = ?
              `, [putawayTaskId, itemCode, cartonIdForLine]);
              
              if (verifyRows.length === 0) {
                console.error(`[closeBox] ❌ CRITICAL: Line insert reported success but line not found in database!`);
                throw new Error(`Line insert failed verification for ${itemCode}`);
              } else {
                console.log(`[closeBox] ✅ Verified line exists in database: ID ${verifyRows[0].id}`);
              }
            } else {
              console.error(`[closeBox] ❌ Insert reported 0 affected rows for ${itemCode}`);
              throw new Error(`INSERT affected 0 rows for ${itemCode}`);
            }
          } catch (lineError) {
            // Log full error details
            console.error(`[closeBox] ❌ ERROR inserting line for ${itemCode}:`, {
              code: lineError.code,
              errno: lineError.errno,
              sqlState: lineError.sqlState,
              sqlMessage: lineError.sqlMessage,
              message: lineError.message,
              stack: lineError.stack
            });
            
            // If duplicate entry, that's okay (might have been created already)
            if (lineError.code === 'ER_DUP_ENTRY') {
              console.warn(`[closeBox] ⚠️ Line already exists for ${itemCode} in task ${putawayTaskId}, skipping`);
              // Verify it actually exists
              const [existingRows] = await connection.execute(`
                SELECT id FROM tabPutawayLine 
                WHERE parent_title = ? AND item_code = ? AND carton_id = ?
              `, [putawayTaskId, itemCode, cartonIdForLine]);
              
              if (existingRows.length > 0) {
                linesCreated++; // Count as success if it really exists
                console.log(`[closeBox] ✅ Verified existing line: ID ${existingRows[0].id}`);
              } else {
                console.error(`[closeBox] ❌ CRITICAL: Duplicate error but line doesn't exist!`);
                linesErrors.push({ item_code: itemCode, error: `Duplicate entry but line not found: ${lineError.message}` });
              }
            } else {
              const errorMsg = `Failed to create line for ${itemCode}: ${lineError.message} (code: ${lineError.code})`;
              console.error(`[closeBox] ❌ ${errorMsg}`);
              linesErrors.push({ item_code: itemCode, error: errorMsg });
              // Continue with other items even if one fails
            }
          }
        }

        // Log summary and throw error if no lines created
        if (linesCreated === 0 && boxItems.length === 0) {
          console.error(`[closeBox] ❌ ERROR: Putaway task ${putawayTaskId} created but NO items found for box ${box_id}`);
          console.error(`[closeBox] ❌ Events must be synced to tabWmsScanEvent BEFORE closing box.`);
          console.error(`[closeBox] ❌ Please sync SORT_TO_BOX events for box ${box_id} and try again.`);
          
          // Rollback the transaction since we can't create putaway without items
          await connection.rollback();
          connection.release();
          return res.status(400).json({
            ok: false,
            error: {
              code: 'NO_ITEMS_FOUND',
              message: `Cannot create putaway task: No items found in box ${box_id}`,
              details: `Events must be synced to tabWmsScanEvent before closing box. Please sync SORT_TO_BOX events first.`
            }
          });
        } else if (linesCreated < boxItems.length) {
          console.warn(`[closeBox] ⚠️ WARNING: Created ${linesCreated} out of ${boxItems.length} lines for box ${box_id}`);
          if (linesErrors.length > 0) {
            console.error(`[closeBox] ❌ Line creation errors:`, linesErrors);
          }
        } else {
          console.log(`[closeBox] ✅ Successfully created putaway task ${putawayTaskId} for warehouse box ${box_id} with ${linesCreated} line(s)`);
        }
        
        // Final verification: Query database to confirm lines actually exist
        const [finalVerify] = await connection.execute(`
          SELECT COUNT(*) as count FROM tabPutawayLine WHERE parent_title = ?
        `, [putawayTaskId]);
        
        const actualLineCount = finalVerify[0]?.count || 0;
        console.log(`[closeBox] 🔍 Final verification: linesCreated=${linesCreated}, actualLinesInDB=${actualLineCount}`);
        
        if (actualLineCount !== linesCreated) {
          console.error(`[closeBox] ❌ MISMATCH: Expected ${linesCreated} lines but found ${actualLineCount} in database!`);
          // Update linesCreated to actual count for accurate response
          linesCreated = actualLineCount;
        }
        
        // Store errors for response if any
        if (linesErrors.length > 0) {
          console.error(`[closeBox] ❌ Some lines failed to create:`, linesErrors);
        }
      } catch (error) {
        console.error(`[closeBox] ❌ ERROR creating putaway task for box ${box_id}:`, error);
        console.error(`[closeBox] ❌ Error stack:`, error.stack);
        // Don't fail the box close operation if putaway task creation fails
        // Log the error but continue
        putawayTaskId = null;
      }
    }

    await connection.commit();

    const response = {
      ok: true,
      box_id: box_id,
      status: 'Closed',
      message: isWarehouseBox 
        ? `Box closed successfully. Putaway task created with ${linesCreated} line(s).`
        : 'Box closed successfully'
    };

    if (isWarehouseBox && putawayTaskId) {
      response.putaway_task = putawayTaskId;
      response.lines_count = linesCreated;
    }

    res.json(response);

  } catch (error) {
    await connection.rollback();
    console.error('Failed to close box:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to close box',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/boxes
 * Get boxes filtered by ASN, store, and optionally status
 * 
 * Query Parameters:
 * - asn (required): ASN number (e.g., "ASN-0001")
 * - store (required): Store identifier (e.g., "STORE-001" or "WAREHOUSE")
 * - status (optional): Filter by status (e.g., "Open", "Filling", "Closed")
 * 
 * Example:
 * GET /api/boxes?asn=ASN-0001&store=STORE-001&status=Open
 * 
 * Rows come from tabSortBox (WHERE advance_shipping_notice + store).
 * units_scanned / item_count use desktop SortBoxService.GetBoxContentsAsync merge on SORT_TO_BOX.
 *
 * Response (each element):
 * {
 *   "box_id": "PUT-1001011",
 *   "asn_no": "WMS-ASN-EXT-00006",
 *   "store": "004-ALRAS",
 *   "status": "Open",
 *   "created_by": "TESTUSER2",
 *   "created_on": "2026-04-26 13:19",
 *   "units_scanned": 4,
 *   "item_count": 4,
 *   "packed_tc_id": null,
 *   "pack_eligible": true,
 *   "pack_block_reason": null
 * }
 */
export const getBoxes = async (req, res) => {
  const { asn, store, status, bin_location, bin_code } = req.query;

  // If bin_location or bin_code is provided, this might be a bin scan request
  // Redirect to bin-master API or return helpful error
  if (bin_location || bin_code) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'INVALID_ENDPOINT',
        message: 'For bin scanning/validation, use GET /api/master/bin-master/:bin_code instead of GET /api/boxes',
        suggestion: `Use: GET /api/master/bin-master/${bin_location || bin_code}`
      }
    });
  }

  // Validation: asn and store are required for getting boxes
  if (!asn || !store) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'asn and store query parameters are required for getting boxes',
        details: {
          provided: { asn: asn || null, store: store || null },
          required: ['asn', 'store'],
          note: 'If you are trying to scan/validate a bin location, use GET /api/master/bin-master/:bin_code instead'
        }
      }
    });
  }

  const connection = await getConnection();

  try {
    // Main source: tabSortBox only (same as desktop / SQL you specified).
    const orderCol = await getTabSortBoxOrderColumn(connection);
    let query = `
      SELECT *
      FROM tabSortBox
      WHERE advance_shipping_notice = ?
        AND store = ?
    `;
    const queryParams = [asn, store];

    if (status) {
      query += ' AND status = ?';
      queryParams.push(status);
    }

    query += ` ORDER BY \`${orderCol}\` DESC`;

    const [rows] = await connection.execute(query, queryParams);

    const sortCols = await getWmsScanEventSortColumns(connection);
    const boxIds = rows.map((r) => r.box_id);
    const scanStats = await getBoxScanStatsDesktopBatch(
      connection,
      boxIds,
      sortCols
    );
    const packedTcByBox = await getLatestPackedTcByBoxIds(connection, boxIds);

    // Contract: tabSortBox row + live totals (desktop SortBoxService box contents logic).
    const boxes = rows.map((row) => {
      const stats = scanStats.get(row.box_id) || {
        units_scanned: 0,
        item_count: 0,
      };
      const createdRaw = row.created_on ?? row.created_at ?? null;
      const packedTcId = packedTcByBox.get(row.box_id) || null;
      const st = String(row.status || '').trim();
      const isClosed = st.toLowerCase() === 'closed';
      const isPackedStatus = st.toLowerCase() === 'packed';
      let packEligible = false;
      let packBlockReason = null;
      if (isPackedStatus || packedTcId) {
        packEligible = false;
        packBlockReason = packedTcId ? 'ALREADY_PACKED' : 'BOX_ALREADY_PACKED';
      } else if (!isClosed) {
        packEligible = false;
        packBlockReason = 'BOX_NOT_CLOSED';
      } else {
        packEligible = true;
        packBlockReason = null;
      }
      return {
        box_id: row.box_id,
        asn_no: row.advance_shipping_notice,
        store: row.store,
        status: row.status,
        created_by: row.created_by || null,
        created_on: formatSortedOn(createdRaw),
        units_scanned: stats.units_scanned,
        item_count: stats.item_count,
        packed_tc_id: packedTcId,
        pack_eligible: packEligible,
        pack_block_reason: packBlockReason,
      };
    });

    res.json({
      ok: true,
      data: boxes
    });

  } catch (error) {
    console.error('Failed to fetch boxes:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch boxes',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/boxes/:box_id/items?asn=...&store=... (optional store)
 * Step 1: tabSortBox row. Step 2: same SORT_TO_BOX logic as desktop SortBoxService.GetBoxContentsAsync.
 */
export const getBoxItems = async (req, res) => {
  const { box_id } = req.params;
  const { asn, store } = req.query;

  if (!box_id?.trim()) {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'box_id is required' },
    });
  }
  if (!asn?.trim()) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'asn query parameter is required',
      },
    });
  }

  const connection = await getConnection();
  try {
    let sql = `
      SELECT *
      FROM tabSortBox
      WHERE box_id = ?
        AND advance_shipping_notice = ?
    `;
    const params = [box_id.trim(), asn.trim()];
    if (store?.trim()) {
      sql += ' AND store = ?';
      params.push(store.trim());
    }
    sql += ' LIMIT 1';

    const [rows] = await connection.execute(sql, params);
    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Box ${box_id} not found for this ASN${store?.trim() ? ' and store' : ''}`,
        },
      });
    }

    const box = rows[0];
    const cols = await getWmsScanEventSortColumns(connection);
    const linesRaw = await getSortToBoxContentsDesktop(connection, box.box_id, cols);
    const items = linesRaw
      .filter((row) => (Number(row.scanned_qty) || 0) > 0)
      .map((row) => ({
        item_code: row.item_code,
        source_carton: row.source_carton,
        scanned_qty: row.scanned_qty,
        sorted_by: row.sorted_by || null,
        sorted_on: formatSortedOn(row.sorted_on),
      }));
    const total_pieces = items.reduce(
      (s, i) => s + (Number(i.scanned_qty) || 0),
      0
    );

    res.json({
      ok: true,
      data: {
        box_id: box.box_id,
        asn_no: box.advance_shipping_notice,
        store: box.store,
        total_pieces: total_pieces,
        items,
      },
    });
  } catch (error) {
    console.error(`Failed to fetch box items for ${box_id}:`, error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch box items',
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/boxes/:box_id
 * Get a specific box by ID (for validating scanned barcodes)
 * 
 * Example:
 * GET /api/boxes/BOX-STORE-001-001
 * 
 * Response:
 * {
 *   "ok": true,
 *   "data": {
 *     "box_id": "BOX-STORE-001-001",
 *     "status": "Open",
 *     "asn_no": "ASN-0001",
 *     "to_no": "TO-0001",
 *     "store": "STORE-001",
 *     "purpose": "STORE",
 *     "created_by": "USER-172188",
 *     "created_on": "2024-12-25T10:30:23Z"
 *   }
 * }
 */
export const getBoxById = async (req, res) => {
  const { box_id } = req.params;

  if (!box_id) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'box_id is required'
      }
    });
  }

  const connection = await getConnection();

  try {
    const [rows] = await connection.execute(`
      SELECT 
        box_id,
        status,
        advance_shipping_notice as asn_no,
        transfer_order as to_no,
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
      WHERE box_id = ?
    `, [box_id]);

    if (rows.length === 0) {
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Box ${box_id} not found`
        }
      });
    }

    const box = rows[0];

    // Box contents: same logic as desktop SortBoxService.GetBoxContentsAsync
    let boxContents = [];
    try {
      const cols = await getWmsScanEventSortColumns(connection);
      const lines = await getSortToBoxContentsDesktop(connection, box_id, cols);
      boxContents = lines.map((row) => ({
        item_code: row.item_code,
        source_carton: row.source_carton,
        qty: row.scanned_qty,
        sorted_by: row.sorted_by || null,
        sorted_on: row.sorted_on ? row.sorted_on.toISOString() : null,
      }));
      console.log(
        `✅ Found ${boxContents.length} items in box ${box_id} from SORT events (desktop merge)`
      );
    } catch (contentsError) {
      console.warn(`Failed to fetch box contents for ${box_id}:`, contentsError.message);
    }

    // Format response
    const boxData = {
      box_id: box.box_id,
      status: box.status,
      asn_no: box.asn_no,
      to_no: box.to_no || null,
      store: box.store,
      purpose: box.purpose || 'STORE',
      created_by: box.created_by || null,
      created_on: box.created_on ? box.created_on.toISOString() : null,
      closed_by: box.closed_by || null,
      closed_on: box.closed_on ? box.closed_on.toISOString() : null,
      dispatched_on: box.dispatched_on ? box.dispatched_on.toISOString() : null,
      received_at_store_on: box.received_at_store_on ? box.received_at_store_on.toISOString() : null,
      updated_on: box.updated_on ? box.updated_on.toISOString() : null,
      remarks: box.remarks || null,
      contents: boxContents  // Add box contents from SORT events
    };

    res.json({
      ok: true,
      data: boxData
    });

  } catch (error) {
    console.error(`Failed to fetch box ${box_id}:`, error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch box',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/boxes/delete
 * Delete a box - only allowed if box has no scanned items
 * 
 * Request Body:
 * {
 *   "box_id": "BOX-WAREHOUSE-624758"
 * }
 * 
 * Response (Success):
 * {
 *   "success": true,
 *   "ok": true,
 *   "message": "Box deleted successfully"
 * }
 * 
 * Response (Error - Box has items):
 * {
 *   "code": "VALIDATION_ERROR",
 *   "message": "Cannot delete box with scanned items",
 *   "details": "Box contains 5 scanned item(s)"
 * }
 * 
 * Response (Error - Box not found):
 * {
 *   "code": "NOT_FOUND",
 *   "message": "Box BOX-WAREHOUSE-624758 not found"
 * }
 */
export const deleteBox = async (req, res) => {
  const { box_id } = req.body;

  // Validation
  if (!box_id) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'box_id is required'
      }
    });
  }

  const connection = await getConnection();

  try {
    // Check if box exists
    const [boxes] = await connection.execute(
      'SELECT box_id FROM tabSortBox WHERE box_id = ?',
      [box_id]
    );

    if (boxes.length === 0) {
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Box ${box_id} not found`
        }
      });
    }

    // Check if box has any scanned items
    // Check multiple possible tables where items might be stored:
    // 1. tabReceiveLine (if exists with box_id column) - per requirements
    // 2. scanned_items table (if exists) - mobile app local table
    // 3. tabInboundReceiveLine (if it has box_id column)
    
    let itemCount = 0;
    let itemCountDetails = [];

    // Check tabReceiveLine (as specified in requirements)
    try {
      const [receiveLineCheck] = await connection.execute(`
        SELECT COUNT(*) as count 
        FROM tabReceiveLine 
        WHERE box_id = ?
      `, [box_id]);
      
      if (receiveLineCheck && receiveLineCheck.length > 0) {
        const count = receiveLineCheck[0].count || 0;
        if (count > 0) {
          itemCount += count;
          itemCountDetails.push(`${count} receive line(s)`);
        }
      }
    } catch (receiveLineError) {
      // Table/column might not exist - that's okay, continue checking other tables
      // Error code 1146 = Table doesn't exist, 1054 = Column doesn't exist
      if (receiveLineError.code !== 'ER_NO_SUCH_TABLE' && receiveLineError.code !== 'ER_BAD_FIELD_ERROR') {
        console.warn(`Warning checking tabReceiveLine for box ${box_id}:`, receiveLineError.message);
      }
    }

    // Check for scanned_items table (mobile app local table)
    try {
      const [scannedItemsCheck] = await connection.execute(`
        SELECT COUNT(*) as count 
        FROM scanned_items 
        WHERE box_id = ?
      `, [box_id]);
      
      if (scannedItemsCheck && scannedItemsCheck.length > 0) {
        const count = scannedItemsCheck[0].count || 0;
        if (count > 0) {
          itemCount += count;
          itemCountDetails.push(`${count} scanned item(s)`);
        }
      }
    } catch (scannedItemsError) {
      // Table might not exist - that's okay, continue
      if (scannedItemsError.code !== 'ER_NO_SUCH_TABLE') {
        console.warn(`Warning checking scanned_items for box ${box_id}:`, scannedItemsError.message);
      }
    }

    // Check tabInboundReceiveLine (if it has box_id column)
    try {
      const [inboundReceiveLineCheck] = await connection.execute(`
        SELECT COUNT(*) as count 
        FROM tabInboundReceiveLine 
        WHERE box_id = ?
      `, [box_id]);
      
      if (inboundReceiveLineCheck && inboundReceiveLineCheck.length > 0) {
        const count = inboundReceiveLineCheck[0].count || 0;
        if (count > 0) {
          itemCount += count;
          itemCountDetails.push(`${count} inbound receive line(s)`);
        }
      }
    } catch (inboundReceiveLineError) {
      // Column might not exist - that's okay, continue
      if (inboundReceiveLineError.code !== 'ER_BAD_FIELD_ERROR') {
        console.warn(`Warning checking tabInboundReceiveLine for box ${box_id}:`, inboundReceiveLineError.message);
      }
    }

    // If box has items, prevent deletion
    if (itemCount > 0) {
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot delete box with scanned items',
          details: `Box contains ${itemCount} scanned item(s)${itemCountDetails.length > 0 ? ` (${itemCountDetails.join(', ')})` : ''}`
        }
      });
    }

    // Delete box from database
    const [deleteResult] = await connection.execute(
      'DELETE FROM tabSortBox WHERE box_id = ?',
      [box_id]
    );

    if (deleteResult.affectedRows === 0) {
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Box ${box_id} not found`
        }
      });
    }

    console.log(`✅ Deleted box ${box_id} successfully`);

    res.json({
      success: true,
      ok: true,
      message: 'Box deleted successfully'
    });

  } catch (error) {
    console.error(`Failed to delete box ${box_id}:`, error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to delete box',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

