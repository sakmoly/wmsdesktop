// wms-api/src/modules/boxes/boxController.js
// Box operations

import { getConnection } from '../../db/connection.js';

/**
 * POST /api/boxes/create
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
 */
export const createBox = async (req, res) => {
  // Support both mobile app format (asn_no, to_no, user_id) and desktop format (advance_shipping_notice, transfer_order, created_by, box_id)
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
    // Common fields
    store,
    purpose = 'STORE'
  } = req.body;

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
    let finalBoxId = providedBoxId;
    if (!finalBoxId) {
      const timestamp = Date.now();
      const storeCode = store.replace(/[^A-Z0-9]/g, '').substring(0, 10); // Clean store code
      finalBoxId = `BOX-${storeCode}-${timestamp.toString().slice(-6)}`;
    }

    // Convert empty string to empty string (not null) for database
    // IMPORTANT: transfer_order column has NOT NULL constraint, so use empty string "" instead of null
    const toNoValue = normalizedTO && normalizedTO.trim() !== '' ? normalizedTO.trim() : '';

    // Insert box
    await connection.execute(`
      INSERT INTO tabSortBox 
        (box_id, status, advance_shipping_notice, transfer_order, store, purpose, created_by, created_on)
      VALUES (?, 'Open', ?, ?, ?, ?, ?, NOW())
    `, [finalBoxId, normalizedASN, toNoValue, store, purpose, normalizedCreatedBy]);

    res.json({
      ok: true,
      message: 'Box created successfully',
      box_id: finalBoxId, // Return at root level for mobile app compatibility
      status: 'Open',
      data: {
        box_id: finalBoxId,
        status: 'Open'
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

        // Create putaway task
        if (hasSourceType && hasBoxId) {
          await connection.execute(`
            INSERT INTO tabPutawayTask 
            (title, status, source_type, box_id, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
            VALUES (?, 'Open', 'Box', ?, ?, ?, ?, NOW(), NOW())
          `, [putawayTaskId, box_id, box.asn_no || null, inboundSession, closed_by || 'SYSTEM']);
          console.log(`[closeBox] Created putaway task with source_type and box_id columns`);
        } else if (hasSourceType) {
          await connection.execute(`
            INSERT INTO tabPutawayTask 
            (title, status, source_type, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
            VALUES (?, 'Open', 'Box', ?, ?, ?, NOW(), NOW())
          `, [putawayTaskId, box.asn_no || null, inboundSession, closed_by || 'SYSTEM']);
          console.log(`[closeBox] Created putaway task with source_type column only`);
        } else if (hasBoxId) {
          await connection.execute(`
            INSERT INTO tabPutawayTask 
            (title, status, box_id, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
            VALUES (?, 'Open', ?, ?, ?, ?, NOW(), NOW())
          `, [putawayTaskId, box_id, box.asn_no || null, inboundSession, closed_by || 'SYSTEM']);
          console.log(`[closeBox] Created putaway task with box_id column only`);
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
            AND qty > 0
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
 * Response:
 * {
 *   "ok": true,
 *   "data": [
 *     {
 *       "box_id": "BOX-STORE-001-001",
 *       "status": "Open",
 *       "asn_no": "ASN-0001",
 *       "to_no": "TO-0001",
 *       "store": "STORE-001",
 *       "purpose": "STORE",
 *       "created_by": "USER-172188",
 *       "created_on": "2024-12-25T10:30:23Z"
 *     }
 *   ]
 * }
 */
export const getBoxes = async (req, res) => {
  const { asn, store, status } = req.query;

  // Validation
  if (!asn || !store) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'asn and store query parameters are required'
      }
    });
  }

  const connection = await getConnection();

  try {
    // Build query with filters
    // CRITICAL: Exclude closed warehouse boxes from Packing screen
    // Closed warehouse boxes should go directly to Putaway, not Packing
    let query = `
      SELECT 
        b.box_id,
        b.status,
        b.advance_shipping_notice as asn_no,
        b.transfer_order as to_no,
        b.store,
        b.purpose,
        b.created_by,
        b.created_on,
        b.closed_by,
        b.closed_on,
        b.dispatched_on,
        b.received_at_store_on,
        b.updated_on,
        b.remarks
      FROM tabSortBox b
      LEFT JOIN tabWarehouse w ON b.store = w.code
      WHERE b.advance_shipping_notice = ? AND b.store = ?
        AND NOT (
          b.status = 'Closed' 
          AND w.warehouse_type = 'Warehouse'
        )
    `;
    
    const queryParams = [asn, store];

    // Add status filter if provided
    if (status) {
      query += ' AND b.status = ?';
      queryParams.push(status);
    }

    query += ' ORDER BY b.created_on DESC';

    const [rows] = await connection.execute(query, queryParams);

    // Format response
    const boxes = rows.map(row => ({
      box_id: row.box_id,
      status: row.status,
      asn_no: row.asn_no,
      to_no: row.to_no || null,
      store: row.store,
      purpose: row.purpose || 'STORE',
      created_by: row.created_by || null,
      created_on: row.created_on ? row.created_on.toISOString() : null,
      closed_by: row.closed_by || null,
      closed_on: row.closed_on ? row.closed_on.toISOString() : null,
      dispatched_on: row.dispatched_on ? row.dispatched_on.toISOString() : null,
      received_at_store_on: row.received_at_store_on ? row.received_at_store_on.toISOString() : null,
      updated_on: row.updated_on ? row.updated_on.toISOString() : null,
      remarks: row.remarks || null
    }));

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

    // Get box contents from SORT events
    // Query tabWmsScanEvent where event_type = 'SORT_TO_BOX' and box_id matches
    let boxContents = [];
    try {
      // Detect schema for ASN column in tabWmsScanEvent
      const [eventColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabWmsScanEvent'
        AND COLUMN_NAME IN ('advance_shipping_notice', 'asn_no', 'carton_id', 'item_code', 'qty', 'user_id', 'event_time', 'box_id')
      `);
      const eventCols = new Set(eventColumns.map(r => r.COLUMN_NAME));
      
      const asnCol = eventCols.has('asn_no') ? 'asn_no' : 'advance_shipping_notice';
      const hasCartonId = eventCols.has('carton_id');
      const hasItemCode = eventCols.has('item_code');
      const hasQty = eventCols.has('qty');
      const hasUserId = eventCols.has('user_id');
      const hasEventTime = eventCols.has('event_time');
      const hasBoxId = eventCols.has('box_id');
      
      if (hasBoxId && hasItemCode) {
        // Build query to get SORT_TO_BOX events for this box
        const selectFields = [
          hasItemCode ? 'item_code' : 'NULL as item_code',
          hasCartonId ? 'carton_id' : 'NULL as carton_id',
          hasQty ? 'qty' : '1 as qty',
          hasUserId ? 'user_id' : 'NULL as user_id',
          hasEventTime ? 'event_time' : 'created_at as event_time'
        ];
        
        const [sortEvents] = await connection.execute(`
          SELECT 
            ${selectFields.join(', ')}
          FROM tabWmsScanEvent
          WHERE event_type = 'SORT_TO_BOX'
            AND box_id = ?
          ORDER BY ${hasEventTime ? 'event_time' : 'created_at'} DESC
        `, [box_id]);
        
        // Group by item_code and carton_id, sum quantities
        const contentsMap = new Map();
        
        for (const event of sortEvents) {
          const key = `${event.item_code || ''}_${event.carton_id || ''}`;
          
          if (!contentsMap.has(key)) {
            contentsMap.set(key, {
              item_code: event.item_code || null,
              source_carton: event.carton_id || null,
              qty: parseFloat(event.qty) || 0,
              sorted_by: event.user_id || null,
              sorted_on: event.event_time ? event.event_time.toISOString() : null
            });
          } else {
            // Sum quantities for same item_code + carton_id combination
            const existing = contentsMap.get(key);
            existing.qty += parseFloat(event.qty) || 0;
            // Keep the latest sorted_on time
            if (event.event_time && (!existing.sorted_on || new Date(event.event_time) > new Date(existing.sorted_on))) {
              existing.sorted_on = event.event_time.toISOString();
            }
          }
        }
        
        boxContents = Array.from(contentsMap.values())
          .sort((a, b) => (a.item_code || '').localeCompare(b.item_code || ''));
        
        console.log(`✅ Found ${boxContents.length} items in box ${box_id} from SORT events`);
      } else {
        console.log(`ℹ️ tabWmsScanEvent table missing required columns for box contents`);
      }
    } catch (contentsError) {
      // Non-critical - log but don't fail
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

