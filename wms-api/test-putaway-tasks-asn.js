/**
 * Test Putaway Tasks API for ASN tasks
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

async function testPutawayTasks() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    console.log('🔍 Checking Open ASN Putaway Tasks...\n');

    // Check if source_type column exists
    const [columnCheck] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayTask' 
      AND COLUMN_NAME = 'source_type'
    `);

    const hasSourceType = columnCheck.length > 0;
    console.log(`source_type column exists: ${hasSourceType}\n`);

    // Get all Open tasks
    const [allOpenTasks] = await connection.execute(`
      SELECT 
        title,
        status,
        ${hasSourceType ? 'source_type,' : ''}
        advance_shipping_notice,
        created_at
      FROM tabPutawayTask
      WHERE status = 'Open'
      ORDER BY created_at DESC
    `);

    console.log(`📋 All Open Tasks (${allOpenTasks.length}):\n`);
    allOpenTasks.forEach((task, index) => {
      console.log(`  ${index + 1}. ${task.title}`);
      console.log(`     - Status: ${task.status}`);
      if (hasSourceType) {
        console.log(`     - Source Type: ${task.source_type || 'NULL'}`);
      }
      console.log(`     - ASN: ${task.advance_shipping_notice || 'NULL'}`);
      console.log(`     - Created: ${task.created_at}`);
      console.log('');
    });

    // Get Open ASN tasks (with source_type = 'ASN' or advance_shipping_notice IS NOT NULL)
    if (hasSourceType) {
      const [asnTasks] = await connection.execute(`
        SELECT 
          title,
          status,
          source_type,
          advance_shipping_notice,
          created_at
        FROM tabPutawayTask
        WHERE status = 'Open'
          AND (
            source_type = 'ASN'
            OR (source_type IS NULL AND advance_shipping_notice IS NOT NULL)
            OR advance_shipping_notice IS NOT NULL
          )
        ORDER BY created_at DESC
      `);

      console.log(`\n📋 Open ASN Tasks (${asnTasks.length}):\n`);
      asnTasks.forEach((task, index) => {
        console.log(`  ${index + 1}. ${task.title}`);
        console.log(`     - Status: ${task.status}`);
        console.log(`     - Source Type: ${task.source_type || 'NULL'}`);
        console.log(`     - ASN: ${task.advance_shipping_notice || 'NULL'}`);
        console.log(`     - Created: ${task.created_at}`);
        console.log('');
      });

      // Test the query that mobile app would use (with source_type filter)
      const [filteredTasks] = await connection.execute(`
        SELECT 
          title,
          status,
          source_type,
          advance_shipping_notice
        FROM tabPutawayTask
        WHERE status = 'Open'
          AND COALESCE(source_type, 'ASN') = 'ASN'
        ORDER BY created_at DESC
      `);

      console.log(`\n📋 Tasks matching: status='Open' AND source_type='ASN' (${filteredTasks.length}):\n`);
      filteredTasks.forEach((task, index) => {
        console.log(`  ${index + 1}. ${task.title}`);
        console.log(`     - Status: ${task.status}`);
        console.log(`     - Source Type: ${task.source_type || 'NULL'}`);
        console.log(`     - ASN: ${task.advance_shipping_notice || 'NULL'}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await connection.end();
  }
}

testPutawayTasks();
