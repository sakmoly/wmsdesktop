// wms-api/src/modules/events/eventController.js
// Event logging operations

import { getConnection } from '../../db/connection.js';
import { postStock } from '../stock-ledger/stockPostingService.js';

/**
 * POST /api/events/batch
 * Batch insert scan events
 * 
 * Request Body:
 * {
 *   "events": [
 *     {
 *       "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
 *       "event_type": "RECEIVE_ITEM_SCAN",
 *       "event_time": "2024-12-25T10:35:00Z",
 *       "device_id": "DEVICE-001",
 *       "user_id": "USER-172188",
 *       "advance_shipping_notice": "ASN-0001",
 *       "inbound_session": "SESSION-001",
 *       "carton_id": "CTN-0101",
 *       "item_code": "SKU-001",
 *       "qty": 50,
 *       "notes": "Item received"
 *     }
 *   ]
 * }
 */
export const batchEvents = async (req, res) => {
  let events;
  let update_mode;
  
  try {
    // Check if body is valid JSON
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid request body. Please ensure Content-Type is application/json and body is valid JSON.'
        }
      });
    }

    ({ events, update_mode } = req.body);

    // Validation
    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'events array is required and must not be empty'
        }
      });
    }

    // If update_mode is true, handle quantity updates instead of adding new events
    if (update_mode === true) {
      return handleUpdateMode(req, res, events);
    }
  } catch (error) {
    // Handle JSON parsing errors
    if (error instanceof SyntaxError || error.type === 'entity.parse.failed') {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Invalid JSON in request body. Please check your request format.',
          details: process.env.NODE_ENV === 'development' ? error.message : null
        }
      });
    }
    // Re-throw other errors
    console.error('❌ Error in batchEvents:', error);
    return res.status(500).json({
      ok: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to process request',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  }

  // Ensure events is defined before proceeding
  if (!events) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'events array is required'
      }
    });
  }

  const connection = await getConnection();

  try {
    console.log(`📝 Processing ${events.length} event(s) in batch...`);
    await connection.beginTransaction();

    let insertedCount = 0;
    const errors = [];

    for (const event of events) {
      const {
        offline_uuid,
        event_type,
        event_time,
        device_id,
        user_id,
        advance_shipping_notice = null,
        transfer_order = null,
        material_request = null,  // Support material_request field (alternative to transfer_order)
        inbound_session = null,
        carton_id = null,
        item_code = null,
        qty = 1,
        store = null,
        box_id = null,
        tc_id = null,
        rack = null,
        bin = null,
        location_id = null,  // Support location_id field
        source_bin = null,    // Support source_bin field directly
        notes = null
      } = event;
      
      // Use material_request if transfer_order is not provided (for Material Request events)
      const effectiveTransferOrder = transfer_order || material_request;

      // Validate required fields
      if (!offline_uuid || !event_type || !event_time || !device_id || !user_id) {
        errors.push({
          offline_uuid: offline_uuid || 'MISSING',
          error: 'Missing required fields: offline_uuid, event_type, event_time, device_id, user_id'
        });
        continue;
      }

      try {
        // Validate transfer carton status before allowing packing events
        if ((event_type === 'PACK_BOX_TO_TC' || event_type === 'PACK_ITEM_TO_TC') && tc_id) {
          const [tcStatusRows] = await connection.execute(`
            SELECT status
            FROM tabTransferCarton
            WHERE tc_id = ?
          `, [tc_id]);
          
          if (tcStatusRows.length > 0) {
            const tcStatus = tcStatusRows[0].status;
            if (tcStatus === 'Sealed' || tcStatus === 'Dispatched' || tcStatus === 'Completed') {
              console.warn(`⚠️  Rejecting ${event_type} event: Transfer carton ${tc_id} is ${tcStatus} and cannot accept new items`);
              errors.push({
                offline_uuid: offline_uuid || 'MISSING',
                error: `Transfer carton ${tc_id} is ${tcStatus} and cannot accept new items`
              });
              continue; // Skip this event
            }
          }
        }

        // Validate carton_id requirement for carton-level inventory mode
        // Check if tabCartonStock table exists (indicates carton-level tracking is enabled)
        if ((event_type === 'PACK_BOX_TO_TC' || event_type === 'PACK_ITEM_TO_TC') && item_code) {
          const [cartonStockTable] = await connection.execute(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabCartonStock'
          `);
          
          const isCartonLevelMode = cartonStockTable.length > 0;
          
          if (isCartonLevelMode) {
            // Carton-level mode: carton_id is REQUIRED
            if (!carton_id || carton_id.trim() === '') {
              console.warn(`⚠️  Rejecting ${event_type} event: carton_id is required for carton-level inventory tracking. Item: ${item_code}`);
              errors.push({
                offline_uuid: offline_uuid || 'MISSING',
                error: `Carton ID is required when packing items in carton-level inventory mode. Item: ${item_code}`
              });
              continue; // Skip this event
            }
            
            // Validate that the carton exists in tabCartonStock for this item
            // Also check if source_bin or location info is provided to verify carton is in correct bin
            if (source_bin || location_id || (rack && bin)) {
              const binLocation = source_bin || location_id || (rack && bin ? `${rack}-${bin}` : null);
              
              if (binLocation) {
                const [cartonStock] = await connection.execute(`
                  SELECT carton_id, item_code, bin_location, qty
                  FROM tabCartonStock
                  WHERE carton_id = ? 
                    AND item_code = ?
                    AND bin_location = ?
                    AND qty > 0
                    AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
                  LIMIT 1
                `, [carton_id.trim(), item_code, binLocation]);
                
                if (cartonStock.length === 0) {
                  console.warn(`⚠️  Rejecting ${event_type} event: Carton ${carton_id} not found in bin ${binLocation} for item ${item_code}`);
                  errors.push({
                    offline_uuid: offline_uuid || 'MISSING',
                    error: `Carton ${carton_id} not found in bin ${binLocation} for item ${item_code}. Please verify the carton exists at this location.`
                  });
                  continue; // Skip this event
                }
              } else {
                // No bin location provided, just check if carton exists for this item
                const [cartonStock] = await connection.execute(`
                  SELECT carton_id, item_code, qty
                  FROM tabCartonStock
                  WHERE carton_id = ? 
                    AND item_code = ?
                    AND qty > 0
                    AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
                  LIMIT 1
                `, [carton_id.trim(), item_code]);
                
                if (cartonStock.length === 0) {
                  console.warn(`⚠️  Rejecting ${event_type} event: Carton ${carton_id} not found in stock for item ${item_code}`);
                  errors.push({
                    offline_uuid: offline_uuid || 'MISSING',
                    error: `Carton ${carton_id} not found in stock for item ${item_code}. Please verify the carton exists.`
                  });
                  continue; // Skip this event
                }
              }
            }
          }
        }
        
        // Special handling for PACK_BOX_TO_TC events without item_code
        // If box_id is provided but item_code is null, look up box contents and create item-level events
        if (event_type === 'PACK_BOX_TO_TC' && box_id && !item_code && tc_id) {
          // CRITICAL: Check if item-level PACK_BOX_TO_TC events already exist for this box+tc
          // If they do, skip expansion to prevent duplicate events
          const [existingItemEvents] = await connection.execute(`
            SELECT COUNT(*) as count
            FROM tabWmsScanEvent
            WHERE tc_id = ?
              AND box_id = ?
              AND event_type = 'PACK_BOX_TO_TC'
              AND item_code IS NOT NULL
          `, [tc_id, box_id]);
          
          if (existingItemEvents[0].count > 0) {
            console.log(`Skipping expansion of box-level PACK_BOX_TO_TC event for box ${box_id} - ${existingItemEvents[0].count} item-level events already exist`);
            // Still insert the box-level event for tracking (but with INSERT IGNORE it won't duplicate)
            const [boxInsertResult] = await connection.execute(`
              INSERT IGNORE INTO tabWmsScanEvent 
                (offline_uuid, event_type, event_time, device_id, user_id,
                 advance_shipping_notice, transfer_order, inbound_session,
                 carton_id, item_code, qty, store, box_id, tc_id, rack, bin, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              offline_uuid, event_type, event_time, device_id, user_id,
              advance_shipping_notice, effectiveTransferOrder, inbound_session,
              carton_id, item_code, qty, store, box_id, tc_id, rack, bin, notes
            ]);
            if (boxInsertResult.affectedRows > 0) {
              insertedCount++;
            } else {
              console.warn(`⚠️  Box-level event ignored (duplicate offline_uuid): ${offline_uuid.substring(0, 8)}...`);
            }
            continue; // Skip expansion
          }
          
          console.log(`Expanding PACK_BOX_TO_TC event for box ${box_id} into item-level events`);
          
          // Get box contents from SORT_TO_BOX events
          const [boxContents] = await connection.execute(`
            SELECT 
              item_code,
              carton_id,
              qty,
              user_id as sorted_by,
              event_time as sorted_on
            FROM tabWmsScanEvent
            WHERE event_type = 'SORT_TO_BOX'
              AND box_id = ?
              AND item_code IS NOT NULL
            ORDER BY event_time DESC
          `, [box_id]);
          
          if (boxContents.length === 0) {
            console.warn(`No items found in box ${box_id} for PACK_BOX_TO_TC event`);
            // Still insert the box-level event for tracking
            const [emptyBoxInsertResult] = await connection.execute(`
              INSERT IGNORE INTO tabWmsScanEvent 
                (offline_uuid, event_type, event_time, device_id, user_id,
                 advance_shipping_notice, transfer_order, inbound_session,
                 carton_id, item_code, qty, store, box_id, tc_id, rack, bin, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              offline_uuid, event_type, event_time, device_id, user_id,
              advance_shipping_notice, effectiveTransferOrder, inbound_session,
              carton_id, item_code, qty, store, box_id, tc_id, rack, bin, notes
            ]);
            if (emptyBoxInsertResult.affectedRows > 0) {
              insertedCount++;
            } else {
              console.warn(`⚠️  Box-level event ignored (duplicate offline_uuid): ${offline_uuid.substring(0, 8)}...`);
            }
          } else {
            console.log(`Found ${boxContents.length} items in box ${box_id}, creating item-level PACK_BOX_TO_TC events`);
            
            // Group by item_code and carton_id to sum quantities
            const contentsMap = new Map();
            for (const item of boxContents) {
              const key = `${item.item_code}_${item.carton_id || ''}`;
              if (!contentsMap.has(key)) {
                contentsMap.set(key, {
                  item_code: item.item_code,
                  carton_id: item.carton_id || null,
                  qty: parseFloat(item.qty) || 0
                });
              } else {
                contentsMap.get(key).qty += parseFloat(item.qty) || 0;
              }
            }
            
            // Check if carton-level mode is enabled (for validation)
            const [cartonStockTable] = await connection.execute(`
              SELECT TABLE_NAME 
              FROM INFORMATION_SCHEMA.TABLES 
              WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'tabCartonStock'
            `);
            const isCartonLevelMode = cartonStockTable.length > 0;

            // Create one PACK_BOX_TO_TC event per item
            let itemEventIndex = 0;
            for (const [key, item] of contentsMap.entries()) {
              // Validate carton_id if carton-level mode is enabled
              if (isCartonLevelMode && (!item.carton_id || item.carton_id.trim() === '')) {
                console.warn(`⚠️  Rejecting PACK_BOX_TO_TC event from box ${box_id}: carton_id is required for item ${item.item_code} in carton-level inventory mode`);
                errors.push({
                  offline_uuid: offline_uuid || 'MISSING',
                  error: `Carton ID is required when packing item ${item.item_code} in carton-level inventory mode. Box: ${box_id}`
                });
                continue; // Skip this item
              }

              // CRITICAL: Check if this exact event already exists before inserting
              // This prevents duplicates when the same box is packed multiple times or events are retried
              const [existingEvents] = await connection.execute(`
                SELECT COUNT(*) as count
                FROM tabWmsScanEvent
                WHERE tc_id = ?
                  AND box_id = ?
                  AND item_code = ?
                  AND event_type = 'PACK_BOX_TO_TC'
                  AND qty = ?
              `, [tc_id, box_id, item.item_code, item.qty]);
              
              if (existingEvents[0].count > 0) {
                console.log(`Skipping duplicate PACK_BOX_TO_TC event: item=${item.item_code}, box=${box_id}, tc=${tc_id}, qty=${item.qty} (${existingEvents[0].count} similar events already exist)`);
                continue; // Skip this item - event already exists
              }
              
              // Generate unique offline_uuid for each item event
              // Use original offline_uuid as base and append item index
              const itemOfflineUuid = `${offline_uuid}-item-${itemEventIndex++}`;
              
              const [itemInsertResult] = await connection.execute(`
                INSERT IGNORE INTO tabWmsScanEvent 
                  (offline_uuid, event_type, event_time, device_id, user_id,
                   advance_shipping_notice, transfer_order, inbound_session,
                   carton_id, item_code, qty, store, box_id, tc_id, rack, bin, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                itemOfflineUuid, event_type, event_time, device_id, user_id,
                advance_shipping_notice, transfer_order, inbound_session,
                item.carton_id, item.item_code, item.qty, store, box_id, tc_id, rack, bin, notes
              ]);
              
              if (itemInsertResult.affectedRows > 0) {
                insertedCount++;
              } else {
                console.warn(`⚠️  Item event ignored (duplicate offline_uuid): ${itemOfflineUuid.substring(0, 8)}...`);
                errors.push({
                  offline_uuid: itemOfflineUuid,
                  error: `Event with offline_uuid ${itemOfflineUuid} already exists (duplicate)`
                });
              }
            }
            
            console.log(`Created ${contentsMap.size} item-level PACK_BOX_TO_TC events for box ${box_id}`);
          }
        } else {
          // Normal event insertion (with item_code or not PACK_BOX_TO_TC)
          // CRITICAL: For item-level PACK_BOX_TO_TC events, check for duplicates first
          if (event_type === 'PACK_BOX_TO_TC' && item_code && tc_id && box_id) {
            const [existingEvents] = await connection.execute(`
              SELECT COUNT(*) as count
              FROM tabWmsScanEvent
              WHERE tc_id = ?
                AND box_id = ?
                AND item_code = ?
                AND event_type = 'PACK_BOX_TO_TC'
                AND qty = ?
            `, [tc_id, box_id, item_code, qty]);
            
            if (existingEvents[0].count > 0) {
              console.log(`Skipping duplicate PACK_BOX_TO_TC event: item=${item_code}, box=${box_id}, tc=${tc_id}, qty=${qty} (${existingEvents[0].count} similar events already exist)`);
              continue; // Skip this event - duplicate already exists
            }
          }
          
          const [insertResult] = await connection.execute(`
            INSERT IGNORE INTO tabWmsScanEvent 
              (offline_uuid, event_type, event_time, device_id, user_id,
               advance_shipping_notice, transfer_order, inbound_session,
               carton_id, item_code, qty, store, box_id, tc_id, rack, bin, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            offline_uuid, event_type, event_time, device_id, user_id,
            advance_shipping_notice, effectiveTransferOrder, inbound_session,
            carton_id, item_code, qty, store, box_id, tc_id, rack, bin, notes
          ]);

          if (insertResult.affectedRows > 0) {
            insertedCount++;
            console.log(`✅ Inserted event: ${event_type} (${offline_uuid.substring(0, 8)}...)`);
          } else {
            // Insert was ignored (duplicate offline_uuid)
            console.warn(`⚠️  Event ignored (duplicate offline_uuid): ${offline_uuid.substring(0, 8)}...`);
            errors.push({
              offline_uuid,
              error: `Event with offline_uuid ${offline_uuid} already exists (duplicate). Please generate a unique offline_uuid.`
            });
          }

          // Update Transfer Order quantities if this is a SORT_TO_BOX or PACK_BOX_TO_TC event
          if (effectiveTransferOrder && (event_type === 'SORT_TO_BOX' || event_type === 'PACK_BOX_TO_TC')) {
            try {
              // Check if this is a Material Request (starts with MR-)
              const isMaterialRequest = effectiveTransferOrder.startsWith('MR-') || effectiveTransferOrder.match(/^MR-\d+$/i);
              
              if (isMaterialRequest) {
                // Determine source_bin from location_id, rack/bin, or event data
                let sourceBin = null;
                
                // Priority: source_bin > location_id > rack+bin lookup > rack > bin
                if (source_bin) {
                  sourceBin = source_bin;
                } else if (location_id) {
                  sourceBin = location_id;
                } else if (rack && bin) {
                  // Try to find location_id from tabLocation using rack and bin
                  const [locationRows] = await connection.execute(`
                    SELECT location_id
                    FROM tabLocation
                    WHERE parent_rack = ? AND bin_id = ?
                    LIMIT 1
                  `, [rack, bin]);
                  
                  if (locationRows.length > 0) {
                    sourceBin = locationRows[0].location_id;
                  } else {
                    // Fallback to rack-bin format
                    sourceBin = `${rack}-${bin}`;
                  }
                } else if (rack) {
                  sourceBin = rack;
                } else if (bin) {
                  sourceBin = bin;
                }
                
                // Handle Material Request picking
                console.log(`📦 Processing Material Request picking: MR=${effectiveTransferOrder}, item=${item_code}, qty=${qty}, source_bin=${sourceBin}`);
                await processMaterialRequestPicking(connection, {
                  material_request: effectiveTransferOrder,
                  item_code,
                  qty,
                  source_bin: sourceBin,
                  warehouse: store || null
                });
                console.log(`✅ Material Request picking processed: MR=${effectiveTransferOrder}, item=${item_code}`);
              } else {
                // Handle regular Transfer Order
                const { updateTransferOrderQuantities } = await import('../transfer-orders/updateTransferOrderQuantities.js');
                await updateTransferOrderQuantities(transfer_order, connection);
              }
            } catch (updateError) {
              console.warn(`Failed to update quantities for ${transfer_order}:`, updateError.message);
              // Don't fail the event insertion if quantity update fails
            }
          }

          // Process PUTAWAY_DISPATCH events - dispatch transfer carton
          if (event_type && event_type.toUpperCase() === 'PUTAWAY_DISPATCH' && tc_id) {
            try {
              await processPutawayDispatchEvent(connection, {
                tc_id,
                user_id
              });
            } catch (dispatchError) {
              console.warn(`Failed to process putaway dispatch event:`, dispatchError.message);
              // Don't fail the event insertion if dispatch processing fails
            }
          }
          
          // Process PUTAWAY events - update/create putaway tasks (requires rack)
          if (event_type && event_type.toUpperCase().includes('PUTAWAY') && event_type.toUpperCase() !== 'PUTAWAY_DISPATCH' && tc_id && rack) {
            try {
              await processPutawayEvent(connection, {
                event_type,
                tc_id,
                rack,
                bin,
                advance_shipping_notice,
                item_code,
                carton_id,
                qty,
                user_id
              });
            } catch (putawayError) {
              console.warn(`Failed to process putaway event:`, putawayError.message);
              // Don't fail the event insertion if putaway processing fails
            }
          }

          // Process PUTAWAY completion events - update stock ledger
          if (event_type && (event_type.toUpperCase() === 'PUTAWAY_CONFIRM' || event_type.toUpperCase() === 'PUTAWAY_COMPLETE')) {
            try {
              await processPutawayCompletionEvent(connection, {
                event_type,
                putaway_task: advance_shipping_notice, // May contain putaway task ID
                tc_id,
                rack,
                bin,
                item_code,
                qty,
                user_id
              });
            } catch (putawayError) {
              console.warn(`Failed to process putaway completion event:`, putawayError.message);
              // Don't fail the event insertion if putaway processing fails
            }
          }
        }
      } catch (insertError) {
        // If duplicate UUID, that's okay (idempotent)
        if (insertError.code === 'ER_DUP_ENTRY') {
          insertedCount++; // Count as success (already exists)
        } else {
          errors.push({
            offline_uuid,
            error: insertError.message
          });
        }
      }
    }

    await connection.commit();
    console.log(`✅ Successfully processed ${insertedCount}/${events.length} event(s)`);

    res.json({
      ok: true,
      message: 'Events saved successfully',
      inserted_count: insertedCount,
      total_count: events.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    await connection.rollback();
    console.error('❌ Failed to save events:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to save events',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * Handle update mode - replace existing quantities instead of adding new events
 */
async function handleUpdateMode(req, res, events) {
  const connection = await getConnection();
  const { updatePackingEventQuantity } = await import('./updatePackingEvent.js');

  try {
    await connection.beginTransaction();

    const updateResults = [];

    for (const event of events) {
      const {
        tc_id,
        item_code,
        carton_id,
        qty,
        user_id
      } = event;

      // Validate required fields for update mode
      if (!tc_id || !item_code || qty === undefined || !user_id) {
        updateResults.push({
          item_code: item_code || 'MISSING',
          error: 'Missing required fields: tc_id, item_code, qty, user_id'
        });
        continue;
      }

      try {
        const result = await updatePackingEventQuantity({
          tc_id,
          item_code,
          carton_id: carton_id || null,
          new_qty: parseFloat(qty),
          user_id,
          connection
        });

        updateResults.push({
          item_code,
          carton_id: carton_id || null,
          ...result
        });
      } catch (updateError) {
        updateResults.push({
          item_code,
          carton_id: carton_id || null,
          error: updateError.message
        });
      }
    }

    await connection.commit();

    const successCount = updateResults.filter(r => r.ok !== false && !r.error).length;
    const failedCount = updateResults.filter(r => r.ok === false || r.error).length;

    res.json({
      ok: true,
      message: 'Quantity updates processed',
      updated_count: successCount,
      failed_count: failedCount,
      total_count: events.length,
      results: updateResults
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ Failed to update quantities:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to update quantities',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
}

/**
 * Process PUTAWAY events and update/create putaway tasks
 * Called when event-based tracking is used as fallback
 */
async function processPutawayEvent(connection, event) {
  const { tc_id, rack, bin, advance_shipping_notice, item_code, carton_id, qty, user_id } = event;

  if (!tc_id || !rack) {
    return; // Skip if required fields missing
  }

  // Get transfer carton details
  const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
  const allColumns = new Set(tableInfo.map((row) => row.Field));

  let asnColumn;
  if (allColumns.has("asn_no")) {
    asnColumn = "asn_no";
  } else if (allColumns.has("advance_shipping_notice")) {
    asnColumn = "advance_shipping_notice";
  } else {
    return; // Can't process without ASN column
  }

  const [tcRows] = await connection.execute(
    `SELECT ${asnColumn} as asn_no FROM tabTransferCarton WHERE tc_id = ?`,
    [tc_id]
  );

  if (tcRows.length === 0) {
    return; // Transfer carton not found
  }

  const asnNo = tcRows[0].asn_no || advance_shipping_notice;
  if (!asnNo) {
    return; // No ASN available
  }

  // Get inbound session
  const [sessionRows] = await connection.execute(
    `SELECT inbound_session FROM tabInboundSession WHERE asn_no = ? ORDER BY started_at DESC LIMIT 1`,
    [asnNo]
  );
  const inboundSession = sessionRows.length > 0 ? sessionRows[0].inbound_session : null;
  if (!inboundSession) {
    return; // No inbound session found
  }

  // Find or create putaway task
  // Prefer non-completed tasks, but check all to prevent duplicates
  const [existingTasks] = await connection.execute(
    `SELECT title, status FROM tabPutawayTask 
     WHERE advance_shipping_notice = ? 
     ORDER BY 
       CASE 
         WHEN status IN ('Draft', 'Open', 'In Progress') THEN 1
         ELSE 2
       END,
       created_at DESC 
     LIMIT 1`,
    [asnNo]
  );

  let putawayTaskTitle;
  if (existingTasks.length > 0) {
    putawayTaskTitle = existingTasks[0].title;
  } else {
    // Create new task
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const [countRows] = await connection.execute(
      `SELECT COUNT(*) as count FROM tabPutawayTask WHERE title LIKE ?`,
      [`PUT-${datePrefix}%`]
    );
    const count = countRows[0].count || 0;
    const sequence = (count + 1).toString().padStart(4, "0");
    putawayTaskTitle = `PUT-${datePrefix}-${sequence}`;

    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabPutawayTask' AND COLUMN_NAME = 'source_type'
    `);
    const hasSourceType = columns.length > 0;

    if (hasSourceType) {
      await connection.execute(
        `INSERT INTO tabPutawayTask (title, status, source_type, advance_shipping_notice, inbound_session, created_by, created_at, updated_at) VALUES (?, 'Draft', 'ASN', ?, ?, ?, NOW(), NOW())`,
        [putawayTaskTitle, asnNo, inboundSession, user_id || "SYSTEM"]
      );
    } else {
      await connection.execute(
        `INSERT INTO tabPutawayTask (title, status, advance_shipping_notice, inbound_session, created_by, created_at, updated_at) VALUES (?, 'Draft', ?, ?, ?, NOW(), NOW())`,
        [putawayTaskTitle, asnNo, inboundSession, user_id || "SYSTEM"]
      );
    }
  }

  // If item_code is provided, update/create putaway line
  if (item_code && qty) {
    // Check if line exists with same carton, item, AND location (to prevent duplicates)
    // Handle NULL rack properly - if rack is NULL/empty, check for NULL/empty rack
    const rackValue = rack || '';
    const binValue = bin || '';
    const [existingLines] = await connection.execute(
      `SELECT id, qty FROM tabPutawayLine 
       WHERE parent_title = ? 
         AND item_code = ? 
         AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))
         AND (rack = ? OR (rack IS NULL AND ? = '') OR (rack = '' AND ? IS NULL))
         AND (bin = ? OR (bin IS NULL AND ? = '') OR (bin = '' AND ? IS NULL))`,
      [putawayTaskTitle, item_code, carton_id, carton_id, rackValue, rackValue, rackValue, binValue, binValue, binValue]
    );

    if (existingLines.length > 0) {
      // Line exists with same location - update quantity if different
      const existingQty = parseFloat(existingLines[0].qty) || 0;
      if (Math.abs(existingQty - qty) > 0.01) {
        console.log(`[Putaway Event] Updating quantity for existing line: ${item_code} @ ${rack}/${bin || ''} (${existingQty} -> ${qty})`);
        await connection.execute(
          `UPDATE tabPutawayLine 
           SET qty = ?, updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [qty, existingLines[0].id]
        );
      } else {
        console.log(`[Putaway Event] Line already exists with same quantity: ${item_code} @ ${rack}/${bin || ''}`);
      }
    } else {
      // Check if this carton+item exists in a different location
      // Handle NULL rack properly - check if location is different
      const [existingDifferentLocation] = await connection.execute(
        `SELECT id, rack, bin FROM tabPutawayLine 
         WHERE parent_title = ? 
           AND item_code = ? 
           AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))
           AND NOT (
             (rack = ? OR (rack IS NULL AND ? = '') OR (rack = '' AND ? IS NULL))
             AND (bin = ? OR (bin IS NULL AND ? = '') OR (bin = '' AND ? IS NULL))
           )`,
        [putawayTaskTitle, item_code, carton_id, carton_id, rackValue, rackValue, rackValue, binValue, binValue, binValue]
      );
      
      if (existingDifferentLocation.length > 0) {
        console.warn(`[Putaway Event] WARNING: Carton ${carton_id || 'NULL'} with item ${item_code} already put away to different location: ${existingDifferentLocation[0].rack}/${existingDifferentLocation[0].bin || ''}. Creating new line for ${rack}/${bin || ''}`);
      }
      
      // Insert new line
      // Use empty string if bin is null (database column is NOT NULL)
      const binValue = bin || '';
      await connection.execute(
        `INSERT INTO tabPutawayLine (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [putawayTaskTitle, carton_id || null, item_code, qty, rack, binValue]
      );
    }
  } else if (tc_id) {
    // If no item_code but tc_id provided, get all items from transfer carton and update them
    // Use box_id instead of carton_id since boxes are what's physically in the transfer carton
    const [itemEvents] = await connection.execute(
      `SELECT item_code, box_id, carton_id, SUM(qty) as total_qty FROM tabWmsScanEvent WHERE tc_id = ? AND event_type = 'PACK_BOX_TO_TC' AND item_code IS NOT NULL GROUP BY item_code, box_id, carton_id`,
      [tc_id]
    );

    for (const item of itemEvents) {
      const itemCode = item.item_code;
      // Use box_id for putaway since that's the physical box in the transfer carton
      const boxId = item.box_id || item.carton_id || null;
      const itemQty = parseFloat(item.total_qty) || 0;

      // Handle NULL rack properly - if rack is NULL/empty, check for NULL/empty rack
      const rackValue = rack || '';
      const binValue = bin || '';

      // Check if line exists with same carton, item, AND location
      const [lineExists] = await connection.execute(
        `SELECT id, qty FROM tabPutawayLine 
         WHERE parent_title = ? 
           AND item_code = ? 
           AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))
           AND (rack = ? OR (rack IS NULL AND ? = '') OR (rack = '' AND ? IS NULL))
           AND (bin = ? OR (bin IS NULL AND ? = '') OR (bin = '' AND ? IS NULL))`,
        [putawayTaskTitle, itemCode, boxId, boxId, rackValue, rackValue, rackValue, binValue, binValue, binValue]
      );

      if (lineExists.length > 0) {
        // Line exists with same location - update quantity if different
        const existingQty = parseFloat(lineExists[0].qty) || 0;
        if (Math.abs(existingQty - itemQty) > 0.01) {
          console.log(`[Putaway Event] Updating quantity for existing line: ${itemCode} @ ${rack}/${bin || ''} (${existingQty} -> ${itemQty})`);
          await connection.execute(
            `UPDATE tabPutawayLine 
             SET qty = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [itemQty, lineExists[0].id]
          );
        } else {
          console.log(`[Putaway Event] Line already exists with same quantity: ${itemCode} @ ${rack}/${bin || ''}`);
        }
      } else {
        // Check if this carton+item exists in a different location
        // Handle NULL rack properly - check if location is different
        const [existingDifferentLocation] = await connection.execute(
          `SELECT id, rack, bin FROM tabPutawayLine 
           WHERE parent_title = ? 
             AND item_code = ? 
             AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))
             AND NOT (
               (rack = ? OR (rack IS NULL AND ? = '') OR (rack = '' AND ? IS NULL))
               AND (bin = ? OR (bin IS NULL AND ? = '') OR (bin = '' AND ? IS NULL))
             )`,
          [putawayTaskTitle, itemCode, boxId, boxId, rackValue, rackValue, rackValue, binValue, binValue, binValue]
        );
        
        if (existingDifferentLocation.length > 0) {
          console.warn(`[Putaway Event] WARNING: Carton ${boxId || 'NULL'} with item ${itemCode} already put away to different location: ${existingDifferentLocation[0].rack}/${existingDifferentLocation[0].bin || ''}. Creating new line for ${rack}/${bin || ''}`);
        }
        
        // Store box_id in carton_id field
        // Use empty string if bin is null (database column is NOT NULL)
        const binValue = bin || '';
        await connection.execute(
          `INSERT INTO tabPutawayLine (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [putawayTaskTitle, boxId, itemCode, itemQty, rack, binValue]
        );
      }
    }
  }

  console.log(`Processed putaway event: Updated putaway task ${putawayTaskTitle} for transfer carton ${tc_id}`);
}

/**
 * Process PUTAWAY_DISPATCH events - dispatch transfer carton for putaway
 * This dispatches the transfer carton without requiring a location
 */
async function processPutawayDispatchEvent(connection, event) {
  const { tc_id, user_id } = event;

  if (!tc_id) {
    return; // Skip if tc_id missing
  }

  // Check if transfer carton exists
  const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
  const allColumns = new Set(tableInfo.map((row) => row.Field));

  // Check if dispatched_on column exists
  const hasDispatchedOn = allColumns.has('dispatched_on');
  const hasStatus = allColumns.has('status');

  // Update transfer carton status to Dispatched
  if (hasStatus) {
    await connection.execute(
      `UPDATE tabTransferCarton SET status = 'Dispatched'${hasDispatchedOn ? ', dispatched_on = NOW()' : ''} WHERE tc_id = ?`,
      [tc_id]
    );
  } else if (hasDispatchedOn) {
    // If no status column, just update dispatched_on
    await connection.execute(
      `UPDATE tabTransferCarton SET dispatched_on = NOW() WHERE tc_id = ?`,
      [tc_id]
    );
  }

  console.log(`Processed putaway dispatch event: Dispatched transfer carton ${tc_id}`);
}

/**
 * Process PUTAWAY completion events and update stock ledger
 * Called when PUTAWAY_CONFIRM or PUTAWAY_COMPLETE events are received
 */
async function processPutawayCompletionEvent(connection, event) {
  const { putaway_task, tc_id, rack, bin, item_code, qty, user_id } = event;

  // If putaway_task is provided, use it; otherwise try to find from tc_id
  let putawayTaskTitle = putaway_task;
  
  if (!putawayTaskTitle && tc_id) {
    // Try to find putaway task from transfer carton
    const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
    const allColumns = new Set(tableInfo.map((row) => row.Field));
    let asnColumn = allColumns.has("asn_no") ? "asn_no" : "advance_shipping_notice";
    
    const [tcRows] = await connection.execute(
      `SELECT ${asnColumn} as asn_no FROM tabTransferCarton WHERE tc_id = ? LIMIT 1`,
      [tc_id]
    );
    
    if (tcRows.length > 0 && tcRows[0].asn_no) {
      const [tasks] = await connection.execute(
        `SELECT title FROM tabPutawayTask WHERE advance_shipping_notice = ? ORDER BY created_at DESC LIMIT 1`,
        [tcRows[0].asn_no]
      );
      if (tasks.length > 0) {
        putawayTaskTitle = tasks[0].title;
      }
    }
  }

  if (!putawayTaskTitle) {
    return; // Can't process without putaway task
  }

  // Get all putaway lines for this task
  const [putawayLines] = await connection.execute(
    `SELECT item_code, qty, rack, bin FROM tabPutawayLine WHERE parent_title = ? AND item_code IS NOT NULL AND qty > 0`,
    [putawayTaskTitle]
  );

  if (putawayLines.length === 0) {
    return; // No lines to process
  }

  // Get warehouse
  const [taskInfo] = await connection.execute(
    `SELECT advance_shipping_notice FROM tabPutawayTask WHERE title = ?`,
    [putawayTaskTitle]
  );
  
  // CRITICAL: Normalize warehouse to CODE (not name) for stock ledger consistency
  let warehouse = null;
  if (taskInfo.length > 0 && taskInfo[0].advance_shipping_notice) {
    // Try to get warehouse from ASN if available
    // (Note: ASN might have warehouse name or code)
    warehouse = null; // Will be normalized below
  }
  
  // Normalize warehouse to CODE
  const [defaultWarehouse] = await connection.execute(
    `SELECT code FROM tabWarehouse WHERE warehouse_type = 'Warehouse' ORDER BY code LIMIT 1`
  );
  if (defaultWarehouse.length > 0) {
    warehouse = defaultWarehouse[0].code;
  } else {
    warehouse = 'WH-MAIN'; // Fallback
  }
  
  // If we have a warehouse from ASN, normalize it
  if (warehouse) {
    // Check if it's already a code
    const [codeCheck] = await connection.execute(
      `SELECT code FROM tabWarehouse WHERE code = ? LIMIT 1`,
      [warehouse]
    );
    
    if (codeCheck.length === 0) {
      // It's a name, look up the code
      const [nameCheck] = await connection.execute(
        `SELECT code FROM tabWarehouse WHERE name = ? LIMIT 1`,
        [warehouse]
      );
      if (nameCheck.length > 0) {
        warehouse = nameCheck[0].code;
      }
    }
  }

  // Update stock ledger for each putaway line
  for (const line of putawayLines) {
    const itemCode = line.item_code;
    const lineQty = parseFloat(line.qty) || 0;
    const lineRack = line.rack || null;
    const lineBin = line.bin || null;
    
    let binLocation = null;
    if (lineRack && lineBin) {
      binLocation = `${lineRack}-${lineBin}`;
    } else if (lineRack) {
      binLocation = lineRack;
    }

    if (!itemCode || lineQty <= 0) continue;

    // Get current stock
    const [currentStock] = await connection.execute(
      `SELECT qty, reserved_qty FROM tabStockLedger WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))`,
      [itemCode, warehouse, binLocation, binLocation]
    );

    const currentQty = currentStock.length > 0 ? parseFloat(currentStock[0].qty) || 0 : 0;
    const currentReservedQty = currentStock.length > 0 ? parseFloat(currentStock[0].reserved_qty) || 0 : 0;
    const newQty = currentQty + lineQty;

    // Update stock ledger
    await connection.execute(
      `INSERT INTO tabStockLedger (item_code, warehouse, bin_location, qty, reserved_qty, last_transaction_date, last_transaction_type, last_transaction_ref, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, NOW(), 'Putaway', ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE qty = ?, last_transaction_date = NOW(), last_transaction_type = 'Putaway', last_transaction_ref = ?, updated_at = NOW()`,
      [itemCode, warehouse, binLocation, newQty, currentReservedQty, putawayTaskTitle, newQty, putawayTaskTitle]
    );

    // Get carton_id from putaway line if available
    const [putawayLineWithCarton] = await connection.execute(
      `SELECT carton_id FROM tabPutawayLine WHERE parent_title = ? AND item_code = ? LIMIT 1`,
      [putawayTaskTitle, itemCode]
    );
    const cartonId = putawayLineWithCarton.length > 0 ? putawayLineWithCarton[0].carton_id : null;
    
    // Check if carton_id column exists in tabStockTransaction
    const [stockTransactionColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockTransaction' 
      AND COLUMN_NAME = 'carton_id'
    `);
    const hasStockTransactionCartonId = stockTransactionColumns.length > 0;
    
    // Insert stock transaction (with carton_id if available)
    if (hasStockTransactionCartonId && cartonId) {
      await connection.execute(
        `INSERT INTO tabStockTransaction 
          (transaction_date, transaction_type, reference_doc_type, reference_doc, item_code, warehouse, bin_location, carton_id, qty_change, qty_before, qty_after, source_bin, target_bin, performed_by, created_at)
         VALUES (NOW(), 'Putaway', 'Putaway Task', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NOW())`,
        [putawayTaskTitle, itemCode, warehouse, binLocation, cartonId, lineQty, currentQty, newQty, binLocation, user_id || 'SYSTEM']
      );
    } else {
      await connection.execute(
        `INSERT INTO tabStockTransaction 
          (transaction_date, transaction_type, reference_doc_type, reference_doc, item_code, warehouse, bin_location, qty_change, qty_before, qty_after, source_bin, target_bin, performed_by, created_at)
         VALUES (NOW(), 'Putaway', 'Putaway Task', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NOW())`,
        [putawayTaskTitle, itemCode, warehouse, binLocation, lineQty, currentQty, newQty, binLocation, user_id || 'SYSTEM']
      );
    }
  }

  // Post stock updates (rebuild summaries from ledger)
  const itemCodes = [...new Set(putawayLines.map(line => line.item_code).filter(Boolean))];
  
  if (itemCodes.length > 0) {
    try {
      const postingResult = await postStock('PUTAWAY', putawayTaskTitle, {
        itemCodes,
        warehouse: warehouse,
        postedBy: user_id || 'SYSTEM',
        connection // Use existing connection
      });
      
      if (postingResult.posted) {
        console.log(`✅ Stock posted for Putaway ${putawayTaskTitle}: ${postingResult.affectedItems.length} items updated`);
      } else {
        console.log(`⏭️  Stock posting skipped for ${putawayTaskTitle}: ${postingResult.reason}`);
      }
    } catch (postingError) {
      console.error(`⚠️  Stock posting failed for Putaway ${putawayTaskTitle}:`, postingError);
      // Don't fail the entire operation, but log the error
    }
  }

  // Mark putaway task as completed if not already
  await connection.execute(
    `UPDATE tabPutawayTask SET status = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE title = ? AND status != 'Completed'`,
    [putawayTaskTitle]
  );

  console.log(`Processed putaway completion event: Updated stock for putaway task ${putawayTaskTitle}`);
}

/**
 * Process Material Request picking - update picked_qty and reduce stock
 */
async function processMaterialRequestPicking(connection, data) {
  const { material_request, item_code, qty, source_bin, warehouse } = data;
  
  if (!material_request || !item_code || !qty || qty <= 0) {
    console.warn(`⚠️  processMaterialRequestPicking: Missing required fields. material_request=${material_request}, item_code=${item_code}, qty=${qty}`);
    return; // Skip if required fields missing
  }
  
  try {
    // Get Material Request details
    const [mrRows] = await connection.execute(`
      SELECT title, from_warehouse, to_showroom, status
      FROM tabMaterialRequest
      WHERE title = ?
    `, [material_request]);
    
    if (mrRows.length === 0) {
      console.warn(`Material Request ${material_request} not found`);
      return;
    }
    
    const materialRequest = mrRows[0];
    const targetWarehouse = warehouse || materialRequest.from_warehouse;
    
    // Get current picked_qty for this item
    const [currentItem] = await connection.execute(`
      SELECT picked_qty, requested_qty
      FROM tabMaterialRequestItem
      WHERE parent_title = ? AND item_code = ?
    `, [material_request, item_code]);
    
    if (currentItem.length === 0) {
      console.warn(`Item ${item_code} not found in Material Request ${material_request}`);
      return;
    }
    
    const currentPickedQty = parseFloat(currentItem[0].picked_qty) || 0;
    const requestedQty = parseFloat(currentItem[0].requested_qty) || 0;
    const pickedQty = parseFloat(qty) || 0;
    const newPickedQty = currentPickedQty + pickedQty;
    
    // Don't allow picking more than requested
    if (newPickedQty > requestedQty) {
      console.warn(`Cannot pick ${pickedQty} for ${item_code} in ${material_request}. Already picked: ${currentPickedQty}, Requested: ${requestedQty}`);
      return;
    }
    
    // Compute item status based on picked_qty
    let itemStatus = 'Pending';
    if (newPickedQty >= requestedQty && requestedQty > 0) {
      itemStatus = 'Picked';
    } else if (newPickedQty > 0) {
      itemStatus = 'In Progress';
    }
    
    // Update Material Request Item picked_qty and status
    await connection.execute(`
      UPDATE tabMaterialRequestItem
      SET picked_qty = ?,
          status = ?,
          updated_at = NOW()
      WHERE parent_title = ? AND item_code = ?
    `, [newPickedQty, itemStatus, material_request, item_code]);
    
    console.log(`✅ Updated picked_qty for ${item_code} in ${material_request}: ${currentPickedQty} → ${newPickedQty} (added ${pickedQty}), status: ${itemStatus}`);
    
    // Recalculate total_picked_qty from items (more accurate than incrementing)
    await connection.execute(`
      UPDATE tabMaterialRequest
      SET total_picked_qty = (
          SELECT COALESCE(SUM(picked_qty), 0)
          FROM tabMaterialRequestItem
          WHERE parent_title = ?
        ),
        updated_at = NOW()
      WHERE title = ?
    `, [material_request, material_request]);
    
    // Reduce stock from source bin if source_bin is provided
    if (source_bin) {
      // Check if carton_id column exists in tabStockLedger
      const [stockLedgerCartonIdColumn] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabStockLedger' 
        AND COLUMN_NAME = 'carton_id'
      `);
      const hasStockLedgerCartonIdColumn = stockLedgerCartonIdColumn.length > 0;

      // Get current stock from source bin (including carton_id if available)
      let stockQuery = `
        SELECT qty, reserved_qty
      `;
      if (hasStockLedgerCartonIdColumn) {
        stockQuery += `, carton_id`;
      }
      stockQuery += `
        FROM tabStockLedger
        WHERE item_code = ?
          AND warehouse = ?
          AND bin_location = ?
      `;

      const [currentStock] = await connection.execute(
        stockQuery,
        [item_code, targetWarehouse, source_bin]
      );
      
      const currentQty = currentStock.length > 0 ? parseFloat(currentStock[0].qty) || 0 : 0;
      const currentReservedQty = currentStock.length > 0 ? parseFloat(currentStock[0].reserved_qty) || 0 : 0;
      const cartonId = hasStockLedgerCartonIdColumn && currentStock.length > 0
        ? (currentStock[0].carton_id || null)
        : null;
      
      if (currentQty >= pickedQty) {
        const newQty = currentQty - pickedQty;
        
        // Build stock ledger update query with optional carton_id
        let insertFields = `item_code, warehouse, bin_location, qty, reserved_qty, last_transaction_date, last_transaction_type, last_transaction_ref, updated_at, created_at`;
        let insertValues = `?, ?, ?, ?, ?, NOW(), 'Picking', ?, NOW(), NOW()`;
        let insertParams = [item_code, targetWarehouse, source_bin, newQty, currentReservedQty, material_request];
        
        let updateFields = `qty = ?, last_transaction_date = NOW(), last_transaction_type = 'Picking', last_transaction_ref = ?, updated_at = NOW()`;
        let updateParams = [newQty, material_request];

        // Include carton_id if column exists
        if (hasStockLedgerCartonIdColumn && cartonId) {
          insertFields += `, carton_id`;
          insertValues += `, ?`;
          insertParams.push(cartonId);
          updateFields += `, carton_id = ?`;
          updateParams.push(cartonId);
        }
        
        // Update stock ledger (decrease from source bin)
        await connection.execute(`
          INSERT INTO tabStockLedger 
            (${insertFields})
          VALUES (${insertValues})
          ON DUPLICATE KEY UPDATE
            ${updateFields}
        `, [...insertParams, ...updateParams]);

        // Update tabCartonStock if carton_id exists and tabCartonStock table exists
        if (cartonId) {
          const [cartonStockTable] = await connection.execute(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabCartonStock'
          `);

          if (cartonStockTable.length > 0) {
            try {
              // Get current carton stock
              const [currentCartonStock] = await connection.execute(
                `SELECT qty FROM tabCartonStock 
                 WHERE carton_id = ? AND item_code = ? AND warehouse = ? AND bin_location = ?`,
                [cartonId, item_code, targetWarehouse, source_bin]
              );

              const currentCartonQty = currentCartonStock.length > 0 
                ? parseFloat(currentCartonStock[0].qty) || 0 
                : 0;
              const newCartonQty = Math.max(0, currentCartonQty - pickedQty); // Don't go below 0

              // Update carton stock
              await connection.execute(`
                UPDATE tabCartonStock
                SET qty = ?,
                    updated_at = NOW()
                WHERE carton_id = ? AND item_code = ? AND warehouse = ? AND bin_location = ?
              `, [newCartonQty, cartonId, item_code, targetWarehouse, source_bin]);

              console.log(`[Material Request Picking] 📦 Updated tabCartonStock: carton_id=${cartonId}, item=${item_code}, qty=${currentCartonQty} → ${newCartonQty}, bin=${source_bin}`);
            } catch (cartonStockError) {
              console.warn(`[Material Request Picking] ⚠️ Could not update tabCartonStock: ${cartonStockError.message}`);
              // Don't fail the transaction - stock ledger is already updated
            }
          }
        }
        
        // Insert stock transaction log
        // Check if carton_id column exists in tabStockTransaction
        const [stockTransactionColumns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabStockTransaction' 
          AND COLUMN_NAME = 'carton_id'
        `);
        const hasStockTransactionCartonId = stockTransactionColumns.length > 0;
        
        if (hasStockTransactionCartonId && cartonId) {
          // Include carton_id in stock transaction log
          await connection.execute(`
            INSERT INTO tabStockTransaction 
              (transaction_date, transaction_type, reference_doc_type, reference_doc,
               item_code, warehouse, bin_location, carton_id, qty_change, qty_before, qty_after,
               source_bin, target_bin, performed_by, created_at)
            VALUES 
              (NOW(), 'Picking', 'Material Request', ?,
               ?, ?, ?, ?, ?, ?, ?,
               ?, NULL, NULL, NOW())
          `, [
            material_request,
            item_code,
            targetWarehouse,
            source_bin,
            cartonId,
            -pickedQty, // Negative (decrease)
            currentQty,
            newQty,
            source_bin
          ]);
        } else {
          // Standard stock transaction log without carton_id
          await connection.execute(`
            INSERT INTO tabStockTransaction 
              (transaction_date, transaction_type, reference_doc_type, reference_doc,
               item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
               source_bin, target_bin, performed_by, created_at)
            VALUES 
              (NOW(), 'Picking', 'Material Request', ?,
               ?, ?, ?, ?, ?, ?,
               ?, NULL, NULL, NOW())
          `, [
            material_request,
            item_code,
            targetWarehouse,
            source_bin,
            -pickedQty, // Negative (decrease)
            currentQty,
            newQty,
            source_bin
          ]);
        }
        
        // Update tabItem.stock_qty
        const [stockSum] = await connection.execute(`
          SELECT COALESCE(SUM(qty), 0) as total_qty
          FROM tabStockLedger
          WHERE item_code = ? AND warehouse = ?
        `, [item_code, targetWarehouse]);
        
        const totalStockQty = parseFloat(stockSum[0].total_qty) || 0;
        
        await connection.execute(`
          UPDATE tabItem
          SET stock_qty = ?,
              updated_at = NOW()
          WHERE code = ?
        `, [totalStockQty, item_code]);
        
        console.log(`✅ Reduced stock for ${item_code} at ${source_bin}: ${currentQty} → ${newQty} (Material Request: ${material_request})`);
      } else {
        console.warn(`⚠️  Insufficient stock for ${item_code} at ${source_bin}. Available: ${currentQty}, Required: ${pickedQty}`);
      }
    }
    
    // Update status based on picking progress
    // Status should only be "Picked" when all items are picked AND transfer carton is sealed
    // So we only update to "In Progress" here, not "Picked"
    if (materialRequest.status === 'Submitted' && newPickedQty > currentPickedQty) {
      await connection.execute(`
        UPDATE tabMaterialRequest
        SET status = 'In Progress',
            updated_at = NOW()
        WHERE title = ?
      `, [material_request]);
    }
    
  } catch (error) {
    console.error(`Failed to process Material Request picking for ${material_request}:`, error);
    // Don't throw - allow event insertion to continue
  }
}

