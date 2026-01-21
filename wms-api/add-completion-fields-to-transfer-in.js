// Add completion fields to tabTransferIn
// Fields: completed_at, completed_by, is_completed

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

async function addCompletionFields() {
  let connection;
  
  try {
    console.log('');
    console.log('============================================================');
    console.log('Adding completion fields to tabTransferIn');
    console.log('============================================================');
    console.log('');
    
    connection = await mysql.createConnection(config);
    console.log('✅ Connected to database');
    console.log('');
    
    // Check if columns already exist
    const [existingCols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferIn'
        AND COLUMN_NAME IN ('completed_at', 'completed_by', 'is_completed')
    `);
    
    const existingColNames = existingCols.map(row => row.COLUMN_NAME);
    const columnsToAdd = [];
    
    if (!existingColNames.includes('completed_at')) {
      columnsToAdd.push("ADD COLUMN completed_at DATETIME NULL");
    }
    
    if (!existingColNames.includes('completed_by')) {
      columnsToAdd.push("ADD COLUMN completed_by VARCHAR(255) NULL");
    }
    
    if (!existingColNames.includes('is_completed')) {
      columnsToAdd.push("ADD COLUMN is_completed TINYINT DEFAULT 0");
    }
    
    if (columnsToAdd.length > 0) {
      console.log('📝 Adding completion fields to tabTransferIn...');
      await connection.execute(`
        ALTER TABLE tabTransferIn
        ${columnsToAdd.join(',\n        ')}
      `);
      console.log(`✅ Added ${columnsToAdd.length} field(s)`);
    } else {
      console.log('⚠️  All completion fields already exist in tabTransferIn');
      console.log('   Skipping field addition...');
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

addCompletionFields();
