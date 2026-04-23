// wms-api/src/modules/inbound/inboundController.js
// Inbound session operations

import { getConnection } from '../../db/connection.js';

/**
 * POST /api/inbound/receive-lines
 * Create or update multiple receive line records (batch).
 *
 * CRITICAL: parent_title = inbound session ID (e.g. SESSION-ASN0003-DEV4YSV108245-USER108245).
 * All receive_lines are stored under this session so desktop can sum received_qty per ASN/item.
 *
 * Request Body (preferred - parent_title at root; mobile must send this):
 * {
 *   "parent_title": "SESSION-ASN0003-DEV4YSV108245-USER108245",
 *   "receive_lines": [
 *     { "carton_id": "CTN-01", "item_code": "SKU-001", "expected_qty": 50, "received_qty": 50, "condition": "Good", "remarks": null }
 *   ]
 * }
 *
 * Fallback: parent_title in first receive_line (legacy).
 */
export const receiveLines = async (req, res) => {
  const { parent_title: rootParentTitle, receive_lines } = req.body;

  if (!receive_lines || !Array.isArray(receive_lines) || receive_lines.length === 0) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'receive_lines array is required and must not be empty'
      }
    });
  }

  // Require parent_title: prefer root (so all lines use same session); fallback first line for legacy
  const firstLine = receive_lines[0];
  const parent_title = rootParentTitle || firstLine?.parent_title;

  if (!parent_title || String(parent_title).trim() === '') {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'parent_title is required (inbound session ID). Send at root: { "parent_title": "<session_id>", "receive_lines": [...] }'
      }
    });
  }

  // Use root parent_title for ALL lines so every carton is associated with the same session
  const sessionId = String(parent_title).trim();

  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    // Verify session exists - detect schema
    const [sessionColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabInboundSession'
      AND COLUMN_NAME IN ('title', 'inbound_session')
    `);
    const sessionIdColumn = sessionColumns.some(r => r.COLUMN_NAME === 'inbound_session') ? 'inbound_session' : 'title';
    
    const [sessions] = await connection.execute(
      `SELECT ${sessionIdColumn} FROM tabInboundSession WHERE ${sessionIdColumn} = ?`,
      [sessionId]
    );

    if (sessions.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: `Inbound session ${sessionId} not found`
        }
      });
    }

    let savedCount = 0;

    // Store all lines under the same session (sessionId) so desktop can sum received_qty per ASN/item
    for (const line of receive_lines) {
      const { carton_id, item_code, expected_qty, received_qty, condition = 'Good', remarks = null } = line;

      if (!carton_id || !item_code || expected_qty === undefined || received_qty === undefined) {
        continue;
      }

      // Always use sessionId (root parent_title) so lines are linked to the correct ASN/session
      const lineParentTitle = sessionId;

      const [existing] = await connection.execute(`
        SELECT id FROM tabInboundReceiveLine 
        WHERE parent_title = ? AND carton_id = ? AND item_code = ?
      `, [lineParentTitle, carton_id, item_code]);

      if (existing && existing.length > 0) {
        // Update: replace received_qty for this (session, carton, item). Idempotent if same payload sent twice.
        await connection.execute(`
          UPDATE tabInboundReceiveLine 
          SET expected_qty = ?,
              received_qty = ?,
              \`condition\` = ?,
              remarks = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE parent_title = ? AND carton_id = ? AND item_code = ?
        `, [expected_qty, received_qty, condition, remarks, lineParentTitle, carton_id, item_code]);
      } else {
        await connection.execute(`
          INSERT INTO tabInboundReceiveLine 
            (parent_title, carton_id, item_code, expected_qty, received_qty, \`condition\`, remarks)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [lineParentTitle, carton_id, item_code, expected_qty, received_qty, condition, remarks]);
      }

      savedCount++;
    }

    await connection.commit();

    res.json({
      ok: true,
      message: 'Receive lines saved successfully',
      saved_count: savedCount
    });

  } catch (error) {
    await connection.rollback();
    console.error('Failed to save receive lines:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to save receive lines',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/inbound/update
 * Create or update inbound session (UPSERT logic)
 * 
 * ⚠️ CRITICAL: Uses exact ASN format from request (e.g., "ASN-0002"), no normalization
 * 
 * Request Body:
 * {
 *   "inbound_session": "SESSION-ASN0002-DEVICE001-USER172188",
 *   "asn_no": "ASN-0002",  // Use exact format from request (preserve format)
 *   "status": "Active",
 *   "completed_cartons": 3,
 *   "total_cartons": 4,
 *   "transfer_order": "TO-00012",
 *   "dock": "DOCK-01",
 *   "user_id": "USER-172188",
 *   "device_id": "DEVICE-001"
 * }
 */
export const updateInboundSession = async (req, res) => {
  const { 
    inbound_session, 
    asn_no, // e.g., "ASN-0002" (preserve exact format)
    transfer_in, // Transfer In title (e.g., "TI-0001")
    status, 
    completed_cartons, 
    total_cartons, 
    dock, 
    transfer_order,
    user_id,
    device_id
  } = req.body;

  // Validation - support both ASN and Transfer In
  if (!inbound_session || (!asn_no && !req.body.transfer_in)) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'inbound_session and either asn_no or transfer_in are required'
      }
    });
  }

  const connection = await getConnection();

  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' '); // MySQL datetime format

    // Check if session exists - detect schema
    const [sessionColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabInboundSession'
      AND COLUMN_NAME IN ('title', 'inbound_session')
    `);
    const sessionIdColumn = sessionColumns.some(r => r.COLUMN_NAME === 'inbound_session') ? 'inbound_session' : 'title';
    
    // Also detect ASN column
    const [asnColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabInboundSession'
      AND COLUMN_NAME IN ('asn_no', 'advance_shipping_notice')
    `);
    const asnColumn = asnColumns.some(r => r.COLUMN_NAME === 'asn_no') ? 'asn_no' : 'advance_shipping_notice';
    
    // Detect started column
    const [startedColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabInboundSession'
      AND COLUMN_NAME IN ('started_at', 'started_on')
    `);
    const startedColumn = startedColumns.some(r => r.COLUMN_NAME === 'started_at') ? 'started_at' : 'started_on';
    
    // Detect user column (user_id or started_by)
    const [userColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabInboundSession'
      AND COLUMN_NAME IN ('user_id', 'started_by')
    `);
    const hasUserId = userColumns.some(r => r.COLUMN_NAME === 'user_id');
    const hasStartedBy = userColumns.some(r => r.COLUMN_NAME === 'started_by');
    
    const [existingSession] = await connection.execute(
      `SELECT ${sessionIdColumn} FROM tabInboundSession WHERE ${sessionIdColumn} = ?`,
      [inbound_session]
    );

    let action = 'updated';

    if (existingSession.length === 0) {
      // Create new session (UPSERT logic) - use detected column names
      // Auto-populate transfer_order from ASN if not provided
      let finalTransferOrder = transfer_order;
      if (!finalTransferOrder && asn_no) {
        try {
          const [toRows] = await connection.execute(`
            SELECT title 
            FROM tabTransferOrder 
            WHERE advance_shipping_notice = ?
            LIMIT 1
          `, [asn_no]);
          if (toRows.length > 0) {
            finalTransferOrder = toRows[0].title;
            console.log(`📋 Auto-populated transfer_order ${finalTransferOrder} for ASN ${asn_no}`);
          }
        } catch (toError) {
          console.warn(`Could not auto-populate transfer_order for ASN ${asn_no}:`, toError.message);
        }
      }
      
      // Check if transfer_in column exists
      const [transferInColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabInboundSession'
        AND COLUMN_NAME = 'transfer_in'
      `);
      const hasTransferIn = transferInColumns.length > 0;
      
      // Build INSERT statement dynamically based on available columns
      const insertColumns = [
        sessionIdColumn,
        asnColumn,
        'transfer_order',
        'dock',
        'status',
        'completed_cartons',
        'total_cartons',
        startedColumn,
        'updated_at'
      ];
      const insertValues = [
        inbound_session,
        asn_no || null, // Use null if transfer_in is provided instead
        finalTransferOrder || null,
        dock || null,
        status || 'Active',
        completed_cartons || 0,
        total_cartons || 0,
        now, // started_on/started_at
        now  // updated_at
      ];
      
      // Add transfer_in column if it exists and transfer_in is provided
      if (hasTransferIn && transfer_in) {
        insertColumns.push('transfer_in');
        insertValues.push(transfer_in);
      }
      
      // Add user column if available
      if (hasUserId) {
        insertColumns.push('user_id');
        insertValues.push(user_id || null);
      } else if (hasStartedBy) {
        insertColumns.push('started_by');
        insertValues.push(user_id || null);
      }
      
      // Add device_id if available
      const [deviceColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabInboundSession'
        AND COLUMN_NAME = 'device_id'
      `);
      if (deviceColumns.length > 0) {
        insertColumns.push('device_id');
        insertValues.push(device_id || null);
      }
      
      await connection.execute(
        `INSERT INTO tabInboundSession (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
        insertValues
      );
      action = 'created';
      if (transfer_in) {
        console.log(`✅ Created inbound session ${inbound_session} for Transfer In ${transfer_in}`);
      } else {
        console.log(`✅ Created inbound session ${inbound_session} for ASN ${asn_no}`);
      }
    } else {
      // Update existing session
      const updates = [];
      const updateValues = [];

      if (status !== undefined) {
        updates.push('status = ?');
        updateValues.push(status);

        // Set completed_on if status is "Completed"
        if (status === 'Completed') {
          updates.push('completed_on = ?');
          updateValues.push(now);
        }
      }
      if (completed_cartons !== undefined) {
        updates.push('completed_cartons = ?');
        updateValues.push(completed_cartons);
      }
      if (total_cartons !== undefined) {
        updates.push('total_cartons = ?');
        updateValues.push(total_cartons);
      }
      
      // Handle transfer_in update if column exists
      const [transferInUpdateColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabInboundSession'
        AND COLUMN_NAME = 'transfer_in'
      `);
      if (transferInUpdateColumns.length > 0 && transfer_in !== undefined) {
        updates.push('transfer_in = ?');
        updateValues.push(transfer_in || null);
      }
      
      // Handle transfer_order update:
      // 1. If explicitly provided AND not null, update it
      // 2. If not provided (undefined), preserve existing value
      // 3. If null is explicitly sent, preserve existing value (don't clear it)
      // 4. If not provided and session has no transfer_order, try to auto-populate from ASN
      if (transfer_order !== undefined && transfer_order !== null) {
        // Explicitly provided and not null - update it
        updates.push('transfer_order = ?');
        updateValues.push(transfer_order);
      } else if (transfer_order === undefined) {
        // Not provided - check if we should auto-populate
        const [currentSession] = await connection.execute(`
          SELECT transfer_order 
          FROM tabInboundSession 
          WHERE ${sessionIdColumn} = ?
        `, [inbound_session]);
        
        const currentTransferOrder = currentSession.length > 0 ? currentSession[0].transfer_order : null;
        
        // If session has no transfer_order, try to auto-populate from ASN
        if (!currentTransferOrder && asn_no) {
          try {
            const [toRows] = await connection.execute(`
              SELECT title 
              FROM tabTransferOrder 
              WHERE advance_shipping_notice = ?
              LIMIT 1
            `, [asn_no]);
            if (toRows.length > 0) {
              updates.push('transfer_order = ?');
              updateValues.push(toRows[0].title);
              console.log(`📋 Auto-populated transfer_order ${toRows[0].title} for existing session ${inbound_session}`);
            }
          } catch (toError) {
            console.warn(`Could not auto-populate transfer_order for ASN ${asn_no}:`, toError.message);
          }
        }
        // If currentTransferOrder exists, we don't update (preserve it)
      }
      // If transfer_order is explicitly null, we preserve existing value (don't update/clear)
      if (dock !== undefined) {
        updates.push('dock = ?');
        updateValues.push(dock);
      }
      // Update user column if available
      if (user_id !== undefined) {
        if (hasUserId) {
          updates.push('user_id = ?');
          updateValues.push(user_id);
        } else if (hasStartedBy) {
          updates.push('started_by = ?');
          updateValues.push(user_id);
        }
      }
      
      // Update device_id if column exists
      if (device_id !== undefined) {
        const [deviceColumns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabInboundSession'
          AND COLUMN_NAME = 'device_id'
        `);
        if (deviceColumns.length > 0) {
          updates.push('device_id = ?');
          updateValues.push(device_id);
        }
      }

      // Always update updated_at
      updates.push('updated_at = ?');
      updateValues.push(now);
      updateValues.push(inbound_session); // WHERE clause

      if (updates.length > 1) { // More than just updated_at
        await connection.execute(
          `UPDATE tabInboundSession SET ${updates.join(', ')} WHERE ${sessionIdColumn} = ?`,
          updateValues
        );
        console.log(`✅ Updated inbound session ${inbound_session}`);
      }
    }

    res.json({
      ok: true,
      message: 'Session updated successfully',
      action: action
    });

  } catch (error) {
    console.error('Failed to update inbound session:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to update inbound session',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/inbound/complete
 * Complete an inbound session
 * 
 * Request Body:
 * {
 *   "inbound_session": "SESSION-001",
 *   "completed_by": "USER-001"
 * }
 */
export const completeInboundSession = async (req, res) => {
  const { inbound_session, completed_by } = req.body;

  // Validation
  if (!inbound_session) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'inbound_session is required'
      }
    });
  }

  const connection = await getConnection();

  try {
    // Detect schema for session ID column
    const [sessionColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabInboundSession'
      AND COLUMN_NAME IN ('title', 'inbound_session')
    `);
    const sessionIdColumn = sessionColumns.some(r => r.COLUMN_NAME === 'inbound_session') ? 'inbound_session' : 'title';
    
    // Update session to completed
    const [result] = await connection.execute(`
      UPDATE tabInboundSession 
      SET status = 'Completed',
          completed_on = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE ${sessionIdColumn} = ?
    `, [inbound_session]);

    if (result.affectedRows === 0) {
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: `Inbound session ${inbound_session} not found`
        }
      });
    }

    res.json({
      ok: true,
      message: 'Inbound session completed successfully'
    });

  } catch (error) {
    console.error('Failed to complete inbound session:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to complete inbound session',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/inbound/sessions
 * Get all inbound sessions
 * 
 * Returns all inbound sessions ordered by started_at DESC (newest first)
 * 
 * Response Format:
 * [
 *   {
 *     "inbound_session": "SESSION-ASN0002-DEVICE001-USER172188",
 *     "asn_no": "ASN-0002",
 *     "status": "Active",
 *     "completed_cartons": 0,
 *     "total_cartons": 2,
 *     "transfer_order": null,
 *     "dock": "DOCK-01",
 *     "started_by": "USER-172188",
 *     "device_id": "DEVICE-001",
 *     "started_at": "2025-12-24T12:16:08.000Z",
 *     "ended_at": null,
 *     "completed_on": null,
 *     "created_at": "2025-12-24T12:16:08.000Z",
 *     "updated_at": "2025-12-24T12:16:08.000Z"
 *   }
 * ]
 */
export const getInboundSessions = async (req, res) => {
  const connection = await getConnection();

  try {
    // Detect schema - check which columns exist
    const [columnRows] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabInboundSession'
      AND COLUMN_NAME IN ('title', 'inbound_session', 'advance_shipping_notice', 'asn_no', 'started_on', 'started_at', 'user_id', 'started_by', 'device_id', 'transfer_in')
    `);

    const existingColumns = new Set(columnRows.map(row => row.COLUMN_NAME));
    
    // Determine column names
    const sessionIdColumn = existingColumns.has('inbound_session') ? 'inbound_session' : 
                            existingColumns.has('title') ? 'title' : 'inbound_session';
    const asnColumn = existingColumns.has('asn_no') ? 'asn_no' : 
                      existingColumns.has('advance_shipping_notice') ? 'advance_shipping_notice' : 'asn_no';
    const startedColumn = existingColumns.has('started_at') ? 'started_at' : 
                         existingColumns.has('started_on') ? 'started_on' : 'started_at';
    const hasUserId = existingColumns.has('user_id');
    const hasStartedBy = existingColumns.has('started_by');
    const hasDeviceId = existingColumns.has('device_id');
    const hasTransferIn = existingColumns.has('transfer_in');
    
    console.log(`Inbound Session schema detected: sessionId=${sessionIdColumn}, asn=${asnColumn}, started=${startedColumn}, user_id=${hasUserId}, started_by=${hasStartedBy}, device_id=${hasDeviceId}, transfer_in=${hasTransferIn}`);

    // Build SELECT columns dynamically
    const selectColumns = [
      `${sessionIdColumn} as inbound_session`,
      `${asnColumn} as asn_no`,
      'status',
      'completed_cartons',
      'total_cartons',
      'transfer_order',
      'dock',
      `${startedColumn} as started_at`,
      'ended_at',
      'completed_on',
      'created_at',
      'updated_at'
    ];
    
    // Add transfer_in column if it exists
    if (hasTransferIn) {
      selectColumns.splice(2, 0, 'transfer_in'); // Insert after asn_no
    }
    
    // Add optional columns in correct order
    if (hasStartedBy) {
      selectColumns.splice(7, 0, 'started_by');
    }
    if (hasUserId) {
      const insertIndex = selectColumns.findIndex(col => col.includes('started_at')) + 1;
      selectColumns.splice(insertIndex, 0, 'user_id');
    }
    if (hasDeviceId) {
      const insertIndex = selectColumns.findIndex(col => col.includes('user_id') || col.includes('started_by') || col.includes('started_at')) + 1;
      selectColumns.splice(insertIndex, 0, 'device_id');
    }

    // Build query with detected column names
    const [rows] = await connection.execute(`
      SELECT ${selectColumns.join(', ')}
      FROM tabInboundSession
      ORDER BY ${startedColumn} DESC, created_at DESC
    `);

    const sessions = rows.map(row => {
      const session = {
        inbound_session: row.inbound_session,
        asn_no: row.asn_no || null,
        status: row.status || null,
        completed_cartons: row.completed_cartons || 0,
        total_cartons: row.total_cartons || 0,
        transfer_order: row.transfer_order || null,
        dock: row.dock || null,
        started_at: row.started_at ? new Date(row.started_at).toISOString() : null,
        ended_at: row.ended_at ? new Date(row.ended_at).toISOString() : null,
        completed_on: row.completed_on ? new Date(row.completed_on).toISOString() : null,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null
      };
      
      // Add optional fields only if they exist in the result
      if (hasTransferIn && row.transfer_in !== undefined) {
        session.transfer_in = row.transfer_in || null;
      }
      if (hasStartedBy && row.started_by !== undefined) {
        session.started_by = row.started_by || null;
      }
      if (hasUserId && row.user_id !== undefined) {
        session.user_id = row.user_id || null;
      }
      if (hasDeviceId && row.device_id !== undefined) {
        session.device_id = row.device_id || null;
      }
      
      return session;
    });

    res.json(sessions);

  } catch (error) {
    console.error('Failed to fetch inbound sessions:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch inbound sessions',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/inbound/unload-line
 * Create or update an unload line record (UPSERT)
 * 
 * Request Body:
 * {
 *   "parent_title": "SESSION-001",
 *   "unit_type": "Carton",
 *   "unit_id": "CTN-0101",
 *   "scanned_by": "USER-001",
 *   "scanned_on": "2024-12-24T10:20:00Z"  // Optional
 * }
 */
export const createUnloadLine = async (req, res) => {
  const { parent_title, unit_type, unit_id, scanned_by, scanned_on } = req.body;

  // Validation
  if (!parent_title || !unit_type || !unit_id || !scanned_by) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'parent_title, unit_type, unit_id, and scanned_by are required'
      }
    });
  }

  const connection = await getConnection();

  try {
    // Detect schema for parent_title column in tabInboundSession
    const [sessionColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabInboundSession'
      AND COLUMN_NAME IN ('title', 'inbound_session')
    `);
    const sessionIdColumn = sessionColumns.some(r => r.COLUMN_NAME === 'inbound_session') ? 'inbound_session' : 'title';
    
    // Verify session exists
    const [sessions] = await connection.execute(
      `SELECT ${sessionIdColumn} FROM tabInboundSession WHERE ${sessionIdColumn} = ?`,
      [parent_title]
    );

    if (sessions.length === 0) {
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: `Inbound session ${parent_title} not found`
        }
      });
    }

    // Use provided scanned_on or current time
    const scannedTimestamp = scanned_on ? new Date(scanned_on).toISOString().slice(0, 19).replace('T', ' ') : null;

    // Insert or update unload line (UPSERT)
    await connection.execute(`
      INSERT INTO tabInboundUnloadLine 
        (parent_title, unit_type, unit_id, scanned_by, scanned_on)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        scanned_on = VALUES(scanned_on),
        scanned_by = VALUES(scanned_by),
        updated_at = CURRENT_TIMESTAMP
    `, [
      parent_title,
      unit_type,
      unit_id,
      scanned_by,
      scannedTimestamp || new Date().toISOString().slice(0, 19).replace('T', ' ')
    ]);

    res.json({
      ok: true,
      message: 'Unload line created/updated successfully',
      data: {
        parent_title,
        unit_type,
        unit_id,
        scanned_by,
        scanned_on: scannedTimestamp || new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Failed to create unload line:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to create unload line',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

