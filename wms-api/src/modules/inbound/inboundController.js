// wms-api/src/modules/inbound/inboundController.js
// Inbound session operations

import { getConnection } from '../../db/connection.js';
import { findCrossSessionUnloadDuplicate } from '../../services/inboundUnloadCrossSession.js';
import {
  ensureUnloadLineUniqueIndex,
  ensureUnloadLineDeviceIdColumn,
  getUnloadLineOptionalMeta,
} from '../../services/inboundUnloadLineSchema.js';

/** Demo store: parent_title -> list of unload line objects (no DB). */
const __unloadDemoLinesByParent = new Map();

function isUnloadDemoMode(req) {
  const q = req.query || {};
  const demoQuery =
    String(q.demo || q.demo_mode || '').toLowerCase() === '1' ||
    String(q.demo || q.demo_mode || '').toLowerCase() === 'true';
  const envDemo =
    process.env.WMS_INBOUND_UNLOAD_DEMO === '1' ||
    process.env.WMS_INBOUND_UNLOAD_DEMO === 'true';
  return demoQuery || envDemo;
}

function duplicateUnloadResponse(parent_title, unit_type, unit_id, existing) {
  return {
    ok: false,
    error: {
      code: 'DUPLICATE_UNLOAD',
      message: `Unload already recorded for this session and unit (${unit_type}: ${unit_id}).`,
      duplicate: true,
      parent_title,
      unit_type,
      unit_id,
      existing: existing || null,
    },
  };
}

function crossSessionUnloadResponse(unit_type, unit_id, existing, sourceDoc, sourceKind) {
  return {
    ok: false,
    error: {
      code: 'ASN_CARTON_ALREADY_UNLOADED',
      message: `This ${unit_type.toLowerCase()} was already unloaded for the same ${sourceKind} (${sourceDoc}) in another inbound session.`,
      duplicate: true,
      cross_session: true,
      source_doc: sourceDoc,
      source_kind: sourceKind,
      unit_type,
      unit_id,
      existing_session: existing?.parent_title || null,
      existing: existing || null,
    },
  };
}

function deviceHintFromParentTitle(parent_title) {
  const m = String(parent_title || '').match(/-DEV([A-Z0-9]+)-/i);
  return m ? `DEV${m[1]}` : null;
}

function formatUnloadLineRow(row) {
  const deviceIdStored =
    row.device_id != null && String(row.device_id).trim() !== '' ? String(row.device_id).trim() : null;
  const hint = !deviceIdStored ? deviceHintFromParentTitle(row.parent_title) : null;
  const out = {
    id: row.id,
    parent_title: row.parent_title,
    unit_type: row.unit_type,
    unit_id: row.unit_id,
    scanned_by: row.scanned_by,
    scanned_on: row.scanned_on ? new Date(row.scanned_on).toISOString() : null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    session_jti: row.session_jti ?? undefined,
    device_id: deviceIdStored ?? null,
  };
  if (hint) out.device_hint_from_session = hint;
  return out;
}

/**
 * GET /api/inbound/unload-lines?parent_title=...
 * Multiple response shapes for mobile pre-check compatibility.
 */
export const getUnloadLines = async (req, res) => {
  const parent_title =
    req.query.parent_title ||
    req.query.parentTitle ||
    req.query.inbound_session ||
    req.query.requested_session_id ||
    req.query.session_id;
  if (!parent_title || String(parent_title).trim() === '') {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Session query is required: parent_title, inbound_session, requested_session_id, or session_id',
      },
    });
  }

  const pt = String(parent_title).trim();

  if (isUnloadDemoMode(req)) {
    const lines = (__unloadDemoLinesByParent.get(pt) || []).map((r) => formatUnloadLineRow(r));
    const payload = {
      ok: true,
      parent_title: pt,
      demo: true,
      lines,
      unload_lines: lines,
      results: lines,
      items: lines,
      data: {
        parent_title: pt,
        lines,
        unload_lines: lines,
        results: lines,
        items: lines,
      },
    };
    return res.json(payload);
  }

  const connection = await getConnection();
  try {
    await ensureUnloadLineUniqueIndex(connection);
    await ensureUnloadLineDeviceIdColumn(connection);

    const [sessionColumns] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabInboundSession'
        AND COLUMN_NAME IN ('title', 'inbound_session', 'name')
    `);
    const sc = new Set(sessionColumns.map((r) => r.COLUMN_NAME));
    const idParts = ['inbound_session', 'title', 'name'].filter((c) => sc.has(c));
    const idClause = idParts.length
      ? idParts.map((c) => `${c} = ?`).join(' OR ')
      : 'title = ?';
    const idParams = idParts.length ? idParts.map(() => pt) : [pt];

    const [sessions] = await connection.execute(
      `SELECT 1 AS ok FROM tabInboundSession WHERE ${idClause} LIMIT 1`,
      idParams
    );

    if (sessions.length === 0) {
      // 422 (not 404): route exists; session id is wrong or session not created in DB yet.
      return res.status(422).json({
        ok: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: `Inbound session ${pt} not found`,
          hint: 'Use the same id as POST /api/inbound/session/start (tabInboundSession title / inbound_session / name).',
        },
      });
    }

    const ulMeta = await getUnloadLineOptionalMeta(connection);

    const [rows] = await connection.execute(
      `SELECT id, parent_title, unit_type, unit_id, scanned_by, scanned_on, created_at, updated_at${ulMeta.selectSuffix}
       FROM tabInboundUnloadLine
       WHERE parent_title = ?
       ORDER BY id ASC`,
      [pt]
    );

    const lines = rows.map(formatUnloadLineRow);
    return res.json({
      ok: true,
      parent_title: pt,
      lines,
      unload_lines: lines,
      results: lines,
      items: lines,
      data: {
        parent_title: pt,
        lines,
        unload_lines: lines,
        results: lines,
        items: lines,
      },
    });
  } catch (error) {
    console.error('getUnloadLines error:', error);
    return res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to list unload lines',
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

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
  const {
    parent_title: rootParentTitle,
    inbound_session: rootInboundSession,
    requested_session_id: rootRequestedSessionId,
    receive_lines,
  } = req.body;

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
  const parent_title =
    rootParentTitle ||
    rootInboundSession ||
    rootRequestedSessionId ||
    firstLine?.parent_title ||
    firstLine?.inbound_session ||
    firstLine?.requested_session_id;

  if (!parent_title || String(parent_title).trim() === '') {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'Session id is required: parent_title, inbound_session, or requested_session_id at root (or on first receive_line)',
      },
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
      AND COLUMN_NAME IN ('title', 'inbound_session', 'name')
    `);
    const scRl = new Set(sessionColumns.map((r) => r.COLUMN_NAME));
    const idPartsRl = ['inbound_session', 'title', 'name'].filter((c) => scRl.has(c));
    const idClauseRl = idPartsRl.length
      ? idPartsRl.map((c) => `${c} = ?`).join(' OR ')
      : 'title = ?';
    const idParamsRl = idPartsRl.length ? idPartsRl.map(() => sessionId) : [sessionId];
    const sessionIdColumn = scRl.has('inbound_session') ? 'inbound_session' : 'title';

    const [sessions] = await connection.execute(
      `SELECT ${sessionIdColumn} FROM tabInboundSession WHERE ${idClauseRl} LIMIT 1`,
      idParamsRl
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

    const inboundCodes = [
      ...new Set(
        receive_lines
          .filter(
            (l) =>
              l &&
              l.carton_id &&
              l.item_code != null &&
              String(l.item_code).trim() !== '' &&
              l.expected_qty !== undefined &&
              l.received_qty !== undefined
          )
          .map((l) => String(l.item_code).trim())
      ),
    ];
    if (inboundCodes.length > 0) {
      const { findMissingItemCodesInMaster } = await import('../../utils/itemMasterValidate.js');
      const missInbound = await findMissingItemCodesInMaster(connection, inboundCodes);
      if (missInbound.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          ok: false,
          error: {
            code: 'ITEM_NOT_IN_MASTER',
            message: `Item code(s) not in Item master (tabItem): ${missInbound.join(', ')}`,
            missing_item_codes: missInbound,
          },
        });
      }
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
    requested_session_id,
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

  const sessionKey =
    inbound_session != null && String(inbound_session).trim() !== ''
      ? String(inbound_session).trim()
      : requested_session_id != null && String(requested_session_id).trim() !== ''
        ? String(requested_session_id).trim()
        : null;

  // Validation - support both ASN and Transfer In
  if (!sessionKey || (!asn_no && !req.body.transfer_in)) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'inbound_session (or requested_session_id) and either asn_no or transfer_in are required'
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
      AND COLUMN_NAME IN ('title', 'inbound_session', 'name')
    `);
    const scSet = new Set(sessionColumns.map((r) => r.COLUMN_NAME));
    const sessionIdColumn = scSet.has('inbound_session') ? 'inbound_session' : 'title';
    const idPartsUp = ['inbound_session', 'title', 'name'].filter((c) => scSet.has(c));
    const sessionWhereClause = idPartsUp.length
      ? idPartsUp.map((c) => `${c} = ?`).join(' OR ')
      : `${sessionIdColumn} = ?`;
    const sessionWhereParams = idPartsUp.length ? idPartsUp.map(() => sessionKey) : [sessionKey];
    
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
      `SELECT ${sessionIdColumn} FROM tabInboundSession WHERE ${sessionWhereClause} LIMIT 1`,
      sessionWhereParams
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
        sessionKey,
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
        console.log(`✅ Created inbound session ${sessionKey} for Transfer In ${transfer_in}`);
      } else {
        console.log(`✅ Created inbound session ${sessionKey} for ASN ${asn_no}`);
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
          WHERE ${sessionWhereClause}
          LIMIT 1
        `, sessionWhereParams);
        
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
              console.log(`📋 Auto-populated transfer_order ${toRows[0].title} for existing session ${sessionKey}`);
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
      updateValues.push(...sessionWhereParams);

      if (updates.length > 1) { // More than just updated_at
        await connection.execute(
          `UPDATE tabInboundSession SET ${updates.join(', ')} WHERE ${sessionWhereClause}`,
          updateValues
        );
        console.log(`✅ Updated inbound session ${sessionKey}`);
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
  const { inbound_session, requested_session_id, completed_by } = req.body;

  const sessionKey =
    inbound_session != null && String(inbound_session).trim() !== ''
      ? String(inbound_session).trim()
      : requested_session_id != null && String(requested_session_id).trim() !== ''
        ? String(requested_session_id).trim()
        : null;

  // Validation
  if (!sessionKey) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'inbound_session or requested_session_id is required'
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
      AND COLUMN_NAME IN ('title', 'inbound_session', 'name')
    `);
    const scC = new Set(sessionColumns.map((r) => r.COLUMN_NAME));
    const idPartsC = ['inbound_session', 'title', 'name'].filter((c) => scC.has(c));
    const idClauseC = idPartsC.length
      ? idPartsC.map((c) => `${c} = ?`).join(' OR ')
      : 'title = ?';
    const idParamsC = idPartsC.length ? idPartsC.map(() => sessionKey) : [sessionKey];
    
    // Update session to completed
    const [result] = await connection.execute(`
      UPDATE tabInboundSession 
      SET status = 'Completed',
          completed_on = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE ${idClauseC}
    `, idParamsC);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: `Inbound session ${sessionKey} not found`
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
 * Create one unload line per (parent_title, unit_type, unit_id). Second POST → 409 DUPLICATE_UNLOAD.
 *
 * Request Body:
 * {
 *   "parent_title": "SESSION-001",
 *   "unit_type": "Carton",
 *   "unit_id": "CTN-0101",
 *   "scanned_by": "USER-001",
 *   "scanned_on": "2024-12-24T10:20:00Z",  // Optional
 *   "device_id": "DEV8S2V117773"          // Optional — stored for mobile "who / which device unloaded"
 * }
 *
 * Demo: ?demo=1 on POST or env WMS_INBOUND_UNLOAD_DEMO=1 — skips DB session check; uses in-memory store.
 */
export const createUnloadLine = async (req, res) => {
  const {
    parent_title,
    inbound_session,
    requested_session_id,
    unit_type,
    unit_id,
    scanned_by,
    scanned_on,
    device_id,
  } = req.body;

  const sessionParent =
    parent_title || inbound_session || requested_session_id;

  if (!sessionParent || !unit_type || !unit_id || !scanned_by) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'parent_title (or inbound_session / requested_session_id), unit_type, unit_id, and scanned_by are required',
      },
    });
  }

  const pt = String(sessionParent).trim();
  const ut = String(unit_type).trim();
  const uid = String(unit_id).trim();
  const scannedTimestamp = scanned_on
    ? new Date(scanned_on).toISOString().slice(0, 19).replace('T', ' ')
    : new Date().toISOString().slice(0, 19).replace('T', ' ');
  const isoOut = scanned_on ? new Date(scanned_on).toISOString() : new Date().toISOString();
  const jti = req.user?.jti || null;
  const deviceIdNorm =
    device_id != null && String(device_id).trim() !== '' ? String(device_id).trim() : null;

  if (isUnloadDemoMode(req)) {
    const list = __unloadDemoLinesByParent.get(pt) || [];
    const dup = list.find((r) => r.unit_type === ut && r.unit_id === uid);
    if (dup) {
      return res.status(409).json(duplicateUnloadResponse(pt, ut, uid, formatUnloadLineRow(dup)));
    }
    const row = {
      id: Date.now(),
      parent_title: pt,
      unit_type: ut,
      unit_id: uid,
      scanned_by,
      scanned_on: isoOut,
      session_jti: jti,
      device_id: deviceIdNorm,
    };
    list.push(row);
    __unloadDemoLinesByParent.set(pt, list);
    return res.status(201).json({
      ok: true,
      message: 'Unload line created (demo)',
      demo: true,
      data: row,
    });
  }

  const connection = await getConnection();

  try {
    await ensureUnloadLineUniqueIndex(connection);
    await ensureUnloadLineDeviceIdColumn(connection);
    const ulMeta = await getUnloadLineOptionalMeta(connection);

    const [sessionColumns] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabInboundSession'
        AND COLUMN_NAME IN ('title', 'inbound_session', 'name')
    `);
    const sc = new Set(sessionColumns.map((r) => r.COLUMN_NAME));
    const idParts = ['inbound_session', 'title', 'name'].filter((c) => sc.has(c));
    const idClause = idParts.length
      ? idParts.map((c) => `${c} = ?`).join(' OR ')
      : 'title = ?';
    const idParams = idParts.length ? idParts.map(() => pt) : [pt];
    const sessionIdColumn = sc.has('inbound_session') ? 'inbound_session' : 'title';

    const [sessions] = await connection.execute(
      `SELECT ${sessionIdColumn} FROM tabInboundSession WHERE ${idClause} LIMIT 1`,
      idParams
    );

    if (sessions.length === 0) {
      return res.status(422).json({
        ok: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: `Inbound session ${pt} not found`,
          hint: 'Use the same id as POST /api/inbound/session/start (title / inbound_session / name on tabInboundSession).',
        },
      });
    }

    const [existing] = await connection.execute(
      `SELECT id, parent_title, unit_type, unit_id, scanned_by, scanned_on, created_at, updated_at${ulMeta.selectSuffix}
       FROM tabInboundUnloadLine
       WHERE parent_title = ? AND unit_type = ? AND unit_id = ?
       LIMIT 1`,
      [pt, ut, uid]
    );

    if (existing.length > 0) {
      return res.status(409).json(duplicateUnloadResponse(pt, ut, uid, formatUnloadLineRow(existing[0])));
    }

    const cross = await findCrossSessionUnloadDuplicate(connection, sessionIdColumn, pt, ut, uid);
    if (cross) {
      return res.status(409).json(
        crossSessionUnloadResponse(
          ut,
          uid,
          formatUnloadLineRow(cross.row),
          cross.sourceDoc,
          cross.sourceKind
        )
      );
    }

    const insertCols = ['parent_title', 'unit_type', 'unit_id', 'scanned_by', 'scanned_on'];
    const insertVals = [pt, ut, uid, scanned_by, scannedTimestamp];
    if (ulMeta.hasDeviceId) {
      insertCols.push('device_id');
      insertVals.push(deviceIdNorm);
    }
    if (ulMeta.hasSessionJti && jti) {
      insertCols.push('session_jti');
      insertVals.push(jti);
    }
    await connection.execute(
      `INSERT INTO tabInboundUnloadLine (${insertCols.join(', ')}) VALUES (${insertCols.map(() => '?').join(', ')})`,
      insertVals
    );

    return res.status(201).json({
      ok: true,
      message: 'Unload line created',
      data: {
        parent_title: pt,
        unit_type: ut,
        unit_id: uid,
        scanned_by,
        scanned_on: isoOut,
        session_jti: jti || undefined,
        device_id: deviceIdNorm ?? null,
      },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
      return res.status(409).json(duplicateUnloadResponse(pt, ut, uid, null));
    }
    console.error('Failed to create unload line:', error);
    return res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to create unload line',
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

