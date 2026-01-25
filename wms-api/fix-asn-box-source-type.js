/**
 * Fix ASN Box Putaway Tasks - Update source_type from 'Box' to 'ASN'
 * 
 * This script updates existing putaway tasks that were created from ASN boxes
 * to have source_type = 'ASN' instead of 'Box', so they appear in the mobile app.
 * 
 * Run: node fix-asn-box-source-type.js
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

async function fixAsnBoxSourceType() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    console.log('🔍 Checking for putaway tasks with source_type = "Box" and advance_shipping_notice...\n');

    // Check if source_type column exists
    const [columnCheck] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayTask' 
      AND COLUMN_NAME = 'source_type'
    `);

    if (columnCheck.length === 0) {
      console.log('⚠️  source_type column does not exist in tabPutawayTask. Skipping update.');
      return;
    }

    // Check if box_id column exists
    const [boxIdCheck] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayTask' 
      AND COLUMN_NAME = 'box_id'
    `);
    const hasBoxId = boxIdCheck.length > 0;

    // Find tasks with source_type = 'Box' and advance_shipping_notice IS NOT NULL
    const boxIdSelect = hasBoxId ? 'box_id,' : '';
    const [tasks] = await connection.execute(`
      SELECT 
        title,
        source_type,
        advance_shipping_notice,
        ${boxIdSelect}
        status,
        created_at
      FROM tabPutawayTask
      WHERE source_type = 'Box'
        AND advance_shipping_notice IS NOT NULL
        AND advance_shipping_notice != ''
      ORDER BY created_at DESC
    `);

    if (tasks.length === 0) {
      console.log('✅ No tasks found with source_type = "Box" and advance_shipping_notice. All tasks are already correct.');
      return;
    }

    console.log(`📋 Found ${tasks.length} task(s) to update:\n`);
    tasks.forEach((task, index) => {
      console.log(`  ${index + 1}. ${task.title}`);
      console.log(`     - ASN: ${task.advance_shipping_notice}`);
      if (hasBoxId) {
        console.log(`     - Box ID: ${task.box_id || 'N/A'}`);
      }
      console.log(`     - Status: ${task.status}`);
      console.log(`     - Created: ${task.created_at}`);
      console.log('');
    });

    // Update tasks
    console.log('🔄 Updating tasks...\n');

    for (const task of tasks) {
      await connection.execute(`
        UPDATE tabPutawayTask
        SET source_type = 'ASN',
            updated_at = NOW()
        WHERE title = ?
      `, [task.title]);

      console.log(`  ✅ Updated ${task.title} (ASN: ${task.advance_shipping_notice})`);
    }

    console.log(`\n✅ Successfully updated ${tasks.length} task(s)!\n`);

    // Verify update
    const [verifyTasks] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM tabPutawayTask
      WHERE source_type = 'Box'
        AND advance_shipping_notice IS NOT NULL
        AND advance_shipping_notice != ''
    `);

    if (verifyTasks[0].count === 0) {
      console.log('✅ Verification: All ASN box tasks now have source_type = "ASN"');
    } else {
      console.log(`⚠️  Warning: ${verifyTasks[0].count} task(s) still have source_type = "Box"`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

// Run the script
fixAsnBoxSourceType()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
