/**
 * unifiedInboundController.js
 * Unified inbound controller for ASN and Transfer In
 * Uses same APIs and flow for consistency
 */

import { getConnection } from '../../db/connection.js';
import { normalizeCartonId, validateForPutaway } from '../../utils/scanNormalize.js';
import { insertScanEvent } from '../../services/scanEventService.js';
import { applyStockMovement } from '../../services/stockMovementService.js';
// Note: These functions are imported dynamically when needed to avoid circular dependencies
import { logger } from '../../utils/logger.js';

function inboundSessionIdWhereClause(columnNames, sessionId) {
  const cols = ['inbound_session', 'title', 'name'].filter((c) => columnNames.has(c));
  if (!cols.length) {
    const fallback = columnNames.has('inbound_session') ? 'inbound_session' : 'title';
    return { clause: `${fallback} = ?`, params: [sessionId] };
  }
  return {
    clause: cols.map((c) => `${c} = ?`).join(' OR '),
    params: cols.map(() => sessionId),
  };
}

function sessionRowDocMatches(row, source_type, effectiveDoc, asnColumn, columnNames) {
  if (source_type === 'TransferIn') {
    if (!columnNames.has('transfer_in')) return false;
    return String(row.transfer_in || '').trim() === String(effectiveDoc).trim();
  }
  return String(row[asnColumn] || '').trim() === String(effectiveDoc).trim();
}

/**
 * POST /api/inbound/session/start
 * Mobile supplies inbound_session / requested_session_id (no server-generated IB-… id).
 * Idempotent: same session id + same ASN/TI returns existing row; otherwise 409 SESSION_ID_IN_USE.
 */
export const startInboundSession = async (req, res) => {
  const {
    source_type: sourceTypeInput,
    source_doc,
    asn_no,
    warehouse: warehouseInput,
    dock,
    user_id,
    device_id,
    transfer_order,
    inbound_session: inboundSessionInput,
    requested_session_id: requestedSessionIdInput,
  } = req.body;

  let source_type = sourceTypeInput;
  const effectiveDoc =
    source_doc != null && String(source_doc).trim() !== ''
      ? String(source_doc).trim()
      : asn_no != null && String(asn_no).trim() !== ''
        ? String(asn_no).trim()
        : null;

  if (!source_type && effectiveDoc) {
    source_type = 'ASN';
  }

  if (!source_type || (source_type !== 'ASN' && source_type !== 'TransferIn')) {
    return res.status(400).json({
      ok: false,
      code: 'VALIDATION_ERROR',
      message:
        'source_type must be "ASN" or "TransferIn" (or send asn_no / source_doc to default to ASN)',
    });
  }

  if (!effectiveDoc) {
    return res.status(400).json({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'source_doc or asn_no is required',
    });
  }

  const requestedSessionIdRaw =
    inboundSessionInput ?? requestedSessionIdInput ?? null;
  const requestedSessionId =
    requestedSessionIdRaw != null && String(requestedSessionIdRaw).trim() !== ''
      ? String(requestedSessionIdRaw).trim()
      : null;
  if (!requestedSessionId) {
    return res.status(400).json({
      ok: false,
      code: 'SESSION_ID_REQUIRED',
      message: 'Mobile must provide inbound_session or requested_session_id',
    });
  }
  const sessionId = requestedSessionId;

  const connection = await getConnection();

  try {
    let warehouse =
      warehouseInput != null && String(warehouseInput).trim() !== ''
        ? String(warehouseInput).trim()
        : null;
    if (!warehouse) {
      try {
        const [whRows] = await connection.execute(`
          SELECT code FROM tabWarehouse
          WHERE code IS NOT NULL AND TRIM(code) <> ''
          ORDER BY code ASC
          LIMIT 1
        `);
        if (whRows.length > 0) {
          warehouse = String(whRows[0].code).trim();
        }
      } catch (whErr) {
        logger.warn('[Unified Inbound] warehouse default lookup failed:', whErr.message);
      }
    }
    if (!warehouse && process.env.WMS_INBOUND_DEFAULT_WAREHOUSE) {
      warehouse = String(process.env.WMS_INBOUND_DEFAULT_WAREHOUSE).trim();
    }
    if (!warehouse) {
      connection.release();
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        message:
          'warehouse is required (send warehouse, add tabWarehouse rows, or set WMS_INBOUND_DEFAULT_WAREHOUSE)',
      });
    }

    // Verify source document exists
    if (source_type === 'ASN') {
      const [asnRows] = await connection.execute(
        `SELECT title FROM tabAdvanceShippingNotice WHERE title = ? LIMIT 1`,
        [effectiveDoc]
      );
      if (asnRows.length === 0) {
        connection.release();
        return res.status(404).json({
          ok: false,
          code: 'ASN_NOT_FOUND',
          message: `ASN ${effectiveDoc} not found`,
        });
      }
    } else if (source_type === 'TransferIn') {
      const [tiRows] = await connection.execute(
        `SELECT title FROM tabTransferIn WHERE title = ? LIMIT 1`,
        [effectiveDoc]
      );
      if (tiRows.length === 0) {
        connection.release();
        return res.status(404).json({
          ok: false,
          code: 'TRANSFER_IN_NOT_FOUND',
          message: `Transfer In ${effectiveDoc} not found`,
        });
      }
    }

    let finalTransferOrder =
      transfer_order != null && String(transfer_order).trim() !== ''
        ? String(transfer_order).trim()
        : null;

    const lookupTransferOrderByAsn = async () => {
      const [toRows] = await connection.execute(
        `SELECT title FROM tabTransferOrder WHERE advance_shipping_notice = ? LIMIT 1`,
        [effectiveDoc]
      );
      return toRows.length ? toRows[0].title : null;
    };

    if (source_type === 'ASN') {
      try {
        if (finalTransferOrder) {
          const [chk] = await connection.execute(
            `SELECT title FROM tabTransferOrder WHERE title = ? LIMIT 1`,
            [finalTransferOrder]
          );
          if (chk.length === 0) {
            const resolved = await lookupTransferOrderByAsn();
            if (resolved) {
              finalTransferOrder = resolved;
              logger.info(
                `[Unified Inbound] transfer_order from body not found; using ASN-linked TO: ${resolved}`
              );
            }
          }
        } else {
          finalTransferOrder = await lookupTransferOrderByAsn();
        }
      } catch (toErr) {
        logger.warn('[Unified Inbound] transfer_order resolve failed:', toErr.message);
      }
    }

    const [sessionColumns] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabInboundSession'
        AND COLUMN_NAME IN (
          'inbound_session', 'title', 'name', 'advance_shipping_notice', 'asn_no', 'transfer_in',
          'warehouse', 'dock', 'transfer_order', 'user_id', 'started_by', 'status', 'device_id',
          'started_at', 'started_on', 'updated_at', 'completed_cartons', 'total_cartons'
        )
    `);

    const columnNames = new Set(sessionColumns.map((col) => col.COLUMN_NAME));
    const sessionIdColumn = columnNames.has('inbound_session')
      ? 'inbound_session'
      : 'title';
    const asnColumn = columnNames.has('asn_no') ? 'asn_no' : 'advance_shipping_notice';
    const hasDeviceIdCol = columnNames.has('device_id');

    let userNorm =
      user_id != null && String(user_id).trim() !== '' ? String(user_id).trim() : null;
    if (!userNorm && req.body.started_by != null && String(req.body.started_by).trim() !== '') {
      userNorm = String(req.body.started_by).trim();
    }
    const deviceNorm =
      device_id != null && String(device_id).trim() !== '' ? String(device_id).trim() : null;

    const hasUserCol = columnNames.has('user_id') || columnNames.has('started_by');

    const idWhere = inboundSessionIdWhereClause(columnNames, sessionId);
    const [existingRows] = await connection.execute(
      `SELECT * FROM tabInboundSession WHERE ${idWhere.clause} LIMIT 1`,
      idWhere.params
    );

    if (existingRows.length > 0) {
      const row = existingRows[0];
      if (!sessionRowDocMatches(row, source_type, effectiveDoc, asnColumn, columnNames)) {
        connection.release();
        return res.status(409).json({
          ok: false,
          code: 'SESSION_ID_IN_USE',
          message: `inbound_session "${sessionId}" already exists for a different document.`,
        });
      }

      const updates = [];
      const uvals = [];
      if (columnNames.has('warehouse')) {
        updates.push('warehouse = ?');
        uvals.push(warehouse);
      }
      if (columnNames.has('dock')) {
        updates.push('dock = ?');
        uvals.push(dock || null);
      }
      if (hasDeviceIdCol && deviceNorm != null) {
        updates.push('device_id = ?');
        uvals.push(deviceNorm);
      }
      if (columnNames.has('user_id') && userNorm) {
        updates.push('user_id = ?');
        uvals.push(userNorm);
      }
      if (columnNames.has('started_by') && userNorm) {
        updates.push('started_by = ?');
        uvals.push(userNorm);
      }
      if (columnNames.has('transfer_order') && finalTransferOrder) {
        updates.push('transfer_order = ?');
        uvals.push(finalTransferOrder);
      }
      if (updates.length === 0) {
        await connection.execute(
          `UPDATE tabInboundSession SET updated_at = NOW() WHERE ${idWhere.clause}`,
          idWhere.params
        );
      } else {
        uvals.push(...idWhere.params);
        await connection.execute(
          `UPDATE tabInboundSession SET ${updates.join(', ')}, updated_at = NOW() WHERE ${idWhere.clause}`,
          uvals
        );
      }

      await insertScanEvent(connection, {
        event_type: 'INBOUND_SESSION_START',
        source_type,
        source_doc: effectiveDoc,
        warehouse,
        carton_id: null,
        user_id,
        payload: {
          session_id: sessionId,
          dock,
          transfer_order: finalTransferOrder,
          reused: true,
        },
      });

      connection.release();
      logger.info(
        `[Unified Inbound] Idempotent reuse session ${sessionId} for ${source_type} ${effectiveDoc}`
      );
      const outUid = row.user_id || row.started_by || userNorm || '';
      const outDev = row.device_id != null ? String(row.device_id) : deviceNorm || '';
      return res.json({
        ok: true,
        inbound_session: sessionId,
        session_id: sessionId,
        status: row.status || 'Receiving',
        user_id: outUid,
        device_id: outDev,
        reused: true,
      });
    }

    if (hasUserCol && !userNorm) {
      connection.release();
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'user_id or started_by is required to start an inbound session',
      });
    }

    const insertFields = [];
    const insertValues = [];
    const placeholders = [];
    const idCols = ['title', 'inbound_session', 'name'].filter((c) => columnNames.has(c));
    for (const col of idCols) {
      insertFields.push(col);
      insertValues.push(sessionId);
      placeholders.push('?');
    }
    if (insertFields.length === 0) {
      insertFields.push(sessionIdColumn);
      insertValues.push(sessionId);
      placeholders.push('?');
    }

    insertFields.push('status');
    insertValues.push('Receiving');
    placeholders.push('?');

    if (source_type === 'ASN' && columnNames.has(asnColumn)) {
      insertFields.push(asnColumn);
      insertValues.push(effectiveDoc);
      placeholders.push('?');
    } else if (source_type === 'TransferIn' && columnNames.has('transfer_in')) {
      insertFields.push('transfer_in');
      insertValues.push(effectiveDoc);
      placeholders.push('?');
    }

    if (columnNames.has('warehouse')) {
      insertFields.push('warehouse');
      insertValues.push(warehouse);
      placeholders.push('?');
    }

    if (columnNames.has('dock')) {
      insertFields.push('dock');
      insertValues.push(dock || null);
      placeholders.push('?');
    }

    if (columnNames.has('transfer_order')) {
      insertFields.push('transfer_order');
      insertValues.push(finalTransferOrder || null);
      placeholders.push('?');
    }

    if (columnNames.has('completed_cartons')) {
      insertFields.push('completed_cartons');
      insertValues.push(0);
      placeholders.push('?');
    }
    if (columnNames.has('total_cartons')) {
      insertFields.push('total_cartons');
      insertValues.push(0);
      placeholders.push('?');
    }

    const insertUserVal = userNorm || user_id || null;
    if (columnNames.has('user_id')) {
      insertFields.push('user_id');
      insertValues.push(insertUserVal);
      placeholders.push('?');
    }
    if (columnNames.has('started_by')) {
      insertFields.push('started_by');
      insertValues.push(insertUserVal);
      placeholders.push('?');
    }

    if (hasDeviceIdCol) {
      insertFields.push('device_id');
      insertValues.push(deviceNorm);
      placeholders.push('?');
    }

    await connection.execute(
      `INSERT INTO tabInboundSession (${insertFields.join(', ')}, created_at, updated_at)
       VALUES (${placeholders.join(', ')}, NOW(), NOW())`,
      insertValues
    );

    // Insert scan event
    await insertScanEvent(connection, {
      event_type: 'INBOUND_SESSION_START',
      source_type,
      source_doc: effectiveDoc,
      warehouse,
      carton_id: null,
      user_id,
      payload: { session_id: sessionId, dock, transfer_order: finalTransferOrder, reused: false },
    });

    connection.release();

    logger.info(`[Unified Inbound] Started session ${sessionId} for ${source_type} ${effectiveDoc}`);

    return res.json({
      ok: true,
      inbound_session: sessionId,
      session_id: sessionId,
      status: 'Receiving',
      user_id: insertUserVal || '',
      device_id: deviceNorm || '',
      reused: false,
    });

  } catch (error) {
    connection.release();
    logger.error('[Unified Inbound] Failed to start session:', error);
    res.status(500).json({
      ok: false,
      code: 'DATABASE_ERROR',
      message: 'Failed to start inbound session',
      details: process.env.NODE_ENV === 'development' ? error.message : null,
    });
  }
};

/**
 * POST /api/inbound/carton/generate
 * Generate carton ID for inbound session
 * 
 * Request:
 * { "session_id": "IB-20260120-000123" }
 * 
 * Response:
 * { "success": true, "carton_id": "CTN-TI-123457-20260120-192254-116" }
 */
export const generateCartonId = async (req, res) => {
  const sessionKeyRaw =
    req.body.session_id ||
    req.body.inbound_session ||
    req.body.requested_session_id;
  const session_id =
    sessionKeyRaw != null && String(sessionKeyRaw).trim() !== ''
      ? String(sessionKeyRaw).trim()
      : null;

  if (!session_id) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'session_id (or inbound_session / requested_session_id) is required'
      }
    });
  }

  // Generate carton ID based on source type
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const time = new Date().toISOString().slice(11, 19).replace(/:/g, '');

  // Get source type from session
  const connection = await getConnection();

  try {
    const [sessionColumns] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabInboundSession'
        AND COLUMN_NAME IN ('inbound_session', 'title', 'name', 'advance_shipping_notice', 'asn_no', 'transfer_in')
    `);

    const columnNames = new Set(sessionColumns.map(col => col.COLUMN_NAME));
    const asnColumn = columnNames.has('asn_no') ? 'asn_no' : 'advance_shipping_notice';
    const idWhere = inboundSessionIdWhereClause(columnNames, session_id);

    const [sessions] = await connection.execute(
      `SELECT * FROM tabInboundSession WHERE ${idWhere.clause} LIMIT 1`,
      idWhere.params
    );

    if (sessions.length === 0) {
      connection.release();
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: `Inbound session ${session_id} not found`
        }
      });
    }

    const session = sessions[0];
    const sourceDoc = session.transfer_in || session[asnColumn] || 'UNKNOWN';
    const sourceType = session.transfer_in ? 'TransferIn' : 'ASN';

    // Generate carton ID: CTN-{type}-{doc}-{date}-{time}-{random}
    const prefix = sourceType === 'TransferIn' ? 'CTN-TI' : 'CTN-ASN';
    const docShort = sourceDoc.replace(/[^A-Z0-9]/g, '').substring(0, 6);
    const carton_id = `${prefix}-${docShort}-${date}-${time}-${random}`;

    connection.release();

    logger.info(`[Unified Inbound] Generated carton_id ${carton_id} for session ${session_id}`);

    res.json({
      success: true,
      carton_id
    });

  } catch (error) {
    connection.release();
    logger.error('[Unified Inbound] Failed to generate carton ID:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to generate carton ID',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  }
};

/**
 * POST /api/inbound/carton/validate
 * Validate carton and insert scan event with box_id + store
 * 
 * Request:
 * {
 *   "session_id": "IB-20260120-000123",
 *   "source_type": "TransferIn",
 *   "source_doc": "INSLIP-123457",
 *   "warehouse": "WH-MAIN",
 *   "carton_id": "CTN-TI-123457-20260120-192254-116",
 *   "user_id": "USER-150526"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "carton_id": "CTN-TI-123457-20260120-192254-116",
 *   "box_id": "CTN-TI-123457-20260120-192254-116"
 * }
 */
export const validateCarton = async (req, res) => {
  const { session_id, source_type, source_doc, warehouse, carton_id, user_id } = req.body;

  // Validation
  if (!carton_id) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'carton_id is required'
      }
    });
  }

  // Normalize and validate carton ID
  const normalized = normalizeCartonId(carton_id);
  if (!normalized.ok) {
    return res.status(400).json({
      success: false,
      error: {
        code: normalized.reason,
        message: normalized.message || `Invalid carton ID format: ${carton_id}`
      }
    });
  }

  const validCartonId = normalized.carton_id;
  const box_id = normalized.box_id; // Always = carton_id

  const connection = await getConnection();

  try {
    // Verify source document exists
    if (source_type === 'ASN') {
      const [asnRows] = await connection.execute(
        `SELECT title FROM tabAdvanceShippingNotice WHERE title = ? LIMIT 1`,
        [source_doc]
      );
      if (asnRows.length === 0) {
        connection.release();
        return res.status(404).json({
          success: false,
          error: {
            code: 'ASN_NOT_FOUND',
            message: `ASN ${source_doc} not found`
          }
        });
      }
    } else if (source_type === 'TransferIn') {
      const [tiRows] = await connection.execute(
        `SELECT title FROM tabTransferIn WHERE title = ? LIMIT 1`,
        [source_doc]
      );
      if (tiRows.length === 0) {
        connection.release();
        return res.status(404).json({
          success: false,
          error: {
            code: 'TRANSFER_IN_NOT_FOUND',
            message: `Transfer In ${source_doc} not found`
          }
        });
      }
    }

    // Insert scan event with box_id and store (CRITICAL: never NULL)
    await insertScanEvent(connection, {
      event_type: 'CARTON_VALIDATED',
      source_type,
      source_doc,
      warehouse,
      carton_id: validCartonId,
      user_id,
      payload: { session_id, box_id }
    });

    connection.release();

    logger.info(`[Unified Inbound] Validated carton ${validCartonId} (box_id=${box_id}) for ${source_type} ${source_doc}`);

    res.json({
      success: true,
      carton_id: validCartonId,
      box_id
    });

  } catch (error) {
    connection.release();
    logger.error('[Unified Inbound] Failed to validate carton:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to validate carton',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  }
};

/**
 * POST /api/inbound/receive
 * Receive item scan (ONE endpoint for ASN + TransferIn)
 * 
 * Request:
 * {
 *   "session_id": "IB-20260120-000123",
 *   "source_type": "ASN",
 *   "source_doc": "ASN-365425473",
 *   "warehouse": "WH-MAIN",
 *   "carton_id": "CTN-ASN-365425473-20260120-001",
 *   "item_code": "SKU-HAT-301-BLU-OS",
 *   "qty": 2,
 *   "user_id": "USER-150526"
 * }
 * 
 * Response:
 * { "success": true }
 */
export const receiveItem = async (req, res) => {
  const { session_id, source_type, source_doc, warehouse, carton_id, item_code, qty, user_id } = req.body;

  // Validation
  if (!carton_id || !item_code || qty === null || qty === undefined) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'carton_id, item_code, and qty are required'
      }
    });
  }

  // Normalize carton ID
  const normalized = normalizeCartonId(carton_id);
  if (!normalized.ok) {
    return res.status(400).json({
      success: false,
      error: {
        code: normalized.reason,
        message: normalized.message || `Invalid carton ID format: ${carton_id}`
      }
    });
  }

  const validCartonId = normalized.carton_id;
  const box_id = normalized.box_id;

  const connection = await getConnection();

  try {
    const { findMissingItemCodesInMaster } = await import('../../utils/itemMasterValidate.js');
    const missUnified = await findMissingItemCodesInMaster(connection, [item_code]);
    if (missUnified.length > 0) {
      connection.release();
      return res.status(400).json({
        success: false,
        error: {
          code: 'ITEM_NOT_IN_MASTER',
          message: `Item code(s) not in Item master (tabItem): ${missUnified.join(', ')}`,
          missing_item_codes: missUnified,
        },
      });
    }

    await connection.beginTransaction();

    // Process receive based on source type
    if (source_type === 'ASN') {
      // ASN receiving logic (use existing ASN receive logic)
      // TODO: Integrate with existing ASN receive endpoint
      logger.info(`[Unified Inbound] Processing ASN receive: ${item_code} x ${qty} in ${validCartonId}`);
    } else if (source_type === 'TransferIn') {
      // Transfer In receiving logic (use existing Transfer In receive logic)
      // TODO: Integrate with existing Transfer In receive endpoint
      logger.info(`[Unified Inbound] Processing Transfer In receive: ${item_code} x ${qty} in ${validCartonId}`);
    }

    // Insert scan event with box_id and store (CRITICAL: never NULL)
    await insertScanEvent(connection, {
      event_type: 'RECEIVE_ITEM_SCAN',
      source_type,
      source_doc,
      warehouse,
      carton_id: validCartonId,
      user_id,
      item_code,
      qty: parseFloat(qty),
      payload: { session_id, box_id }
    });

    await connection.commit();
    connection.release();

    logger.info(`[Unified Inbound] Received ${item_code} x ${qty} in carton ${validCartonId}`);

    res.json({
      success: true
    });

  } catch (error) {
    await connection.rollback();
    connection.release();
    logger.error('[Unified Inbound] Failed to receive item:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to receive item',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  }
};

/**
 * POST /api/inbound/session/complete
 * Complete inbound session (creates Putaway Task)
 * 
 * Request:
 * {
 *   "session_id": "IB-20260120-000123",
 *   "source_type": "TransferIn",
 *   "source_doc": "INSLIP-123457",
 *   "warehouse": "WH-MAIN",
 *   "user_id": "USER-150526"
 * }
 * 
 * Response:
 * { "success": true, "putaway_task": "PUT-20260120-0001" }
 */
export const completeInboundSession = async (req, res) => {
  const { session_id, source_type, source_doc, warehouse, user_id } = req.body;

  // Validation
  if (!source_type || !source_doc || !warehouse) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'source_type, source_doc, and warehouse are required'
      }
    });
  }

  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    let putawayTaskTitle = null;

    if (source_type === 'TransferIn') {
      // Import dynamically to avoid circular dependencies
      const { createPutawayTaskFromTransferIn } = await import('../transfer-in/transferInController.js');
      
      // Create putaway task for Transfer In
      await createPutawayTaskFromTransferIn(connection, source_doc, warehouse);
      
      // Get created putaway task
      const [taskRows] = await connection.execute(
        `SELECT title FROM tabPutawayTask WHERE transfer_in = ? ORDER BY created_at DESC LIMIT 1`,
        [source_doc]
      );

      if (taskRows.length > 0) {
        putawayTaskTitle = taskRows[0].title;

        // Ensure boxes are created (function is internal, call via transferInController)
        // Note: ensurePutawayBoxesForTransferIn is called automatically by createPutawayTaskFromTransferIn
        // If needed, we can call it explicitly here
      }
    } else if (source_type === 'ASN') {
      // Create putaway task for ASN
      // TODO: Integrate with existing ASN putaway task creation
      logger.info(`[Unified Inbound] ASN putaway task creation - TODO: integrate with existing logic`);
    }

    // Update session status
    const [sessionColumns] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabInboundSession'
        AND COLUMN_NAME IN ('inbound_session', 'title', 'status', 'completed_on')
    `);

    const columnNames = new Set(sessionColumns.map(col => col.COLUMN_NAME));
    const sessionIdColumn = columnNames.has('inbound_session') ? 'inbound_session' : 'title';

    await connection.execute(
      `UPDATE tabInboundSession 
       SET status = 'Completed'${columnNames.has('completed_on') ? ', completed_on = NOW()' : ''}, updated_at = NOW()
       WHERE ${sessionIdColumn} = ?`,
      [session_id]
    );

    // Insert scan event
    await insertScanEvent(connection, {
      event_type: 'INBOUND_SESSION_COMPLETE',
      source_type,
      source_doc,
      warehouse,
      carton_id: null,
      user_id,
      payload: { session_id, putaway_task: putawayTaskTitle }
    });

    await connection.commit();
    connection.release();

    logger.info(`[Unified Inbound] Completed session ${session_id}, created putaway task: ${putawayTaskTitle}`);

    res.json({
      success: true,
      putaway_task: putawayTaskTitle
    });

  } catch (error) {
    await connection.rollback();
    connection.release();
    logger.error('[Unified Inbound] Failed to complete session:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to complete inbound session',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  }
};
