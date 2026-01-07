// wms-api/src/modules/cartons/cartonStatusController.js
// Carton status update operations (batch)

import { getConnection } from '../../db/connection.js';

/**
 * POST /api/cartons/update-status
 * Update carton status(es) - supports single or batch updates
 * 
 * ⚠️ CRITICAL: Accepts "Receiving" (without space), NOT "In Receiving" (with space)
 * 
 * Request Body (Single):
 * {
 *   "asn_no": "ASN-0002",  // Use exact format from request (preserve format)
 *   "inbound_session": "SESSION-001",
 *   "carton_id": "CTN-0101",
 *   "status": "Receiving",  // ⚠️ "Receiving" not "In Receiving"
 *   "user_id": "USER-001",
 *   "device_id": "DEVICE-001"
 * }
 * 
 * Request Body (Batch):
 * {
 *   "asn_no": "ASN-0002",
 *   "inbound_session": "SESSION-001",
 *   "cartons": [
 *     { "carton_id": "CTN-0101", "status": "Unloaded" },
 *     { "carton_id": "CTN-0102", "status": "Unloaded" }
 *   ],
 *   "user_id": "USER-001",
 *   "device_id": "DEVICE-001"
 * }
 * 
 * Valid Status Values:
 * - "Pending" - Carton initialized but not yet unloaded
 * - "Unloaded" - Carton unloaded from truck
 * - "Receiving" - Carton locked and being received/sorted ⚠️ Changed from "In Receiving"
 * - "Received" - Carton fully received and sorted
 * - "Verified" - Carton verified
 * - "Closed" - Carton closed
 */
export const updateCartonStatus = async (req, res) => {
  const { asn_no, inbound_session, carton_id, status, cartons, user_id, device_id } = req.body;

  // Validation
  if (!asn_no || !inbound_session) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'asn_no and inbound_session are required'
      }
    });
  }

  // ⚠️ CRITICAL: Valid statuses - "Receiving" (without space), NOT "In Receiving"
  const validStatuses = [
    'Pending',
    'Unloaded',
    'Receiving', // ⚠️ Changed from "In Receiving" to "Receiving"
    'Received',
    'Verified',
    'Closed'
  ];

  // Validate single status if provided
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid status: ${status}. Valid values: ${validStatuses.join(', ')}`
      }
    });
  }

  // Determine if single or batch update
  const isBatch = Array.isArray(cartons) && cartons.length > 0;
  const isSingle = carton_id && status;

  if (!isBatch && !isSingle) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Either carton_id+status or cartons array is required'
      }
    });
  }

  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    // Detect schema for ASN column (once, outside loop)
    const [asnColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabReceivingCarton'
      AND COLUMN_NAME IN ('asn_no', 'advance_shipping_notice')
    `);
    const asnColumn = asnColumns.some(r => r.COLUMN_NAME === 'asn_no') ? 'asn_no' : 'advance_shipping_notice';

    // Detect available columns in tabReceivingCarton (once, outside loop)
    const [cartonColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabReceivingCarton'
      AND COLUMN_NAME IN ('updated_by', 'created_by', 'device_id', 'received_by', 'opened_by', 'locked_by', 'locked_on', 'created_on', 'created_at')
    `);
    const hasUpdatedBy = cartonColumns.some(r => r.COLUMN_NAME === 'updated_by');
    const hasCreatedBy = cartonColumns.some(r => r.COLUMN_NAME === 'created_by');
    const hasDeviceId = cartonColumns.some(r => r.COLUMN_NAME === 'device_id');
    const hasReceivedBy = cartonColumns.some(r => r.COLUMN_NAME === 'received_by');
    const hasOpenedBy = cartonColumns.some(r => r.COLUMN_NAME === 'opened_by');
    const hasLockedBy = cartonColumns.some(r => r.COLUMN_NAME === 'locked_by');
    const hasLockedOn = cartonColumns.some(r => r.COLUMN_NAME === 'locked_on');
    const hasCreatedOn = cartonColumns.some(r => r.COLUMN_NAME === 'created_on');
    const hasCreatedAt = cartonColumns.some(r => r.COLUMN_NAME === 'created_at');

    let updatedCount = 0;
    const cartonsToUpdate = isBatch ? cartons : [{ carton_id, status }];

    for (const carton of cartonsToUpdate) {
      const currentCartonId = carton.carton_id || carton_id;
      const currentStatus = carton.status || status;

      if (!currentCartonId || !currentStatus) {
        continue; // Skip invalid entries
      }

      // Validate each carton's status
      if (!validStatuses.includes(currentStatus)) {
        console.warn(`⚠️ Invalid status for carton ${currentCartonId}: ${currentStatus}`);
        continue; // Skip invalid statuses
      }
      
      // Build UPDATE statement dynamically
      const updateFields = ['status = ?', 'updated_on = NOW()'];
      const updateValues = [currentStatus];
      
      // Add user tracking field based on what's available
      if (hasUpdatedBy) {
        updateFields.push('updated_by = ?');
        updateValues.push(user_id || null);
      } else if (hasReceivedBy && currentStatus === 'Received') {
        updateFields.push('received_by = ?');
        updateValues.push(user_id || null);
      } else if (hasOpenedBy && currentStatus === 'Unloaded') {
        updateFields.push('opened_by = ?');
        updateValues.push(user_id || null);
      }
      
      // Add locked_by and locked_on when status is "Receiving" (locked)
      if (currentStatus === 'Receiving') {
        if (hasLockedBy) {
          updateFields.push('locked_by = ?');
          updateValues.push(user_id || null);
        }
        if (hasLockedOn) {
          updateFields.push('locked_on = NOW()');
        }
      }
      
      // Add device_id if available
      if (hasDeviceId) {
        updateFields.push('device_id = ?');
        updateValues.push(device_id || null);
      }
      
      updateValues.push(asn_no, inbound_session, currentCartonId);
      
      // UPSERT: Update if exists, insert if doesn't exist
      // First, try to update
      const [updateResult] = await connection.execute(`
        UPDATE tabReceivingCarton
        SET ${updateFields.join(', ')}
        WHERE ${asnColumn} = ?
          AND inbound_session = ?
          AND carton_id = ?
      `, updateValues);

      if (updateResult.affectedRows > 0) {
        updatedCount++;
        console.log(`✅ Updated carton ${currentCartonId} status to ${currentStatus}`);
      } else {
        // Carton doesn't exist - create it (UPSERT logic)
        console.log(`ℹ️ Carton ${currentCartonId} not found, creating new record...`);
        try {
          // Build INSERT statement dynamically
          const insertFields = ['carton_id', asnColumn, 'inbound_session', 'status', 'updated_on'];
          const insertValues = [currentCartonId, asn_no, inbound_session, currentStatus];
          const valuePlaceholders = ['?', '?', '?', '?', 'NOW()']; // updated_on uses NOW()
          
          // Note: created_at is auto-generated, don't include it
          // Only include created_on if it exists (and is not auto-generated)
          if (hasCreatedOn && !hasCreatedAt) {
            insertFields.push('created_on');
            valuePlaceholders.push('NOW()');
          }
          
          // Add user tracking field based on what's available
          if (hasCreatedBy) {
            insertFields.push('created_by');
            insertValues.push(user_id || null);
            valuePlaceholders.push('?');
          } else if (hasReceivedBy && currentStatus === 'Received') {
            insertFields.push('received_by');
            insertValues.push(user_id || null);
            valuePlaceholders.push('?');
          } else if (hasOpenedBy && currentStatus === 'Unloaded') {
            insertFields.push('opened_by');
            insertValues.push(user_id || null);
            valuePlaceholders.push('?');
          }
          
          // Add updated_by if available (for status tracking)
          if (hasUpdatedBy) {
            insertFields.push('updated_by');
            insertValues.push(user_id || null);
            valuePlaceholders.push('?');
          }
          
          // Add locked_by and locked_on when status is "Receiving" (locked)
          if (currentStatus === 'Receiving') {
            if (hasLockedBy) {
              insertFields.push('locked_by');
              insertValues.push(user_id || null);
              valuePlaceholders.push('?');
            }
            if (hasLockedOn) {
              insertFields.push('locked_on');
              valuePlaceholders.push('NOW()');
            }
          }
          
          // Add device_id if available
          if (hasDeviceId) {
            insertFields.push('device_id');
            insertValues.push(device_id || null);
            valuePlaceholders.push('?');
          }
          
          await connection.execute(`
            INSERT INTO tabReceivingCarton 
              (${insertFields.join(', ')})
            VALUES (${valuePlaceholders.join(', ')})
          `, insertValues);
          updatedCount++;
          console.log(`✅ Created carton ${currentCartonId} with status ${currentStatus}`);
        } catch (insertError) {
          console.error(`❌ Failed to create carton ${currentCartonId}:`, insertError.message);
          // Continue with other cartons even if one fails
        }
      }

      // If status is "Unloaded", create unload line
      if (currentStatus === 'Unloaded') {
        try {
          await connection.execute(`
            INSERT INTO tabInboundUnloadLine 
              (parent_title, unit_type, unit_id, scanned_by, scanned_on)
            VALUES (?, 'Carton', ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
              scanned_on = NOW(),
              scanned_by = VALUES(scanned_by)
          `, [inbound_session, currentCartonId, user_id || 'SYSTEM']);
        } catch (unloadLineError) {
          console.warn(`Failed to create unload line for carton ${currentCartonId}:`, unloadLineError.message);
        }
      }

      // Update tabAsnItemDetails.carton_assigned_status
      try {
        await connection.execute(`
          UPDATE tabAsnItemDetails
          SET carton_assigned_status = ?,
              updated_at = NOW()
          WHERE carton_id = ? 
            AND parent_title = ?
        `, [currentStatus, currentCartonId, asn_no]);
      } catch (asnItemError) {
        // Non-critical - log but don't fail
        console.warn(`Failed to update tabAsnItemDetails for carton ${currentCartonId}:`, asnItemError.message);
      }
    }

    // After updating carton statuses, update ASN status based on carton progress
    // This ensures the desktop app shows the correct ASN status
    try {
      // Get all cartons for this ASN - use detected ASN column
      const [allCartons] = await connection.execute(`
        SELECT carton_id, status FROM tabReceivingCarton WHERE ${asnColumn} = ?
      `, [asn_no]);

      if (allCartons.length > 0) {
        const unloadedCount = allCartons.filter(c => c.status === 'Unloaded').length;
        const receivedCount = allCartons.filter(c => c.status === 'Received').length;
        const totalCount = allCartons.length;

        let newASNStatus = null;

        // Determine ASN status based on carton progress
        if (receivedCount === totalCount) {
          // All cartons received
          newASNStatus = 'Received'; // or "Completed" depending on your status values
        } else if (unloadedCount > 0 || receivedCount > 0) {
          // At least one carton is unloaded or received
          newASNStatus = 'In Progress'; // or equivalent status
        }
        // If all cartons are still "Pending", keep ASN status as "Submitted"

        // Update ASN status if it should change
        if (newASNStatus) {
          const [asnUpdateResult] = await connection.execute(`
            UPDATE tabAdvanceShippingNotice SET status = ?, updated_on = NOW() WHERE title = ?
          `, [newASNStatus, asn_no]);

          if (asnUpdateResult.affectedRows > 0) {
            console.log(`✅ Updated ASN ${asn_no} status to ${newASNStatus}`);
          } else {
            console.warn(`⚠️ ASN ${asn_no} not found in tabAdvanceShippingNotice table`);
          }
        }
      }
    } catch (asnStatusError) {
      console.warn('⚠️ Failed to update ASN status:', asnStatusError.message);
      // Don't fail the entire request if ASN status update fails
    }

    await connection.commit();

    res.json({
      success: true,
      ok: true,
      message: 'Carton status updated successfully',
      updated_count: updatedCount
    });

  } catch (error) {
    await connection.rollback();
    console.error('Failed to update carton status:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to update carton status',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

