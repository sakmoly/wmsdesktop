// wms-api/add-source-type-transfer-in-to-putaway-task.js
// Migration script to add source_type and transfer_in columns to tabPutawayTask

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function addSourceTypeAndTransferInColumns() {
  console.log('==========================================');
  console.log('Adding source_type and transfer_in columns to tabPutawayTask');
  console.log('==========================================\n');

  let connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'wms_desktop',
      multipleStatements: true
    });

    console.log(`✅ Connected to database: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '3306'}/${process.env.DB_NAME || 'wms_desktop'}\n`);

    // Check if source_type column already exists
    const [sourceTypeRows] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabPutawayTask'
      AND COLUMN_NAME = 'source_type';
    `);

    if (sourceTypeRows.length === 0) {
      console.log('Adding source_type column to tabPutawayTask...');
      await connection.execute(`
        ALTER TABLE tabPutawayTask
        ADD COLUMN source_type VARCHAR(50) NULL AFTER status,
        ADD INDEX idx_source_type (source_type);
      `);
      console.log('✅ source_type column added to tabPutawayTask.');

      // Set default value for existing records (assume all existing tasks are ASN)
      console.log('Setting default source_type = "ASN" for existing records...');
      await connection.execute(`
        UPDATE tabPutawayTask
        SET source_type = 'ASN'
        WHERE source_type IS NULL;
      `);
      console.log('✅ Existing records updated with source_type = "ASN".');
    } else {
      console.log('ℹ️  source_type column already exists in tabPutawayTask. Skipping.');
    }

    // Check if transfer_in column already exists
    const [transferInRows] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabPutawayTask'
      AND COLUMN_NAME = 'transfer_in';
    `);

    if (transferInRows.length === 0) {
      console.log('Adding transfer_in column to tabPutawayTask...');
      await connection.execute(`
        ALTER TABLE tabPutawayTask
        ADD COLUMN transfer_in VARCHAR(100) NULL AFTER source_type,
        ADD INDEX idx_transfer_in (transfer_in);
      `);
      console.log('✅ transfer_in column added to tabPutawayTask.');
    } else {
      console.log('ℹ️  transfer_in column already exists in tabPutawayTask. Skipping.');
    }

    await connection.end();
    console.log('\n==========================================');
    console.log('Migration complete.');
    console.log('==========================================');

  } catch (error) {
    console.error('❌ Error during migration:', error);
    if (connection) {
      await connection.end();
    }
    process.exit(1);
  }
}

addSourceTypeAndTransferInColumns();

