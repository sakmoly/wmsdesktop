// Helper function to update existing packing events
// This allows updating quantity for items that are already scanned

import { getConnection } from '../../db/connection.js';

/**
 * Update or replace packing events for a specific item in a transfer carton
 * 
 * @param {Object} params - Update parameters
 * @param {string} params.tc_id - Transfer carton ID
 * @param {string} params.item_code - Item code
 * @param {string} params.carton_id - Source carton ID
 * @param {number} params.new_qty - New total quantity (replaces all previous events)
 * @param {string} params.user_id - User ID making the update
 * @param {Object} connection - Database connection (optional, will create if not provided)
 * @returns {Promise<Object>} Update result
 */
export async function updatePackingEventQuantity({
  tc_id,
  item_code,
  carton_id,
  new_qty,
  user_id,
  connection = null
}) {
  const shouldReleaseConnection = !connection;
  if (!connection) {
    connection = await getConnection();
  }

  try {
    await connection.beginTransaction();

    // Step 1: Find all existing PACK_ITEM_TO_TC events for this item+carton+tc
    const [existingEvents] = await connection.execute(`
      SELECT 
        id,
        offline_uuid,
        qty,
        event_time
      FROM tabWmsScanEvent
      WHERE tc_id = ?
        AND item_code = ?
        AND carton_id = ?
        AND event_type = 'PACK_ITEM_TO_TC'
      ORDER BY event_time ASC
    `, [tc_id, item_code, carton_id]);

    const currentTotalQty = existingEvents.reduce((sum, e) => sum + parseFloat(e.qty || 0), 0);
    const qtyDifference = new_qty - currentTotalQty;

    console.log(`📦 Updating packing event quantity:`);
    console.log(`   TC: ${tc_id}`);
    console.log(`   Item: ${item_code}`);
    console.log(`   Carton: ${carton_id}`);
    console.log(`   Current total: ${currentTotalQty}`);
    console.log(`   New total: ${new_qty}`);
    console.log(`   Difference: ${qtyDifference}`);

    if (qtyDifference === 0) {
      // No change needed
      await connection.commit();
      return {
        ok: true,
        message: 'Quantity unchanged',
        current_qty: currentTotalQty,
        new_qty: new_qty,
        events_updated: 0
      };
    }

    if (qtyDifference > 0) {
      // Need to add more quantity - insert new event(s)
      // Check which optional columns exist
      const [optionalColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabWmsScanEvent' 
          AND COLUMN_NAME IN ('material_request', 'source_bin')
      `);
      const existingColumns = new Set(optionalColumns.map(row => row.COLUMN_NAME));
      const hasMaterialRequestColumn = existingColumns.has('material_request');
      const hasSourceBinColumn = existingColumns.has('source_bin');

      // Build SELECT fields dynamically based on what columns exist
      const selectFields = ['transfer_order'];
      if (hasMaterialRequestColumn) selectFields.push('material_request');
      if (hasSourceBinColumn) selectFields.push('source_bin');
      selectFields.push('store');
      
      const [existingEventForCopy] = await connection.execute(`
        SELECT ${selectFields.join(', ')}
        FROM tabWmsScanEvent
        WHERE tc_id = ?
          AND item_code = ?
          AND carton_id = ?
          AND event_type = 'PACK_ITEM_TO_TC'
        LIMIT 1
      `, [tc_id, item_code, carton_id]);

      // Extract values (only if columns exist)
      const transferOrder = existingEventForCopy[0]?.transfer_order || null;
      const materialRequest = hasMaterialRequestColumn ? (existingEventForCopy[0]?.material_request || null) : null;
      const sourceBin = hasSourceBinColumn ? (existingEventForCopy[0]?.source_bin || null) : null;
      const store = existingEventForCopy[0]?.store || null;

      // Insert one event with the difference
      const newEventUuid = `update-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      
      // Build INSERT statement dynamically based on what columns exist
      const insertFields = ['offline_uuid', 'event_type', 'event_time', 'device_id', 'user_id', 
                            'carton_id', 'item_code', 'qty', 'tc_id', 'transfer_order'];
      const insertValues = ['?', '?', 'NOW()', '?', '?', '?', '?', '?', '?', '?'];
      const insertParams = [newEventUuid, 'PACK_ITEM_TO_TC', 'SYSTEM', user_id, carton_id, item_code, qtyDifference, tc_id, transferOrder];
      
      if (hasMaterialRequestColumn) {
        insertFields.push('material_request');
        insertValues.push('?');
        insertParams.push(materialRequest);
      }
      if (hasSourceBinColumn) {
        insertFields.push('source_bin');
        insertValues.push('?');
        insertParams.push(sourceBin);
      }
      insertFields.push('store');
      insertValues.push('?');
      insertParams.push(store);
      
      await connection.execute(`
        INSERT INTO tabWmsScanEvent 
          (${insertFields.join(', ')})
        VALUES (${insertValues.join(', ')})
      `, insertParams);

      await connection.commit();
      return {
        ok: true,
        message: 'Quantity increased',
        current_qty: currentTotalQty,
        new_qty: new_qty,
        events_added: 1,
        qty_added: qtyDifference
      };
    } else {
      // Need to reduce quantity - delete or reduce events
      let remainingToReduce = Math.abs(qtyDifference);
      let eventsDeleted = 0;

      // Delete events starting from the oldest until we've reduced enough
      for (const event of existingEvents) {
        if (remainingToReduce <= 0) break;

        const eventQty = parseFloat(event.qty || 0);
        if (eventQty <= remainingToReduce) {
          // Delete entire event
          await connection.execute(`
            DELETE FROM tabWmsScanEvent
            WHERE id = ?
          `, [event.id]);
          remainingToReduce -= eventQty;
          eventsDeleted++;
        } else {
          // Reduce quantity in this event
          await connection.execute(`
            UPDATE tabWmsScanEvent
            SET qty = qty - ?
            WHERE id = ?
          `, [remainingToReduce, event.id]);
          remainingToReduce = 0;
        }
      }

      await connection.commit();
      return {
        ok: true,
        message: 'Quantity decreased',
        current_qty: currentTotalQty,
        new_qty: new_qty,
        events_deleted: eventsDeleted,
        qty_reduced: Math.abs(qtyDifference)
      };
    }
  } catch (error) {
    await connection.rollback();
    console.error('❌ Error updating packing event quantity:', error);
    throw error;
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}
