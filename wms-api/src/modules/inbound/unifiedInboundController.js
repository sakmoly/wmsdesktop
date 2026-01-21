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

/**
 * POST /api/inbound/session/start
 * Start inbound session (ASN or Transfer In)
 * 
 * Request:
 * {
 *   "source_type": "ASN" | "TransferIn",
 *   "source_doc": "ASN-xxxxx" | "INSLIP-xxxxx",
 *   "warehouse": "WH-MAIN",
 *   "dock": "DOCK-01",
 *   "user_id": "USER-150526"
 * }
 * 
 * Response:
 * { "success": true, "session_id": "IB-20260120-000123" }
 */
export const startInboundSession = async (req, res) => {
  const { source_type, source_doc, warehouse, dock, user_id } = req.body;

  // Validation
  if (!source_type || (source_type !== 'ASN' && source_type !== 'TransferIn')) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'source_type must be "ASN" or "TransferIn"'
      }
    });
  }

  if (!source_doc) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'source_doc is required'
      }
    });
  }

  if (!warehouse) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'warehouse is required'
      }
    });
  }

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

    // Generate session ID: IB-{date}-{sequence}
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const sequence = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    const session_id = `IB-${date}-${sequence}`;

    // Create inbound session
    const [sessionColumns] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabInboundSession'
        AND COLUMN_NAME IN ('inbound_session', 'title', 'advance_shipping_notice', 'asn_no', 'transfer_in', 'warehouse', 'dock', 'user_id', 'started_by', 'status')
    `);

    const columnNames = new Set(sessionColumns.map(col => col.COLUMN_NAME));
    const sessionIdColumn = columnNames.has('inbound_session') ? 'inbound_session' : 'title';
    const asnColumn = columnNames.has('asn_no') ? 'asn_no' : 'advance_shipping_notice';

    const insertFields = [sessionIdColumn, 'status'];
    const insertValues = [session_id, 'Active'];
    const placeholders = ['?', '?'];

    if (source_type === 'ASN' && columnNames.has(asnColumn)) {
      insertFields.push(asnColumn);
      insertValues.push(source_doc);
      placeholders.push('?');
    } else if (source_type === 'TransferIn' && columnNames.has('transfer_in')) {
      insertFields.push('transfer_in');
      insertValues.push(source_doc);
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

    if (columnNames.has('user_id')) {
      insertFields.push('user_id');
      insertValues.push(user_id || null);
      placeholders.push('?');
    } else if (columnNames.has('started_by')) {
      insertFields.push('started_by');
      insertValues.push(user_id || null);
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
      source_doc,
      warehouse,
      carton_id: null,
      user_id,
      payload: { session_id, dock }
    });

    connection.release();

    logger.info(`[Unified Inbound] Started session ${session_id} for ${source_type} ${source_doc}`);

    res.json({
      success: true,
      session_id
    });

  } catch (error) {
    connection.release();
    logger.error('[Unified Inbound] Failed to start session:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to start inbound session',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
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
  const { session_id } = req.body;

  if (!session_id) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'session_id is required'
      }
    });
  }

  // Generate carton ID based on source type
  const timestamp = Date.now();
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
        AND COLUMN_NAME IN ('inbound_session', 'title', 'advance_shipping_notice', 'asn_no', 'transfer_in')
    `);

    const columnNames = new Set(sessionColumns.map(col => col.COLUMN_NAME));
    const sessionIdColumn = columnNames.has('inbound_session') ? 'inbound_session' : 'title';
    const asnColumn = columnNames.has('asn_no') ? 'asn_no' : 'advance_shipping_notice';

    const [sessions] = await connection.execute(
      `SELECT ${sessionIdColumn}, ${asnColumn || 'NULL as asn'}, ${columnNames.has('transfer_in') ? 'transfer_in' : 'NULL as transfer_in'}
       FROM tabInboundSession WHERE ${sessionIdColumn} = ? LIMIT 1`,
      [session_id]
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
