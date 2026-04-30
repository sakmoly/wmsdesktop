// wms-api/src/modules/cartons/cartonController.js
// Carton locking and status management endpoints

import { getConnection } from '../../db/connection.js';

/**
 * POST /api/carton/lock
 * Lock a carton for receiving (prevent concurrent access)
 * 
 * Request Body:
 * {
 *   "inbound_session": "INB-0001",
 *   "asn_no": "ASN-0002",
 *   "carton_id": "CTN-0101",
 *   "user_id": "operator1",
 *   "device_id": "DEVICE-001" (optional)
 * }
 * 
 * Response:
 * {
 *   "locked": true,
 *   "message": "Carton locked successfully"
 * }
 * 
 * OR if already locked:
 * {
 *   "locked": false,
 *   "message": "Carton is already being processed by operator2"
 * }
 */
export const lockCarton = async (req, res) => {
  const { inbound_session, asn_no, carton_id, user_id, device_id } = req.body;
  
  // Validation
  if (!inbound_session || !asn_no || !carton_id || !user_id) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Missing required fields: inbound_session, asn_no, carton_id, user_id'
    });
  }
  
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();

    // Resolve schema differences (asn_no vs advance_shipping_notice, optional device_id).
    const [asnCols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabReceivingCarton'
        AND COLUMN_NAME IN ('asn_no', 'advance_shipping_notice')
    `);
    const asnColumn = asnCols.some((r) => r.COLUMN_NAME === 'asn_no')
      ? 'asn_no'
      : 'advance_shipping_notice';
    const [deviceCols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabReceivingCarton'
        AND COLUMN_NAME = 'device_id'
    `);
    const hasDeviceIdCol = deviceCols.length > 0;
    
    // Check carton-level lock across sessions for the same ASN.
    // This prevents duplicate lock on different sessions/devices.
    const [existing] = await connection.query(`
      SELECT locked_by, status, inbound_session${hasDeviceIdCol ? ', device_id' : ''}
      FROM tabReceivingCarton
      WHERE ${asnColumn} = ?
        AND carton_id = ?
      ORDER BY updated_on DESC
      LIMIT 1
    `, [asn_no, carton_id]);
    
    if (existing.length > 0) {
      const carton = existing[0];
      const lockedSession = carton.inbound_session || null;
      const lockedDevice = hasDeviceIdCol ? (carton.device_id || null) : null;

      // Different user: block with explicit lock owner message.
      if (carton.locked_by && carton.locked_by !== user_id && carton.status === 'Receiving') {
        await connection.rollback();
        connection.release();
        
        return res.status(409).json({
          locked: false,
          code: 'CARTON_ALREADY_LOCKED',
          message: `Carton already locked by ${carton.locked_by}`,
          lock: {
            carton_id,
            asn_no,
            locked_by: carton.locked_by,
            inbound_session: lockedSession,
            device_id: lockedDevice
          }
        });
      }

      // Same user + same session: idempotent no-op success.
      if (carton.locked_by === user_id && lockedSession === inbound_session && carton.status === 'Receiving') {
        await connection.commit();
        connection.release();
        return res.json({
          locked: true,
          no_action: true,
          message: 'Carton already locked by this user in the same session',
          lock: {
            carton_id,
            asn_no,
            locked_by: user_id,
            inbound_session,
            device_id: lockedDevice
          }
        });
      }
    }
    
    // Check row for this exact session/carton for UPSERT path.
    const [existingCurrentSession] = await connection.query(`
      SELECT locked_by, status
      FROM tabReceivingCarton
      WHERE ${asnColumn} = ? 
        AND inbound_session = ? 
        AND carton_id = ?
      LIMIT 1
    `, [asn_no, inbound_session, carton_id]);
    
    if (existingCurrentSession.length > 0) {
      const carton = existingCurrentSession[0];
    
      // Guard current-session row as well (defensive).
      if (carton.locked_by && carton.locked_by !== user_id && carton.status === 'Receiving') {
        await connection.rollback();
        connection.release();
        
        return res.status(409).json({
          locked: false,
          code: 'CARTON_ALREADY_LOCKED',
          message: `Carton already locked by ${carton.locked_by}`
        });
      }
    }
    
    // Insert or update carton status to "Receiving" and lock it
    const lockSql = hasDeviceIdCol
      ? `
      INSERT INTO tabReceivingCarton 
        (carton_id, ${asnColumn}, inbound_session, status, locked_by, locked_on, updated_on, device_id)
      VALUES (?, ?, ?, 'Receiving', ?, NOW(), NOW(), ?)
      ON DUPLICATE KEY UPDATE
        status = 'Receiving',
        locked_by = VALUES(locked_by),
        locked_on = NOW(),
        updated_on = NOW(),
        device_id = VALUES(device_id)
    `
      : `
      INSERT INTO tabReceivingCarton 
        (carton_id, ${asnColumn}, inbound_session, status, locked_by, locked_on, updated_on)
      VALUES (?, ?, ?, 'Receiving', ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        status = 'Receiving',
        locked_by = VALUES(locked_by),
        locked_on = NOW(),
        updated_on = NOW()
    `;
    const lockParams = hasDeviceIdCol
      ? [carton_id, asn_no, inbound_session, user_id, device_id || null]
      : [carton_id, asn_no, inbound_session, user_id];
    await connection.query(lockSql, lockParams);
    
    // Also update tabAsnItemDetails.carton_assigned_status to "Receiving"
    try {
      await connection.query(`
        UPDATE tabAsnItemDetails
        SET carton_assigned_status = 'Receiving',
            updated_at = NOW()
        WHERE carton_id = ? 
          AND parent_title = ?
      `, [carton_id, asn_no]);
    } catch (asnItemError) {
      // Non-critical - log but don't fail the transaction
      console.warn(`Failed to update tabAsnItemDetails for carton ${carton_id}:`, asnItemError.message);
    }
    
    await connection.commit();
    
    console.log(`Carton locked: ${carton_id} by ${user_id} for ASN ${asn_no}`);
    
    res.json({
      locked: true,
      message: 'Carton locked successfully',
      lock: {
        carton_id,
        asn_no,
        locked_by: user_id,
        inbound_session,
        device_id: device_id || null
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Failed to lock carton:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to lock carton',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/carton/complete
 * Mark carton as completed (clear lock and set status to Received)
 * 
 * Request Body:
 * {
 *   "inbound_session": "INB-0001",
 *   "asn_no": "ASN-0002",
 *   "carton_id": "CTN-0101",
 *   "user_id": "operator1",
 *   "device_id": "DEVICE-001" (optional)
 * }
 * 
 * Response:
 * {
 *   "ok": true,
 *   "message": "Carton completed successfully"
 * }
 */
export const completeCarton = async (req, res) => {
  const { inbound_session, asn_no, carton_id, user_id, device_id } = req.body;
  
  // Validation
  if (!inbound_session || !asn_no || !carton_id || !user_id) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Missing required fields: inbound_session, asn_no, carton_id, user_id'
    });
  }
  
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();

    const [asnCols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabReceivingCarton'
        AND COLUMN_NAME IN ('asn_no', 'advance_shipping_notice')
    `);
    const asnColumn = asnCols.some((r) => r.COLUMN_NAME === 'asn_no')
      ? 'asn_no'
      : 'advance_shipping_notice';
    const [deviceCols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabReceivingCarton'
        AND COLUMN_NAME = 'device_id'
    `);
    const hasDeviceIdCol = deviceCols.length > 0;

    // Enforce lock ownership before completing.
    const [lockRows] = await connection.query(
      `SELECT locked_by, status, inbound_session${hasDeviceIdCol ? ', device_id' : ''}
       FROM tabReceivingCarton
       WHERE ${asnColumn} = ?
         AND carton_id = ?
       ORDER BY updated_on DESC
       LIMIT 1`,
      [asn_no, carton_id]
    );
    if (lockRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        code: 'CARTON_NOT_FOUND',
        message: `Carton ${carton_id} not found for ASN ${asn_no}`
      });
    }
    const lock = lockRows[0];
    if (lock.locked_by && lock.locked_by !== user_id && lock.status === 'Receiving') {
      await connection.rollback();
      return res.status(409).json({
        ok: false,
        code: 'CARTON_LOCKED_BY_OTHER_USER',
        message: `Carton already locked by ${lock.locked_by}`,
        lock: {
          carton_id,
          asn_no,
          locked_by: lock.locked_by,
          inbound_session: lock.inbound_session || null,
          device_id: hasDeviceIdCol ? (lock.device_id || null) : null
        }
      });
    }
    
    // Update carton status to Received and clear lock
    const completeSql = hasDeviceIdCol
      ? `
      UPDATE tabReceivingCarton
      SET status = 'Received',
          received_by = ?,
          received_on = NOW(),
          locked_by = NULL,
          locked_on = NULL,
          updated_on = NOW(),
          device_id = COALESCE(?, device_id)
      WHERE ${asnColumn} = ? 
        AND inbound_session = ? 
        AND carton_id = ?
    `
      : `
      UPDATE tabReceivingCarton
      SET status = 'Received',
          received_by = ?,
          received_on = NOW(),
          locked_by = NULL,
          locked_on = NULL,
          updated_on = NOW()
      WHERE ${asnColumn} = ? 
        AND inbound_session = ? 
        AND carton_id = ?
    `;
    const completeParams = hasDeviceIdCol
      ? [user_id, device_id || null, asn_no, inbound_session, carton_id]
      : [user_id, asn_no, inbound_session, carton_id];
    const [completeResult] = await connection.query(completeSql, completeParams);
    if (!completeResult || completeResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(409).json({
        ok: false,
        code: 'SESSION_MISMATCH',
        message: `Carton lock belongs to a different inbound_session. Expected ${inbound_session}.`
      });
    }
    
    // Also update tabAsnItemDetails.carton_assigned_status to "Received"
    try {
      await connection.query(`
        UPDATE tabAsnItemDetails
        SET carton_assigned_status = 'Received',
            updated_at = NOW()
        WHERE carton_id = ? 
          AND parent_title = ?
      `, [carton_id, asn_no]);
    } catch (asnItemError) {
      // Non-critical - log but don't fail the transaction
      console.warn(`Failed to update tabAsnItemDetails for carton ${carton_id}:`, asnItemError.message);
    }
    
    await connection.commit();
    
    console.log(`Carton completed: ${carton_id} by ${user_id} for ASN ${asn_no}`);
    
    res.json({
      ok: true,
      message: 'Carton completed successfully'
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Failed to complete carton:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to complete carton',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
};

