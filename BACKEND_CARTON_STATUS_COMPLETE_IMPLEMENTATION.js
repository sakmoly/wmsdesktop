// wms-api/src/modules/cartons/cartonController.js
// COMPLETE IMPLEMENTATION with UPSERT and ASN Status Auto-Update

import pool from '../../config/database.js';
import logger from '../../config/logger.js';
import { asyncHandler } from '../../utils/response.js';

/**
 * POST /api/cartons/update-status
 * Update carton status(es) - supports single and batch updates
 * 
 * Features:
 * - UPSERT logic: Creates carton if doesn't exist, updates if exists
 * - Automatic ASN status updates based on carton progress
 * - Handles exact ASN format from mobile (no normalization)
 * - Validates "Receiving" status
 * 
 * Request Body Examples:
 * 
 * Batch Format (RECOMMENDED):
 * {
 *   "asn_no": "ASN-00002",  // Original format from mobile (preserves exact format)
 *   "inbound_session": "SESSION-ASN0002-DEVICE001-USER172188",
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
 *   "asn_no": "ASN-00002",
 *   "inbound_session": "SESSION-ASN0002-DEVICE001-USER172188",
 *   "carton_id": "CTN-0101",
 *   "status": "Receiving",  // Note: "Receiving" (no space)
 *   "user_id": "USER-172188",
 *   "device_id": "DEVICE-001"
 * }
 */
export const updateCartonStatus = asyncHandler(async (req, res) => {
  const {
    asn_no,              // Original format from mobile (e.g., "ASN-00002")
    inbound_session,
    carton_id,           // Single carton format
    cartons,             // Batch format (array)
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

  // IMPORTANT: Use exact ASN format from request, do NOT normalize
  // The mobile app sends the original format (e.g., "ASN-00002")
  const exactAsn = asn_no;
  
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
  const validStatuses = ['Pending', 'Unloaded', 'Receiving', 'Received', 'Verified', 'Closed'];
  
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

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const now = new Date();
    let updatedCount = 0;
    let insertedCount = 0;
    const updatedCartons = [];

    if (isSingle) {
      // ============================================
      // SINGLE CARTON UPDATE (UPSERT)
      // ============================================
      
      // Try UPDATE first
      const [updateResult] = await connection.query(
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
          exactAsn,  // Use exact ASN format
          inbound_session
        ]
      );

      if (updateResult.affectedRows > 0) {
        updatedCount = 1;
        updatedCartons.push({
          carton_id: carton_id,
          status: status,
          updated: true
        });
        
        // Also update tabAsnItemDetails.carton_assigned_status
        try {
          await connection.query(`
            UPDATE tabAsnItemDetails
            SET carton_assigned_status = ?,
                updated_at = NOW()
            WHERE carton_id = ? 
              AND parent_title = ?
          `, [status, carton_id, exactAsn]);
          logger.info({ carton_id, asn_no: exactAsn, status }, 'Updated tabAsnItemDetails.carton_assigned_status');
        } catch (asnItemError) {
          // Non-critical - log but don't fail
          logger.warn({ error: asnItemError.message, carton_id, asn_no: exactAsn }, 'Failed to update tabAsnItemDetails (non-critical)');
        }
      } else {
        // Carton doesn't exist - INSERT it (UPSERT logic)
        try {
          await connection.query(
            `INSERT INTO tabReceivingCarton 
             (carton_id, advance_shipping_notice, inbound_session, status, 
              received_by, updated_on, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              carton_id,
              exactAsn,  // Use exact ASN format
              inbound_session,
              status,
              user_id || null,
              now
            ]
          );
          insertedCount = 1;
          updatedCartons.push({
            carton_id: carton_id,
            status: status,
            inserted: true
          });
          logger.info({ carton_id, asn_no, status }, 'Carton created (UPSERT)');
          
          // Also update tabAsnItemDetails.carton_assigned_status
          try {
            await connection.query(`
              UPDATE tabAsnItemDetails
              SET carton_assigned_status = ?,
                  updated_at = NOW()
              WHERE carton_id = ? 
                AND parent_title = ?
            `, [status, carton_id, exactAsn]);
            logger.info({ carton_id, asn_no: exactAsn, status }, 'Updated tabAsnItemDetails.carton_assigned_status');
          } catch (asnItemError) {
            // Non-critical - log but don't fail
            logger.warn({ error: asnItemError.message, carton_id, asn_no: exactAsn }, 'Failed to update tabAsnItemDetails (non-critical)');
          }
        } catch (insertError) {
          // If INSERT fails due to duplicate key, try UPDATE again with exact match
          if (insertError.code === 'ER_DUP_ENTRY') {
            const [retryUpdate] = await connection.query(
              `UPDATE tabReceivingCarton 
               SET status = ?,
                   updated_on = ?,
                   received_by = ?,
                   updated_at = NOW()
               WHERE carton_id = ? 
                 AND advance_shipping_notice = ?`,
              [
                status,
                now,
                user_id || null,
                carton_id,
                exactAsn  // Use exact ASN format
              ]
            );
            
            if (retryUpdate.affectedRows > 0) {
              updatedCount = 1;
              updatedCartons.push({
                carton_id: carton_id,
                status: status,
                updated: true
              });
              
              // Also update tabAsnItemDetails.carton_assigned_status
              try {
                await connection.query(`
                  UPDATE tabAsnItemDetails
                  SET carton_assigned_status = ?,
                      updated_at = NOW()
                  WHERE carton_id = ? 
                    AND parent_title = ?
                `, [status, carton_id, exactAsn]);
                logger.info({ carton_id, asn_no: exactAsn, status }, 'Updated tabAsnItemDetails.carton_assigned_status');
              } catch (asnItemError) {
                // Non-critical - log but don't fail
                logger.warn({ error: asnItemError.message, carton_id, asn_no: exactAsn }, 'Failed to update tabAsnItemDetails (non-critical)');
              }
            } else {
              throw insertError;
            }
          } else {
            throw insertError;
          }
        }
      }
    } else {
      // ============================================
      // BATCH CARTON UPDATE (UPSERT)
      // ============================================
      for (const carton of cartons) {
        // Try UPDATE first
        const [updateResult] = await connection.query(
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
            exactAsn,  // Use exact ASN format
            inbound_session
          ]
        );

        if (updateResult.affectedRows > 0) {
          updatedCount++;
          updatedCartons.push({
            carton_id: carton.carton_id,
            status: carton.status,
            updated: true
          });
          
          // Also update tabAsnItemDetails.carton_assigned_status
          try {
            await connection.query(`
              UPDATE tabAsnItemDetails
              SET carton_assigned_status = ?,
                  updated_at = NOW()
              WHERE carton_id = ? 
                AND parent_title = ?
            `, [carton.status, carton.carton_id, exactAsn]);
            logger.info({ carton_id: carton.carton_id, asn_no: exactAsn, status: carton.status }, 'Updated tabAsnItemDetails.carton_assigned_status');
          } catch (asnItemError) {
            // Non-critical - log but don't fail
            logger.warn({ error: asnItemError.message, carton_id: carton.carton_id, asn_no: exactAsn }, 'Failed to update tabAsnItemDetails (non-critical)');
          }
        } else {
          // Carton doesn't exist - INSERT it (UPSERT logic)
          try {
            await connection.query(
              `INSERT INTO tabReceivingCarton 
               (carton_id, advance_shipping_notice, inbound_session, status, 
                received_by, updated_on, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [
                carton.carton_id,
                exactAsn,  // Use exact ASN format
                inbound_session,
                carton.status,
                user_id || null,
                now
              ]
            );
            insertedCount++;
            updatedCartons.push({
              carton_id: carton.carton_id,
              status: carton.status,
              inserted: true
            });
            logger.info({ carton_id: carton.carton_id, asn_no, status: carton.status }, 'Carton created (UPSERT)');
            
            // Also update tabAsnItemDetails.carton_assigned_status
            try {
              await connection.query(`
                UPDATE tabAsnItemDetails
                SET carton_assigned_status = ?,
                    updated_at = NOW()
                WHERE carton_id = ? 
                  AND parent_title = ?
              `, [carton.status, carton.carton_id, exactAsn]);
              logger.info({ carton_id: carton.carton_id, asn_no: exactAsn, status: carton.status }, 'Updated tabAsnItemDetails.carton_assigned_status');
            } catch (asnItemError) {
              // Non-critical - log but don't fail
              logger.warn({ error: asnItemError.message, carton_id: carton.carton_id, asn_no: exactAsn }, 'Failed to update tabAsnItemDetails (non-critical)');
            }
          } catch (insertError) {
            // If INSERT fails due to duplicate key, try UPDATE again
            if (insertError.code === 'ER_DUP_ENTRY') {
              const [retryUpdate] = await connection.query(
                `UPDATE tabReceivingCarton 
                 SET status = ?,
                     updated_on = ?,
                     received_by = ?,
                     updated_at = NOW()
                 WHERE carton_id = ? 
                   AND advance_shipping_notice = ?`,
                [
                  carton.status,
                  now,
                  user_id || null,
                  carton.carton_id,
                  exactAsn  // Use exact ASN format
                ]
              );
              
              if (retryUpdate.affectedRows > 0) {
                updatedCount++;
                updatedCartons.push({
                  carton_id: carton.carton_id,
                  status: carton.status,
                  updated: true
                });
                
                // Also update tabAsnItemDetails.carton_assigned_status
                try {
                  await connection.query(`
                    UPDATE tabAsnItemDetails
                    SET carton_assigned_status = ?,
                        updated_at = NOW()
                    WHERE carton_id = ? 
                      AND parent_title = ?
                  `, [carton.status, carton.carton_id, exactAsn]);
                  logger.info({ carton_id: carton.carton_id, asn_no: exactAsn, status: carton.status }, 'Updated tabAsnItemDetails.carton_assigned_status');
                } catch (asnItemError) {
                  // Non-critical - log but don't fail
                  logger.warn({ error: asnItemError.message, carton_id: carton.carton_id, asn_no: exactAsn }, 'Failed to update tabAsnItemDetails (non-critical)');
                }
              } else {
                updatedCartons.push({
                  carton_id: carton.carton_id,
                  status: carton.status,
                  updated: false,
                  error: 'Failed to insert or update carton'
                });
              }
            } else {
              updatedCartons.push({
                carton_id: carton.carton_id,
                status: carton.status,
                updated: false,
                error: insertError.message
              });
            }
          }
        }
      }
    }

    // ============================================
    // AUTOMATIC ASN STATUS UPDATE
    // ============================================
    // Update ASN status based on carton progress
    try {
      // Get all cartons for this ASN (use exact ASN format)
      const [allCartons] = await connection.query(
        `SELECT carton_id, status 
         FROM tabReceivingCarton 
         WHERE advance_shipping_notice = ?`,
        [exactAsn]  // Use exact ASN format
      );

      if (allCartons.length > 0) {
        const totalCount = allCartons.length;
        const unloadedCount = allCartons.filter(c => c.status === 'Unloaded').length;
        const receivingCount = allCartons.filter(c => c.status === 'Receiving').length;
        const receivedCount = allCartons.filter(c => c.status === 'Received').length;
        const verifiedCount = allCartons.filter(c => c.status === 'Verified').length;
        const closedCount = allCartons.filter(c => c.status === 'Closed').length;

        let newASNStatus = null;

        // Determine ASN status based on carton progress
        if (closedCount === totalCount || verifiedCount === totalCount) {
          // All cartons verified/closed
          newASNStatus = 'Completed';
        } else if (receivedCount === totalCount) {
          // All cartons received
          newASNStatus = 'Received';
        } else if (receivedCount > 0 || receivingCount > 0 || unloadedCount > 0) {
          // At least one carton is unloaded, receiving, or received
          newASNStatus = 'Receiving';  // or "In Progress" depending on your status values
        }
        // If all cartons are still "Pending" or "Assigned", keep ASN status as "Submitted"

        // Update ASN status if it should change
        if (newASNStatus) {
          // Try both possible ASN table names
          let asnUpdateResult;
          
          // Try tabAdvanceShippingNotice first (desktop app schema)
          try {
            [asnUpdateResult] = await connection.query(
              `UPDATE tabAdvanceShippingNotice 
               SET status = ?, 
                   updated_on = ?, 
                   updated_at = NOW() 
               WHERE title = ?`,
              [newASNStatus, now, exactAsn]
            );
          } catch (error) {
            // If table doesn't exist, try tabASN (alternative schema)
            logger.warn({ error: error.message, table: 'tabAdvanceShippingNotice' }, 'Failed to update ASN in tabAdvanceShippingNotice, trying tabASN');
            [asnUpdateResult] = await connection.query(
              `UPDATE tabASN 
               SET status = ?, 
                   updated_on = ?, 
                   updated_at = NOW() 
               WHERE asn_no = ?`,
              [newASNStatus, now, exactAsn]
            );
          }

          if (asnUpdateResult.affectedRows > 0) {
            logger.info({ asn_no: exactAsn, new_status: newASNStatus }, 'ASN status updated automatically');
          } else {
            logger.warn({ asn_no: exactAsn }, 'ASN not found in ASN table - status not updated');
          }
        } else {
          logger.info({ asn_no: exactAsn }, 'ASN status not changed (all cartons still pending/assigned)');
        }
      }
    } catch (asnStatusError) {
      // Don't fail the entire request if ASN status update fails
      logger.warn({ error: asnStatusError.message, asn_no: exactAsn }, 'Failed to update ASN status (non-critical)');
    }

    await connection.commit();

    logger.info({ 
      asn_no: exactAsn, 
      inbound_session, 
      updated_count: updatedCount, 
      inserted_count: insertedCount 
    }, 'Carton status(es) updated');

    // Success response
    res.json({
      success: true,
      message: isBatch 
        ? `Carton statuses updated successfully` 
        : `Carton status updated successfully`,
      updated_count: updatedCount,
      inserted_count: insertedCount,
      ...(isBatch && { cartons: updatedCartons })
    });
    
  } catch (error) {
    await connection.rollback();
    logger.error({ error, body: req.body, errorMessage: error.message, errorCode: error.code }, 'Failed to update carton status');
    
    res.status(500).json({
      code: 'DATABASE_ERROR',
      message: 'Failed to update carton status',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  } finally {
    connection.release();
  }
});

