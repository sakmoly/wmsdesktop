/**
 * Check if putaway tasks have lines
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

async function checkPutawayLines() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    console.log('🔍 Checking Putaway Tasks and Lines...\n');

    // Check if box_id column exists
    const [boxIdCheck] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayTask' 
      AND COLUMN_NAME = 'box_id'
    `);
    const hasBoxId = boxIdCheck.length > 0;

    // Get all Open ASN tasks
    const boxIdSelect = hasBoxId ? 'pt.box_id,' : '';
    const [tasks] = await connection.execute(`
      SELECT 
        pt.title,
        pt.status,
        pt.source_type,
        pt.advance_shipping_notice,
        ${boxIdSelect}
        pt.created_at
      FROM tabPutawayTask pt
      WHERE pt.status = 'Open'
        AND COALESCE(pt.source_type, 'ASN') = 'ASN'
      ORDER BY pt.created_at DESC
    `);

    console.log(`📋 Found ${tasks.length} Open ASN Task(s):\n`);

    for (const task of tasks) {
      console.log(`Task: ${task.title}`);
      console.log(`  - Status: ${task.status}`);
      console.log(`  - Source Type: ${task.source_type || 'NULL'}`);
      console.log(`  - ASN: ${task.advance_shipping_notice || 'NULL'}`);
      if (hasBoxId) {
        console.log(`  - Box ID: ${task.box_id || 'NULL'}`);
      }

      // Get lines for this task
      const [lines] = await connection.execute(`
        SELECT 
          item_code,
          qty,
          carton_id,
          rack,
          bin
        FROM tabPutawayLine
        WHERE parent_title = ?
      `, [task.title]);

      console.log(`  - Lines: ${lines.length}`);
      if (lines.length > 0) {
        lines.forEach((line, idx) => {
          console.log(`    ${idx + 1}. ${line.item_code} - Qty: ${line.qty} (Carton: ${line.carton_id || 'N/A'})`);
        });
      } else {
        console.log(`    ⚠️  NO LINES - This task will not appear in mobile app!`);
      }
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await connection.end();
  }
}

checkPutawayLines();
