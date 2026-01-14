// ============================================================
// Auto Run Transaction History Setup (Fixed Version)
// Run from wms-api directory: node setup-transaction-history-fixed.js
// ============================================================

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration
const DB_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'erppadmin',
  password: 'P61nt!',
  database: 'wms_desktop',
  multipleStatements: true
};

async function runSetup() {
  console.log('============================================================');
  console.log('Auto Setup Transaction History Table');
  console.log('============================================================');
  console.log('');
  
  console.log('Database Configuration:');
  console.log(`  Host: ${DB_CONFIG.host}`);
  console.log(`  Port: ${DB_CONFIG.port}`);
  console.log(`  Database: ${DB_CONFIG.database}`);
  console.log(`  User: ${DB_CONFIG.user}`);
  console.log('');

  let connection;
  
  try {
    // Connect to database
    console.log('Connecting to database...');
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✅ Connected to database');
    console.log('');

    // Step 1: Create table
    console.log('Step 1: Creating table...');
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS tabTransactionHistory (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        transaction_id BIGINT NOT NULL,
        transaction_number VARCHAR(100) NULL,
        transaction_date TIMESTAMP NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,
        reference_doc_type VARCHAR(100) NULL,
        reference_doc VARCHAR(100) NULL,
        wms_transaction_title VARCHAR(100) NULL,
        item_code VARCHAR(100) NOT NULL,
        item_name VARCHAR(255) NULL,
        warehouse VARCHAR(100) NOT NULL,
        warehouse_name VARCHAR(255) NULL,
        bin_location VARCHAR(100) NULL,
        location_id VARCHAR(100) NULL,
        source_bin VARCHAR(100) NULL,
        target_bin VARCHAR(100) NULL,
        carton_id VARCHAR(100) NULL,
        batch_no VARCHAR(100) NULL,
        serial_no VARCHAR(100) NULL,
        qty_change DECIMAL(10,2) NOT NULL,
        qty_before DECIMAL(10,2) NOT NULL,
        qty_after DECIMAL(10,2) NOT NULL,
        uom VARCHAR(50) NULL,
        stock_direction VARCHAR(20) GENERATED ALWAYS AS (
          CASE 
            WHEN qty_change > 0 THEN 'IN'
            WHEN qty_change < 0 THEN 'OUT'
            ELSE 'ADJUSTMENT'
          END
        ) STORED,
        performed_by VARCHAR(100) NULL,
        performed_by_name VARCHAR(255) NULL,
        notes TEXT NULL,
        reason_code VARCHAR(50) NULL,
        status VARCHAR(50) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_transaction_id (transaction_id),
        INDEX idx_transaction_number (transaction_number),
        INDEX idx_transaction_date (transaction_date),
        INDEX idx_transaction_type (transaction_type),
        INDEX idx_reference_doc (reference_doc),
        INDEX idx_item_code (item_code),
        INDEX idx_warehouse (warehouse),
        INDEX idx_bin_location (bin_location),
        INDEX idx_carton_id (carton_id),
        INDEX idx_performed_by (performed_by),
        INDEX idx_stock_direction (stock_direction),
        INDEX idx_item_warehouse_date (item_code, warehouse, transaction_date),
        INDEX idx_carton_item_date (carton_id, item_code, transaction_date),
        INDEX idx_location_item_date (bin_location, item_code, transaction_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='Transaction History - Complete audit trail of all stock movements';
    `;
    await connection.query(createTableSQL);
    console.log('✅ Step 1: Table created');
    console.log('');

    // Step 2: Drop existing trigger
    console.log('Step 2: Dropping existing trigger (if any)...');
    await connection.query('DROP TRIGGER IF EXISTS trg_log_transaction_history_insert');
    console.log('✅ Step 2: Existing trigger dropped (if any)');
    console.log('');

    // Step 3: Create trigger (without DELIMITER)
    console.log('Step 3: Creating trigger...');
    const createTriggerSQL = `
      CREATE TRIGGER trg_log_transaction_history_insert
      AFTER INSERT ON tabStockTransaction
      FOR EACH ROW
      BEGIN
        DECLARE v_transaction_number VARCHAR(100);
        DECLARE v_item_name VARCHAR(255) DEFAULT NULL;
        DECLARE v_warehouse_name VARCHAR(255) DEFAULT NULL;
        DECLARE v_user_name VARCHAR(255) DEFAULT NULL;
        DECLARE v_carton_id VARCHAR(100) DEFAULT NULL;
        
        SET v_transaction_number = CONCAT('TXN-', DATE_FORMAT(NEW.transaction_date, '%Y%m%d'), '-', LPAD(NEW.id, 5, '0'));
        
        BEGIN
          DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_item_name = NULL;
          SELECT name INTO v_item_name FROM tabItem WHERE code = NEW.item_code LIMIT 1;
        END;
        
        BEGIN
          DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_warehouse_name = NULL;
          SELECT name INTO v_warehouse_name FROM tabWarehouse WHERE code = NEW.warehouse LIMIT 1;
        END;
        
        SET v_carton_id = NULL;
        
        INSERT INTO tabTransactionHistory (
          transaction_id, transaction_number, transaction_date, transaction_type,
          reference_doc_type, reference_doc, wms_transaction_title,
          item_code, item_name, warehouse, warehouse_name,
          bin_location, location_id, source_bin, target_bin, carton_id,
          qty_change, qty_before, qty_after,
          performed_by, performed_by_name, notes, created_at
        ) VALUES (
          NEW.id, v_transaction_number, NEW.transaction_date, NEW.transaction_type,
          NEW.reference_doc_type, NEW.reference_doc, NEW.wms_transaction_title,
          NEW.item_code, v_item_name, NEW.warehouse, v_warehouse_name,
          NEW.bin_location, NEW.bin_location, NEW.source_bin, NEW.target_bin, v_carton_id,
          NEW.qty_change, NEW.qty_before, NEW.qty_after,
          NEW.performed_by, v_user_name, NEW.notes, NEW.created_at
        );
      END
    `;
    await connection.query(createTriggerSQL);
    console.log('✅ Step 3: Trigger created');
    console.log('');

    // Step 4: Update carton_id if column exists
    console.log('Step 4: Updating carton_id (if column exists)...');
    const [hasCartonId] = await connection.query(`
      SELECT COUNT(*) > 0 as has_column
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabStockTransaction'
        AND COLUMN_NAME = 'carton_id'
    `);
    
    if (hasCartonId[0].has_column) {
      await connection.query(`
        UPDATE tabTransactionHistory th
        INNER JOIN tabStockTransaction ts ON th.transaction_id = ts.id
        SET th.carton_id = ts.carton_id
        WHERE ts.carton_id IS NOT NULL
      `);
      console.log('✅ Step 4: Carton ID updated');
    } else {
      console.log('⚠️ Step 4: Carton ID column not found (skipped)');
    }
    console.log('');

    // Step 5: Backfill existing transactions
    console.log('Step 5: Backfilling existing transactions...');
    const [existingCount] = await connection.query('SELECT COUNT(*) as cnt FROM tabStockTransaction');
    const [historyCount] = await connection.query('SELECT COUNT(*) as cnt FROM tabTransactionHistory');
    
    if (historyCount[0].cnt === 0 && existingCount[0].cnt > 0) {
      await connection.query(`
        INSERT INTO tabTransactionHistory (
          transaction_id, transaction_number, transaction_date, transaction_type,
          reference_doc_type, reference_doc, wms_transaction_title,
          item_code, warehouse, bin_location, location_id,
          source_bin, target_bin, qty_change, qty_before, qty_after,
          performed_by, notes, created_at
        )
        SELECT 
          id, CONCAT('TXN-', DATE_FORMAT(transaction_date, '%Y%m%d'), '-', LPAD(id, 5, '0')),
          transaction_date, transaction_type,
          reference_doc_type, reference_doc, wms_transaction_title,
          item_code, warehouse, bin_location, bin_location,
          source_bin, target_bin, qty_change, qty_before, qty_after,
          performed_by, notes, created_at
        FROM tabStockTransaction
        ORDER BY id
      `);
      console.log(`✅ Step 5: Backfilled ${existingCount[0].cnt} existing transactions`);
    } else {
      console.log(`✅ Step 5: History already has ${historyCount[0].cnt} records (skipped backfill)`);
    }
    console.log('');

    // Step 6: Verification
    console.log('============================================================');
    console.log('VERIFICATION RESULTS');
    console.log('============================================================');
    
    const [tableCheck] = await connection.query(`
      SELECT COUNT(*) > 0 as table_exists
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransactionHistory'
    `);
    console.log(tableCheck[0].table_exists ? '✅ Table tabTransactionHistory exists' : '❌ Table NOT found');
    
    const [triggerCheck] = await connection.query(`
      SELECT COUNT(*) > 0 as trigger_exists
      FROM INFORMATION_SCHEMA.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE()
        AND TRIGGER_NAME = 'trg_log_transaction_history_insert'
    `);
    console.log(triggerCheck[0].trigger_exists ? '✅ Trigger trg_log_transaction_history_insert exists' : '❌ Trigger NOT found');
    
    const [stats] = await connection.query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT item_code) as unique_items,
        COUNT(DISTINCT transaction_type) as unique_types,
        MIN(transaction_date) as earliest,
        MAX(transaction_date) as latest
      FROM tabTransactionHistory
    `);
    console.log(`Total Records: ${stats[0].total_records}`);
    console.log(`Unique Items: ${stats[0].unique_items}`);
    console.log(`Transaction Types: ${stats[0].unique_types}`);
    if (stats[0].earliest) {
      console.log(`Earliest: ${stats[0].earliest}`);
      console.log(`Latest: ${stats[0].latest}`);
    }

    console.log('');
    console.log('============================================================');
    console.log('✅ SETUP COMPLETE!');
    console.log('============================================================');
    console.log('');
    console.log('The transaction history table is now active and will');
    console.log('automatically capture all future transactions.');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('============================================================');
    console.error('❌ ERROR: Setup failed!');
    console.error('============================================================');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run setup
runSetup().catch(console.error);
