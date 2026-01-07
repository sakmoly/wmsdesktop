// Add dispatched_by column to tabTransferCarton
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function addDispatchedByColumn() {
  console.log('==========================================');
  console.log('Adding dispatched_by column to tabTransferCarton');
  console.log('==========================================\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'wms_desktop'
  });

  try {
    // Check if column already exists
    const [rows] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabTransferCarton'
      AND COLUMN_NAME = 'dispatched_by';
    `);

    if (rows.length === 0) {
      console.log('Adding dispatched_by column to tabTransferCarton...');
      await connection.execute(`
        ALTER TABLE tabTransferCarton
        ADD COLUMN dispatched_by VARCHAR(100) NULL AFTER sealed_on;
      `);
      console.log('✅ dispatched_by column added successfully.');
    } else {
      console.log('ℹ️  dispatched_by column already exists. Skipping migration.');
    }

    // Verify
    const [cols] = await connection.execute('DESCRIBE tabTransferCarton');
    const hasDispatchedBy = cols.some(col => col.Field === 'dispatched_by');
    console.log(`\nVerification: dispatched_by column exists: ${hasDispatchedBy}`);

    console.log('\n==========================================');
    console.log('Migration complete.');
    console.log('==========================================');
  } catch (error) {
    console.error('❌ Error during migration:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

addDispatchedByColumn()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

