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
    
    // Check if carton is already locked by another user
    // Note: Using tabReceivingCarton table (advance_shipping_notice = asn_no)
    const [existing] = await connection.query(`
      SELECT locked_by, status
      FROM tabReceivingCarton
      WHERE advance_shipping_notice = ? 
        AND inbound_session = ? 
        AND carton_id = ?
    `, [asn_no, inbound_session, carton_id]);
    
    if (existing.length > 0) {
      const carton = existing[0];
      
      // If locked by different user and still in "Receiving" status
      if (carton.locked_by && carton.locked_by !== user_id && carton.status === 'Receiving') {
        await connection.rollback();
        connection.release();
        
        return res.json({
          locked: false,
          message: `Carton is already being processed by ${carton.locked_by}`
        });
      }
    }
    
    // Insert or update carton status to "Receiving" and lock it
    await connection.query(`
      INSERT INTO tabReceivingCarton 
        (carton_id, advance_shipping_notice, inbound_session, status, locked_by, locked_on, updated_on)
      VALUES (?, ?, ?, 'Receiving', ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        status = 'Receiving',
        locked_by = VALUES(locked_by),
        locked_on = NOW(),
        updated_on = NOW()
    `, [carton_id, asn_no, inbound_session, user_id]);
    
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
      message: 'Carton locked successfully'
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
    
    // Update carton status to Received and clear lock
    await connection.query(`
      UPDATE tabReceivingCarton
      SET status = 'Received',
          received_by = ?,
          received_on = NOW(),
          locked_by = NULL,
          locked_on = NULL,
          updated_on = NOW()
      WHERE advance_shipping_notice = ? 
        AND inbound_session = ? 
        AND carton_id = ?
    `, [user_id, asn_no, inbound_session, carton_id]);
    
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

