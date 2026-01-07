// wms-api/src/modules/cartons/cartonController.js

const { getConnection } = require('../../db/connection');
const { normalizeAsnNumber } = require('../../utils/normalize');

/**
 * Update carton status(es) - supports single and batch updates
 * POST /api/cartons/update-status
 * 
 * Request Body Examples:
 * 
 * Batch Format (RECOMMENDED):
 * {
 *   "asn_no": "ASN-0002",
 *   "inbound_session": "SESSION-1721881234567",
 *   "cartons": [
 *     { "carton_id": "CTN-0101", "status": "Unloaded" },
 *     { "carton_id": "CTN-0102", "status": "Unloaded" }
 *   ],
 *   "user_id": "USER-172188",
 *   "device_id": "DEVICE-001"
 * }
 * 
 * Single Format:
 * {
 *   "asn_no": "ASN-0002",
 *   "inbound_session": "SESSION-1721881234567",
 *   "carton_id": "CTN-0101",
 *   "status": "Unloaded",
 *   "user_id": "USER-172188",
 *   "device_id": "DEVICE-001"
 * }
 */
async function updateCartonStatus(req, res) {
  const {
    asn_no,
    inbound_session,
    carton_id,        // Single carton format
    cartons,          // Batch format (array)
    status,
    user_id,
    device_id
  } = req.body;

  // Validate required fields
  if (!asn_no || !inbound_session) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'asn_no and inbound_session are required',
      details: {
        asn_no: asn_no ? null : 'asn_no is required',
        inbound_session: inbound_session ? null : 'inbound_session is required'
      }
    });
  }

  // Normalize ASN number (4-digit format: ASN-0002)
  const normalizedAsn = normalizeAsnNumber(asn_no);
  
  // Determine if single or batch update
  const isBatch = Array.isArray(cartons) && cartons.length > 0;
  const isSingle = carton_id && status;

  if (!isBatch && !isSingle) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Either carton_id with status (single) or cartons array (batch) is required',
      details: {
        carton_id: isSingle ? null : 'Required for single update',
        cartons: isBatch ? null : 'Required for batch update',
        status: isSingle ? null : 'Required for single update'
      }
    });
  }

  // Validate status values
  const validStatuses = ['Pending', 'Unloaded', 'In Receiving', 'Received', 'Verified', 'Closed'];
  
  if (isSingle && !validStatuses.includes(status)) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: `Invalid status: ${status}. Valid values: ${validStatuses.join(', ')}`,
      details: {
        status: `Must be one of: ${validStatuses.join(', ')}`
      }
    });
  }

  if (isBatch) {
    // Validate all cartons in batch
    for (const carton of cartons) {
      if (!carton.carton_id || !carton.status) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Each carton in batch must have carton_id and status',
          details: {
            carton: carton,
            error: 'Missing carton_id or status'
          }
        });
      }
      if (!validStatuses.includes(carton.status)) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: `Invalid status in batch: ${carton.status}. Valid values: ${validStatuses.join(', ')}`,
          details: {
            carton_id: carton.carton_id,
            status: carton.status,
            valid_statuses: validStatuses
          }
        });
      }
    }
  }

  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    const now = new Date();
    let updatedCount = 0;
    const updatedCartons = [];

    if (isSingle) {
      // ============================================
      // SINGLE CARTON UPDATE
      // ============================================
      const [result] = await connection.query(
        `UPDATE tabReceivingCarton 
         SET status = ?,
             updated_on = ?,
             received_by = ?,
             updated_at = NOW()
         WHERE carton_id = ? 
           AND advance_shipping_notice = ? 
           AND inbound_session = ?`,
        [
          status,
          now,
          user_id || null,
          carton_id,
          normalizedAsn,
          inbound_session
        ]
      );

      if (result.affectedRows > 0) {
        updatedCount = 1;
        updatedCartons.push({
          carton_id: carton_id,
          status: status,
          updated: true
        });
      } else {
        // Check if carton exists at all
        const [exists] = await connection.query(
          `SELECT carton_id FROM tabReceivingCarton 
           WHERE carton_id = ? 
             AND advance_shipping_notice = ? 
             AND inbound_session = ?`,
          [carton_id, normalizedAsn, inbound_session]
        );

        await connection.rollback();
        
        if (exists.length === 0) {
          return res.status(404).json({
            code: 'NOT_FOUND',
            message: `Carton ${carton_id} not found for ASN ${asn_no} and session ${inbound_session}`,
            details: {
              carton_id: carton_id,
              asn_no: asn_no,
              inbound_session: inbound_session
            }
          });
        } else {
          return res.status(500).json({
            code: 'UPDATE_FAILED',
            message: `Failed to update carton ${carton_id}`,
            details: null
          });
        }
      }
    } else {
      // ============================================
      // BATCH CARTON UPDATE
      // ============================================
      for (const carton of cartons) {
        const [result] = await connection.query(
          `UPDATE tabReceivingCarton 
           SET status = ?,
               updated_on = ?,
               received_by = ?,
               updated_at = NOW()
           WHERE carton_id = ? 
             AND advance_shipping_notice = ? 
             AND inbound_session = ?`,
          [
            carton.status,
            now,
            user_id || null,
            carton.carton_id,
            normalizedAsn,
            inbound_session
          ]
        );

        if (result.affectedRows > 0) {
          updatedCount++;
          updatedCartons.push({
            carton_id: carton.carton_id,
            status: carton.status,
            updated: true
          });
        } else {
          // Check if carton exists
          const [exists] = await connection.query(
            `SELECT carton_id FROM tabReceivingCarton 
             WHERE carton_id = ? 
               AND advance_shipping_notice = ? 
               AND inbound_session = ?`,
            [carton.carton_id, normalizedAsn, inbound_session]
          );

          updatedCartons.push({
            carton_id: carton.carton_id,
            status: carton.status,
            updated: false,
            error: exists.length === 0 
              ? "Carton not found for this ASN and session" 
              : "Update failed (no rows affected)"
          });
        }
      }
    }

    await connection.commit();

    // Success response
    res.json({
      success: true,
      message: isBatch 
        ? `Carton statuses updated successfully` 
        : `Carton status updated successfully`,
      updated_count: updatedCount,
      ...(isBatch && { cartons: updatedCartons })
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating carton status:', error);
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to update carton status',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  updateCartonStatus
};

