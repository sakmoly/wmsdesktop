// Add tabTransferInCarton and tabTransferInCartonLine tables
// Supports multi-carton receiving for Transfer In

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

async function addCartonTables() {
  let connection;
  
  try {
    console.log('');
    console.log('============================================================');
    console.log('Adding Transfer In Carton tables');
    console.log('============================================================');
    console.log('');
    
    connection = await mysql.createConnection(config);
    console.log('✅ Connected to database');
    console.log('');
    
    // Check if tabTransferInCarton table exists
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInCarton'
    `);
    
    if (tables.length === 0) {
      console.log('📝 Creating tabTransferInCarton table...');
      await connection.execute(`
        CREATE TABLE tabTransferInCarton (
          name VARCHAR(255) PRIMARY KEY,
          carton_id VARCHAR(255) NOT NULL UNIQUE,
          transfer_in VARCHAR(100) NOT NULL,
          status VARCHAR(50) DEFAULT 'Draft',
          created_by VARCHAR(255) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          closed_by VARCHAR(255) NULL,
          closed_at TIMESTAMP NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_transfer_in (transfer_in),
          INDEX idx_carton_id (carton_id),
          INDEX idx_status (status),
          FOREIGN KEY (transfer_in) REFERENCES tabTransferIn(title) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ Created tabTransferInCarton table');
    } else {
      console.log('⚠️  tabTransferInCarton table already exists');
    }
    
    console.log('');
    
    // Check if tabTransferInCartonLine table exists
    const [lineTables] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInCartonLine'
    `);
    
    if (lineTables.length === 0) {
      console.log('📝 Creating tabTransferInCartonLine table...');
      await connection.execute(`
        CREATE TABLE tabTransferInCartonLine (
          name VARCHAR(255) PRIMARY KEY,
          transfer_in VARCHAR(100) NOT NULL,
          carton_id VARCHAR(255) NOT NULL,
          item_code VARCHAR(100) NOT NULL,
          received_qty DECIMAL(10,2) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_transfer_carton_item (transfer_in, carton_id, item_code),
          INDEX idx_transfer_in (transfer_in),
          INDEX idx_carton_id (carton_id),
          INDEX idx_item_code (item_code),
          FOREIGN KEY (transfer_in) REFERENCES tabTransferIn(title) ON DELETE CASCADE,
          FOREIGN KEY (carton_id) REFERENCES tabTransferInCarton(carton_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ Created tabTransferInCartonLine table');
    } else {
      console.log('⚠️  tabTransferInCartonLine table already exists');
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

addCartonTables();
