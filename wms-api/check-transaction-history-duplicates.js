/**
 * Check for duplicate transaction history records
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

async function checkDuplicates() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    console.log('🔍 Checking for duplicate transaction history records...\n');

    // Check for duplicates by transaction_id
    const [duplicatesById] = await connection.execute(`
      SELECT 
        transaction_id,
        COUNT(*) as count,
        GROUP_CONCAT(id ORDER BY id) as ids,
        GROUP_CONCAT(transaction_date ORDER BY id) as dates
      FROM tabTransactionHistory
      WHERE transaction_id IS NOT NULL
      GROUP BY transaction_id
      HAVING COUNT(*) > 1
      ORDER BY transaction_id DESC
      LIMIT 20
    `);

    if (duplicatesById.length > 0) {
      console.log(`⚠️  Found ${duplicatesById.length} transaction_id(s) with duplicates:\n`);
      duplicatesById.forEach(dup => {
        console.log(`  Transaction ID: ${dup.transaction_id}`);
        console.log(`    Count: ${dup.count}`);
        console.log(`    History IDs: ${dup.ids}`);
        console.log(`    Dates: ${dup.dates}`);
        console.log('');
      });
    } else {
      console.log('✅ No duplicates found by transaction_id.\n');
    }

    // Check for duplicates by reference_doc + item_code + location + qty_change + transaction_date
    const [duplicatesByFields] = await connection.execute(`
      SELECT 
        reference_doc,
        item_code,
        bin_location,
        qty_change,
        DATE(transaction_date) as transaction_date,
        COUNT(*) as count,
        GROUP_CONCAT(id ORDER BY id) as ids
      FROM tabTransactionHistory
      WHERE reference_doc IS NOT NULL
        AND item_code IS NOT NULL
        AND bin_location IS NOT NULL
      GROUP BY reference_doc, item_code, bin_location, qty_change, DATE(transaction_date)
      HAVING COUNT(*) > 1
      ORDER BY transaction_date DESC, reference_doc
      LIMIT 20
    `);

    if (duplicatesByFields.length > 0) {
      console.log(`⚠️  Found ${duplicatesByFields.length} record(s) with duplicate fields:\n`);
      duplicatesByFields.forEach(dup => {
        console.log(`  Reference: ${dup.reference_doc}`);
        console.log(`    Item: ${dup.item_code}`);
        console.log(`    Location: ${dup.bin_location}`);
        console.log(`    Qty Change: ${dup.qty_change}`);
        console.log(`    Date: ${dup.transaction_date}`);
        console.log(`    Count: ${dup.count}`);
        console.log(`    History IDs: ${dup.ids}`);
        console.log('');
      });
    } else {
      console.log('✅ No duplicates found by reference_doc + item_code + location + qty_change + date.\n');
    }

    // Summary
    const totalDuplicates = duplicatesById.length + duplicatesByFields.length;
    if (totalDuplicates > 0) {
      console.log(`\n📊 Summary: Found ${totalDuplicates} duplicate group(s).`);
      console.log('\n💡 To remove duplicates, you can:');
      console.log('   1. Keep the oldest record (lowest id)');
      console.log('   2. Keep the newest record (highest id)');
      console.log('   3. Manually review and delete specific records');
      console.log('\n⚠️  Note: This script only identifies duplicates. Use a separate script to remove them.');
    } else {
      console.log('\n✅ No duplicates found! Transaction history is clean.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await connection.end();
  }
}

checkDuplicates();
