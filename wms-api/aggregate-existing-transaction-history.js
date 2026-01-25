/**
 * Aggregate existing duplicate transaction history records
 * Groups by: item_code + location_id + carton_id + reference_doc + transaction_type + same day
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms'
};

async function aggregateExistingRecords() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    console.log('🔄 Aggregating existing duplicate transaction history records...\n');

    await connection.beginTransaction();

    // Step 1: Find duplicate groups
    console.log('Step 1: Finding duplicate groups...');
    const [duplicateGroups] = await connection.execute(`
      SELECT 
        item_code,
        COALESCE(location_id, bin_location) as location,
        carton_id,
        reference_doc,
        transaction_type,
        DATE(transaction_date) as transaction_date,
        COUNT(*) as record_count,
        MIN(id) as keep_id,
        GROUP_CONCAT(id ORDER BY id) as all_ids,
        SUM(qty_change) as total_qty_change,
        MIN(qty_before) as first_qty_before,
        MAX(qty_after) as last_qty_after,
        MIN(transaction_date) as first_transaction_date,
        MAX(transaction_date) as last_transaction_date
      FROM tabTransactionHistory
      WHERE transaction_type = 'Picking'
        AND reference_doc LIKE 'MR-%'
      GROUP BY 
        item_code,
        COALESCE(location_id, bin_location),
        carton_id,
        reference_doc,
        transaction_type,
        DATE(transaction_date)
      HAVING COUNT(*) > 1
      ORDER BY transaction_date DESC, reference_doc, item_code
    `);

    if (duplicateGroups.length === 0) {
      console.log('✅ No duplicate groups found. All records are already aggregated.\n');
      await connection.commit();
      return;
    }

    console.log(`Found ${duplicateGroups.length} duplicate group(s) to aggregate.\n`);

    let totalAggregated = 0;
    let totalDeleted = 0;

    // Step 2: Aggregate each group
    for (const group of duplicateGroups) {
      const keepId = group.keep_id;
      const allIds = group.all_ids.split(',').map(id => parseInt(id));
      const idsToDelete = allIds.filter(id => id !== keepId);

      console.log(`Processing group:`);
      console.log(`  Item: ${group.item_code}`);
      console.log(`  Location: ${group.location}`);
      console.log(`  Carton: ${group.carton_id || 'NULL'}`);
      console.log(`  Reference: ${group.reference_doc}`);
      console.log(`  Date: ${group.transaction_date}`);
      console.log(`  Records: ${group.record_count} (keeping ID ${keepId}, deleting ${idsToDelete.length})`);

      // Update the kept record with aggregated values
      await connection.execute(`
        UPDATE tabTransactionHistory
        SET qty_change = ?,
            qty_after = ?,
            transaction_date = ?,
            updated_at = NOW()
        WHERE id = ?
      `, [
        group.total_qty_change,
        group.last_qty_after,
        group.last_transaction_date, // Use latest transaction date
        keepId
      ]);

      // Delete duplicate records
      if (idsToDelete.length > 0) {
        const placeholders = idsToDelete.map(() => '?').join(',');
        const [result] = await connection.execute(
          `DELETE FROM tabTransactionHistory WHERE id IN (${placeholders})`,
          idsToDelete
        );
        totalDeleted += result.affectedRows;
      }

      totalAggregated++;
      console.log(`  ✅ Aggregated: qty_change = ${group.total_qty_change}, qty_after = ${group.last_qty_after}\n`);
    }

    await connection.commit();

    console.log('✅ Aggregation completed successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`  - Groups aggregated: ${totalAggregated}`);
    console.log(`  - Records deleted: ${totalDeleted}`);
    console.log(`  - Records kept: ${totalAggregated}`);

  } catch (error) {
    await connection.rollback();
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await connection.end();
  }
}

aggregateExistingRecords();
