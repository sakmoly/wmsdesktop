// Add relocation tables and enhance transaction history
// Supports relocation/bin transfer feature

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

async function addRelocationTables() {
  let connection;
  
  try {
    console.log('');
    console.log('============================================================');
    console.log('Adding Relocation tables and enhancing Transaction History');
    console.log('============================================================');
    console.log('');
    
    connection = await mysql.createConnection(config);
    console.log('✅ Connected to database');
    console.log('');
    
    // 1. Create tabRelocationSession table
    console.log('📝 Creating tabRelocationSession table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tabRelocationSession (
        session_id VARCHAR(100) PRIMARY KEY,
        mode VARCHAR(50) NOT NULL COMMENT 'FULL_CARTON | PARTIAL_ITEMS | CARTON_TO_CARTON',
        policy VARCHAR(50) NOT NULL COMMENT 'BLIND | VERIFIED',
        warehouse_id VARCHAR(100) NOT NULL,
        from_bin VARCHAR(100) NULL,
        from_carton VARCHAR(100) NULL,
        to_bin VARCHAR(100) NULL,
        to_carton VARCHAR(100) NULL,
        status VARCHAR(50) DEFAULT 'IN_PROGRESS' COMMENT 'IN_PROGRESS | COMPLETED | CANCELLED',
        created_by VARCHAR(255) NULL,
        device_id VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_warehouse (warehouse_id),
        INDEX idx_from_carton (from_carton),
        INDEX idx_to_carton (to_carton)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Created tabRelocationSession table');
    console.log('');
    
    // 2. Create tabRelocationLine table
    console.log('📝 Creating tabRelocationLine table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tabRelocationLine (
        line_id BIGINT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(100) NOT NULL,
        item_code VARCHAR(100) NOT NULL,
        qty_moved DECIMAL(10,2) NOT NULL,
        barcode VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES tabRelocationSession(session_id) ON DELETE CASCADE,
        INDEX idx_session (session_id),
        INDEX idx_item (item_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Created tabRelocationLine table');
    console.log('');
    
    // 3. Create tabStockDirty table
    console.log('📝 Creating tabStockDirty table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tabStockDirty (
        warehouse_id VARCHAR(100) NOT NULL,
        item_code VARCHAR(100) NOT NULL,
        dirty_reason VARCHAR(255) NULL,
        marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (warehouse_id, item_code),
        INDEX idx_marked_at (marked_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Created tabStockDirty table');
    console.log('');
    
    // 4. Enhance tabStockTransaction with from_carton and to_carton
    console.log('📝 Enhancing tabStockTransaction table...');
    
    // Check if from_carton column exists
    const [fromCartonCols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabStockTransaction'
        AND COLUMN_NAME = 'from_carton'
    `);
    
    if (fromCartonCols.length === 0) {
      // Find position after carton_id
      const [cartonIdCols] = await connection.execute(`
        SELECT ORDINAL_POSITION
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabStockTransaction'
          AND COLUMN_NAME = 'carton_id'
      `);
      
      if (cartonIdCols.length > 0) {
        await connection.execute(`
          ALTER TABLE tabStockTransaction
          ADD COLUMN from_carton VARCHAR(100) NULL AFTER carton_id
        `);
        console.log('✅ Added from_carton column to tabStockTransaction');
      } else {
        // If carton_id doesn't exist, add after bin_location
        await connection.execute(`
          ALTER TABLE tabStockTransaction
          ADD COLUMN from_carton VARCHAR(100) NULL AFTER bin_location
        `);
        console.log('✅ Added from_carton column to tabStockTransaction');
      }
    } else {
      console.log('⚠️  from_carton column already exists in tabStockTransaction');
    }
    
    // Check if to_carton column exists
    const [toCartonCols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabStockTransaction'
        AND COLUMN_NAME = 'to_carton'
    `);
    
    if (toCartonCols.length === 0) {
      await connection.execute(`
        ALTER TABLE tabStockTransaction
        ADD COLUMN to_carton VARCHAR(100) NULL AFTER from_carton
      `);
      console.log('✅ Added to_carton column to tabStockTransaction');
    } else {
      console.log('⚠️  to_carton column already exists in tabStockTransaction');
    }
    
    // Add indexes for carton fields
    try {
      await connection.execute(`
        CREATE INDEX idx_from_carton ON tabStockTransaction(from_carton)
      `);
      console.log('✅ Added index on from_carton');
    } catch (err) {
      if (!err.message.includes('Duplicate key name')) {
        throw err;
      }
      console.log('⚠️  Index on from_carton already exists');
    }
    
    try {
      await connection.execute(`
        CREATE INDEX idx_to_carton ON tabStockTransaction(to_carton)
      `);
      console.log('✅ Added index on to_carton');
    } catch (err) {
      if (!err.message.includes('Duplicate key name')) {
        throw err;
      }
      console.log('⚠️  Index on to_carton already exists');
    }
    
    console.log('');
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('📋 Summary:');
    console.log('   - tabRelocationSession: Created');
    console.log('   - tabRelocationLine: Created');
    console.log('   - tabStockDirty: Created');
    console.log('   - tabStockTransaction: Enhanced with from_carton/to_carton');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('');
      console.log('🔌 Database connection closed');
    }
  }
}

// Run migration
addRelocationTables()
  .then(() => {
    console.log('');
    console.log('✅ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration error:', error);
    process.exit(1);
  });
