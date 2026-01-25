/**
 * Remove duplicate transaction history records
 * Keeps the oldest record (lowest id) for each duplicate group
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

async function removeDuplicates() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    console.log('🧹 Removing duplicate transaction history records...\n');

    await connection.beginTransaction();

    // First, check for duplicates by transaction_id (most reliable)
    const [duplicatesById] = await connection.execute(`
      SELECT 
        transaction_id,
        MIN(id) as keep_id,
        GROUP_CONCAT(id ORDER BY id) as all_ids
      FROM tabTransactionHistory
      WHERE transaction_id IS NOT NULL
      GROUP BY transaction_id
      HAVING COUNT(*) > 1
    `);

    let deletedById = 0;
    if (duplicatesById.length > 0) {
      console.log(`Found ${duplicatesById.length} duplicate group(s) by transaction_id:\n`);
      for (const dup of duplicatesById) {
        const idsToDelete = dup.all_ids.split(',').filter(id => id != dup.keep_id);
        if (idsToDelete.length > 0) {
          const [result] = await connection.execute(
            `DELETE FROM tabTransactionHistory WHERE id IN (${idsToDelete.join(',')})`
          );
          deletedById += result.affectedRows;
          console.log(`  Transaction ID ${dup.transaction_id}: Keeping ID ${dup.keep_id}, deleted ${result.affectedRows} duplicate(s)`);
        }
      }
      console.log('');
    }

    // Then, check for duplicates by reference_doc + item_code + location + qty_change + transaction_date
    const [duplicatesByFields] = await connection.execute(`
      SELECT 
        reference_doc,
        item_code,
        bin_location,
        qty_change,
        DATE(transaction_date) as transaction_date,
        MIN(id) as keep_id,
        GROUP_CONCAT(id ORDER BY id) as all_ids,
        COUNT(*) as count
      FROM tabTransactionHistory
      WHERE reference_doc IS NOT NULL
        AND item_code IS NOT NULL
        AND bin_location IS NOT NULL
      GROUP BY reference_doc, item_code, bin_location, qty_change, DATE(transaction_date)
      HAVING COUNT(*) > 1
    `);

    let deletedByFields = 0;
    if (duplicatesByFields.length > 0) {
      console.log(`Found ${duplicatesByFields.length} duplicate group(s) by fields:\n`);
      for (const dup of duplicatesByFields) {
        const idsToDelete = dup.all_ids.split(',').filter(id => id != dup.keep_id);
        if (idsToDelete.length > 0) {
          const [result] = await connection.execute(
            `DELETE FROM tabTransactionHistory WHERE id IN (${idsToDelete.join(',')})`
          );
          deletedByFields += result.affectedRows;
          console.log(`  ${dup.reference_doc} - ${dup.item_code} @ ${dup.bin_location}: Keeping ID ${dup.keep_id}, deleted ${result.affectedRows} duplicate(s)`);
        }
      }
      console.log('');
    }

    const totalDeleted = deletedById + deletedByFields;

    if (totalDeleted > 0) {
      await connection.commit();
      console.log(`✅ Successfully removed ${totalDeleted} duplicate record(s)!`);
      console.log(`   - Removed by transaction_id: ${deletedById}`);
      console.log(`   - Removed by fields: ${deletedByFields}`);
    } else {
      await connection.rollback();
      console.log('✅ No duplicates found. Transaction history is clean.');
    }

  } catch (error) {
    await connection.rollback();
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await connection.end();
  }
}

removeDuplicates();
