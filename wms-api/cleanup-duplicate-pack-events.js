// Cleanup script to remove duplicate PACK_BOX_TO_TC events
// This script keeps only the earliest event for each unique combination of:
// tc_id + box_id + item_code + qty

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms_db',
};

async function cleanupDuplicatePackEvents() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    console.log('🔍 Finding duplicate PACK_BOX_TO_TC events...\n');

    // Find all duplicate events (same tc_id, box_id, item_code, qty)
    const [duplicates] = await connection.execute(`
      SELECT 
        tc_id,
        box_id,
        item_code,
        qty,
        COUNT(*) as event_count,
        GROUP_CONCAT(id ORDER BY event_time ASC SEPARATOR ',') as event_ids,
        GROUP_CONCAT(offline_uuid ORDER BY event_time ASC SEPARATOR ',') as offline_uuids,
        MIN(event_time) as earliest_event_time
      FROM tabWmsScanEvent
      WHERE event_type = 'PACK_BOX_TO_TC'
        AND tc_id IS NOT NULL
        AND box_id IS NOT NULL
        AND item_code IS NOT NULL
        AND qty IS NOT NULL
      GROUP BY tc_id, box_id, item_code, qty
      HAVING COUNT(*) > 1
      ORDER BY tc_id, box_id, item_code
    `);

    if (duplicates.length === 0) {
      console.log('✅ No duplicate PACK_BOX_TO_TC events found!');
      return;
    }

    console.log(`Found ${duplicates.length} sets of duplicate events:\n`);

    let totalDeleted = 0;

    for (const dup of duplicates) {
      const eventIds = dup.event_ids.split(',');
      const offlineUuids = dup.offline_uuids.split(',');
      
      // Keep the first event (earliest), delete the rest
      const keepEventId = eventIds[0];
      const deleteEventIds = eventIds.slice(1);

      console.log(`📦 Transfer Carton: ${dup.tc_id}`);
      console.log(`   Box: ${dup.box_id}`);
      console.log(`   Item: ${dup.item_code}`);
      console.log(`   Quantity: ${dup.qty}`);
      console.log(`   Duplicate count: ${dup.event_count}`);
      console.log(`   Keeping event ID: ${keepEventId} (offline_uuid: ${offlineUuids[0]})`);
      console.log(`   Deleting event IDs: ${deleteEventIds.join(', ')}`);

      // Delete duplicate events
      const placeholders = deleteEventIds.map(() => '?').join(',');
      const [deleteResult] = await connection.execute(
        `DELETE FROM tabWmsScanEvent WHERE id IN (${placeholders})`,
        deleteEventIds
      );

      totalDeleted += deleteResult.affectedRows;
      console.log(`   ✅ Deleted ${deleteResult.affectedRows} duplicate event(s)\n`);
    }

    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Total duplicate sets: ${duplicates.length}`);
    console.log(`   Total events deleted: ${totalDeleted}`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

// Run cleanup
cleanupDuplicatePackEvents()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

