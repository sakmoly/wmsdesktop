// Add status column to tabTransferInItem
// Status values: Pending, Picking, Received

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms_db',
};

async function addStatusColumn() {
  let connection;
  
  try {
    console.log('');
    console.log('============================================================');
    console.log('Adding status column to tabTransferInItem');
    console.log('============================================================');
    console.log('');
    
    connection = await mysql.createConnection(config);
    console.log('✅ Connected to database');
    console.log('');
    
    // Check if column already exists
    const [existingCols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInItem'
        AND COLUMN_NAME = 'status'
    `);
    
    if (existingCols.length > 0) {
      console.log('⚠️  status column already exists in tabTransferInItem');
      console.log('   Skipping column addition...');
    } else {
      // Add status column
      console.log('📝 Adding status column to tabTransferInItem...');
      await connection.execute(`
        ALTER TABLE tabTransferInItem
        ADD COLUMN status VARCHAR(50) DEFAULT 'Pending' AFTER received_qty,
        ADD INDEX idx_status (status)
      `);
      console.log('✅ Added status column with default value "Pending"');
      console.log('✅ Added index on status column');
    }
    
    console.log('');
    console.log('📊 Updating existing records based on received_qty...');
    
    // Update status based on received_qty
    // Pending: received_qty = 0
    // Picking: 0 < received_qty < qty
    // Received: received_qty >= qty
    
    const [updateResult] = await connection.execute(`
      UPDATE tabTransferInItem
      SET status = CASE
        WHEN received_qty >= qty AND qty > 0 THEN 'Received'
        WHEN received_qty > 0 THEN 'Picking'
        ELSE 'Pending'
      END
      WHERE status IS NULL OR status = 'Pending'
    `);
    
    console.log(`✅ Updated ${updateResult.affectedRows} record(s)`);
    console.log('');
    
    // Show summary
    const [statusSummary] = await connection.execute(`
      SELECT status, COUNT(*) as count
      FROM tabTransferInItem
      GROUP BY status
      ORDER BY status
    `);
    
    console.log('📊 Status Summary:');
    statusSummary.forEach(row => {
      console.log(`   ${row.status}: ${row.count} item(s)`);
    });
    
    console.log('');
    console.log('✅ Migration completed successfully!');
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

addStatusColumn();
