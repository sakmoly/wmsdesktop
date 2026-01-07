// wms-api/src/modules/cartons/cartonController.js
// COMPLETE FIX: Update lockCarton function to use "Receiving" instead of "In Receiving"

import pool from '../../config/database.js';
import logger from '../../config/logger.js';
import { asyncHandler } from '../../utils/response.js';

/**
 * POST /api/carton/lock
 * Lock a carton for receiving (prevent concurrent access)
 * 
 * FIXED: Changed "In Receiving" to "Receiving" in all places
 */
export const lockCarton = asyncHandler(async (req, res) => {
  const { inbound_session, asn_no, carton_id, user_id, device_id } = req.body;
  
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Check if carton is already locked by another user
    const [existing] = await connection.query(`
      SELECT locked_by, status
      FROM tabCartonStatus
      WHERE asn_no = ? AND inbound_session = ? AND carton_id = ?
    `, [asn_no, inbound_session, carton_id]);
    
    if (existing.length > 0) {
      const carton = existing[0];
      
      // FIXED: Changed from 'In Receiving' to 'Receiving'
      // If locked by different user and still in "Receiving" status
      if (carton.locked_by && carton.locked_by !== user_id && carton.status === 'Receiving') {
        await connection.rollback();
        
        return res.json({
          locked: false,
          message: `Carton is already being processed by ${carton.locked_by}`
        });
      }
    }
    
    // FIXED: Changed from 'In Receiving' to 'Receiving' in both INSERT and UPDATE
    // Insert or update carton status
    await connection.query(`
      INSERT INTO tabCartonStatus 
      (asn_no, inbound_session, carton_id, status, locked_by, locked_on, updated_on)
      VALUES (?, ?, ?, 'Receiving', ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        status = 'Receiving',
        locked_by = VALUES(locked_by),
        locked_on = NOW(),
        updated_on = NOW()
    `, [asn_no, inbound_session, carton_id, user_id]);
    
    // Also update tabAsnItemDetails.carton_assigned_status
    try {
      await connection.query(`
        UPDATE tabAsnItemDetails
        SET carton_assigned_status = 'Receiving',
            updated_at = NOW()
        WHERE carton_id = ? 
          AND parent_title = ?
      `, [carton_id, asn_no]);
      logger.info({ carton_id, asn_no, status: 'Receiving' }, 'Updated tabAsnItemDetails.carton_assigned_status');
    } catch (asnItemError) {
      // Non-critical - log but don't fail
      logger.warn({ error: asnItemError.message, carton_id, asn_no }, 'Failed to update tabAsnItemDetails (non-critical)');
    }
    
    await connection.commit();
    
    logger.info({ carton_id, user_id, asn_no }, 'Carton locked');
    
    res.json({
      locked: true,
      message: 'Carton locked successfully'
    });
    
  } catch (error) {
    await connection.rollback();
    logger.error({ error, body: req.body }, 'Failed to lock carton');
    throw error;
  } finally {
    connection.release();
  }
});

/**
 * POST /api/carton/complete
 * Mark carton as completed (clear lock)
 * 
 * Verify this function doesn't have any "In Receiving" references
 */
export const completeCarton = asyncHandler(async (req, res) => {
  const { inbound_session, asn_no, carton_id, user_id, device_id } = req.body;
  
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Update carton status to Received and clear lock
    await connection.query(`
      UPDATE tabCartonStatus
      SET status = 'Received',
          locked_by = NULL,
          locked_on = NULL,
          updated_on = NOW()
      WHERE asn_no = ? AND inbound_session = ? AND carton_id = ?
    `, [asn_no, inbound_session, carton_id]);
    
    // Also update tabAsnItemDetails.carton_assigned_status
    try {
      await connection.query(`
        UPDATE tabAsnItemDetails
        SET carton_assigned_status = 'Received',
            updated_at = NOW()
        WHERE carton_id = ? 
          AND parent_title = ?
      `, [carton_id, asn_no]);
      logger.info({ carton_id, asn_no, status: 'Received' }, 'Updated tabAsnItemDetails.carton_assigned_status');
    } catch (asnItemError) {
      // Non-critical - log but don't fail
      logger.warn({ error: asnItemError.message, carton_id, asn_no }, 'Failed to update tabAsnItemDetails (non-critical)');
    }
    
    await connection.commit();
    
    logger.info({ carton_id, user_id, asn_no }, 'Carton completed');
    
    res.json({
      ok: true,
      message: 'Carton completed successfully'
    });
    
  } catch (error) {
    await connection.rollback();
    logger.error({ error, body: req.body }, 'Failed to complete carton');
    throw error;
  } finally {
    connection.release();
  }
});

