// wms-api/src/modules/events/eventController.js
// Event logging operations

import { getConnection } from '../../db/connection.js';
import { postStock } from '../stock-ledger/stockPostingService.js';
import { logger } from '../../utils/logger.js';

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
        transfer_in = null,        // Support transfer_in field (for TRANSFER_IN_RECEIVE events)
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

      // CRITICAL FIX: Normalize IDs for Putaway events
      // Putaway is BOX-based, so putaway box ID must be in box_id (not tc_id)
      const isPutawayEvent = 
        event_type === 'PUTAWAY_TO_RACK' ||
        event_type === 'PUTAWAY_CONFIRM' ||
        event_type === 'PUTAWAY_COMPLETE' ||
        event?.purpose === 'PUTAWAY' ||
        event?.module === 'PUTAWAY';
      
      let normalizedBoxId = box_id;
      let normalizedTcId = tc_id;
      let normalizedItemCode = item_code;
      let normalizedCartonId = carton_id;
      let normalizedStore = store;
      
      if (isPutawayEvent) {
        // Putaway is BOX-based: use box_id from event, or fallback to tc_id if box_id not provided
        // But ensure tc_id is NOT used for putaway (set to null)
        normalizedBoxId = box_id || tc_id || null;
        normalizedTcId = null; // Ensure tc_id is NOT used for putaway
        
        // CRITICAL FIX: If carton_id is provided but box_id is not, use carton_id as box_id
        // For Transfer In, carton_id IS the box_id (CTN-TI-* format)
        if (!normalizedBoxId && carton_id) {
          // Strip item code if appended (format: "CTN-TI-...: SKU-..." -> "CTN-TI-...")
          const cleanCartonId = carton_id.split(':')[0].trim();
          normalizedBoxId = cleanCartonId;
          normalizedCartonId = cleanCartonId; // Also update normalizedCartonId
          logger.info(`[Event] Using carton_id as box_id for putaway: ${normalizedBoxId}`);
        }
        
        // CRITICAL: Also check if carton_id has item code but box_id is already set
        // In this case, we still need to clean carton_id for lookup
        if (normalizedCartonId && normalizedCartonId.includes(':')) {
          normalizedCartonId = normalizedCartonId.split(':')[0].trim();
          logger.info(`[Event] Cleaned carton_id (removed item code): ${normalizedCartonId}`);
        }
        
        if (tc_id && !box_id) {
          logger.warn(`[Event] PUTAWAY event had tc_id instead of box_id. Normalized: box_id=${tc_id}, tc_id=null`, {
            event_type,
            original_tc_id: tc_id,
            normalized_box_id: normalizedBoxId
          });
        }
        
        // CRITICAL FIX: For Transfer In putaway, mobile app may send:
        // 1. Old format: TI-PUT-* (putaway task title or old box_id)
        // 2. Putaway task title: PUT-*
        // 3. Carton ID: CTN-TI-* (correct format, should be used as box_id)
        // 4. Carton ID with item code: CTN-TI-*: SKU-* (need to strip item code)
        // We need to resolve to the actual carton_id (CTN-TI-*) which is the box_id in tabSortBox
        
        // CRITICAL: Strip item code from carton_id if present (format: "CTN-TI-...: SKU-..." -> "CTN-TI-...")
        if (normalizedCartonId && normalizedCartonId.includes(':')) {
          normalizedCartonId = normalizedCartonId.split(':')[0].trim();
          logger.info(`[Event] Stripped item code from carton_id: ${normalizedCartonId}`);
        }
        
        // CRITICAL: If normalizedBoxId has item code appended, strip it
        if (normalizedBoxId && normalizedBoxId.includes(':')) {
          normalizedBoxId = normalizedBoxId.split(':')[0].trim();
          logger.info(`[Event] Stripped item code from box_id: ${normalizedBoxId}`);
        }
        
        let actualBoxIdForLookup = normalizedBoxId;
        let resolvedFromPutawayTask = false;
        
        if (normalizedBoxId && (normalizedBoxId.startsWith('PUT-') || normalizedBoxId.startsWith('TI-PUT-'))) {
          // This is a putaway task title or old format - need to find actual carton_id
          try {
            // Try to find carton_id from tabSortBox using putaway_task_title
            const [sortBoxColumns] = await connection.execute(`
              SELECT COLUMN_NAME
              FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'tabSortBox'
                AND COLUMN_NAME IN ('putaway_task_title', 'box_id', 'carton_id')
            `);
            const hasPutawayTaskTitle = sortBoxColumns.some(col => col.COLUMN_NAME === 'putaway_task_title');
            
            if (hasPutawayTaskTitle) {
              // Try to find box by putaway_task_title
              const [boxByTask] = await connection.execute(
                `SELECT box_id, carton_id FROM tabSortBox WHERE putaway_task_title = ? LIMIT 1`,
                [normalizedBoxId]
              );
              
              if (boxByTask.length > 0) {
                actualBoxIdForLookup = boxByTask[0].box_id || boxByTask[0].carton_id || normalizedBoxId;
                resolvedFromPutawayTask = true;
                logger.info(`[Event] Resolved putaway task ${normalizedBoxId} to box_id ${actualBoxIdForLookup}`);
              }
            }
            
            // Fallback: Try to find carton_id from putaway lines
            if (!resolvedFromPutawayTask) {
              const [putawayLine] = await connection.execute(
                `SELECT DISTINCT carton_id FROM tabPutawayLine WHERE parent_title = ? AND carton_id IS NOT NULL LIMIT 1`,
                [normalizedBoxId]
              );
              
              if (putawayLine.length > 0 && putawayLine[0].carton_id) {
                actualBoxIdForLookup = putawayLine[0].carton_id;
                resolvedFromPutawayTask = true;
                logger.info(`[Event] Resolved putaway task ${normalizedBoxId} to carton_id ${actualBoxIdForLookup} from putaway lines`);
              }
            }
          } catch (resolveError) {
            logger.warn(`[Event] Failed to resolve putaway task to carton_id:`, resolveError);
          }
        }
        
        // CRITICAL: Update normalizedBoxId to use actual carton_id if resolved
        if (resolvedFromPutawayTask && actualBoxIdForLookup !== normalizedBoxId) {
          normalizedBoxId = actualBoxIdForLookup;
          logger.info(`[Event] Updated normalizedBoxId from putaway task to actual box_id: ${normalizedBoxId}`);
        }
        
        // CRITICAL FIX: Populate missing item_code, carton_id, store, and box_id from box contents
        // If PUTAWAY event is missing these fields, look them up from tabSortBox or putaway lines
        // Also check if we have carton_id but no box_id (mobile app might send carton_id only)
        // CRITICAL: For PUTAWAY events, ALWAYS try to populate store and box_id if missing
        const needsLookup = normalizedBoxId && (!normalizedItemCode || !normalizedStore || !normalizedCartonId);
        const hasCartonIdButNoBoxId = !normalizedBoxId && normalizedCartonId;
        const needsStoreOrBoxId = isPutawayEvent && (!normalizedStore || !normalizedBoxId);
        
        if (needsLookup || hasCartonIdButNoBoxId || needsStoreOrBoxId) {
          try {
            // CRITICAL: First, try to get store and box_id from tabSortBox (for both ASN and Transfer In)
            // This should work for both CTN-TI-* format and old TI-PUT-* format
            let sortBoxInfo = [];
            let searchId = normalizedBoxId || normalizedCartonId;
            
            // Clean search ID (strip item code if present)
            if (searchId && searchId.includes(':')) {
              searchId = searchId.split(':')[0].trim();
              logger.info(`[Event] Cleaned searchId (removed item code): ${searchId}`);
            }
            
            // Try exact match first
            if (searchId) {
              [sortBoxInfo] = await connection.execute(
                `SELECT box_id, store, carton_id, advance_shipping_notice FROM tabSortBox WHERE box_id = ? OR carton_id = ? LIMIT 1`,
                [searchId, searchId]
              );
              
              if (sortBoxInfo.length > 0) {
                logger.info(`[Event] ✅ Found box in tabSortBox by exact match: ${searchId} -> ${sortBoxInfo[0].box_id}`);
              }
            }
            
            // If not found, try partial match for different box formats
            if (sortBoxInfo.length === 0 && searchId) {
              // Try partial match for CTN-TI-* format (Transfer In)
              if (searchId.startsWith('CTN-TI-')) {
                // Extract base part (CTN-TI-{transfer_in}-{date})
                const parts = searchId.split('-');
                if (parts.length >= 4) {
                  // Format: CTN-TI-{transfer_in}-{date}-{time}-{random}
                  // Try to find by matching first parts (CTN-TI-{transfer_in}-{date})
                  const basePattern = parts.slice(0, 4).join('-') + '%';
                  [sortBoxInfo] = await connection.execute(
                    `SELECT box_id, store, carton_id, advance_shipping_notice FROM tabSortBox WHERE (box_id LIKE ? OR carton_id LIKE ?) LIMIT 1`,
                    [basePattern, basePattern]
                  );
                  
                  if (sortBoxInfo.length > 0) {
                    logger.info(`[Event] Found Transfer In box by partial match: ${searchId} -> ${sortBoxInfo[0].box_id}`);
                  }
                }
              }
              
              // Try partial match for BOX-* format (ASN)
              if (sortBoxInfo.length === 0 && searchId.startsWith('BOX-')) {
                // Extract base part (BOX-{store}-{timestamp})
                const parts = searchId.split('-');
                if (parts.length >= 2) {
                  // Format: BOX-{store}-{timestamp}
                  // Try to find by matching first parts (BOX-{store})
                  const basePattern = parts.slice(0, 2).join('-') + '%';
                  [sortBoxInfo] = await connection.execute(
                    `SELECT box_id, store, carton_id, advance_shipping_notice FROM tabSortBox WHERE (box_id LIKE ? OR carton_id LIKE ?) LIMIT 1`,
                    [basePattern, basePattern]
                  );
                  
                  if (sortBoxInfo.length > 0) {
                    logger.info(`[Event] Found ASN box by partial match: ${searchId} -> ${sortBoxInfo[0].box_id}`);
                  }
                }
              }
              
              // Try partial match for any format (fallback - match first part)
              if (sortBoxInfo.length === 0 && searchId.includes('-')) {
                const parts = searchId.split('-');
                if (parts.length >= 2) {
                  // Try matching first 2 parts
                  const basePattern = parts.slice(0, 2).join('-') + '%';
                  [sortBoxInfo] = await connection.execute(
                    `SELECT box_id, store, carton_id, advance_shipping_notice FROM tabSortBox WHERE (box_id LIKE ? OR carton_id LIKE ?) LIMIT 1`,
                    [basePattern, basePattern]
                  );
                  
                  if (sortBoxInfo.length > 0) {
                    logger.info(`[Event] Found box by generic partial match: ${searchId} -> ${sortBoxInfo[0].box_id}`);
                  }
                }
              }
            }
            
            if (sortBoxInfo.length > 0) {
              const boxInfo = sortBoxInfo[0];
              
              // CRITICAL: Use box_id from tabSortBox (this is the actual box_id, which is carton_id for Transfer In)
              // Update normalizedBoxId to the actual box_id from tabSortBox (ALWAYS, even if it was set before)
              if (boxInfo.box_id) {
                normalizedBoxId = boxInfo.box_id;
                logger.info(`[Event] ✅ Set normalizedBoxId from tabSortBox: ${normalizedBoxId}`);
              }
              
              // CRITICAL FIX: Always populate store from tabSortBox if missing OR if it's different
              if (boxInfo.store) {
                normalizedStore = boxInfo.store;
                logger.info(`[Event] ✅ Set store from tabSortBox for box ${normalizedBoxId}: ${normalizedStore}`);
              }
              
              // Populate carton_id if missing
              if (!normalizedCartonId && boxInfo.carton_id) {
                normalizedCartonId = boxInfo.carton_id;
                logger.info(`[Event] Populated carton_id from tabSortBox: ${normalizedCartonId}`);
              } else if (!normalizedCartonId && boxInfo.box_id) {
                // For Transfer In, box_id IS the carton_id
                normalizedCartonId = boxInfo.box_id;
                logger.info(`[Event] Using box_id as carton_id from tabSortBox: ${normalizedCartonId}`);
              }
            } else if (normalizedBoxId) {
              // Box not found - log warning but continue
              logger.warn(`[Event] Box ${normalizedBoxId} not found in tabSortBox - store and box_id may remain NULL`);
            }
            
            // CRITICAL: Check if this is Transfer In putaway
            // Transfer In putaway uses CTN-TI-* format as box_id
            const isTransferInPutaway = normalizedBoxId && normalizedBoxId.startsWith('CTN-TI-');
            
            if (isTransferInPutaway) {
              // Transfer In putaway: Look up from putaway lines
              // CRITICAL: normalizedBoxId is now the actual carton_id (CTN-TI-*)
              // Find putaway task from carton_id in putaway lines
              let actualPutawayTaskTitle = null;
              
              // Try to get putaway task from putaway lines using carton_id
              const [taskFromCarton] = await connection.execute(
                `SELECT DISTINCT parent_title FROM tabPutawayLine WHERE carton_id = ? LIMIT 1`,
                [normalizedBoxId]
              );
              
              if (taskFromCarton.length > 0) {
                actualPutawayTaskTitle = taskFromCarton[0].parent_title;
                logger.info(`[Event] Found putaway task ${actualPutawayTaskTitle} from putaway lines with carton_id ${normalizedBoxId}`);
              } else {
                // Fallback: Try to get from tabSortBox
                const [sortBoxColumns] = await connection.execute(`
                  SELECT COLUMN_NAME
                  FROM INFORMATION_SCHEMA.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'tabSortBox'
                    AND COLUMN_NAME = 'putaway_task_title'
                `);
                const hasPutawayTaskTitle = sortBoxColumns.length > 0;
                
                if (hasPutawayTaskTitle) {
                  const [boxInfo] = await connection.execute(
                    `SELECT putaway_task_title FROM tabSortBox WHERE box_id = ? LIMIT 1`,
                    [normalizedBoxId]
                  );
                  
                  if (boxInfo.length > 0 && boxInfo[0].putaway_task_title) {
                    actualPutawayTaskTitle = boxInfo[0].putaway_task_title;
                    logger.info(`[Event] Found putaway task ${actualPutawayTaskTitle} from tabSortBox for box ${normalizedBoxId}`);
                  }
                }
              }
              
              // Get ALL lines to find the correct item_code and carton_id (not just LIMIT 1)
              const [putawayLines] = await connection.execute(`
                SELECT 
                  pl.item_code,
                  pl.carton_id,
                  pl.qty,
                  pt.transfer_in,
                  pt.source_type,
                  pt.warehouse
                FROM tabPutawayLine pl
                INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title
                WHERE pt.title = ?
                  AND pl.item_code IS NOT NULL
                ORDER BY pl.item_code
              `, [actualPutawayTaskTitle]);
              
              if (putawayLines.length > 0) {
                // Use the first line to populate missing fields
                // If carton_id is provided in the event, try to match that line
                const matchingLine = carton_id 
                  ? putawayLines.find(line => line.carton_id === carton_id)
                  : putawayLines[0];
                
                const line = matchingLine || putawayLines[0];
                
                // Populate missing fields
                if (!normalizedItemCode && line.item_code) {
                  normalizedItemCode = line.item_code;
                  logger.info(`[Event] Populated missing item_code from putaway lines for task ${normalizedBoxId}: ${normalizedItemCode}`);
                }
                
                if (!normalizedCartonId && line.carton_id) {
                  normalizedCartonId = line.carton_id;
                  logger.info(`[Event] Populated missing carton_id from putaway lines for task ${normalizedBoxId}: ${normalizedCartonId}`);
                }
                
                // Get store from transfer_in or putaway task
                if (!normalizedStore) {
                  // Try to get store from transfer_in
                  if (line.transfer_in) {
                    const [transferIn] = await connection.execute(`
                      SELECT store FROM tabTransferIn WHERE title = ? LIMIT 1
                    `, [line.transfer_in]);
                    
                    if (transferIn.length > 0 && transferIn[0].store) {
                      normalizedStore = transferIn[0].store;
                      logger.info(`[Event] Populated missing store from transfer_in ${line.transfer_in}: ${normalizedStore}`);
                    }
                  }
                  
                  // Fallback: Get from putaway task warehouse
                  if (!normalizedStore && line.warehouse) {
                    normalizedStore = line.warehouse;
                    logger.info(`[Event] Populated missing store from putaway task warehouse: ${normalizedStore}`);
                  }
                }
                
                // CRITICAL: If qty is 1.00 (default), replace with actual qty from putaway line
                const currentQty = parseFloat(qty) || 0;
                const lineQty = parseFloat(line.qty) || 0;
                if (currentQty === 1.00 && lineQty > 1.00) {
                  qty = lineQty;
                  logger.info(`[Event] Replaced default qty (1.00) with actual qty from putaway line: ${qty}`);
                }
              }
            } else {
              // ASN putaway: Get box contents from SORT_TO_BOX events
              const [boxContents] = await connection.execute(`
                SELECT 
                  item_code,
                  carton_id,
                  store
                FROM tabWmsScanEvent
                WHERE event_type = 'SORT_TO_BOX'
                  AND box_id = ?
                  AND item_code IS NOT NULL
                ORDER BY event_time DESC
                LIMIT 1
              `, [normalizedBoxId]);
              
              if (boxContents.length > 0) {
                const boxContent = boxContents[0];
                
                // Populate missing fields
                if (!normalizedItemCode && boxContent.item_code) {
                  normalizedItemCode = boxContent.item_code;
                  logger.info(`[Event] Populated missing item_code from box ${normalizedBoxId}: ${normalizedItemCode}`);
                }
                
                if (!normalizedCartonId && boxContent.carton_id) {
                  normalizedCartonId = boxContent.carton_id;
                  logger.info(`[Event] Populated missing carton_id from box ${normalizedBoxId}: ${normalizedCartonId}`);
                } else if (!normalizedCartonId) {
                  // If carton_id still missing, use box_id as carton_id (for putaway, box_id IS the carton)
                  normalizedCartonId = normalizedBoxId;
                  logger.info(`[Event] Using box_id as carton_id for putaway: ${normalizedBoxId}`);
                }
                
                if (!normalizedStore && boxContent.store) {
                  normalizedStore = boxContent.store;
                  logger.info(`[Event] Populated missing store from box ${normalizedBoxId}: ${normalizedStore}`);
                }
              } else {
                // If no SORT_TO_BOX events found, try to get from tabsortbox
                if (!normalizedStore) {
                  const [sortBox] = await connection.execute(`
                    SELECT store FROM tabsortbox WHERE box_id = ? LIMIT 1
                  `, [normalizedBoxId]);
                  
                  if (sortBox.length > 0 && sortBox[0].store) {
                    normalizedStore = sortBox[0].store;
                    logger.info(`[Event] Populated missing store from tabsortbox for box ${normalizedBoxId}: ${normalizedStore}`);
                  }
                }
                
                // Use box_id as carton_id if still missing
                if (!normalizedCartonId) {
                  normalizedCartonId = normalizedBoxId;
                  logger.info(`[Event] Using box_id as carton_id for putaway (no SORT_TO_BOX events found): ${normalizedBoxId}`);
                }
              }
            }
          } catch (lookupError) {
            logger.warn(`[Event] Failed to lookup box contents for ${normalizedBoxId}`, {
              error: lookupError.message,
              event_type
            });
            // Continue with original values (don't fail the event)
            // Use box_id as carton_id as fallback
            if (!normalizedCartonId) {
              normalizedCartonId = normalizedBoxId;
            }
          }
        }
      }

      // CRITICAL FIX: For TRANSFER_IN_RECEIVE events, ensure box_id and store are populated
      // This ensures tabwmsscanevent.box_id and store are NEVER NULL for Transfer In receiving
      if (event_type && event_type.toUpperCase() === 'TRANSFER_IN_RECEIVE') {
        // Set box_id = carton_id if carton_id is provided but box_id is missing
        if (normalizedCartonId && !normalizedBoxId) {
          normalizedBoxId = normalizedCartonId;
          logger.info(`[Event] TRANSFER_IN_RECEIVE: Set box_id = carton_id: ${normalizedBoxId}`);
        }
        
        // Get store from transfer_in document if missing
        if (!normalizedStore && transfer_in) {
          try {
            const [transferInInfo] = await connection.execute(
              `SELECT to_warehouse, warehouse FROM tabTransferIn WHERE title = ? LIMIT 1`,
              [transfer_in]
            );
            
            if (transferInInfo.length > 0) {
              // Priority: to_warehouse > warehouse
              const warehouse = transferInInfo[0].to_warehouse || transferInInfo[0].warehouse;
              if (warehouse) {
                normalizedStore = warehouse;
                logger.info(`[Event] TRANSFER_IN_RECEIVE: Set store from transfer_in ${transfer_in}: ${normalizedStore}`);
              }
            }
          } catch (tiError) {
            logger.warn(`[Event] Failed to get store from transfer_in ${transfer_in}:`, tiError.message);
          }
        }
        
        // Fallback: If store is still missing, try to get from carton_id (if it's CTN-TI-* format)
        if (!normalizedStore && normalizedCartonId && normalizedCartonId.startsWith('CTN-TI-')) {
          try {
            // Extract transfer_in from carton_id (format: CTN-TI-{transfer_in}-{date}-...)
            const parts = normalizedCartonId.split('-');
            if (parts.length >= 3) {
              const extractedTransferIn = parts[2]; // CTN-TI-{transfer_in}-...
              const [transferInInfo] = await connection.execute(
                `SELECT to_warehouse, warehouse FROM tabTransferIn WHERE title = ? LIMIT 1`,
                [extractedTransferIn]
              );
              
              if (transferInInfo.length > 0) {
                const warehouse = transferInInfo[0].to_warehouse || transferInInfo[0].warehouse;
                if (warehouse) {
                  normalizedStore = warehouse;
                  logger.info(`[Event] TRANSFER_IN_RECEIVE: Set store from carton_id extracted transfer_in: ${normalizedStore}`);
                }
              }
            }
          } catch (extractError) {
            logger.warn(`[Event] Failed to extract store from carton_id:`, extractError.message);
          }
        }
      }

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
              carton_id, item_code, qty, store, normalizedBoxId, normalizedTcId, rack, bin, notes
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
              carton_id, item_code, qty, store, normalizedBoxId, normalizedTcId, rack, bin, notes
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
                item.carton_id, item.item_code, item.qty, store, normalizedBoxId, normalizedTcId, rack, bin, notes
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
          
          // CRITICAL: Prevent duplicate PUTAWAY_TO_RACK events for the same task
          // Check if a PUTAWAY_TO_RACK event was already processed for this tc_id/box_id/task
          // NOTE: For PUTAWAY events, use box_id (not tc_id) - Putaway is BOX-based
          const putawayId = normalizedBoxId || tc_id; // Use normalized box_id for putaway, tc_id for others
          if ((event_type === 'PUTAWAY_TO_RACK' || event_type === 'PUTAWAY_CONFIRM' || event_type === 'PUTAWAY_COMPLETE') && putawayId) {
            // Try to find putaway task from tc_id
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
                const putawayTaskTitle = tasks[0].title;
                
                // Check if stock transactions already exist for this task AND are complete
                // Only skip if transactions exist AND have carton_id (complete transactions)
                const [existingTransactions] = await connection.execute(
                  `SELECT id, carton_id, target_bin, bin_location 
                   FROM tabStockTransaction 
                   WHERE transaction_type = 'Putaway' AND reference_doc = ? 
                   LIMIT 1`,
                  [putawayTaskTitle]
                );
                
                // Only skip if transaction exists AND has carton_id (complete transaction)
                // If transaction exists but carton_id is NULL, allow event processing to complete it
                if (existingTransactions.length > 0) {
                  const existingTxn = existingTransactions[0];
                  const hasCartonId = existingTxn.carton_id && existingTxn.carton_id.trim() !== '';
                  const hasLocation = (existingTxn.target_bin && existingTxn.target_bin.trim() !== '') || 
                                     (existingTxn.bin_location && existingTxn.bin_location.trim() !== '');
                  
                  // Only skip if transaction is complete (has both carton_id and location)
                  if (hasCartonId && hasLocation) {
                    continue; // Skip this event - already processed completely
                  }
                  // If transaction exists but incomplete, allow event to complete it
                }
                
                // Also check if task is already completed
                const [taskStatus] = await connection.execute(
                  `SELECT status FROM tabPutawayTask WHERE title = ? LIMIT 1`,
                  [putawayTaskTitle]
                );
                
                if (taskStatus.length > 0 && taskStatus[0].status === 'Completed') {
                  continue; // Skip this event - already completed
                }
              }
            }
          }
          
          // CRITICAL: For TRANSFER_IN_RECEIVE events, ensure box_id and store are set before INSERT
          // Final check: If box_id is still NULL but carton_id exists, use carton_id
          if (!normalizedBoxId && normalizedCartonId) {
            normalizedBoxId = normalizedCartonId;
            logger.info(`[Event] Final check: Set box_id = carton_id before INSERT: ${normalizedBoxId}`);
          }
          
          // Final check: If store is still NULL for TRANSFER_IN_RECEIVE, try one more time to get from transfer_in
          if (!normalizedStore && event_type && event_type.toUpperCase() === 'TRANSFER_IN_RECEIVE' && transfer_in) {
            try {
              const [transferInInfo] = await connection.execute(
                `SELECT to_warehouse, warehouse FROM tabTransferIn WHERE title = ? LIMIT 1`,
                [transfer_in]
              );
              
              if (transferInInfo.length > 0) {
                const warehouse = transferInInfo[0].to_warehouse || transferInInfo[0].warehouse;
                if (warehouse) {
                  normalizedStore = warehouse;
                  logger.info(`[Event] Final check: Set store from transfer_in before INSERT: ${normalizedStore}`);
                }
              }
            } catch (finalError) {
              logger.warn(`[Event] Final check: Failed to get store from transfer_in:`, finalError.message);
            }
          }
          
          // Last resort: If store is still NULL, use default (but log warning)
          if (!normalizedStore) {
            normalizedStore = 'WH-MAIN';
            logger.warn(`[Event] Final check: Store still NULL after all attempts, using default: ${normalizedStore}`);
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
            normalizedCartonId, normalizedItemCode, qty, normalizedStore, normalizedBoxId, normalizedTcId, rack, bin, notes
          ]);

          if (insertResult.affectedRows > 0) {
            insertedCount++;
            console.log(`✅ Inserted event: ${event_type} (${offline_uuid.substring(0, 8)}...)`);
            // Log normalized values for PUTAWAY events to help debug
            if (isPutawayEvent) {
              logger.info(`[Event] Inserted PUTAWAY event with normalized values:`, {
                event_type,
                box_id: normalizedBoxId,
                tc_id: normalizedTcId,
                item_code: normalizedItemCode,
                carton_id: normalizedCartonId,
                store: normalizedStore,
                qty
              });
              
              // CRITICAL: If store or box_id is still NULL after insertion, try to update it
              // This handles cases where the box is created AFTER the event is inserted
              // Works for both ASN and Transfer In Putaway
              // Also handles PUTAWAY_TO_RACK events that may not have store/box_id initially
              if ((!normalizedStore || !normalizedBoxId) && (normalizedCartonId || normalizedBoxId || advance_shipping_notice || transfer_in)) {
                const searchIdForUpdate = normalizedBoxId || normalizedCartonId;
                
                // Try multiple lookup strategies
                let updateBoxInfo = [];
                
                try {
                  // Strategy 1: Exact match by box_id or carton_id
                  if (searchIdForUpdate) {
                    const cleanSearchId = searchIdForUpdate.split(':')[0].trim();
                    [updateBoxInfo] = await connection.execute(
                      `SELECT box_id, store FROM tabSortBox WHERE box_id = ? OR carton_id = ? LIMIT 1`,
                      [cleanSearchId, cleanSearchId]
                    );
                  }
                  
                  // Strategy 2: Lookup by ASN if available (for ASN Putaway)
                  if (updateBoxInfo.length === 0 && advance_shipping_notice) {
                    [updateBoxInfo] = await connection.execute(
                      `SELECT box_id, store FROM tabSortBox WHERE advance_shipping_notice = ? LIMIT 1`,
                      [advance_shipping_notice]
                    );
                    if (updateBoxInfo.length > 0) {
                      logger.info(`[Event] Found box by ASN for post-insert update: ${advance_shipping_notice} -> ${updateBoxInfo[0].box_id}`);
                    }
                  }
                  
                  // Strategy 2b: Lookup by Transfer In if available (for Transfer In Putaway)
                  if (updateBoxInfo.length === 0 && transfer_in) {
                    [updateBoxInfo] = await connection.execute(
                      `SELECT box_id, store FROM tabSortBox WHERE advance_shipping_notice = ? LIMIT 1`,
                      [transfer_in]
                    );
                    if (updateBoxInfo.length > 0) {
                      logger.info(`[Event] Found box by Transfer In for post-insert update: ${transfer_in} -> ${updateBoxInfo[0].box_id}`);
                    }
                  }
                  
                  // Strategy 3: Partial match for different formats
                  if (updateBoxInfo.length === 0 && searchIdForUpdate) {
                    const cleanSearchId = searchIdForUpdate.split(':')[0].trim();
                    
                    // Try CTN-TI-* format (Transfer In)
                    if (cleanSearchId.startsWith('CTN-TI-')) {
                      const parts = cleanSearchId.split('-');
                      if (parts.length >= 4) {
                        const basePattern = parts.slice(0, 4).join('-') + '%';
                        [updateBoxInfo] = await connection.execute(
                          `SELECT box_id, store FROM tabSortBox WHERE (box_id LIKE ? OR carton_id LIKE ?) LIMIT 1`,
                          [basePattern, basePattern]
                        );
                      }
                    }
                    
                    // Try BOX-* format (ASN)
                    if (updateBoxInfo.length === 0 && cleanSearchId.startsWith('BOX-')) {
                      const parts = cleanSearchId.split('-');
                      if (parts.length >= 2) {
                        const basePattern = parts.slice(0, 2).join('-') + '%';
                        [updateBoxInfo] = await connection.execute(
                          `SELECT box_id, store FROM tabSortBox WHERE (box_id LIKE ? OR carton_id LIKE ?) LIMIT 1`,
                          [basePattern, basePattern]
                        );
                      }
                    }
                  }
                  
                  if (updateBoxInfo.length > 0) {
                    const updateFields = [];
                    const updateParams = [];
                    
                    if (!normalizedStore && updateBoxInfo[0].store) {
                      updateFields.push('store = ?');
                      updateParams.push(updateBoxInfo[0].store);
                    }
                    
                    if (!normalizedBoxId && updateBoxInfo[0].box_id) {
                      updateFields.push('box_id = ?');
                      updateParams.push(updateBoxInfo[0].box_id);
                    }
                    
                    if (updateFields.length > 0) {
                      updateParams.push(offline_uuid);
                      await connection.execute(
                        `UPDATE tabWmsScanEvent SET ${updateFields.join(', ')} WHERE offline_uuid = ?`,
                        updateParams
                      );
                      logger.info(`[Event] ✅ Updated PUTAWAY event ${offline_uuid.substring(0, 8)}... with store/box_id from tabSortBox (${updateBoxInfo[0].box_id})`);
                    }
                  }
                } catch (updateError) {
                  logger.warn(`[Event] Failed to update event with store/box_id:`, updateError);
                }
              }
            }
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
          // CRITICAL: For PUTAWAY events, use box_id (not tc_id) - Putaway is BOX-based
          const putawayBoxId = normalizedBoxId || tc_id; // Use normalized box_id for putaway
          if (event_type && event_type.toUpperCase().includes('PUTAWAY') && event_type.toUpperCase() !== 'PUTAWAY_DISPATCH' && putawayBoxId && rack) {
            try {
              await processPutawayEvent(connection, {
                event_type,
                tc_id: putawayBoxId, // Pass box_id as tc_id for backward compatibility
                box_id: normalizedBoxId, // Also pass box_id explicitly
                rack,
                bin,
                location_id, // Pass location_id if available
                advance_shipping_notice,
                item_code: normalizedItemCode, // Use normalized item_code
                carton_id: normalizedCartonId, // Use normalized carton_id
                qty,
                user_id,
                store: normalizedStore // Use normalized store
              });
            } catch (putawayError) {
              console.warn(`Failed to process putaway event:`, putawayError.message);
              // Don't fail the event insertion if putaway processing fails
            }
          }

          // Process PUTAWAY completion events - update stock ledger
          // Handle PUTAWAY_TO_RACK, PUTAWAY_CONFIRM, and PUTAWAY_COMPLETE events
          if (event_type && (
            event_type.toUpperCase() === 'PUTAWAY_TO_RACK' || 
            event_type.toUpperCase() === 'PUTAWAY_CONFIRM' || 
            event_type.toUpperCase() === 'PUTAWAY_COMPLETE'
          )) {
            try {
              // CRITICAL: For Transfer In putaway, extract putaway task from inbound_session, box_id, or tc_id
              let putawayTaskForEvent = advance_shipping_notice;
              
              // Check if inbound_session contains putaway task (e.g., "SESSION-ASN365425479-DE TI-PUT-20260120-0001")
              if (inbound_session && (inbound_session.includes('TI-PUT-') || inbound_session.includes('PUT-'))) {
                const taskMatch = inbound_session.match(/(TI-PUT-\d+-\d+|PUT-\d+-\d+)/);
                if (taskMatch) {
                  putawayTaskForEvent = taskMatch[1];
                  logger.info(`[Event] Extracted putaway task from inbound_session: ${putawayTaskForEvent}`);
                }
              }
              
      // CRITICAL: For PUTAWAY events, normalizedTcId is null, so check normalizedBoxId instead
      // If box_id or tc_id is a putaway task title, use it
      // BUT: If it's a box_id (TI-PUT-*), we need to find the actual task title
      const putawayIdToCheck = normalizedBoxId || normalizedTcId || tc_id || box_id;
      if (!putawayTaskForEvent && putawayIdToCheck) {
        if (putawayIdToCheck.startsWith('PUT-')) {
          // This is a task title (PUT-YYYYMMDD-####)
          putawayTaskForEvent = putawayIdToCheck;
          logger.info(`[Event] Using putaway task title: ${putawayTaskForEvent}`);
        } else if (putawayIdToCheck.startsWith('TI-PUT-')) {
          // This is a box_id (TI-PUT-YYYYMMDD-####), need to find the task
          try {
            // Try to get putaway_task_title from tabSortBox
            const [sortBoxColumns] = await connection.execute(`
              SELECT COLUMN_NAME
              FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'tabSortBox'
                AND COLUMN_NAME = 'putaway_task_title'
            `);
            const hasPutawayTaskTitle = sortBoxColumns.length > 0;
            
            if (hasPutawayTaskTitle) {
              const [boxInfo] = await connection.execute(
                `SELECT putaway_task_title FROM tabSortBox WHERE box_id = ? LIMIT 1`,
                [putawayIdToCheck]
              );
              
              if (boxInfo.length > 0 && boxInfo[0].putaway_task_title) {
                putawayTaskForEvent = boxInfo[0].putaway_task_title;
                logger.info(`[Event] Found putaway task ${putawayTaskForEvent} from box ${putawayIdToCheck}`);
              }
            }
            
            // Fallback: Find task from putaway lines that have this box_id
            if (!putawayTaskForEvent) {
              const [boxIdColCheck] = await connection.execute(`
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'tabPutawayLine'
                  AND COLUMN_NAME = 'box_id'
              `);
              const hasBoxIdInLine = boxIdColCheck.length > 0;
              
              if (hasBoxIdInLine) {
                const [taskFromBox] = await connection.execute(
                  `SELECT DISTINCT parent_title FROM tabPutawayLine WHERE box_id = ? LIMIT 1`,
                  [putawayIdToCheck]
                );
                
                if (taskFromBox.length > 0) {
                  putawayTaskForEvent = taskFromBox[0].parent_title;
                  logger.info(`[Event] Found putaway task ${putawayTaskForEvent} from putaway lines with box_id ${putawayIdToCheck}`);
                }
              }
            }
          } catch (lookupError) {
            logger.warn(`[Event] Failed to find putaway task for box ${putawayIdToCheck}:`, lookupError.message);
          }
        }
      }
              
              await processPutawayCompletionEvent(connection, {
                event_type,
                putaway_task: putawayTaskForEvent, // Putaway task ID (from inbound_session, advance_shipping_notice, or tc_id)
                tc_id: normalizedTcId || normalizedBoxId || tc_id, // Keep tc_id for Transfer In, use box_id for ASN
                box_id: normalizedBoxId, // Pass box_id explicitly (for ASN putaway)
                rack,
                bin,
                location_id, // Add location_id if available in event
                item_code: normalizedItemCode, // Use normalized item_code
                qty,
                user_id,
                store: normalizedStore, // Use normalized store
                carton_id: normalizedCartonId // Add carton_id for Transfer In putaway
              });
            } catch (putawayError) {
              logger.error(`[Event] Failed to process putaway completion event:`, {
                error: putawayError.message,
                stack: putawayError.stack,
                event_type,
                putaway_task: putawayTaskForEvent,
                tc_id: normalizedTcId || normalizedBoxId || tc_id,
                box_id: normalizedBoxId,
                item_code: normalizedItemCode,
                carton_id: normalizedCartonId
              });
              // Don't fail the event insertion if putaway processing fails
              // But log the error so we can debug why stock isn't updating
            }
          }

          /**
           * Process TRANSFER_IN_RECEIVE events - update Transfer In item lines with carton_id and/or received_qty
           * Supports both multi-carton mode (tabTransferInCarton tables) and legacy single-carton mode
           * 
           * Multi-Carton Mode (if tabTransferInCarton exists):
           * 1. Ensure carton exists in tabTransferInCarton (create Draft if not exists)
           * 2. Upsert carton line in tabTransferInCartonLine: received_qty += qty (additive)
           * 3. Recalculate total received_qty from all carton lines
           * 
           * Legacy Mode (if tabTransferInCarton doesn't exist):
           * 1. Update received_qty in tabTransferInItem (additive)
           * 2. Update carton_id in tabTransferInItem (if provided)
           * 
           * IMPORTANT: event.qty is the DIFFERENCE (change amount), not the total
           * - Positive qty = increase (e.g., +2)
           * - Negative qty = decrease (e.g., -2)
           */
          async function processTransferInReceiveEvent(connection, data) {
            const { transfer_in, item_code, carton_id, qty, user_id } = data;
          
            // Validate required fields (carton_id is optional)
            if (!transfer_in || !item_code) {
              console.warn(`⚠️  processTransferInReceiveEvent: Missing required fields. transfer_in=${transfer_in}, item_code=${item_code}`);
              return; // Skip if required fields missing
            }
          
            try {
              // Check if Transfer In exists
              const [transferInRows] = await connection.execute(`
              SELECT title, status
              FROM tabTransferIn
              WHERE title = ?
            `, [transfer_in]);
            
              if (transferInRows.length === 0) {
                console.warn(`Transfer In ${transfer_in} not found`);
                return;
              }
            
              const transferIn = transferInRows[0];
            
              // Check if Transfer In item line exists
              const [itemRows] = await connection.execute(`
              SELECT id, item_code, qty, received_qty, carton_id
              FROM tabTransferInItem
              WHERE parent_title = ?
                AND item_code = ?
            `, [transfer_in, item_code]);
            
              if (itemRows.length === 0) {
                console.warn(`Transfer In item ${item_code} not found in Transfer In ${transfer_in}`);
                return;
              }
            
              const item = itemRows[0];
              const currentReceivedQty = parseFloat(item.received_qty) || 0;
              const expectedQty = parseFloat(item.qty) || 0;
            
              // Check if multi-carton tables exist
              const [cartonTableCheck] = await connection.execute(`
              SELECT TABLE_NAME
              FROM INFORMATION_SCHEMA.TABLES
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'tabTransferInCarton'
            `);
            
              const hasMultiCartonTables = cartonTableCheck.length > 0;
            
              // MULTI-CARTON MODE: Use carton tables
              if (hasMultiCartonTables && carton_id) {
                // Ensure carton exists (create Draft if not exists)
                // Use ON DUPLICATE KEY UPDATE to handle race conditions
                const cartonName = `TIC-${transfer_in}-${carton_id}-${Date.now()}`;
              
                // Check if carton is closed first (before creating/updating)
                const [existingCarton] = await connection.execute(`
                SELECT name, carton_id, status
                FROM tabTransferInCarton
                WHERE carton_id = ? AND transfer_in = ?
              `, [carton_id, transfer_in]);
                
                if (existingCarton.length > 0 && existingCarton[0].status === 'Closed') {
                  console.warn(`⚠️  Cannot update closed carton ${carton_id} for Transfer In ${transfer_in}`);
                  return;
                }
              
                // Insert or update carton (atomic operation, prevents duplicate key errors)
                await connection.execute(`
                INSERT INTO tabTransferInCarton (name, carton_id, transfer_in, status, created_by, created_at)
                VALUES (?, ?, ?, 'Draft', ?, NOW())
                ON DUPLICATE KEY UPDATE
                  transfer_in = VALUES(transfer_in),
                  updated_at = NOW()
              `, [cartonName, carton_id, transfer_in, user_id || 'SYSTEM']);
              
                if (existingCarton.length === 0) {
                  console.log(`✅ Created carton ${carton_id} for Transfer In ${transfer_in}`);
                }
              
                // Get current qty from carton line (if exists)
                const [cartonLineRows] = await connection.execute(`
                SELECT name, received_qty
                FROM tabTransferInCartonLine
                WHERE transfer_in = ? AND carton_id = ? AND item_code = ?
              `, [transfer_in, carton_id, item_code]);
              
                const qtyDifference = parseFloat(qty) || 0;
                const currentCartonQty = cartonLineRows.length > 0 ? parseFloat(cartonLineRows[0].received_qty) || 0 : 0;
                const newCartonQty = Math.max(0, currentCartonQty + qtyDifference); // Prevent negative
              
                // Upsert carton line with additive qty
                // Use ON DUPLICATE KEY UPDATE to handle race conditions (atomic upsert)
                const lineName = `TICL-${transfer_in}-${carton_id}-${item_code}-${Date.now()}`;
                await connection.execute(`
                INSERT INTO tabTransferInCartonLine (name, transfer_in, carton_id, item_code, received_qty, created_at)
                VALUES (?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                  received_qty = VALUES(received_qty),
                  updated_at = NOW()
              `, [lineName, transfer_in, carton_id, item_code, newCartonQty]);
              
                console.log(`✅ Updated carton line: ${item_code} in carton ${carton_id} for Transfer In ${transfer_in}: ${currentCartonQty} → ${newCartonQty} (${qtyDifference >= 0 ? '+' : ''}${qtyDifference})`);
              
                // Update tabTransferInItem.carton_id with the last carton used (for desktop grid display)
                // Check if carton_id column exists
                const [cartonIdColCheck] = await connection.execute(`
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'tabTransferInItem'
                  AND COLUMN_NAME = 'carton_id'
              `);
                const hasCartonIdColumn = cartonIdColCheck.length > 0;
              
                if (hasCartonIdColumn && carton_id) {
                  await connection.execute(`
                  UPDATE tabTransferInItem
                  SET carton_id = ?,
                      updated_at = NOW()
                  WHERE parent_title = ?
                    AND item_code = ?
                `, [carton_id, transfer_in, item_code]);
                  console.log(`✅ Updated tabTransferInItem.carton_id: ${item_code} = ${carton_id} (for desktop grid)`);
                }
              
                // Recalculate total received_qty from all cartons for this item
                // Helper function to recalculate received_qty from carton lines
                async function recalculateTransferInItemReceivedQty(connection, transfer_in, item_code) {
                  const [cartonLines] = await connection.execute(`
                  SELECT COALESCE(SUM(received_qty), 0) as total_received_qty
                  FROM tabTransferInCartonLine
                  WHERE transfer_in = ? AND item_code = ?
                `, [transfer_in, item_code]);
                  
                  const totalReceivedQty = parseFloat(cartonLines[0]?.total_received_qty || 0);
                  
                  await connection.execute(`
                  UPDATE tabTransferInItem
                  SET received_qty = ?,
                      updated_at = NOW()
                  WHERE parent_title = ?
                    AND item_code = ?
                `, [totalReceivedQty, transfer_in, item_code]);
                }
                
                await recalculateTransferInItemReceivedQty(connection, transfer_in, item_code);
              
                // Recalculate Transfer In header status
                try {
                  const { recalculateTransferInStatus } = await import('../transfer-in/transferInController.js');
                  await recalculateTransferInStatus(connection, transfer_in);
                } catch (recalcError) {
                  console.warn(`⚠️  Failed to recalculate Transfer In status:`, recalcError.message);
                }
              
                return; // Exit early - multi-carton mode handled
              }
            
              // LEGACY MODE: Update tabTransferInItem directly (single carton per item)
            
              // Check if carton_id column exists
              const [cartonIdColCheck] = await connection.execute(`
              SELECT COLUMN_NAME
              FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'tabTransferInItem'
                AND COLUMN_NAME = 'carton_id'
            `);
              const hasCartonIdColumn = cartonIdColCheck.length > 0;
            
              // Process quantity update (if qty is provided)
              // IMPORTANT: Backend expects event.qty to be the DIFFERENCE (change amount), not the total
              // If mobile app sends TOTAL instead of DIFFERENCE, this will cause double-counting
              // Example: Current = 2, Mobile sends qty = 2 (total), Backend does 2 + 2 = 4 (WRONG!)
              // Mobile app should send: qty = 0 (no change) or qty = difference (e.g., +1, -1)
              let newReceivedQty = currentReceivedQty;
              let qtyUpdated = false;
            
              if (qty !== undefined && qty !== null) {
                const qtyDifference = parseFloat(qty) || 0;
              
                // Log for debugging quantity issues
                console.log(`[Transfer In Event] Processing quantity update: current=${currentReceivedQty}, event.qty=${qtyDifference}, expected=${expectedQty}`);
              
                // Check if mobile app might be sending TOTAL instead of DIFFERENCE
                // If event.qty is very close to expectedQty and currentReceivedQty is 0, it might be total
                // If event.qty is very close to (expectedQty - currentReceivedQty), it might be total
                if (currentReceivedQty > 0 && Math.abs(qtyDifference - (expectedQty - currentReceivedQty)) < 0.01) {
                  console.warn(`⚠️  [Transfer In Event] WARNING: event.qty (${qtyDifference}) looks like TOTAL quantity, not DIFFERENCE!`);
                  console.warn(`   Current: ${currentReceivedQty}, Expected: ${expectedQty}, Remaining: ${expectedQty - currentReceivedQty}`);
                  console.warn(`   Mobile app should send DIFFERENCE (${qtyDifference - (expectedQty - currentReceivedQty)}), not TOTAL (${qtyDifference})`);
                }
              
                newReceivedQty = currentReceivedQty + qtyDifference;
              
                // Validate: received_qty should not be negative
                if (newReceivedQty < 0) {
                  console.warn(`⚠️  processTransferInReceiveEvent: Cannot decrease received_qty below 0. Current: ${currentReceivedQty}, Change: ${qtyDifference}`);
                  newReceivedQty = 0;
                }
              
                qtyUpdated = true;
              }
            
              // Check if status column exists
              const [statusColCheck] = await connection.execute(`
              SELECT COLUMN_NAME
              FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'tabTransferInItem'
                AND COLUMN_NAME = 'status'
            `);
              const hasStatusColumn = statusColCheck.length > 0;
            
              // Compute status if qty was updated
              // Status should remain "Picking" when receiving, not automatically change to "Received"
              // Status will only be set to "Received" via explicit API call
              let itemStatus = null;
              if (qtyUpdated && hasStatusColumn) {
                if (newReceivedQty > 0) {
                  itemStatus = 'Picking';
                } else {
                  itemStatus = 'Pending';
                }
              }
            
              // Build UPDATE statement dynamically
              const updateFields = [];
              const updateValues = [];
            
              // Update received_qty if qty was provided
              if (qtyUpdated) {
                updateFields.push('received_qty = ?');
                updateValues.push(newReceivedQty);
              }
            
              // Update status if computed
              if (itemStatus) {
                updateFields.push('status = ?');
                updateValues.push(itemStatus);
              }
            
              // Update carton_id if provided and column exists
              // IMPORTANT: Always update carton_id from event (per spec: "carton_id should be updated every time")
              // If multiple events have different carton_id values, the last event's carton_id will be used
              if (hasCartonIdColumn && carton_id) {
                updateFields.push('carton_id = ?'); // Always update from event
                updateValues.push(carton_id);
              }
            
              // Always update updated_at
              updateFields.push('updated_at = NOW()');
            
              // Execute update if there are fields to update
              if (updateFields.length > 1) { // More than just updated_at
                updateValues.push(transfer_in, item_code);
              
                await connection.execute(`
                UPDATE tabTransferInItem
                SET ${updateFields.join(', ')}
                WHERE parent_title = ?
                  AND item_code = ?
              `, updateValues);
              
                const updates = [];
                if (qtyUpdated) {
                  updates.push(`received_qty: ${currentReceivedQty} → ${newReceivedQty} (${qty >= 0 ? '+' : ''}${qty})`);
                }
                if (itemStatus) {
                  updates.push(`status: ${itemStatus}`);
                }
                if (hasCartonIdColumn && carton_id) {
                  updates.push(`carton_id: ${carton_id}`);
                }
              
                console.log(`✅ Updated Transfer In item: ${item_code} in ${transfer_in} - ${updates.join(', ')}`);
              
                // Recalculate Transfer In header status after updating item
                try {
                  const { recalculateTransferInStatus } = await import('../transfer-in/transferInController.js');
                  await recalculateTransferInStatus(connection, transfer_in);
                } catch (recalcError) {
                  console.warn(`⚠️  Failed to recalculate Transfer In status:`, recalcError.message);
                  // Don't fail the event processing if recalculation fails
                }
              } else if (hasCartonIdColumn && carton_id) {
                // Only carton_id update (already handled above, but this is a fallback)
                // Always update carton_id from event (per spec: "carton_id should be updated every time")
                await connection.execute(`
                UPDATE tabTransferInItem
                SET carton_id = ?,
                    updated_at = NOW()
                WHERE parent_title = ?
                  AND item_code = ?
              `, [carton_id, transfer_in, item_code]);
              
                console.log(`✅ Updated Transfer In item: ${item_code} in ${transfer_in} with carton_id=${carton_id}`);
              } else {
                console.warn(`⚠️  processTransferInReceiveEvent: No updates to perform. qty=${qty}, carton_id=${carton_id}, hasCartonIdColumn=${hasCartonIdColumn}`);
              }
            
            } catch (error) {
              console.error(`❌ Error processing TRANSFER_IN_RECEIVE event:`, error);
              // Don't throw - allow event insertion to continue
            }
          }

          // Process TRANSFER_IN_RECEIVE events - update Transfer In item lines with carton_id and/or received_qty
          // carton_id is optional - events can update quantities even without carton_id
          if (event_type && event_type.toUpperCase() === 'TRANSFER_IN_RECEIVE' && transfer_in && item_code) {
            try {
              await processTransferInReceiveEvent(connection, {
                transfer_in,
                item_code,
                carton_id, // Optional - can be null
                qty, // Quantity difference (can be positive or negative)
                user_id
              });
            } catch (transferInError) {
              console.warn(`Failed to process TRANSFER_IN_RECEIVE event:`, transferInError.message);
              // Don't fail the event insertion if transfer in processing fails
            }
          }

          // Process TRANSFER_IN_RECEIVE_ADJUST events - set absolute qty for item in carton
          if (event_type && event_type.toUpperCase() === 'TRANSFER_IN_RECEIVE_ADJUST' && transfer_in && item_code && carton_id) {
            try {
              await processTransferInReceiveAdjustEvent(connection, {
                transfer_in,
                item_code,
                carton_id,
                set_qty: qty, // Absolute qty to set (not difference)
                user_id
              });
            } catch (adjustError) {
              console.warn(`Failed to process TRANSFER_IN_RECEIVE_ADJUST event:`, adjustError.message);
              // Don't fail the event insertion if adjust processing fails
            }
          }

          // Process TRANSFER_IN_CARTON_CLOSE events - close carton
          if (event_type && event_type.toUpperCase() === 'TRANSFER_IN_CARTON_CLOSE' && transfer_in && carton_id) {
            try {
              await processTransferInCartonCloseEvent(connection, {
                transfer_in,
                carton_id,
                user_id
              });
            } catch (closeError) {
              console.warn(`Failed to process TRANSFER_IN_CARTON_CLOSE event:`, closeError.message);
              // Don't fail the event insertion if close processing fails
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
  // CRITICAL: Support both box_id (for putaway) and tc_id (for backward compatibility)
  const { tc_id, box_id, rack, bin, location_id, advance_shipping_notice, item_code, carton_id, qty, user_id, store } = event;
  
  // For PUTAWAY events, use box_id (putaway is BOX-based)
  // For backward compatibility, also support tc_id
  const putawayId = box_id || tc_id;
  
  // Location can come from location_id (parsed to rack/bin) or directly from rack/bin
  const hasLocation = (location_id && location_id.trim() !== '') || (rack && rack.trim() !== '');

  if (!putawayId || !hasLocation) {
    return; // Skip if required fields missing
  }

  // CRITICAL: For PUTAWAY (box-based), find ASN from tabsortbox or putaway lines
  // For backward compatibility, also try tabTransferCarton
  let asnNo = advance_shipping_notice || null;
  let inboundSession = null;
  
  // Priority 1: Try to get ASN from tabsortbox (for box-based putaway)
  if (box_id) {
    const [sortBox] = await connection.execute(
      `SELECT advance_shipping_notice FROM tabsortbox WHERE box_id = ? LIMIT 1`,
      [box_id]
    );
    
    if (sortBox.length > 0 && sortBox[0].advance_shipping_notice) {
      asnNo = sortBox[0].advance_shipping_notice;
      logger.info(`[Putaway Event] Found ASN ${asnNo} from tabsortbox for box ${box_id}`);
    } else {
      // Try to get ASN from putaway lines
      const [putawayLine] = await connection.execute(
        `SELECT DISTINCT pt.advance_shipping_notice 
         FROM tabPutawayLine pl
         JOIN tabPutawayTask pt ON pt.title = pl.parent_title
         WHERE pl.carton_id = ?
         LIMIT 1`,
        [box_id]
      );
      
      if (putawayLine.length > 0 && putawayLine[0].advance_shipping_notice) {
        asnNo = putawayLine[0].advance_shipping_notice;
        logger.info(`[Putaway Event] Found ASN ${asnNo} from putaway lines for box ${box_id}`);
      }
    }
  }
  
  // Priority 2: Fallback to tabTransferCarton (for backward compatibility)
  if (!asnNo && tc_id) {
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

    if (tcRows.length > 0 && tcRows[0].asn_no) {
      asnNo = tcRows[0].asn_no;
      logger.info(`[Putaway Event] Found ASN ${asnNo} from tabTransferCarton for tc_id ${tc_id}`);
    }
  }
  
  if (!asnNo) {
    logger.warn(`[Putaway Event] No ASN found for putaway ID ${putawayId}`);
    return; // No ASN available
  }

  // Get inbound session (optional - don't fail if not found)
  const [sessionRows] = await connection.execute(
    `SELECT inbound_session FROM tabInboundSession WHERE asn_no = ? ORDER BY started_at DESC LIMIT 1`,
    [asnNo]
  );
  inboundSession = sessionRows.length > 0 ? sessionRows[0].inbound_session : null;
  // Note: inbound_session is optional - continue even if not found

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

  // CRITICAL: Use box_id as carton_id for putaway (putaway is BOX-based)
  const cartonIdForLine = box_id || carton_id || putawayId;
  
  // CRITICAL: Parse location_id to get rack/bin if needed (do this once for all lines)
  let effectiveRack = rack || null;
  let effectiveBin = bin || null;
  let effectiveLocationId = location_id || null;
  
  if (location_id && !effectiveRack && !effectiveBin) {
    // Try to parse location_id to get rack/bin
    // Format might be: A1-R02-L1-B2 or similar
    const parts = location_id.split('-');
    if (parts.length >= 2) {
      // Try to extract rack and bin from location_id
      // This is a simple parser - adjust based on your location_id format
      effectiveRack = parts.slice(0, -1).join('-'); // Everything except last part
      effectiveBin = parts[parts.length - 1]; // Last part
    }
  }
  
  // CRITICAL: If location is provided, update ALL lines for this box/carton with the location
  // This ensures all items in the box get the same location when PUTAWAY_TO_RACK event is received
  if (hasLocation && putawayTaskTitle && cartonIdForLine) {
    // Check which columns exist
    const [lineCols] = await connection.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayLine' 
      AND COLUMN_NAME IN ('rack', 'bin', 'location_id')
    `);
    const hasRack = lineCols.some(col => col.COLUMN_NAME === 'rack');
    const hasBin = lineCols.some(col => col.COLUMN_NAME === 'bin');
    const hasLocationId = lineCols.some(col => col.COLUMN_NAME === 'location_id');
    
    // Find ALL lines for this box/carton (regardless of item_code or location)
    const [allLinesForBox] = await connection.execute(
      `SELECT id, item_code, rack, bin, location_id FROM tabPutawayLine 
       WHERE parent_title = ? 
         AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))`,
      [putawayTaskTitle, cartonIdForLine, cartonIdForLine]
    );
    
    // Update ALL lines that don't have the correct location
    let updatedCount = 0;
    for (const line of allLinesForBox) {
      const lineRack = (line.rack || '').trim();
      const lineBin = (line.bin || '').trim();
      const lineLocationId = (line.location_id || '').trim();
      const rackValue = (effectiveRack || '').trim();
      const binValue = (effectiveBin || '').trim();
      const locationIdValue = (effectiveLocationId || '').trim();
      
      // Check if line needs location update
      const needsLocationUpdate = 
        (effectiveRack && lineRack !== rackValue) ||
        (effectiveBin && lineBin !== binValue) ||
        (effectiveLocationId && lineLocationId !== locationIdValue) ||
        (!lineRack && !lineBin && !lineLocationId); // Line has no location at all
      
      if (needsLocationUpdate) {
        let updateFields = ['updated_at = CURRENT_TIMESTAMP'];
        const updateParams = [];
        
        if (hasRack && effectiveRack) {
          updateFields.push('rack = ?');
          updateParams.push(effectiveRack);
        }
        if (hasBin && effectiveBin) {
          updateFields.push('bin = ?');
          updateParams.push(effectiveBin);
        }
        if (hasLocationId && effectiveLocationId) {
          updateFields.push('location_id = ?');
          updateParams.push(effectiveLocationId);
        }
        
        updateParams.push(line.id);
        
        await connection.execute(
          `UPDATE tabPutawayLine 
           SET ${updateFields.join(', ')} 
           WHERE id = ?`,
          updateParams
        );
        updatedCount++;
        logger.info(`[Putaway Event] Updated line ID ${line.id} (item: ${line.item_code}) with location: rack=${effectiveRack || 'NULL'}, bin=${effectiveBin || 'NULL'}, location_id=${effectiveLocationId || 'NULL'}`);
      }
    }
    
    if (updatedCount > 0) {
      logger.info(`[Putaway Event] Updated ${updatedCount} putaway line(s) for box ${cartonIdForLine} with location from PUTAWAY_TO_RACK event`);
    }
  }
  
  // If item_code is provided, also update/create specific putaway line (for backward compatibility)
  if (item_code && qty) {
    // CRITICAL: First, find existing lines for this item/carton (regardless of location)
    // This allows updating lines that have NULL/TBD locations with the new location from event
    const [existingLinesAnyLocation] = await connection.execute(
      `SELECT id, qty, rack, bin, location_id FROM tabPutawayLine 
       WHERE parent_title = ? 
         AND item_code = ? 
         AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))`,
      [putawayTaskTitle, item_code, cartonIdForLine, cartonIdForLine]
    );
    
    // Note: effectiveRack, effectiveBin, effectiveLocationId are already set above (for all lines)
    
    // Check if line exists with same location
    const rackValue = effectiveRack || '';
    const binValue = effectiveBin || '';
    const existingLineWithLocation = existingLinesAnyLocation.find(line => {
      const lineRack = (line.rack || '').trim();
      const lineBin = (line.bin || '').trim();
      return (lineRack === rackValue || (lineRack === '' && rackValue === '')) &&
             (lineBin === binValue || (lineBin === '' && binValue === ''));
    });

    if (existingLineWithLocation) {
      // Line exists with same location - CRITICAL: Only update location fields, NOT quantity
      // Quantity should come from putaway line (set by closeBox from SORT_TO_BOX events), not from PUTAWAY_TO_RACK event
      // The event qty might be partial (scanning one item at a time) and would overwrite the correct total quantity
      const needsUpdate = 
                         (effectiveRack && existingLineWithLocation.rack !== effectiveRack) ||
                         (effectiveBin && existingLineWithLocation.bin !== effectiveBin) ||
                         (effectiveLocationId && existingLineWithLocation.location_id !== effectiveLocationId);
      
      if (needsUpdate) {
        // Check which columns exist
        const [lineCols] = await connection.execute(`
          SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabPutawayLine' 
          AND COLUMN_NAME IN ('rack', 'bin', 'location_id')
        `);
        const hasRack = lineCols.some(col => col.COLUMN_NAME === 'rack');
        const hasBin = lineCols.some(col => col.COLUMN_NAME === 'bin');
        const hasLocationId = lineCols.some(col => col.COLUMN_NAME === 'location_id');
        
        // CRITICAL: Do NOT update quantity - only update location fields
        let updateFields = ['updated_at = CURRENT_TIMESTAMP'];
        const updateParams = [];
        
        if (hasRack && effectiveRack) {
          updateFields.push('rack = ?');
          updateParams.push(effectiveRack);
        }
        if (hasBin && effectiveBin) {
          updateFields.push('bin = ?');
          updateParams.push(effectiveBin);
        }
        if (hasLocationId && effectiveLocationId) {
          updateFields.push('location_id = ?');
          updateParams.push(effectiveLocationId);
        }
        
        updateParams.push(existingLineWithLocation.id);
        
        await connection.execute(
          `UPDATE tabPutawayLine 
           SET ${updateFields.join(', ')} 
           WHERE id = ?`,
          updateParams
        );
        logger.info(`[Putaway Event] Updated existing line ID ${existingLineWithLocation.id} with location: rack=${effectiveRack || 'NULL'}, bin=${effectiveBin || 'NULL'}, location_id=${effectiveLocationId || 'NULL'} (quantity preserved: ${existingLineWithLocation.qty})`);
      }
    } else if (existingLinesAnyLocation.length > 0) {
      // Line exists but with different location - CRITICAL: Only update location fields, NOT quantity
      // Quantity should come from putaway line (set by closeBox from SORT_TO_BOX events), not from PUTAWAY_TO_RACK event
      const existingLine = existingLinesAnyLocation[0];
      
      // Check which columns exist
      const [lineCols] = await connection.execute(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabPutawayLine' 
        AND COLUMN_NAME IN ('rack', 'bin', 'location_id')
      `);
      const hasRack = lineCols.some(col => col.COLUMN_NAME === 'rack');
      const hasBin = lineCols.some(col => col.COLUMN_NAME === 'bin');
      const hasLocationId = lineCols.some(col => col.COLUMN_NAME === 'location_id');
      
      // CRITICAL: Do NOT update quantity - only update location fields
      let updateFields = ['updated_at = CURRENT_TIMESTAMP'];
      const updateParams = [];
      
      if (hasRack && effectiveRack) {
        updateFields.push('rack = ?');
        updateParams.push(effectiveRack);
      }
      if (hasBin && effectiveBin) {
        updateFields.push('bin = ?');
        updateParams.push(effectiveBin);
      }
      if (hasLocationId && effectiveLocationId) {
        updateFields.push('location_id = ?');
        updateParams.push(effectiveLocationId);
      }
      
      updateParams.push(existingLine.id);
      
      await connection.execute(
        `UPDATE tabPutawayLine 
         SET ${updateFields.join(', ')} 
         WHERE id = ?`,
        updateParams
      );
      logger.info(`[Putaway Event] Updated existing line ID ${existingLine.id} with new location: rack=${effectiveRack || 'NULL'}, bin=${effectiveBin || 'NULL'}, location_id=${effectiveLocationId || 'NULL'} (quantity preserved: ${existingLine.qty})`);
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
        [putawayTaskTitle, item_code, cartonIdForLine, cartonIdForLine, rackValue, rackValue, rackValue, binValue, binValue, binValue]
      );
      
      if (existingDifferentLocation.length > 0) {
        console.warn(`[Putaway Event] WARNING: Carton ${cartonIdForLine || 'NULL'} with item ${item_code} already put away to different location: ${existingDifferentLocation[0].rack}/${existingDifferentLocation[0].bin || ''}. Creating new line for ${rack}/${bin || ''}`);
      }
      
      // Insert new line
      // CRITICAL: Get quantity from SORT_TO_BOX events, not from PUTAWAY_TO_RACK event
      // The event qty might be partial (scanning one item at a time) and would create incorrect quantity
      let correctQty = qty; // Fallback to event qty if SORT_TO_BOX events not found
      if (box_id || cartonIdForLine) {
        try {
          const [qtyFromEvents] = await connection.execute(
            `SELECT SUM(qty) as total_qty 
             FROM tabWmsScanEvent 
             WHERE event_type = 'SORT_TO_BOX' 
               AND item_code = ? 
               AND (box_id = ? OR carton_id = ?)
               AND qty > 0`,
            [item_code, box_id || cartonIdForLine, box_id || cartonIdForLine]
          );
          if (qtyFromEvents.length > 0 && qtyFromEvents[0].total_qty) {
            correctQty = parseFloat(qtyFromEvents[0].total_qty) || qty;
            logger.info(`[Putaway Event] Using quantity from SORT_TO_BOX events: ${correctQty} (event had: ${qty})`);
          }
        } catch (qtyError) {
          logger.warn(`[Putaway Event] Could not get quantity from SORT_TO_BOX events, using event qty: ${qtyError.message}`);
        }
      }
      
      // Check which columns exist
      const [lineCols] = await connection.execute(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabPutawayLine' 
        AND COLUMN_NAME IN ('rack', 'bin', 'location_id')
      `);
      const hasRack = lineCols.some(col => col.COLUMN_NAME === 'rack');
      const hasBin = lineCols.some(col => col.COLUMN_NAME === 'bin');
      const hasLocationId = lineCols.some(col => col.COLUMN_NAME === 'location_id');
      
      const binValue = effectiveBin || '';
      const rackValue = effectiveRack || '';
      
      let insertFields = ['parent_title', 'carton_id', 'item_code', 'qty'];
      let insertValues = [putawayTaskTitle, cartonIdForLine || null, item_code, correctQty];
      let placeholders = ['?', '?', '?', '?'];
      
      if (hasRack) {
        insertFields.push('rack');
        insertValues.push(rackValue);
        placeholders.push('?');
      }
      if (hasBin) {
        insertFields.push('bin');
        insertValues.push(binValue);
        placeholders.push('?');
      }
      if (hasLocationId && effectiveLocationId) {
        insertFields.push('location_id');
        insertValues.push(effectiveLocationId);
        placeholders.push('?');
      }
      
      insertFields.push('created_at', 'updated_at');
      insertValues.push('NOW()', 'NOW()');
      placeholders.push('NOW()', 'NOW()');
      
      await connection.execute(
        `INSERT INTO tabPutawayLine (${insertFields.join(', ')}) VALUES (${placeholders.join(', ')})`,
        insertValues
      );
      logger.info(`[Putaway Event] Created putaway line: ${item_code} (qty: ${correctQty}, carton_id: ${cartonIdForLine}, location: rack=${rackValue || 'NULL'}, bin=${binValue || 'NULL'}, location_id=${effectiveLocationId || 'NULL'})`);
    }
  } else if (putawayId) {
    // If no item_code but box_id/tc_id provided, get all items from box/carton and update them
    // CRITICAL: For PUTAWAY, use box_id from SORT_TO_BOX events (putaway is BOX-based)
    // For backward compatibility, also support tc_id from PACK_BOX_TO_TC events
    let itemEvents = [];
    
    if (box_id) {
      // Get items from SORT_TO_BOX events (for putaway boxes)
      const [boxItemEvents] = await connection.execute(
        `SELECT item_code, box_id, carton_id, SUM(qty) as total_qty 
         FROM tabWmsScanEvent 
         WHERE box_id = ? 
           AND event_type = 'SORT_TO_BOX' 
           AND item_code IS NOT NULL 
         GROUP BY item_code, box_id, carton_id`,
        [box_id]
      );
      itemEvents = boxItemEvents;
    } else if (tc_id) {
      // Fallback: Get items from PACK_BOX_TO_TC events (for transfer cartons)
      const [tcItemEvents] = await connection.execute(
        `SELECT item_code, box_id, carton_id, SUM(qty) as total_qty 
         FROM tabWmsScanEvent 
         WHERE tc_id = ? 
           AND event_type = 'PACK_BOX_TO_TC' 
           AND item_code IS NOT NULL 
         GROUP BY item_code, box_id, carton_id`,
        [tc_id]
      );
      itemEvents = tcItemEvents;
    }

    for (const item of itemEvents) {
      const itemCode = item.item_code;
      // CRITICAL: For PUTAWAY, use box_id as carton_id (putaway is BOX-based)
      // For backward compatibility, also support carton_id from events
      const boxId = box_id || item.box_id || item.carton_id || putawayId;
      const itemQty = parseFloat(item.total_qty) || 0;

      // CRITICAL: Find existing lines for this item/carton (regardless of location)
      const [existingLinesAnyLocation] = await connection.execute(
        `SELECT id, qty, rack, bin, location_id FROM tabPutawayLine 
         WHERE parent_title = ? 
           AND item_code = ? 
           AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))`,
        [putawayTaskTitle, itemCode, boxId, boxId]
      );
      
      // Check if line exists with same location
      const rackValue = effectiveRack || '';
      const binValue = effectiveBin || '';
      const existingLineWithLocation = existingLinesAnyLocation.find(line => {
        const lineRack = (line.rack || '').trim();
        const lineBin = (line.bin || '').trim();
        return (lineRack === rackValue || (lineRack === '' && rackValue === '')) &&
               (lineBin === binValue || (lineBin === '' && binValue === ''));
      });
      
      if (existingLineWithLocation) {
        // Line exists with same location - update quantity and location if needed
        const existingQty = parseFloat(existingLineWithLocation.qty) || 0;
        const needsUpdate = Math.abs(existingQty - itemQty) > 0.01 ||
                           (effectiveRack && existingLineWithLocation.rack !== effectiveRack) ||
                           (effectiveBin && existingLineWithLocation.bin !== effectiveBin) ||
                           (effectiveLocationId && existingLineWithLocation.location_id !== effectiveLocationId);
        
        if (needsUpdate) {
          // Check which columns exist
          const [lineCols] = await connection.execute(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabPutawayLine' 
            AND COLUMN_NAME IN ('rack', 'bin', 'location_id')
          `);
          const hasRack = lineCols.some(col => col.COLUMN_NAME === 'rack');
          const hasBin = lineCols.some(col => col.COLUMN_NAME === 'bin');
          const hasLocationId = lineCols.some(col => col.COLUMN_NAME === 'location_id');
          
          let updateFields = ['qty = ?', 'updated_at = CURRENT_TIMESTAMP'];
          const updateParams = [itemQty];
          
          if (hasRack && effectiveRack) {
            updateFields.push('rack = ?');
            updateParams.push(effectiveRack);
          }
          if (hasBin && effectiveBin) {
            updateFields.push('bin = ?');
            updateParams.push(effectiveBin);
          }
          if (hasLocationId && effectiveLocationId) {
            updateFields.push('location_id = ?');
            updateParams.push(effectiveLocationId);
          }
          
          updateParams.push(existingLineWithLocation.id);
          
          await connection.execute(
            `UPDATE tabPutawayLine 
             SET ${updateFields.join(', ')} 
             WHERE id = ?`,
            updateParams
          );
          logger.info(`[Putaway Event] Updated existing line ID ${existingLineWithLocation.id} with location: rack=${effectiveRack || 'NULL'}, bin=${effectiveBin || 'NULL'}, location_id=${effectiveLocationId || 'NULL'}`);
        }
      } else if (existingLinesAnyLocation.length > 0) {
        // Line exists but with different/NULL location - update it with new location
        const existingLine = existingLinesAnyLocation[0];
        
        // Check which columns exist
        const [lineCols] = await connection.execute(`
          SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabPutawayLine' 
          AND COLUMN_NAME IN ('rack', 'bin', 'location_id')
        `);
        const hasRack = lineCols.some(col => col.COLUMN_NAME === 'rack');
        const hasBin = lineCols.some(col => col.COLUMN_NAME === 'bin');
        const hasLocationId = lineCols.some(col => col.COLUMN_NAME === 'location_id');
        
        let updateFields = ['qty = ?', 'updated_at = CURRENT_TIMESTAMP'];
        const updateParams = [itemQty];
        
        if (hasRack && effectiveRack) {
          updateFields.push('rack = ?');
          updateParams.push(effectiveRack);
        }
        if (hasBin && effectiveBin) {
          updateFields.push('bin = ?');
          updateParams.push(effectiveBin);
        }
        if (hasLocationId && effectiveLocationId) {
          updateFields.push('location_id = ?');
          updateParams.push(effectiveLocationId);
        }
        
        updateParams.push(existingLine.id);
        
        await connection.execute(
          `UPDATE tabPutawayLine 
           SET ${updateFields.join(', ')} 
           WHERE id = ?`,
          updateParams
        );
        logger.info(`[Putaway Event] Updated existing line ID ${existingLine.id} with new location: rack=${effectiveRack || 'NULL'}, bin=${effectiveBin || 'NULL'}, location_id=${effectiveLocationId || 'NULL'}`);
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
        
        // CRITICAL: Store box_id in carton_id field (putaway is BOX-based)
        // Check which columns exist
        const [lineCols] = await connection.execute(`
          SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabPutawayLine' 
          AND COLUMN_NAME IN ('rack', 'bin', 'location_id')
        `);
        const hasRack = lineCols.some(col => col.COLUMN_NAME === 'rack');
        const hasBin = lineCols.some(col => col.COLUMN_NAME === 'bin');
        const hasLocationId = lineCols.some(col => col.COLUMN_NAME === 'location_id');
        
        const binValue = effectiveBin || '';
        const rackValue = effectiveRack || '';
        
        let insertFields = ['parent_title', 'carton_id', 'item_code', 'qty'];
        let insertValues = [putawayTaskTitle, boxId, itemCode, itemQty];
        let placeholders = ['?', '?', '?', '?'];
        
        if (hasRack) {
          insertFields.push('rack');
          insertValues.push(rackValue);
          placeholders.push('?');
        }
        if (hasBin) {
          insertFields.push('bin');
          insertValues.push(binValue);
          placeholders.push('?');
        }
        if (hasLocationId && effectiveLocationId) {
          insertFields.push('location_id');
          insertValues.push(effectiveLocationId);
          placeholders.push('?');
        }
        
        insertFields.push('created_at', 'updated_at');
        insertValues.push('NOW()', 'NOW()');
        placeholders.push('NOW()', 'NOW()');
        
        await connection.execute(
          `INSERT INTO tabPutawayLine (${insertFields.join(', ')}) VALUES (${placeholders.join(', ')})`,
          insertValues
        );
        logger.info(`[Putaway Event] Created putaway line: ${itemCode} (qty: ${itemQty}, carton_id: ${boxId}, location: rack=${rackValue || 'NULL'}, bin=${binValue || 'NULL'}, location_id=${effectiveLocationId || 'NULL'})`);
      }
    }
  }

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

}

/**
 * Process PUTAWAY completion events and update stock ledger
 * Called when PUTAWAY_TO_RACK, PUTAWAY_CONFIRM, or PUTAWAY_COMPLETE events are received
 * Uses MOVE pattern: decrease from staging, increase at target
 * 
 * @param {Connection} connection - Database connection (must be in transaction if called from scan endpoint)
 * @param {Object} event - Event object with putaway_task, location_id, etc.
 */
export async function processPutawayCompletionEvent(connection, event) {
  const logPrefix = '[Putaway Completion]';
  let putawayTaskTitle = null; // Declare outside try block for catch block access
  
  try {
    logger.info(`${logPrefix} ========================================`);
    logger.info(`${logPrefix} 🔵 ENTRY: processPutawayCompletionEvent called`);
    
    // Validate connection
    if (!connection) {
      logger.error(`${logPrefix} ❌ CRITICAL: connection is NULL or undefined!`);
      throw new Error('Database connection is required');
    }
    
    logger.info(`${logPrefix} Connection validation:`, {
      hasConnection: !!connection,
      connectionType: typeof connection,
      hasExecute: typeof connection.execute === 'function'
    });
    
    // Validate event
    if (!event) {
      logger.error(`${logPrefix} ❌ CRITICAL: event is NULL or undefined!`);
      throw new Error('Event object is required');
    }
    
    logger.info(`${logPrefix} Event object:`, JSON.stringify({
      putaway_task: event.putaway_task || 'NULL',
      tc_id: event.tc_id || 'NULL',
      box_id: event.box_id || 'NULL',
      carton_id: event.carton_id || 'NULL',
      location_id: event.location_id || 'NULL',
      rack: event.rack || 'NULL',
      bin: event.bin || 'NULL',
      item_code: event.item_code || 'NULL',
      qty: event.qty || 'NULL',
      user_id: event.user_id || 'NULL',
      store: event.store || 'NULL',
      event_type: event.event_type || 'NULL'
    }, null, 2));
    logger.info(`${logPrefix} ========================================`);
    
    logger.info(`${logPrefix} 🔍 DEBUG: About to extract event parameters...`);
    const { putaway_task, tc_id, box_id, rack, bin, location_id, item_code, qty, user_id, store, carton_id } = event;
    logger.info(`${logPrefix} 🔍 DEBUG: Event parameters extracted successfully`);

    logger.info(`${logPrefix} Step 0: Extracted event parameters:`, {
    putaway_task: putaway_task || 'NULL',
    tc_id: tc_id || 'NULL',
    box_id: box_id || 'NULL',
    carton_id: carton_id || 'NULL',
    location_id: location_id || 'NULL',
    item_code: item_code || 'NULL',
    qty: qty || 'NULL'
  });

    // If putaway_task is provided, use it; otherwise try to find from box_id or tc_id
    putawayTaskTitle = putaway_task;
    
    logger.info(`${logPrefix} Step 0a: Initial putawayTaskTitle: ${putawayTaskTitle || 'NULL'}`);
    
    // CRITICAL: For PUTAWAY events, use box_id (putaway is BOX-based)
    const putawayId = box_id || tc_id;
    
    // CRITICAL FIX: If putawayId is a box_id (TI-PUT-*), find the actual task title
    if (!putawayTaskTitle && putawayId && putawayId.startsWith('TI-PUT-')) {
    // This is a box_id, not a task title - need to find the task
    try {
      // Try to get putaway_task_title from tabSortBox
      const [sortBoxColumns] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabSortBox'
          AND COLUMN_NAME = 'putaway_task_title'
      `);
      const hasPutawayTaskTitle = sortBoxColumns.length > 0;
      
      if (hasPutawayTaskTitle) {
        const [boxInfo] = await connection.execute(
          `SELECT putaway_task_title FROM tabSortBox WHERE box_id = ? LIMIT 1`,
          [putawayId]
        );
        
        if (boxInfo.length > 0 && boxInfo[0].putaway_task_title) {
          putawayTaskTitle = boxInfo[0].putaway_task_title;
          logger.info(`[Putaway Completion] Found putaway task ${putawayTaskTitle} from box ${putawayId}`);
        }
      }
      
      // Fallback: Find task from putaway lines that have this box_id
      if (!putawayTaskTitle) {
        const [boxIdColCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabPutawayLine'
            AND COLUMN_NAME = 'box_id'
        `);
        const hasBoxIdInLine = boxIdColCheck.length > 0;
        
        if (hasBoxIdInLine) {
          const [taskFromBox] = await connection.execute(
            `SELECT DISTINCT parent_title FROM tabPutawayLine WHERE box_id = ? LIMIT 1`,
            [putawayId]
          );
          
          if (taskFromBox.length > 0) {
            putawayTaskTitle = taskFromBox[0].parent_title;
            logger.info(`[Putaway Completion] Found putaway task ${putawayTaskTitle} from putaway lines with box_id ${putawayId}`);
          }
        }
      }
    } catch (lookupError) {
      logger.warn(`[Putaway Completion] Failed to find putaway task for box ${putawayId}:`, lookupError.message);
    }
    }
    
    // Check if qty_before and qty_reduced columns exist in tabStockLedger
    const [stockLedgerColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockLedger' 
      AND COLUMN_NAME IN ('qty_before', 'qty_reduced')
    `);
    const hasQtyBefore = stockLedgerColumns.some(col => col.COLUMN_NAME === 'qty_before');
    const hasQtyReduced = stockLedgerColumns.some(col => col.COLUMN_NAME === 'qty_reduced');
    
    if (!putawayTaskTitle && putawayId) {
      // CRITICAL: Check if tc_id or box_id is a putaway task title (PUT- or TI-PUT-)
      // For Transfer In putaway, mobile app sends putaway task title as tc_id or box_id
      const isTcIdTaskTitle = tc_id && (tc_id.startsWith('PUT-') || tc_id.startsWith('TI-PUT-'));
      const isBoxIdTaskTitle = box_id && (box_id.startsWith('PUT-') || box_id.startsWith('TI-PUT-'));
      
      if (isTcIdTaskTitle) {
      // tc_id is the putaway task title - verify it exists
      const [taskCheck] = await connection.execute(
        `SELECT title FROM tabPutawayTask WHERE title = ? LIMIT 1`,
        [tc_id]
      );
      if (taskCheck.length > 0) {
        putawayTaskTitle = tc_id;
        logger.info(`[Putaway Completion] Using tc_id as putaway task title: ${tc_id}`);
      }
    } else if (isBoxIdTaskTitle) {
      // box_id is the putaway task title - verify it exists
      const [taskCheck] = await connection.execute(
        `SELECT title FROM tabPutawayTask WHERE title = ? LIMIT 1`,
        [box_id]
      );
      if (taskCheck.length > 0) {
        putawayTaskTitle = box_id;
        logger.info(`[Putaway Completion] Using box_id as putaway task title: ${box_id}`);
      }
      }
      
      if (!putawayTaskTitle) {
        // Priority 1: Try to find putaway task from putaway lines (using carton_id)
      // Check if box_id column exists in tabPutawayLine
      const [lineColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabPutawayLine' 
        AND COLUMN_NAME = 'box_id'
      `);
      const hasBoxIdColumn = lineColumns.length > 0;
      
      let taskFromLinesQuery = `SELECT DISTINCT parent_title 
         FROM tabPutawayLine 
         WHERE carton_id = ?`;
      const taskFromLinesParams = [putawayId];
      
      if (hasBoxIdColumn) {
        taskFromLinesQuery += ` OR box_id = ?`;
        taskFromLinesParams.push(putawayId);
      }
      
      taskFromLinesQuery += ` ORDER BY parent_title DESC LIMIT 1`;
      
      const [taskFromLines] = await connection.execute(
        taskFromLinesQuery,
        taskFromLinesParams
      );
      
      if (taskFromLines.length > 0) {
        putawayTaskTitle = taskFromLines[0].parent_title;
        logger.info(`[Putaway Completion] Found putaway task ${putawayTaskTitle} from putaway lines for ${box_id ? 'box_id' : 'tc_id'}: ${putawayId}`);
      } else if (box_id) {
        // Priority 2: Try to get ASN from tabsortbox, then find task
        const [sortBox] = await connection.execute(
          `SELECT advance_shipping_notice FROM tabsortbox WHERE box_id = ? LIMIT 1`,
          [box_id]
        );
      
        if (sortBox.length > 0 && sortBox[0].advance_shipping_notice) {
          const [tasks] = await connection.execute(
            `SELECT title FROM tabPutawayTask WHERE advance_shipping_notice = ? ORDER BY created_at DESC LIMIT 1`,
            [sortBox[0].advance_shipping_notice]
          );
          if (tasks.length > 0) {
            putawayTaskTitle = tasks[0].title;
            logger.info(`[Putaway Completion] Found putaway task ${putawayTaskTitle} from tabsortbox ASN for box ${box_id}`);
          }
        }
      } else if (tc_id) {
        // Priority 3: Fallback to tabTransferCarton (for backward compatibility)
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
            logger.info(`[Putaway Completion] Found putaway task ${putawayTaskTitle} from tabTransferCarton ASN for tc_id ${tc_id}`);
          }
        }
        }
      }
    }

    if (!putawayTaskTitle) {
      logger.error(`${logPrefix} ========================================`);
      logger.error(`${logPrefix} ❌ CRITICAL: Cannot process - putaway task not found!`);
      logger.error(`${logPrefix} Event parameters:`, {
        putaway_task: putaway_task || 'NULL',
        tc_id: tc_id || 'NULL',
        box_id: box_id || 'NULL',
        carton_id: carton_id || 'NULL'
      });
      logger.error(`${logPrefix} ========================================`);
      return; // Can't process without putaway task
    }
    
    logger.info(`${logPrefix} Step 0b: ✅ putawayTaskTitle resolved: ${putawayTaskTitle}`);
    logger.info(`[Putaway Completion] Processing putaway task: ${putawayTaskTitle}, carton_id from event: ${carton_id || 'NULL'}, item_code: ${item_code || 'NULL'}, qty: ${qty || 'NULL'}, location_id: ${location_id || 'NULL'}, rack: ${rack || 'NULL'}, bin: ${bin || 'NULL'}`);

    logger.info(`${logPrefix} Step 1: Starting transaction...`);
    // CRITICAL: Use row-level locking to prevent concurrent processing
    // This ensures only ONE process can handle this putaway task at a time
    // NOTE: This function uses its own transaction, separate from the batchEvents transaction
    // This allows stock updates to commit independently of event insertion
    await connection.beginTransaction();
    logger.info(`${logPrefix} ✅ Transaction started`);
  
    try {
      logger.info(`${logPrefix} Step 2: Locking putaway task row: ${putawayTaskTitle}`);
      // Lock the putaway task row to prevent concurrent processing
      const [taskStatus] = await connection.execute(
        `SELECT status FROM tabPutawayTask WHERE title = ? FOR UPDATE`,
        [putawayTaskTitle]
      );
    
      logger.info(`${logPrefix} Task status query result:`, {
        found: taskStatus.length > 0,
        status: taskStatus.length > 0 ? taskStatus[0].status : 'NOT_FOUND'
      });
    
      if (taskStatus.length === 0) {
        logger.error(`${logPrefix} ❌ Task doesn't exist: ${putawayTaskTitle}`);
        await connection.rollback();
        logger.info(`${logPrefix} Transaction rolled back (task not found)`);
        return; // Task doesn't exist
      }
    
      // IDEMPOTENCY CHECK 1: Skip if task is already marked as Completed
      if (taskStatus[0].status === 'Completed') {
        logger.warn(`${logPrefix} ⚠️ Task ${putawayTaskTitle} is already Completed - skipping stock update (idempotency check)`);
        await connection.rollback();
        logger.info(`${logPrefix} Transaction rolled back (task already completed)`);
        return; // Task already completed
      }
      
      logger.info(`${logPrefix} ✅ Task status check passed: ${taskStatus[0].status}`);
    
      // IDEMPOTENCY CHECK 2: Check if stock has already been moved for this task
      // This is the most reliable indicator that stock was moved
      // Check if transactions exist AND are complete (have carton_id and location)
      // Only skip if transactions are complete; allow processing if incomplete
      const [existingTransactions] = await connection.execute(
        `SELECT id, carton_id, target_bin, bin_location 
       FROM tabStockTransaction 
       WHERE transaction_type = 'Putaway' AND reference_doc = ? 
       LIMIT 1`,
        [putawayTaskTitle]
      );
    
      if (existingTransactions.length > 0) {
        const existingTxn = existingTransactions[0];
        const hasCartonId = existingTxn.carton_id && existingTxn.carton_id.trim() !== '';
        const hasLocation = (existingTxn.target_bin && existingTxn.target_bin.trim() !== '') ||
          (existingTxn.bin_location && existingTxn.bin_location.trim() !== '');
      
        // Only skip if transaction is complete (has both carton_id and location)
        if (hasCartonId && hasLocation) {
          await connection.rollback();
          return; // Stock already moved completely for this task
        }
        // If transaction exists but incomplete, continue processing to complete it
      }
    
      // If we reach here, this is the first time processing this task
      // Continue with stock updates (will commit at the end)

      // Get all putaway lines for this task (include carton_id and location_id for tabCartonStock updates)
      // Check if location_id column exists in tabPutawayLine
      const [lineLocationColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayLine' 
      AND COLUMN_NAME = 'location_id'
    `);
      const hasLineLocationId = lineLocationColumns.length > 0;
    
      const locationIdSelect = hasLineLocationId ? ", location_id" : ", NULL as location_id";
    
      // CRITICAL: For Transfer In putaway, if carton_id is provided in event, filter lines by carton_id
      // BUT: If carton_id is a putaway task title (PUT- or TI-PUT-), don't filter by it (it's not a real carton ID)
      let putawayLinesQuery = `SELECT item_code, qty, rack, bin, carton_id${locationIdSelect} FROM tabPutawayLine WHERE parent_title = ? AND item_code IS NOT NULL AND qty > 0`;
      const putawayLinesParams = [putawayTaskTitle];
    
      // If carton_id is provided (for Transfer In putaway), filter by it
      // BUT: Skip filtering if carton_id is actually a putaway task title (not a real carton ID)
      // CRITICAL: For manual trigger, don't filter by carton_id if we want to process all lines
      if (carton_id && !carton_id.startsWith('PUT-') && !carton_id.startsWith('TI-PUT-')) {
        // Only filter if we're processing a specific carton (not manual trigger)
        // For manual trigger, we want to process all lines regardless of carton_id
        // Check if this is a manual trigger by checking if item_code is null (manual trigger passes null)
        if (item_code !== null) {
          putawayLinesQuery += ` AND carton_id = ?`;
          putawayLinesParams.push(carton_id);
          logger.info(`[Putaway Completion] Filtering putaway lines by carton_id: ${carton_id}`);
        } else {
          logger.info(`[Putaway Completion] Manual trigger detected (item_code=null) - processing all lines for task, not filtering by carton_id`);
        }
      } else if (carton_id && (carton_id.startsWith('PUT-') || carton_id.startsWith('TI-PUT-'))) {
        logger.info(`[Putaway Completion] carton_id ${carton_id} is a putaway task title, not filtering by it - will process all lines for task`);
      }
    
      logger.info(`${logPrefix} Step 4: Querying putaway lines...`);
      logger.info(`${logPrefix} Query: ${putawayLinesQuery}`);
      logger.info(`${logPrefix} Params:`, JSON.stringify(putawayLinesParams, null, 2));
      const [putawayLines] = await connection.execute(
        putawayLinesQuery,
        putawayLinesParams
      );

      logger.info(`${logPrefix} Putaway lines query result:`, {
        lines_count: putawayLines.length,
        lines: putawayLines.map(line => ({
          item_code: line.item_code,
          qty: line.qty,
          carton_id: line.carton_id || 'NULL',
          location_id: line.location_id || 'NULL',
          rack: line.rack || 'NULL',
          bin: line.bin || 'NULL'
        }))
      });

      if (putawayLines.length === 0) {
        logger.error(`${logPrefix} ❌ No putaway lines found for task ${putawayTaskTitle}`);
        logger.error(`${logPrefix} Query: ${putawayLinesQuery}`);
        logger.error(`${logPrefix} Params: ${JSON.stringify(putawayLinesParams)}`);
        await connection.rollback();
        logger.info(`${logPrefix} Transaction rolled back (no lines)`);
        return; // No lines to process
      }
      
      logger.info(`${logPrefix} ✅ Found ${putawayLines.length} putaway line(s) for task ${putawayTaskTitle}`);

      // Get warehouse and putaway task info
      const [taskColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayTask' 
      AND COLUMN_NAME IN ('advance_shipping_notice', 'transfer_in', 'source_type', 'warehouse')
    `);
      const hasAdvanceShippingNotice = taskColumns.some(col => col.COLUMN_NAME === 'advance_shipping_notice');
      const hasTransferIn = taskColumns.some(col => col.COLUMN_NAME === 'transfer_in');
      const hasSourceType = taskColumns.some(col => col.COLUMN_NAME === 'source_type');
      const hasWarehouse = taskColumns.some(col => col.COLUMN_NAME === 'warehouse');
    
      let taskSelectQuery = `SELECT`;
      if (hasAdvanceShippingNotice) taskSelectQuery += ` advance_shipping_notice`;
      if (hasTransferIn) taskSelectQuery += hasAdvanceShippingNotice ? `, transfer_in` : ` transfer_in`;
      if (hasSourceType) taskSelectQuery += (hasAdvanceShippingNotice || hasTransferIn) ? `, source_type` : ` source_type`;
      if (hasWarehouse) taskSelectQuery += (hasAdvanceShippingNotice || hasTransferIn || hasSourceType) ? `, warehouse` : ` warehouse`;
      taskSelectQuery += ` FROM tabPutawayTask WHERE title = ?`;
    
      const [taskInfo] = await connection.execute(taskSelectQuery, [putawayTaskTitle]);
    
      // CRITICAL: Normalize warehouse to CODE (not name) for stock ledger consistency
      let warehouse = null;
    
      // For Transfer In putaway, get warehouse from transfer_in or putaway task
      if (taskInfo.length > 0) {
        const task = taskInfo[0];
        const isTransferInTask = (hasSourceType && task.source_type === 'TransferIn') || (hasTransferIn && task.transfer_in);
      
        if (isTransferInTask) {
          // Transfer In putaway: Get warehouse from transfer_in or putaway task
          logger.info(`${logPrefix} Transfer In putaway detected: transfer_in=${task.transfer_in || 'NULL'}, task.warehouse=${task.warehouse || 'NULL'}`);
          if (hasWarehouse && task.warehouse) {
            warehouse = task.warehouse;
            logger.info(`${logPrefix} Using warehouse from putaway task: ${warehouse}`);
          } else if (hasTransferIn && task.transfer_in) {
            // CRITICAL: Get warehouse from tabTransferIn.to_warehouse (not warehouse field)
            logger.info(`${logPrefix} Getting warehouse from tabTransferIn.to_warehouse for Transfer In: ${task.transfer_in}`);
            const [transferInInfo] = await connection.execute(
              `SELECT to_warehouse, warehouse FROM tabTransferIn WHERE title = ? LIMIT 1`,
              [task.transfer_in]
            );
            if (transferInInfo.length > 0) {
              logger.info(`${logPrefix} Transfer In query result:`, {
                to_warehouse: transferInInfo[0].to_warehouse || 'NULL',
                warehouse: transferInInfo[0].warehouse || 'NULL'
              });
              if (transferInInfo[0].to_warehouse) {
                warehouse = transferInInfo[0].to_warehouse;
                logger.info(`${logPrefix} ✅ Using to_warehouse: ${warehouse}`);
              } else {
                logger.warn(`${logPrefix} ⚠️ to_warehouse is NULL, falling back to warehouse field`);
                warehouse = transferInInfo[0].warehouse || null;
              }
            } else {
              logger.error(`${logPrefix} ❌ Transfer In ${task.transfer_in} not found in database`);
            }
          }
        } else if (hasAdvanceShippingNotice && task.advance_shipping_notice) {
          // ASN putaway: Get warehouse from ASN
          try {
            const [asnInfo] = await connection.execute(
              `SELECT warehouse FROM tabAdvanceShippingNotice WHERE title = ? LIMIT 1`,
              [task.advance_shipping_notice]
            );
            if (asnInfo.length > 0 && asnInfo[0].warehouse) {
              warehouse = asnInfo[0].warehouse;
              logger.info(`[Putaway Completion] Found warehouse from ASN ${task.advance_shipping_notice}: ${warehouse}`);
            }
          } catch (asnError) {
            logger.warn(`[Putaway Completion] Failed to get warehouse from ASN:`, asnError);
          }
          
          // Fallback: Use warehouse from putaway task if available
          if (!warehouse && hasWarehouse && task.warehouse) {
            warehouse = task.warehouse;
            logger.info(`[Putaway Completion] Using warehouse from putaway task: ${warehouse}`);
          }
        }
      }
    
      // Normalize warehouse to CODE
      if (warehouse) {
        // Check if warehouse is already a code
        const [warehouseCheck] = await connection.execute(
          `SELECT code FROM tabWarehouse WHERE code = ? LIMIT 1`,
          [warehouse]
        );
        if (warehouseCheck.length > 0) {
          warehouse = warehouseCheck[0].code;
        } else {
          // Try to find by name
          const [warehouseByName] = await connection.execute(
            `SELECT code FROM tabWarehouse WHERE name = ? LIMIT 1`,
            [warehouse]
          );
          if (warehouseByName.length > 0) {
            warehouse = warehouseByName[0].code;
          }
        }
      }
    
      // Fallback: Get default warehouse
      if (!warehouse) {
        const [defaultWarehouse] = await connection.execute(
          `SELECT code FROM tabWarehouse WHERE warehouse_type = 'Warehouse' ORDER BY code LIMIT 1`
        );
        if (defaultWarehouse.length > 0) {
          warehouse = defaultWarehouse[0].code;
        } else {
          warehouse = 'WH-MAIN'; // Fallback
        }
      }

      logger.info(`${logPrefix} Step 5: Warehouse resolved: ${warehouse || 'NULL'}`);
      logger.info(`${logPrefix} Step 5: Starting stock update loop...`);
      // Update stock ledger for each putaway line using MOVE pattern
      // CRITICAL: Use MOVE pattern (decrease from staging, increase at target) - not ADD pattern
      const processedStockKeys = new Set(); // Track processed item+location to prevent duplicates
      
      logger.info(`${logPrefix} Stock update loop parameters:`, {
        warehouse: warehouse || 'NULL',
        total_lines: putawayLines.length,
        event_location_id: location_id || 'NULL',
        event_rack: rack || 'NULL',
        event_bin: bin || 'NULL',
        event_carton_id: carton_id || 'NULL',
        event_box_id: box_id || 'NULL'
      });
    
      let processedCount = 0;
      let skippedCount = 0;
      
      for (let lineIndex = 0; lineIndex < putawayLines.length; lineIndex++) {
        const line = putawayLines[lineIndex];
        logger.info(`${logPrefix} ========================================`);
        logger.info(`${logPrefix} Processing line ${lineIndex + 1}/${putawayLines.length}`);
        logger.info(`${logPrefix} Line data:`, JSON.stringify({
          item_code: line.item_code,
          qty: line.qty,
          carton_id: line.carton_id || 'NULL',
          location_id: line.location_id || 'NULL',
          rack: line.rack || 'NULL',
          bin: line.bin || 'NULL'
        }, null, 2));
        const itemCode = line.item_code;
        const lineQty = parseFloat(line.qty) || 0;
        const lineRack = line.rack || null;
        const lineBin = line.bin || null;
        const cartonId = line.carton_id || null;
        const lineLocationId = line.location_id || null;
      
        // Determine target location (to_location_id)
        // Priority: 1) location_id from event (CRITICAL - this is what mobile app sends), 2) location_id from line, 3) rack/bin from line, 4) rack/bin from event
        // CRITICAL: For Transfer In putaway, location_id from event should be used (mobile app sends it)
        // CRITICAL: If event.location_id is provided, use it even if line.location_id is NULL (location scan sets event.location_id)
        let binLocation = location_id || lineLocationId || null;
        
        logger.info(`${logPrefix} Location determination for line ${lineIndex + 1}:`, {
          event_location_id: location_id || 'NULL',
          line_location_id: lineLocationId || 'NULL',
          line_rack: lineRack || 'NULL',
          line_bin: lineBin || 'NULL',
          event_rack: rack || 'NULL',
          event_bin: bin || 'NULL',
          resolved_binLocation: binLocation || 'NULL'
        });
        
        // Log location determination for debugging
        if (!binLocation) {
          logger.warn(`[Putaway Completion] No location_id found, will try to build from rack/bin. event.location_id=${location_id || 'NULL'}, line.location_id=${lineLocationId || 'NULL'}, line.rack=${lineRack || 'NULL'}, line.bin=${lineBin || 'NULL'}, event.rack=${rack || 'NULL'}, event.bin=${bin || 'NULL'}`);
        }
        if (!binLocation) {
          // Try to build from rack/bin
          // CRITICAL: Check if rack already contains the full location ID (ends with bin)
          // If rack is "A1-R02-L1-B2" and bin is "B2", don't concatenate (would create "A1-R02-L1-B2-B2")
          const effectiveRack = lineRack || rack || null;
          const effectiveBin = lineBin || bin || null;
      
          if (effectiveRack && effectiveBin) {
            // Check if rack already ends with the bin value (to avoid duplication)
            const rackStr = String(effectiveRack).trim();
            const binStr = String(effectiveBin).trim();
        
            if (rackStr.endsWith(`-${binStr}`) || rackStr === binStr) {
              // Rack already contains the bin, use rack as-is
              binLocation = rackStr;
            } else {
              // Rack doesn't contain bin, concatenate them
              binLocation = `${rackStr}-${binStr}`;
            }
          } else if (effectiveRack) {
            binLocation = effectiveRack;
          } else if (effectiveBin) {
            binLocation = effectiveBin;
          }
        }

        logger.info(`${logPrefix} Line ${lineIndex + 1} validation:`, {
          itemCode: itemCode || 'NULL',
          lineQty: lineQty,
          binLocation: binLocation || 'NULL',
          hasItemCode: !!itemCode,
          hasValidQty: lineQty > 0,
          hasValidLocation: !!(binLocation && binLocation.trim() !== '' && !binLocation.includes('TBD'))
        });
        
        if (!itemCode || lineQty <= 0 || !binLocation || binLocation.trim() === '' || binLocation.includes('TBD')) {
          skippedCount++;
          logger.error(`${logPrefix} ❌ SKIPPING line ${lineIndex + 1}/${putawayLines.length}:`, {
            reason: !itemCode ? 'missing item_code' : 
                    lineQty <= 0 ? 'invalid qty' : 
                    !binLocation ? 'missing location' :
                    binLocation.trim() === '' ? 'empty location' :
                    binLocation.includes('TBD') ? 'location is TBD' : 'unknown',
            item: itemCode || 'NULL',
            qty: lineQty,
            location: binLocation || 'NULL',
            lineRack: lineRack || 'NULL',
            lineBin: lineBin || 'NULL',
            eventLocation: location_id || 'NULL',
            eventRack: rack || 'NULL',
            eventBin: bin || 'NULL'
          });
          continue; // Skip lines without valid location
        }
        
        processedCount++;
        
        // CRITICAL: Determine FROM location (staging) - MOVE pattern
        let fromLocation = null;
        
        logger.info(`${logPrefix} ✅ Line ${lineIndex + 1} passed validation - processing stock update`);
        logger.info(`${logPrefix} Stock update details:`, {
          item_code: itemCode,
          qty: lineQty,
          fromLocation: fromLocation || 'NULL',
          toLocation: binLocation,
          cartonId: cartonId || 'NULL',
          warehouse: warehouse || 'NULL'
        });

        // Create unique key for idempotency check
        const stockKey = `${itemCode}|${binLocation}|${cartonId || ''}`;
        if (processedStockKeys.has(stockKey)) {
          continue; // Skip duplicate
        }
        processedStockKeys.add(stockKey);
      
        if (cartonId) {
          // Priority 1: Get from tabCartonStock (most accurate)
          const [cartonStockTable] = await connection.execute(`
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabCartonStock'
      `);
      
          if (cartonStockTable.length > 0) {
            const [cartonCurrentLocation] = await connection.execute(
              `SELECT DISTINCT bin_location, SUM(qty) as total_qty
           FROM tabCartonStock
           WHERE carton_id = ? AND item_code = ? AND warehouse = ?
           GROUP BY bin_location
           ORDER BY total_qty DESC
           LIMIT 1`,
              [cartonId, itemCode, warehouse]
            );
        
            if (cartonCurrentLocation.length > 0 && cartonCurrentLocation[0].bin_location) {
              fromLocation = cartonCurrentLocation[0].bin_location;
            }
          }
      
          // Priority 2: Fallback to tabCarton.current_bin_id
          if (!fromLocation) {
            const [cartonBin] = await connection.execute(
              `SELECT current_bin_id FROM tabCarton WHERE carton_id = ? LIMIT 1`,
              [cartonId]
            );
            if (cartonBin.length > 0 && cartonBin[0].current_bin_id) {
              fromLocation = cartonBin[0].current_bin_id;
            }
          }
        }
      
        // Priority 3: Default to staging location
        if (!fromLocation) {
          const [stagingLocation] = await connection.execute(
            `SELECT location_id FROM tabLocation 
         WHERE (location_type = 'STAGING' OR location_type = 'RECEIVING' 
                OR location_id LIKE '%STAGE%' OR location_id LIKE '%DOCK%')
         AND warehouse = ?
         ORDER BY location_id LIMIT 1`,
            [warehouse]
          );
          if (stagingLocation.length > 0) {
            fromLocation = stagingLocation[0].location_id;
          } else {
            fromLocation = 'STAGING-01'; // Last resort
          }
        }

        // STEP 1: Decrease stock at FROM location (staging) - MOVE pattern
        if (fromLocation && fromLocation !== binLocation) {
          const [fromStock] = await connection.execute(
            `SELECT qty, reserved_qty FROM tabStockLedger
           WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))`,
            [itemCode, warehouse, fromLocation, fromLocation]
          );
        
          const fromCurrentQty = fromStock.length > 0 ? parseFloat(fromStock[0].qty) || 0 : 0;
          const fromCurrentReservedQty = fromStock.length > 0 ? parseFloat(fromStock[0].reserved_qty) || 0 : 0;
          const fromNewQty = Math.max(0, fromCurrentQty - lineQty);
        
          // Calculate qty_before and qty_reduced for FROM location (stock decrease)
          const fromQtyBefore = fromCurrentQty;
          const fromQtyReduced = -lineQty; // Negative for stock decrease
        
          if (fromNewQty > 0) {
            // Build INSERT/UPDATE query with optional qty_before and qty_reduced
            let fromInsertFields = `item_code, warehouse, bin_location, qty, reserved_qty`;
            let fromInsertValues = `?, ?, ?, ?, ?`;
            let fromInsertParams = [itemCode, warehouse, fromLocation, fromNewQty, fromCurrentReservedQty];
        
            let fromUpdateFields = `qty = ?`;
            let fromUpdateParams = [fromNewQty];
        
            if (hasQtyBefore) {
              fromInsertFields += `, qty_before`;
              fromInsertValues += `, ?`;
              fromInsertParams.push(fromQtyBefore);
              fromUpdateFields += `, qty_before = ?`;
              fromUpdateParams.push(fromQtyBefore);
            }
        
            if (hasQtyReduced) {
              fromInsertFields += `, qty_reduced`;
              fromInsertValues += `, ?`;
              fromInsertParams.push(fromQtyReduced);
              fromUpdateFields += `, qty_reduced = ?`;
              fromUpdateParams.push(fromQtyReduced);
            }
        
            fromInsertFields += `, last_transaction_date, last_transaction_type, last_transaction_ref, updated_at, created_at`;
            fromInsertValues += `, NOW(), 'Putaway', ?, NOW(), NOW()`;
            fromInsertParams.push(putawayTaskTitle);
        
            fromUpdateFields += `, last_transaction_date = NOW(), last_transaction_type = 'Putaway', last_transaction_ref = ?, updated_at = NOW()`;
            fromUpdateParams.push(putawayTaskTitle);
        
            await connection.execute(
              `INSERT INTO tabStockLedger (${fromInsertFields})
           VALUES (${fromInsertValues})
           ON DUPLICATE KEY UPDATE ${fromUpdateFields}`,
              [...fromInsertParams, ...fromUpdateParams]
            );
          } else {
            await connection.execute(
              `DELETE FROM tabStockLedger WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))`,
              [itemCode, warehouse, fromLocation, fromLocation]
            );
          }
        }

        // STEP 2: Increase stock at TO location (target) - MOVE pattern
        const [currentStock] = await connection.execute(
          `SELECT qty, reserved_qty FROM tabStockLedger 
         WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))`,
          [itemCode, warehouse, binLocation, binLocation]
        );

        const currentQty = currentStock.length > 0 ? parseFloat(currentStock[0].qty) || 0 : 0;
        const currentReservedQty = currentStock.length > 0 ? parseFloat(currentStock[0].reserved_qty) || 0 : 0;
        const newQty = currentQty + lineQty;
      
        // Calculate qty_before and qty_reduced for TO location (stock increase)
        const toQtyBefore = currentQty;
        const toQtyReduced = lineQty; // Positive for stock increase
      
        // Build INSERT/UPDATE query with optional qty_before and qty_reduced
        let toInsertFields = `item_code, warehouse, bin_location, qty, reserved_qty`;
        let toInsertValues = `?, ?, ?, ?, ?`;
        let toInsertParams = [itemCode, warehouse, binLocation, newQty, currentReservedQty];
      
        let toUpdateFields = `qty = ?`;
        let toUpdateParams = [newQty];
      
        if (hasQtyBefore) {
          toInsertFields += `, qty_before`;
          toInsertValues += `, ?`;
          toInsertParams.push(toQtyBefore);
          toUpdateFields += `, qty_before = ?`;
          toUpdateParams.push(toQtyBefore);
        }
      
        if (hasQtyReduced) {
          toInsertFields += `, qty_reduced`;
          toInsertValues += `, ?`;
          toInsertParams.push(toQtyReduced);
          toUpdateFields += `, qty_reduced = ?`;
          toUpdateParams.push(toQtyReduced);
        }
      
        toInsertFields += `, last_transaction_date, last_transaction_type, last_transaction_ref, updated_at, created_at`;
        toInsertValues += `, NOW(), 'Putaway', ?, NOW(), NOW()`;
        toInsertParams.push(putawayTaskTitle);
      
        toUpdateFields += `, last_transaction_date = NOW(), last_transaction_type = 'Putaway', last_transaction_ref = ?, updated_at = NOW()`;
        toUpdateParams.push(putawayTaskTitle);

        // Update stock ledger at TO location
        logger.info(`${logPrefix} ========================================`);
        logger.info(`${logPrefix} 🔵 EXECUTING STOCK LEDGER INSERT/UPDATE`);
        logger.info(`${logPrefix} Item: ${itemCode}`);
        logger.info(`${logPrefix} Location: ${binLocation}`);
        logger.info(`${logPrefix} Warehouse: ${warehouse}`);
        logger.info(`${logPrefix} New Qty: ${newQty}`);
        logger.info(`${logPrefix} Current Qty: ${currentQty}`);
        logger.info(`${logPrefix} SQL: INSERT INTO tabStockLedger (${toInsertFields}) VALUES (${toInsertValues}) ON DUPLICATE KEY UPDATE ${toUpdateFields}`);
        logger.info(`${logPrefix} Insert Params:`, JSON.stringify(toInsertParams, null, 2));
        logger.info(`${logPrefix} Update Params:`, JSON.stringify(toUpdateParams, null, 2));
        logger.info(`${logPrefix} ========================================`);
        
        const stockLedgerResult = await connection.execute(
          `INSERT INTO tabStockLedger (${toInsertFields})
         VALUES (${toInsertValues})
         ON DUPLICATE KEY UPDATE ${toUpdateFields}`,
          [...toInsertParams, ...toUpdateParams]
        );
        
        logger.info(`${logPrefix} ✅ STOCK LEDGER UPDATE RESULT:`, {
          item_code: itemCode,
          bin_location: binLocation,
          warehouse: warehouse,
          new_qty: newQty,
          affectedRows: stockLedgerResult[0] ? stockLedgerResult[0].affectedRows : 'N/A',
          insertId: stockLedgerResult[0] ? stockLedgerResult[0].insertId : 'N/A',
          changedRows: stockLedgerResult[0] ? stockLedgerResult[0].changedRows : 'N/A'
        });

        // Update tabCartonStock.bin_location if carton_id exists and tabCartonStock table exists
        // Note: cartonId is already declared above (line 1092)
        // Note: Update all items in carton to the new bin location (not just this item)
        if (cartonId && binLocation) {
          const [cartonStockTable] = await connection.execute(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabCartonStock'
        `);
        
          if (cartonStockTable.length > 0) {
            try {
              // Update bin_location for all items in this carton (carton is moved as a whole)
              await connection.execute(`
              UPDATE tabCartonStock
              SET bin_location = ?,
                  updated_at = NOW()
              WHERE carton_id = ? AND warehouse = ?
            `, [binLocation, cartonId, warehouse]);
            
              // Also update tabCarton.current_bin_id
              await connection.execute(`
              UPDATE tabCarton
              SET current_bin_id = ?,
                  updated_at = NOW()
              WHERE carton_id = ? AND warehouse = ?
            `, [binLocation, cartonId, warehouse]);
            
              console.log(`✅ Updated tabCartonStock and tabCarton for carton ${cartonId} to bin ${binLocation}`);
            } catch (cartonStockError) {
              console.warn(`⚠️  Could not update tabCartonStock/tabCarton: ${cartonStockError.message}`);
              // Don't fail the entire operation
            }
          }
        }
      
        // Check if carton_id column exists in tabStockTransaction
        const [stockTransactionColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabStockTransaction' 
        AND COLUMN_NAME = 'carton_id'
      `);
        const hasStockTransactionCartonId = stockTransactionColumns.length > 0;
      
        // Insert stock transaction with MOVE pattern (source_bin and target_bin)
        // Check for existing COMPLETE transaction to prevent duplicates (idempotency)
        // Allow inserting/updating if transaction exists but is incomplete (missing carton_id)
        const [existingTransaction] = await connection.execute(
          `SELECT id, carton_id, target_bin, bin_location 
         FROM tabStockTransaction
         WHERE transaction_type = 'Putaway'
           AND reference_doc = ?
           AND item_code = ?
           AND (target_bin = ? OR bin_location = ?)`,
          [putawayTaskTitle, itemCode, binLocation, binLocation]
        );
      
        // Only skip if transaction exists AND is complete (has carton_id)
        // If transaction exists but carton_id is NULL, update it with carton_id
        if (existingTransaction.length > 0) {
          const existingTxn = existingTransaction[0];
          const hasCartonId = existingTxn.carton_id && existingTxn.carton_id.trim() !== '';
        
          if (hasCartonId) {
            // Transaction is complete - skip to prevent duplicate
            continue; // Skip this line - transaction already exists and is complete
          } else if (hasStockTransactionCartonId && cartonId) {
            // Transaction exists but incomplete - update it with carton_id
            try {
              await connection.execute(
                `UPDATE tabStockTransaction 
               SET carton_id = ?, target_bin = ?, bin_location = ?
               WHERE id = ?`,
                [cartonId, binLocation, binLocation, existingTxn.id]
              );
            } catch (updateError) {
              // Silent error - continue
            }
            continue; // Updated existing transaction
          }
        }
      
      
        // No existing transaction or incomplete - insert new one
        try {
          if (hasStockTransactionCartonId && cartonId) {
            await connection.execute(
              `INSERT INTO tabStockTransaction 
              (transaction_date, transaction_type, reference_doc_type, reference_doc, item_code, warehouse, bin_location, carton_id, qty_change, qty_before, qty_after, source_bin, target_bin, performed_by, created_at)
             VALUES (NOW(), 'Putaway', 'Putaway Task', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
              [putawayTaskTitle, itemCode, warehouse, binLocation, cartonId, lineQty, currentQty, newQty, fromLocation || null, binLocation, user_id || 'SYSTEM']
            );
          } else {
            await connection.execute(
              `INSERT INTO tabStockTransaction 
              (transaction_date, transaction_type, reference_doc_type, reference_doc, item_code, warehouse, bin_location, qty_change, qty_before, qty_after, source_bin, target_bin, performed_by, created_at)
             VALUES (NOW(), 'Putaway', 'Putaway Task', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
              [putawayTaskTitle, itemCode, warehouse, binLocation, lineQty, currentQty, newQty, fromLocation || null, binLocation, user_id || 'SYSTEM']
            );
          }
        } catch (insertError) {
          // Silent error - transaction might already exist from another process
        }
      
        // CRITICAL: Also insert into tabTransactionHistory (Audit Trail) if table exists
        try {
          const [txnHistoryTable] = await connection.execute(`
          SELECT TABLE_NAME 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabTransactionHistory'
        `);
        
          if (txnHistoryTable.length > 0) {
            // Generate transaction number
            const trxNo = `TRX-PUT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          
            // Check which columns exist in tabTransactionHistory
            const [txnHistoryColumns] = await connection.execute(`
            SELECT COLUMN_NAME, GENERATION_EXPRESSION, EXTRA, COLUMN_DEFAULT, IS_NULLABLE, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabTransactionHistory' 
            AND COLUMN_NAME IN ('transaction_id', 'transaction_no', 'transaction_number', 'transaction_date', 'trx_time', 'trx_type', 'transaction_type', 'reference_doc', 'ref_no', 
                                'item_code', 'item_name', 'store', 'warehouse',
                                'location_id', 'bin_location', 'carton_id', 'box_id',
                                'qty_change', 'qty_before', 'qty_after', 'direction', 'stock_direction', 'user_id', 'performed_by')
          `);
          
            // Check for transaction_id - if it exists and is NOT auto-increment, we need to provide a value
            const transactionIdCol = txnHistoryColumns.find(col => col.COLUMN_NAME === 'transaction_id');
            const hasTransactionId = !!transactionIdCol;
            const isTransactionIdAutoIncrement = transactionIdCol && transactionIdCol.EXTRA && transactionIdCol.EXTRA.toLowerCase().includes('auto_increment');
            const needsTransactionId = hasTransactionId && !isTransactionIdAutoIncrement && transactionIdCol.IS_NULLABLE === 'NO' && !transactionIdCol.COLUMN_DEFAULT;
            const isTransactionIdInteger = transactionIdCol && (transactionIdCol.DATA_TYPE === 'int' || transactionIdCol.DATA_TYPE === 'bigint' || transactionIdCol.DATA_TYPE === 'integer');
            
            // Check for both transaction_no and transaction_number (different schemas may use different names)
            const hasTransactionNo = txnHistoryColumns.some(col => col.COLUMN_NAME === 'transaction_no');
            const hasTransactionNumber = txnHistoryColumns.some(col => col.COLUMN_NAME === 'transaction_number');
            // Use transaction_number if it exists, otherwise fall back to transaction_no
            const transactionNoColumnName = hasTransactionNumber ? 'transaction_number' : (hasTransactionNo ? 'transaction_no' : null);
            const hasTransactionDate = txnHistoryColumns.some(col => col.COLUMN_NAME === 'transaction_date');
            const hasTrxTime = txnHistoryColumns.some(col => col.COLUMN_NAME === 'trx_time');
            const hasTrxType = txnHistoryColumns.some(col => col.COLUMN_NAME === 'trx_type');
            const hasTransactionType = txnHistoryColumns.some(col => col.COLUMN_NAME === 'transaction_type');
            const hasReferenceDoc = txnHistoryColumns.some(col => col.COLUMN_NAME === 'reference_doc');
            const hasRefNo = txnHistoryColumns.some(col => col.COLUMN_NAME === 'ref_no');
            const hasItemName = txnHistoryColumns.some(col => col.COLUMN_NAME === 'item_name');
            const hasStore = txnHistoryColumns.some(col => col.COLUMN_NAME === 'store');
            const hasWarehouse = txnHistoryColumns.some(col => col.COLUMN_NAME === 'warehouse');
            const hasLocationId = txnHistoryColumns.some(col => col.COLUMN_NAME === 'location_id');
            const hasBinLocation = txnHistoryColumns.some(col => col.COLUMN_NAME === 'bin_location');
            const hasCartonId = txnHistoryColumns.some(col => col.COLUMN_NAME === 'carton_id');
            const hasBoxId = txnHistoryColumns.some(col => col.COLUMN_NAME === 'box_id');
            const hasQtyChange = txnHistoryColumns.some(col => col.COLUMN_NAME === 'qty_change');
            // Check for qty_before and qty_after - if they exist and are required, we need to provide values
            const qtyBeforeCol = txnHistoryColumns.find(col => col.COLUMN_NAME === 'qty_before');
            const hasQtyBefore = !!qtyBeforeCol;
            // Column is required if: exists AND (NOT nullable OR has no default value)
            // Check both IS_NULLABLE and COLUMN_DEFAULT (COLUMN_DEFAULT can be null, empty string, or 'NULL' as string)
            const isQtyBeforeNullable = qtyBeforeCol && qtyBeforeCol.IS_NULLABLE === 'YES';
            const hasQtyBeforeDefault = qtyBeforeCol && (qtyBeforeCol.COLUMN_DEFAULT !== null && qtyBeforeCol.COLUMN_DEFAULT !== '' && qtyBeforeCol.COLUMN_DEFAULT !== 'NULL');
            const isQtyBeforeGenerated = qtyBeforeCol && !!qtyBeforeCol.GENERATION_EXPRESSION;
            // Include qty_before if column exists and is NOT nullable and has NO default and is NOT generated
            const needsQtyBefore = hasQtyBefore && !isQtyBeforeNullable && !hasQtyBeforeDefault && !isQtyBeforeGenerated;
            
            const qtyAfterCol = txnHistoryColumns.find(col => col.COLUMN_NAME === 'qty_after');
            const hasQtyAfter = !!qtyAfterCol;
            const isQtyAfterNullable = qtyAfterCol && qtyAfterCol.IS_NULLABLE === 'YES';
            const hasQtyAfterDefault = qtyAfterCol && (qtyAfterCol.COLUMN_DEFAULT !== null && qtyAfterCol.COLUMN_DEFAULT !== '' && qtyAfterCol.COLUMN_DEFAULT !== 'NULL');
            const isQtyAfterGenerated = qtyAfterCol && !!qtyAfterCol.GENERATION_EXPRESSION;
            const needsQtyAfter = hasQtyAfter && !isQtyAfterNullable && !hasQtyAfterDefault && !isQtyAfterGenerated;
            
            const hasDirection = txnHistoryColumns.some(col => col.COLUMN_NAME === 'direction');
            // Check if stock_direction exists AND is NOT a generated column (generated columns cannot be inserted into)
            const stockDirectionCol = txnHistoryColumns.find(col => col.COLUMN_NAME === 'stock_direction');
            const hasStockDirection = stockDirectionCol && !stockDirectionCol.GENERATION_EXPRESSION;
            const hasUserId = txnHistoryColumns.some(col => col.COLUMN_NAME === 'user_id');
            const hasPerformedBy = txnHistoryColumns.some(col => col.COLUMN_NAME === 'performed_by');
          
            // Get item name if available
            let itemName = null;
            if (hasItemName) {
              const [itemRows] = await connection.execute(
                `SELECT name FROM tabItem WHERE code = ? LIMIT 1`,
                [itemCode]
              );
              if (itemRows.length > 0) {
                itemName = itemRows[0].name;
              }
            }
          
            // Build INSERT query for tabTransactionHistory
            const historyFields = [];
            const historyValues = [];
          
            // Handle transaction_id if it's required and not auto-increment
            if (needsTransactionId) {
              // Generate a unique transaction ID
              // If it's an integer column, use numeric ID; otherwise use string
              let transactionId;
              if (isTransactionIdInteger) {
                // Generate numeric ID: timestamp + random number (ensures uniqueness)
                transactionId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`.substring(0, 15)); // Limit to 15 digits for INT
              } else {
                // Generate string ID
                transactionId = `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
              }
              historyFields.push('transaction_id');
              historyValues.push(transactionId);
            }
          
            if (transactionNoColumnName) {
              historyFields.push(transactionNoColumnName);
              historyValues.push(trxNo);
            }
            // Track if we need to use NOW() for transaction_date
            let useNowForTransactionDate = false;
            if (hasTransactionDate) {
              historyFields.push('transaction_date');
              // ✅ Use NOW() in SQL instead of JavaScript Date to avoid timezone/format issues
              useNowForTransactionDate = true;
              // Don't push a value - we'll use NOW() in SQL
            }
            if (hasTrxTime) {
              historyFields.push('trx_time');
              historyValues.push(new Date());
            }
            if (hasTrxType) {
              historyFields.push('trx_type');
              historyValues.push('PUTAWAY_COMPLETE');
            }
            if (hasTransactionType) {
              historyFields.push('transaction_type');
              historyValues.push('Putaway');
            }
            if (hasReferenceDoc) {
              historyFields.push('reference_doc');
              historyValues.push(putawayTaskTitle);
            }
            if (hasRefNo) {
              historyFields.push('ref_no');
              historyValues.push(putawayTaskTitle);
            }
            if (hasItemName) {
              historyFields.push('item_code');
              historyValues.push(itemCode);
              historyFields.push('item_name');
              historyValues.push(itemName);
            } else {
              historyFields.push('item_code');
              historyValues.push(itemCode);
            }
            if (hasStore) {
              historyFields.push('store');
              historyValues.push(warehouse); // Use warehouse as store
            }
            if (hasWarehouse) {
              historyFields.push('warehouse');
              historyValues.push(warehouse);
            }
            if (hasLocationId) {
              historyFields.push('location_id');
              historyValues.push(binLocation);
            }
            if (hasBinLocation) {
              historyFields.push('bin_location');
              historyValues.push(binLocation);
            }
            if (hasCartonId && cartonId) {
              historyFields.push('carton_id');
              historyValues.push(cartonId);
            }
            if (hasBoxId && box_id) {
              historyFields.push('box_id');
              historyValues.push(box_id);
            }
            if (hasQtyChange) {
              historyFields.push('qty_change');
              historyValues.push(lineQty);
            }
            // Add qty_before and qty_after if required
            // Always include qty_before and qty_after if columns exist (even if nullable) for better audit trail
            if (hasQtyBefore) {
              historyFields.push('qty_before');
              // Ensure currentQty is always a number (default to 0 if undefined/null)
              const qtyBeforeValue = (typeof currentQty === 'number' && !isNaN(currentQty)) ? currentQty : 0;
              historyValues.push(qtyBeforeValue);
              logger.info(`${logPrefix} 🔍 Adding qty_before: ${qtyBeforeValue} (needsQtyBefore: ${needsQtyBefore}, currentQty: ${currentQty})`);
            }
            if (hasQtyAfter) {
              historyFields.push('qty_after');
              // Ensure newQty is always a number (default to qtyBeforeValue + lineQty if undefined/null)
              const qtyAfterValue = (typeof newQty === 'number' && !isNaN(newQty)) ? newQty : ((typeof currentQty === 'number' && !isNaN(currentQty)) ? currentQty : 0) + lineQty;
              historyValues.push(qtyAfterValue);
              logger.info(`${logPrefix} 🔍 Adding qty_after: ${qtyAfterValue} (needsQtyAfter: ${needsQtyAfter}, newQty: ${newQty})`);
            }
            if (hasDirection) {
              historyFields.push('direction');
              historyValues.push('IN'); // Putaway increases stock
            }
            // Only insert stock_direction if it exists and is NOT a generated column
            if (hasStockDirection) {
              historyFields.push('stock_direction');
              historyValues.push('IN'); // Putaway increases stock
            }
            if (hasUserId) {
              historyFields.push('user_id');
              historyValues.push(user_id || 'SYSTEM');
            }
            if (hasPerformedBy) {
              historyFields.push('performed_by');
              historyValues.push(user_id || 'SYSTEM');
            }
          
            if (historyFields.length > 0) {
              // ✅ IDEMPOTENCY CHECK: Prevent duplicate transaction history records
              // Check if a similar record already exists (same reference_doc/ref_no, item_code, location, qty_change, within last 5 seconds)
              // Handle both reference_doc and ref_no column names
              let idempotencyQuery;
              if (hasReferenceDoc) {
                idempotencyQuery = `SELECT id 
                 FROM tabTransactionHistory 
                 WHERE reference_doc = ? 
                   AND item_code = ? 
                   AND (location_id = ? OR bin_location = ?)
                   AND qty_change = ?
                   AND transaction_date >= DATE_SUB(NOW(), INTERVAL 5 SECOND)
                 LIMIT 1`;
              } else if (hasRefNo) {
                idempotencyQuery = `SELECT id 
                 FROM tabTransactionHistory 
                 WHERE ref_no = ? 
                   AND item_code = ? 
                   AND (location_id = ? OR bin_location = ?)
                   AND qty_change = ?
                   AND transaction_date >= DATE_SUB(NOW(), INTERVAL 5 SECOND)
                 LIMIT 1`;
              } else {
                // Fallback: check by item_code, location, and qty_change only
                idempotencyQuery = `SELECT id 
                 FROM tabTransactionHistory 
                 WHERE item_code = ? 
                   AND (location_id = ? OR bin_location = ?)
                   AND qty_change = ?
                   AND transaction_date >= DATE_SUB(NOW(), INTERVAL 5 SECOND)
                 LIMIT 1`;
              }
              
              const [existingHistory] = await connection.execute(
                idempotencyQuery,
                hasReferenceDoc || hasRefNo 
                  ? [putawayTaskTitle, itemCode, binLocation, binLocation, lineQty]
                  : [itemCode, binLocation, binLocation, lineQty]
              );
              
              if (existingHistory.length > 0) {
                logger.info(`${logPrefix} ⚠️ SKIPPING duplicate transaction history insert (idempotency check)`, {
                  item_code: itemCode,
                  location: binLocation,
                  reference_doc: putawayTaskTitle,
                  existing_id: existingHistory[0].id
                });
                continue; // Skip this line - transaction history already exists
              }
              
              // ✅ Handle transaction_date separately - use NOW() in SQL instead of JavaScript Date
              const transactionDateIndex = historyFields.indexOf('transaction_date');
              let sqlFields = [...historyFields];
              let sqlValues = [...historyValues];
              let sqlPlaceholders = historyFields.map(() => '?');
              
              // If transaction_date is in fields, replace its placeholder with NOW()
              if (useNowForTransactionDate && transactionDateIndex >= 0) {
                // Replace the placeholder with NOW() - no value needed
                sqlPlaceholders[transactionDateIndex] = 'NOW()';
              }
              
              logger.info(`${logPrefix} ========================================`);
              logger.info(`${logPrefix} 🔵 EXECUTING TRANSACTION HISTORY INSERT`);
              logger.info(`${logPrefix} Item: ${itemCode}`);
              logger.info(`${logPrefix} Location: ${binLocation}`);
              logger.info(`${logPrefix} Qty Change: ${lineQty}`);
              logger.info(`${logPrefix} Fields (${sqlFields.length}):`, sqlFields);
              logger.info(`${logPrefix} SQL: INSERT INTO tabTransactionHistory (${sqlFields.join(', ')}) VALUES (${sqlPlaceholders.join(', ')})`);
              logger.info(`${logPrefix} Values:`, JSON.stringify(sqlValues, null, 2));
              logger.info(`${logPrefix} ========================================`);
              
              const transactionResult = await connection.execute(
                `INSERT INTO tabTransactionHistory (${sqlFields.join(', ')})
                 VALUES (${sqlPlaceholders.join(', ')})`,
                sqlValues
              );
            
              logger.info(`${logPrefix} ✅ TRANSACTION HISTORY INSERT RESULT:`, {
                item_code: itemCode,
                bin_location: binLocation,
                qty_change: lineQty,
                affectedRows: transactionResult[0] ? transactionResult[0].affectedRows : 'N/A',
                insertId: transactionResult[0] ? transactionResult[0].insertId : 'N/A'
              });
            } else {
              logger.warn(`${logPrefix} ⚠️ No history fields to insert for item ${itemCode}`);
            }
          }
        } catch (historyError) {
          logger.error(`[Putaway Event] ⚠️ Could not insert audit trail (tabTransactionHistory) for ${itemCode}`, {
            error: historyError.message,
            item_code: itemCode
          });
          // Don't fail the transaction - stock ledger is already updated
        }
      } // End of for loop

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
        
        } catch (postingError) {
          console.error(`⚠️  Stock posting failed for Putaway ${putawayTaskTitle}:`, postingError);
          // Don't fail the entire operation, but log the error
        }
      }

      logger.info(`${logPrefix} ========================================`);
      logger.info(`${logPrefix} Step 6: Stock update loop completed`);
      logger.info(`${logPrefix} Summary:`, {
        processed: processedCount,
        skipped: skippedCount,
        total_lines: putawayLines.length,
        success_rate: `${((processedCount / putawayLines.length) * 100).toFixed(1)}%`
      });
      logger.info(`${logPrefix} ========================================`);
      
      if (processedCount === 0) {
        logger.error(`${logPrefix} ========================================`);
        logger.error(`${logPrefix} ❌ CRITICAL ERROR: No lines were processed!`);
        logger.error(`${logPrefix} All ${putawayLines.length} line(s) were skipped.`);
        logger.error(`${logPrefix} Putaway lines details:`, JSON.stringify({
          lines: putawayLines.map(line => ({
            item_code: line.item_code,
            qty: line.qty,
            location_id: line.location_id || 'NULL',
            rack: line.rack || 'NULL',
            bin: line.bin || 'NULL',
            carton_id: line.carton_id || 'NULL'
          }))
        }, null, 2));
        logger.error(`${logPrefix} ========================================`);
        await connection.rollback();
        logger.info(`${logPrefix} Transaction rolled back (no lines processed)`);
        throw new Error(`No putaway lines could be processed. All lines were skipped (likely missing location). processed=${processedCount}, skipped=${skippedCount}`);
      }

      logger.info(`${logPrefix} Step 7: Marking putaway task as Completed...`);
      // Mark putaway task as completed if not already
      const statusUpdateResult = await connection.execute(
        `UPDATE tabPutawayTask SET status = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE title = ? AND status != 'Completed'`,
        [putawayTaskTitle]
      );
      logger.info(`${logPrefix} Status update result:`, {
        affectedRows: statusUpdateResult[0] ? statusUpdateResult[0].affectedRows : 'N/A'
      });

      logger.info(`${logPrefix} ========================================`);
      logger.info(`${logPrefix} Step 8: COMMITTING TRANSACTION`);
      logger.info(`${logPrefix} Task: ${putawayTaskTitle}`);
      logger.info(`${logPrefix} Processed: ${processedCount}, Skipped: ${skippedCount}`);
      logger.info(`${logPrefix} ========================================`);
      // Commit the transaction - all stock updates succeeded
      await connection.commit();
      logger.info(`${logPrefix} ✅✅✅ TRANSACTION COMMITTED SUCCESSFULLY ✅✅✅`);
      logger.info(`${logPrefix} Task: ${putawayTaskTitle}`);
      logger.info(`${logPrefix} ========================================`);
      
      // Log summary of what was updated (use a new connection since we committed)
      try {
        const { getConnection: getNewConnection } = await import('../../db/connection.js');
        const checkConnection = await getNewConnection();
        try {
          const [stockLedgerCheck] = await checkConnection.execute(
            `SELECT COUNT(*) as count FROM tabStockLedger WHERE last_transaction_ref = ? AND last_transaction_type = 'Putaway'`,
            [putawayTaskTitle]
          );
          const [transactionHistoryCheck] = await checkConnection.execute(
            `SELECT COUNT(*) as count FROM tabTransactionHistory WHERE reference_doc = ? AND transaction_type = 'Putaway'`,
            [putawayTaskTitle]
          );
          
          logger.info(`[Putaway Completion] ✅ Successfully completed putaway task ${putawayTaskTitle} - stock updated, task marked as Completed`, {
            stock_ledger_entries: stockLedgerCheck[0]?.count || 0,
            transaction_history_entries: transactionHistoryCheck[0]?.count || 0,
            processed_lines: processedCount,
            skipped_lines: skippedCount,
            putaway_task: putawayTaskTitle
          });
        } finally {
          checkConnection.release();
        }
      } catch (checkError) {
        // Don't fail if check fails, just log
        logger.warn(`[Putaway Completion] Failed to verify stock updates:`, checkError.message);
      }
    
    } catch (transactionError) {
      // Rollback transaction on error
      await connection.rollback();
      logger.error(`${logPrefix} Transaction rolled back due to error:`, transactionError.message);
      throw transactionError; // Re-throw to be caught by outer catch
    }
  } catch (error) {
    logger.error(`${logPrefix} ========================================`);
    logger.error(`${logPrefix} ❌❌❌ ERROR PROCESSING PUTAWAY COMPLETION EVENT ❌❌❌`);
    logger.error(`${logPrefix} Task: ${putawayTaskTitle || event?.putaway_task || 'UNKNOWN'}`);
    logger.error(`${logPrefix} Error: ${error.message}`);
    logger.error(`${logPrefix} Stack:`, error.stack);
    logger.error(`${logPrefix} Context:`, {
      putaway_task: putawayTaskTitle || event?.putaway_task || 'UNKNOWN',
      location_id: event?.location_id || 'NULL',
      carton_id: event?.carton_id || 'NULL',
      box_id: event?.box_id || 'NULL',
      event_type: event?.event_type || 'NULL'
    });
    logger.error(`${logPrefix} ========================================`);
    // Rollback on any error
    await connection.rollback();
    logger.info(`${logPrefix} Transaction rolled back due to error`);
    throw error; // Re-throw to let caller handle
  }
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

  /**
   * Process TRANSFER_IN_RECEIVE_ADJUST events - set absolute qty for item in carton
   * This sets the received_qty to an absolute value (not additive)
   * 
   * Event payload:
   * {
   *   "event_type": "TRANSFER_IN_RECEIVE_ADJUST",
   *   "transfer_in": "INSLIP-123463",
   *   "carton_id": "CTN-123",
   *   "item_code": "SKU-001",
   *   "set_qty": 5.0  // Absolute qty to set
   * }
   */
  async function processTransferInReceiveAdjustEvent(connection, data) {
    const { transfer_in, item_code, carton_id, set_qty, user_id } = data;
  
    if (!transfer_in || !item_code || !carton_id || set_qty === undefined || set_qty === null) {
      console.warn(`⚠️  processTransferInReceiveAdjustEvent: Missing required fields. transfer_in=${transfer_in}, item_code=${item_code}, carton_id=${carton_id}, set_qty=${set_qty}`);
      return;
    }
  
    try {
      // Check if carton tables exist
      const [cartonTableCheck] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInCarton'
    `);
    
      const hasCartonTables = cartonTableCheck.length > 0;
    
      if (!hasCartonTables) {
        console.warn(`⚠️  tabTransferInCarton table does not exist. Skipping TRANSFER_IN_RECEIVE_ADJUST processing.`);
        return;
      }
    
      // Ensure carton exists (create if not exists)
      // Use ON DUPLICATE KEY UPDATE to handle race conditions
      const cartonName = `TIC-${transfer_in}-${carton_id}-${Date.now()}`;
    
      // Check if carton exists and get status
      const [existingCarton] = await connection.execute(`
      SELECT name, carton_id, status
      FROM tabTransferInCarton
      WHERE carton_id = ? AND transfer_in = ?
    `, [carton_id, transfer_in]);
    
      // Insert or update carton (atomic operation, prevents duplicate key errors)
      await connection.execute(`
      INSERT INTO tabTransferInCarton (name, carton_id, transfer_in, status, created_by, created_at)
      VALUES (?, ?, ?, 'Draft', ?, NOW())
      ON DUPLICATE KEY UPDATE
        transfer_in = VALUES(transfer_in),
        updated_at = NOW()
    `, [cartonName, carton_id, transfer_in, user_id || 'SYSTEM']);
    
      if (existingCarton.length === 0) {
        console.log(`✅ Created carton ${carton_id} for Transfer In ${transfer_in}`);
      }
    
      // Get current qty from carton line (if exists)
      const [cartonLineRows] = await connection.execute(`
      SELECT name, received_qty
      FROM tabTransferInCartonLine
      WHERE transfer_in = ? AND carton_id = ? AND item_code = ?
    `, [transfer_in, carton_id, item_code]);
    
      const newQty = parseFloat(set_qty) || 0;
      const currentCartonQty = cartonLineRows.length > 0 ? parseFloat(cartonLineRows[0].received_qty) || 0 : 0;
    
      // Upsert carton line with absolute qty
      // Use ON DUPLICATE KEY UPDATE to handle race conditions (atomic upsert)
      const lineName = `TICL-${transfer_in}-${carton_id}-${item_code}-${Date.now()}`;
      await connection.execute(`
      INSERT INTO tabTransferInCartonLine (name, transfer_in, carton_id, item_code, received_qty, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        received_qty = VALUES(received_qty),
        updated_at = NOW()
    `, [lineName, transfer_in, carton_id, item_code, newQty]);
    
      console.log(`✅ Updated carton line: ${item_code} in carton ${carton_id} for Transfer In ${transfer_in}: ${currentCartonQty} → ${newQty}`);
    
      // Update tabTransferInItem.carton_id with the last carton used (for desktop grid display)
      // Check if carton_id column exists
      const [cartonIdColCheck] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInItem'
        AND COLUMN_NAME = 'carton_id'
    `);
      const hasCartonIdColumn = cartonIdColCheck.length > 0;
    
      if (hasCartonIdColumn && carton_id) {
        await connection.execute(`
        UPDATE tabTransferInItem
        SET carton_id = ?,
            updated_at = NOW()
        WHERE parent_title = ?
          AND item_code = ?
      `, [carton_id, transfer_in, item_code]);
        console.log(`✅ Updated tabTransferInItem.carton_id: ${item_code} = ${carton_id} (for desktop grid)`);
      }
    
      // Recalculate total received_qty from all cartons for this item
      await recalculateTransferInItemReceivedQty(connection, transfer_in, item_code);
    
      // Recalculate Transfer In header status
      try {
        const { recalculateTransferInStatus } = await import('../transfer-in/transferInController.js');
        await recalculateTransferInStatus(connection, transfer_in);
      } catch (recalcError) {
        console.warn(`⚠️  Failed to recalculate Transfer In status:`, recalcError.message);
      }
    
    } catch (error) {
      console.error(`❌ Error processing TRANSFER_IN_RECEIVE_ADJUST event:`, error);
      // Don't throw - allow event insertion to continue
    }
  }

  /**
   * Process TRANSFER_IN_CARTON_CLOSE events - close carton
   * Sets carton status to 'Closed' and sets closed_at/closed_by
   */
  async function processTransferInCartonCloseEvent(connection, data) {
    const { transfer_in, carton_id, user_id } = data;
  
    if (!transfer_in || !carton_id) {
      console.warn(`⚠️  processTransferInCartonCloseEvent: Missing required fields. transfer_in=${transfer_in}, carton_id=${carton_id}`);
      return;
    }
  
    try {
      // Check if carton table exists
      const [cartonTableCheck] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInCarton'
    `);
    
      const hasCartonTable = cartonTableCheck.length > 0;
    
      if (!hasCartonTable) {
        console.warn(`⚠️  tabTransferInCarton table does not exist. Skipping TRANSFER_IN_CARTON_CLOSE processing.`);
        return;
      }
    
      // Check if carton exists
      const [cartonRows] = await connection.execute(`
      SELECT name, status, closed_at
      FROM tabTransferInCarton
      WHERE carton_id = ? AND transfer_in = ?
    `, [carton_id, transfer_in]);
    
      if (cartonRows.length === 0) {
        console.warn(`⚠️  Carton ${carton_id} not found for Transfer In ${transfer_in}`);
        return;
      }
    
      const carton = cartonRows[0];
    
      // Check if already closed
      if (carton.status === 'Closed' && carton.closed_at) {
        console.log(`⚠️  Carton ${carton_id} already closed. Skipping.`);
        return;
      }
    
      // Close carton
      await connection.execute(`
      UPDATE tabTransferInCarton
      SET status = 'Closed',
          closed_by = ?,
          closed_at = NOW(),
          updated_at = NOW()
      WHERE carton_id = ? AND transfer_in = ?
    `, [user_id || 'SYSTEM', carton_id, transfer_in]);
    
      console.log(`✅ Closed carton ${carton_id} for Transfer In ${transfer_in}`);
    
      // Note: Do NOT change transfer_in.status when closing carton
      // Transfer In status is only changed via Complete endpoint
    
    } catch (error) {
      console.error(`❌ Error processing TRANSFER_IN_CARTON_CLOSE event:`, error);
      // Don't throw - allow event insertion to continue
    }
  }

  /**
   * Recalculate total received_qty for a Transfer In item from all carton lines
   * Updates tabTransferInItem.received_qty = SUM(tabTransferInCartonLine.received_qty)
   */
  async function recalculateTransferInItemReceivedQty(connection, transfer_in, item_code) {
    try {
      // Check if carton line table exists
      const [cartonLineTableCheck] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInCartonLine'
    `);
    
      const hasCartonLineTable = cartonLineTableCheck.length > 0;
    
      if (!hasCartonLineTable) {
        // Fall back to old behavior (single carton per item)
        return;
      }
    
      // Calculate total received_qty from all carton lines
      const [totalRows] = await connection.execute(`
      SELECT COALESCE(SUM(received_qty), 0) as total_received
      FROM tabTransferInCartonLine
      WHERE transfer_in = ? AND item_code = ?
    `, [transfer_in, item_code]);
    
      const totalReceived = parseFloat(totalRows[0]?.total_received || 0);
    
      // Update tabTransferInItem.received_qty
      await connection.execute(`
      UPDATE tabTransferInItem
      SET received_qty = ?,
          updated_at = NOW()
      WHERE parent_title = ? AND item_code = ?
    `, [totalReceived, transfer_in, item_code]);
    
      console.log(`✅ Recalculated received_qty for ${item_code} in Transfer In ${transfer_in}: ${totalReceived} (from carton lines)`);
    
      // Update item status if status column exists
      const [statusColCheck] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInItem'
        AND COLUMN_NAME = 'status'
    `);
    
      if (statusColCheck.length > 0) {
        const [itemRows] = await connection.execute(`
        SELECT qty FROM tabTransferInItem
        WHERE parent_title = ? AND item_code = ?
      `, [transfer_in, item_code]);
      
        if (itemRows.length > 0) {
          const expectedQty = parseFloat(itemRows[0].qty) || 0;
          const itemStatus = totalReceived > 0 ? 'Picking' : 'Pending';
        
          await connection.execute(`
          UPDATE tabTransferInItem
          SET status = ?,
              updated_at = NOW()
          WHERE parent_title = ? AND item_code = ?
        `, [itemStatus, transfer_in, item_code]);
        }
      }
    
    } catch (error) {
      console.error(`❌ Error recalculating Transfer In item received_qty:`, error);
      // Don't throw - allow operation to continue
    }
  }
