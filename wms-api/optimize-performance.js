// Performance Optimization Script
// Adds missing indexes and optimizes queries

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  host: 'localhost',
  user: 'erppadmin',
  password: 'P61nt!',
  database: 'wms_desktop',
  multipleStatements: true
};

async function optimizePerformance() {
  let connection;
  
  try {
    console.log('');
    console.log('============================================================');
    console.log('Performance Optimization - Adding Indexes');
    console.log('============================================================');
    console.log('');
    
    connection = await mysql.createConnection(config);
    console.log('✅ Connected to database');
    console.log('');
    
    // Add composite indexes for performance
    const indexes = [
      {
        name: 'idx_carton_item_warehouse_status',
        sql: 'CREATE INDEX idx_carton_item_warehouse_status ON tabCartonStock(item_code, warehouse, status, qty, bin_location)',
        table: 'tabCartonStock'
      },
      {
        name: 'idx_carton_item_warehouse_bin_id',
        sql: 'CREATE INDEX idx_carton_item_warehouse_bin_id ON tabCartonStock(item_code, warehouse, bin_location, id DESC)',
        table: 'tabCartonStock'
      },
      {
        name: 'idx_location_warehouse_bin',
        sql: 'CREATE INDEX idx_location_warehouse_bin ON tabLocation(warehouse, bin_id, location_id)',
        table: 'tabLocation'
      },
      {
        name: 'idx_location_warehouse_rack',
        sql: 'CREATE INDEX idx_location_warehouse_rack ON tabLocation(warehouse, parent_rack, bin_id)',
        table: 'tabLocation'
      },
      {
        name: 'idx_history_date_desc',
        sql: 'CREATE INDEX idx_history_date_desc ON tabTransactionHistory(transaction_date DESC, id DESC)',
        table: 'tabTransactionHistory'
      },
      {
        name: 'idx_history_item_date',
        sql: 'CREATE INDEX idx_history_item_date ON tabTransactionHistory(item_code, transaction_date DESC, id DESC)',
        table: 'tabTransactionHistory'
      },
      {
        name: 'idx_history_warehouse_date',
        sql: 'CREATE INDEX idx_history_warehouse_date ON tabTransactionHistory(warehouse, transaction_date DESC, id DESC)',
        table: 'tabTransactionHistory'
      },
      {
        name: 'idx_history_type_date',
        sql: 'CREATE INDEX idx_history_type_date ON tabTransactionHistory(transaction_type, transaction_date DESC, id DESC)',
        table: 'tabTransactionHistory'
      }
    ];
    
    console.log('Creating composite indexes...');
    for (const idx of indexes) {
      try {
        await connection.query(idx.sql);
        console.log(`✅ Created index: ${idx.name} on ${idx.table}`);
      } catch (error) {
        if (error.message.includes('Duplicate key name') || error.message.includes('already exists')) {
          console.log(`⚠️  Index ${idx.name} already exists (skipped)`);
        } else {
          console.error(`❌ Error creating index ${idx.name}: ${error.message}`);
        }
      }
    }
    
    // Verify indexes
    console.log('');
    console.log('Verifying indexes...');
    const [indexList] = await connection.query(`
      SELECT 
        TABLE_NAME,
        INDEX_NAME,
        GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as COLUMNS
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('tabCartonStock', 'tabStockLedger', 'tabLocation', 'tabTransactionHistory')
        AND INDEX_NAME != 'PRIMARY'
      GROUP BY TABLE_NAME, INDEX_NAME
      ORDER BY TABLE_NAME, INDEX_NAME
    `);
    
    console.log('');
    console.log('Index Summary:');
    for (const idx of indexList) {
      console.log(`  ${idx.TABLE_NAME}.${idx.INDEX_NAME}: (${idx.COLUMNS})`);
    }
    
    console.log('');
    console.log('============================================================');
    console.log('✅ Performance Optimization Complete!');
    console.log('============================================================');
    console.log('');
    console.log('Next: Optimize API queries (see optimize-api-queries.js)');
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ Error optimizing performance:');
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
optimizePerformance()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
