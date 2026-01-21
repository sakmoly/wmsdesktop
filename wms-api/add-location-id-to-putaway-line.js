// Add location_id column to tabPutawayLine and tabPutawayTask
// This ensures location can be stored for putaway operations

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

async function addLocationIdColumns() {
  let connection;
  
  try {
    console.log('');
    console.log('============================================================');
    console.log('Adding location_id column to tabPutawayLine and tabPutawayTask');
    console.log('============================================================');
    console.log('');
    
    connection = await mysql.createConnection(config);
    console.log('✅ Connected to database');
    console.log('');
    
    // Check if location_id column exists in tabPutawayLine
    const [lineCols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabPutawayLine'
        AND COLUMN_NAME = 'location_id'
    `);
    
    if (lineCols.length === 0) {
      console.log('📝 Adding location_id column to tabPutawayLine...');
      await connection.execute(`
        ALTER TABLE tabPutawayLine
        ADD COLUMN location_id VARCHAR(100) NULL AFTER bin,
        ADD INDEX idx_location_id (location_id)
      `);
      console.log('✅ Added location_id column to tabPutawayLine');
    } else {
      console.log('⚠️  location_id column already exists in tabPutawayLine');
    }
    
    console.log('');
    
    // Check if location_id column exists in tabPutawayTask
    const [taskCols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabPutawayTask'
        AND COLUMN_NAME = 'location_id'
    `);
    
    if (taskCols.length === 0) {
      console.log('📝 Adding location_id column to tabPutawayTask...');
      await connection.execute(`
        ALTER TABLE tabPutawayTask
        ADD COLUMN location_id VARCHAR(100) NULL,
        ADD INDEX idx_location_id (location_id)
      `);
      console.log('✅ Added location_id column to tabPutawayTask');
    } else {
      console.log('⚠️  location_id column already exists in tabPutawayTask');
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

addLocationIdColumns();
