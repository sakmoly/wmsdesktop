// Add warehouse column to tabPutawayTask
// This ensures warehouse is stored for putaway operations

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

async function addWarehouseColumn() {
  let connection;
  
  try {
    console.log('');
    console.log('============================================================');
    console.log('Adding warehouse column to tabPutawayTask');
    console.log('============================================================');
    console.log('');
    
    connection = await mysql.createConnection(config);
    console.log('✅ Connected to database');
    console.log('');
    
    // Check if warehouse column exists
    const [cols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabPutawayTask'
        AND COLUMN_NAME = 'warehouse'
    `);
    
    if (cols.length === 0) {
      console.log('📝 Adding warehouse column to tabPutawayTask...');
      await connection.execute(`
        ALTER TABLE tabPutawayTask
        ADD COLUMN warehouse VARCHAR(100) NULL,
        ADD INDEX idx_warehouse (warehouse)
      `);
      console.log('✅ Added warehouse column to tabPutawayTask');
      console.log('✅ Added index on warehouse column');
    } else {
      console.log('⚠️  warehouse column already exists in tabPutawayTask');
    }
    
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

addWarehouseColumn();
