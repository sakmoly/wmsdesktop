// Script to create Material Request tables if they don't exist
// Run this before using Material Request APIs

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function createTables() {
    console.log('==========================================');
    console.log('Creating Material Request Tables');
    console.log('==========================================\n');

    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'root',
            database: process.env.DB_NAME || 'wms_desktop',
            multipleStatements: true
        });

        console.log(`✅ Connected to database: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '3306'}/${process.env.DB_NAME || 'wms_desktop'}\n`);

        const createTablesSQL = `
-- Material Request Table
CREATE TABLE IF NOT EXISTS tabMaterialRequest (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft',
  from_warehouse VARCHAR(100) NOT NULL,
  to_showroom VARCHAR(100) NOT NULL,
  requested_date DATE NOT NULL,
  required_date DATE NULL,
  requested_by VARCHAR(100) NOT NULL,
  total_requested_qty DECIMAL(10,2) DEFAULT 0,
  total_picked_qty DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_from_warehouse (from_warehouse),
  INDEX idx_to_showroom (to_showroom),
  INDEX idx_status (status),
  INDEX idx_required_date (required_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Material Request Item Table
CREATE TABLE IF NOT EXISTS tabMaterialRequestItem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  requested_qty DECIMAL(10,2) NOT NULL,
  picked_qty DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'Pending',
  pending_qty DECIMAL(10,2) AS (requested_qty - picked_qty) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  INDEX idx_status (status),
  FOREIGN KEY (parent_title) REFERENCES tabMaterialRequest(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

        await connection.query(createTablesSQL);
        console.log('✅ Tables created successfully!\n');

        // Verify tables exist
        const [mrTable] = await connection.execute(`
            SELECT COUNT(*) as count 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabMaterialRequest'
        `);
        
        const [mriTable] = await connection.execute(`
            SELECT COUNT(*) as count 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabMaterialRequestItem'
        `);

        console.log(`✅ tabMaterialRequest table: ${mrTable[0].count > 0 ? 'Exists' : 'Missing'}`);
        console.log(`✅ tabMaterialRequestItem table: ${mriTable[0].count > 0 ? 'Exists' : 'Missing'}`);

        await connection.end();
        console.log('\n✅ Setup completed successfully!');
        console.log('You can now use Material Request APIs.\n');

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        if (error.code) {
            console.error(`   Error code: ${error.code}`);
        }
        process.exit(1);
    }
}

createTables();

