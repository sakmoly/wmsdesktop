// Create dirty flag table using mysql2
import mysql from 'mysql2/promise';

const config = {
  host: 'localhost',
  user: 'erppadmin',
  password: 'P61nt!',
  database: 'wms_desktop',
  multipleStatements: true
};

async function createDirtyFlagTable() {
  let connection;
  
  try {
    console.log('');
    console.log('============================================================');
    console.log('Creating Dirty Flag Table for Self-Healing');
    console.log('============================================================');
    console.log('');
    
    connection = await mysql.createConnection(config);
    console.log('✅ Connected to database');
    
    // Check if table already exists
    const [existing] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabStockDirtyFlag'
    `);
    
    if (existing[0].count > 0) {
      console.log('⚠️  Table tabStockDirtyFlag already exists');
      console.log('   Dropping existing table...');
      await connection.execute('DROP TABLE IF EXISTS tabStockDirtyFlag');
      console.log('   ✅ Existing table dropped');
    }
    
    // Create table
    console.log('');
    console.log('Creating tabStockDirtyFlag table...');
    
    await connection.execute(`
      CREATE TABLE tabStockDirtyFlag (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        item_code VARCHAR(100) NOT NULL,
        warehouse VARCHAR(100) NOT NULL,
        marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reason VARCHAR(255) NULL,
        recalculated_at TIMESTAMP NULL,
        recalculated_count INT DEFAULT 0,
        UNIQUE KEY uk_item_warehouse (item_code, warehouse),
        INDEX idx_marked_at (marked_at),
        INDEX idx_recalculated_at (recalculated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('✅ Table created successfully');
    
    // Add comment
    await connection.execute(`
      ALTER TABLE tabStockDirtyFlag 
      COMMENT = 'Tracks items that need stock recalculation due to discrepancies'
    `);
    
    console.log('✅ Table comment added');
    
    // Verify table structure
    console.log('');
    console.log('Verifying table structure...');
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabStockDirtyFlag'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('');
    console.log('Table Structure:');
    console.log('----------------');
    columns.forEach(col => {
      const nullable = col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultVal = col.COLUMN_DEFAULT ? `DEFAULT ${col.COLUMN_DEFAULT}` : '';
      console.log(`  ${col.COLUMN_NAME.padEnd(20)} ${col.DATA_TYPE.padEnd(15)} ${nullable.padEnd(8)} ${defaultVal}`);
    });
    
    // Check indexes
    const [indexes] = await connection.execute(`
      SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabStockDirtyFlag'
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `);
    
    console.log('');
    console.log('Indexes:');
    console.log('--------');
    indexes.forEach(idx => {
      const unique = idx.NON_UNIQUE === 0 ? 'UNIQUE' : 'NON-UNIQUE';
      console.log(`  ${idx.INDEX_NAME.padEnd(20)} ${idx.COLUMN_NAME.padEnd(20)} ${unique}`);
    });
    
    console.log('');
    console.log('============================================================');
    console.log('✅ Dirty Flag Table Created Successfully!');
    console.log('============================================================');
    console.log('');
    console.log('The self-healing mechanism is now active.');
    console.log('Items with stock discrepancies will be automatically');
    console.log('recalculated on the next transaction in the same warehouse.');
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ Error creating dirty flag table:');
    console.error(`   ${error.message}`);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('✅ Database connection closed');
    }
  }
}

// Run the script
createDirtyFlagTable()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
