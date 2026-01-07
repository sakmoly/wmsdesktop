// Update Transfer Order Item quantities from scan events
// This function updates sorted_qty and packed_qty based on SORT_TO_BOX and PACK_BOX_TO_TC events

import { getConnection } from '../../db/connection.js';

/**
 * Update sorted_qty and packed_qty for Transfer Order Items based on scan events
 * @param {string} transferOrderTitle - Transfer Order title (e.g., "TO-0002")
 * @param {object} connection - Database connection (optional, will create if not provided)
 */
export async function updateTransferOrderQuantities(transferOrderTitle, connection = null) {
  const shouldReleaseConnection = !connection;
  if (!connection) {
    connection = await getConnection();
  }

  try {
    console.log(`🔄 Updating Transfer Order quantities for ${transferOrderTitle}`);

    // Get all Transfer Order Items for this TO
    const [toItems] = await connection.execute(`
      SELECT 
        store,
        item_code,
        allocated_qty
      FROM tabTransferOrderItem
      WHERE parent_title = ?
    `, [transferOrderTitle]);

    if (toItems.length === 0) {
      console.log(`⚠️  No Transfer Order Items found for ${transferOrderTitle}`);
      return;
    }

    // Get the ASN for this Transfer Order
    const [toHeader] = await connection.execute(`
      SELECT advance_shipping_notice
      FROM tabTransferOrder
      WHERE title = ?
    `, [transferOrderTitle]);

    if (toHeader.length === 0) {
      console.log(`⚠️  Transfer Order ${transferOrderTitle} not found`);
      return;
    }

    const asnNo = toHeader[0].advance_shipping_notice;

    // Update each Transfer Order Item
    for (const toItem of toItems) {
      const { store, item_code, allocated_qty } = toItem;

      // Calculate sorted_qty from SORT_TO_BOX events
      // Match by: transfer_order, item_code, and optionally store (if available in event)
      // Note: store might not always be in the event, so we match by TO and item_code
      const [sortedEvents] = await connection.execute(`
        SELECT SUM(qty) as total_sorted
        FROM tabWmsScanEvent
        WHERE event_type = 'SORT_TO_BOX'
          AND transfer_order = ?
          AND item_code = ?
          AND qty IS NOT NULL
          AND (store = ? OR store IS NULL)
      `, [transferOrderTitle, item_code, store]);

      const sortedQty = parseFloat(sortedEvents[0]?.total_sorted || 0);

      // Calculate packed_qty from PACK_BOX_TO_TC events
      // Match by: transfer_order, item_code
      // Note: We match by TO and item_code only, as store might not be in the event
      const [packedEvents] = await connection.execute(`
        SELECT SUM(qty) as total_packed
        FROM tabWmsScanEvent
        WHERE event_type = 'PACK_BOX_TO_TC'
          AND transfer_order = ?
          AND item_code = ?
          AND qty IS NOT NULL
      `, [transferOrderTitle, item_code]);

      const packedQty = parseFloat(packedEvents[0]?.total_packed || 0);

      // Calculate pending_qty
      const pendingQty = Math.max(0, allocated_qty - packedQty);

      // Update the Transfer Order Item
      await connection.execute(`
        UPDATE tabTransferOrderItem
        SET 
          sorted_qty = ?,
          packed_qty = ?,
          pending_qty = ?,
          updated_at = NOW()
        WHERE parent_title = ?
          AND store = ?
          AND item_code = ?
      `, [sortedQty, packedQty, pendingQty, transferOrderTitle, store, item_code]);

      console.log(`  ✅ ${item_code} @ ${store}: Sorted=${sortedQty}, Packed=${packedQty}, Pending=${pendingQty}`);
    }

    console.log(`✅ Updated ${toItems.length} Transfer Order Item(s) for ${transferOrderTitle}`);

  } catch (error) {
    console.error(`❌ Error updating Transfer Order quantities for ${transferOrderTitle}:`, error);
    throw error;
  } finally {
    if (shouldReleaseConnection) {
      connection.release();
    }
  }
}

/**
 * Update all Transfer Order quantities (for all TOs)
 */
export async function updateAllTransferOrderQuantities() {
  const connection = await getConnection();

  try {
    const [allTOs] = await connection.execute(`
      SELECT title
      FROM tabTransferOrder
    `);

    console.log(`🔄 Updating quantities for ${allTOs.length} Transfer Order(s)`);

    for (const to of allTOs) {
      await updateTransferOrderQuantities(to.title, connection);
    }

    console.log(`✅ Updated all Transfer Order quantities`);
  } finally {
    connection.release();
  }
}

