// Fix Transaction History Trigger to Include Carton ID
// This script updates the trigger to correctly read carton_id from tabStockTransaction

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

async function fixTransactionHistoryCartonId() {
  let connection;
  
  try {
    console.log('');
    console.log('============================================================');
    console.log('Fixing Transaction History Carton ID Trigger');
    console.log('============================================================');
    console.log('');
    
    connection = await mysql.createConnection(config);
    console.log('✅ Connected to database');
    
    // Check if carton_id column exists in tabStockTransaction
    const [columnCheck] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabStockTransaction'
        AND COLUMN_NAME = 'carton_id'
    `);
    
    const hasCartonIdColumn = columnCheck[0].count > 0;
    console.log(`Carton ID column exists: ${hasCartonIdColumn ? 'YES' : 'NO'}`);
    console.log('');
    
    // Drop existing trigger (use query for DDL)
    console.log('Dropping existing trigger...');
    try {
      await connection.query('DROP TRIGGER IF EXISTS trg_log_transaction_history_insert');
      console.log('✅ Existing trigger dropped');
    } catch (error) {
      console.log('⚠️  Could not drop trigger (may not exist):', error.message);
    }
    
    // Create new trigger (without DELIMITER - use semicolons directly)
    console.log('');
    console.log('Creating updated trigger...');
    
    if (hasCartonIdColumn) {
      // Trigger with carton_id support
      const triggerSql = `CREATE TRIGGER trg_log_transaction_history_insert
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
    SELECT name INTO v_item_name
    FROM tabItem
    WHERE code = NEW.item_code
    LIMIT 1;
  END;
  
  BEGIN
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_warehouse_name = NULL;
    SELECT name INTO v_warehouse_name
    FROM tabWarehouse
    WHERE code = NEW.warehouse
    LIMIT 1;
  END;
  
  SET v_carton_id = NEW.carton_id;
  
  INSERT INTO tabTransactionHistory (
    transaction_id, transaction_number, transaction_date, transaction_type,
    reference_doc_type, reference_doc, wms_transaction_title,
    item_code, item_name, warehouse, warehouse_name,
    bin_location, location_id, source_bin, target_bin,
    carton_id, qty_change, qty_before, qty_after,
    performed_by, performed_by_name, notes, created_at
  ) VALUES (
    NEW.id, v_transaction_number, NEW.transaction_date, NEW.transaction_type,
    NEW.reference_doc_type, NEW.reference_doc, NEW.wms_transaction_title,
    NEW.item_code, v_item_name, NEW.warehouse, v_warehouse_name,
    NEW.bin_location, NEW.bin_location, NEW.source_bin, NEW.target_bin,
    v_carton_id, NEW.qty_change, NEW.qty_before, NEW.qty_after,
    NEW.performed_by, v_user_name, NEW.notes, NEW.created_at
  );
END`;
      
      await connection.query(triggerSql);
    } else {
      // Trigger without carton_id (column doesn't exist)
      const triggerSql = `CREATE TRIGGER trg_log_transaction_history_insert
AFTER INSERT ON tabStockTransaction
FOR EACH ROW
BEGIN
  DECLARE v_transaction_number VARCHAR(100);
  DECLARE v_item_name VARCHAR(255) DEFAULT NULL;
  DECLARE v_warehouse_name VARCHAR(255) DEFAULT NULL;
  DECLARE v_user_name VARCHAR(255) DEFAULT NULL;
  
  SET v_transaction_number = CONCAT('TXN-', DATE_FORMAT(NEW.transaction_date, '%Y%m%d'), '-', LPAD(NEW.id, 5, '0'));
  
  BEGIN
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_item_name = NULL;
    SELECT name INTO v_item_name
    FROM tabItem
    WHERE code = NEW.item_code
    LIMIT 1;
  END;
  
  BEGIN
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_warehouse_name = NULL;
    SELECT name INTO v_warehouse_name
    FROM tabWarehouse
    WHERE code = NEW.warehouse
    LIMIT 1;
  END;
  
  INSERT INTO tabTransactionHistory (
    transaction_id, transaction_number, transaction_date, transaction_type,
    reference_doc_type, reference_doc, wms_transaction_title,
    item_code, item_name, warehouse, warehouse_name,
    bin_location, location_id, source_bin, target_bin,
    carton_id, qty_change, qty_before, qty_after,
    performed_by, performed_by_name, notes, created_at
  ) VALUES (
    NEW.id, v_transaction_number, NEW.transaction_date, NEW.transaction_type,
    NEW.reference_doc_type, NEW.reference_doc, NEW.wms_transaction_title,
    NEW.item_code, v_item_name, NEW.warehouse, v_warehouse_name,
    NEW.bin_location, NEW.bin_location, NEW.source_bin, NEW.target_bin,
    NULL, NEW.qty_change, NEW.qty_before, NEW.qty_after,
    NEW.performed_by, v_user_name, NEW.notes, NEW.created_at
  );
END`;
      
      await connection.query(triggerSql);
    }
    
    console.log('✅ Trigger created successfully');
    
    // Update existing records
    if (hasCartonIdColumn) {
      console.log('');
      console.log('Updating existing transaction history records...');
      const [updateResult] = await connection.execute(`
        UPDATE tabTransactionHistory th
        INNER JOIN tabStockTransaction ts ON th.transaction_id = ts.id
        SET th.carton_id = ts.carton_id
        WHERE ts.carton_id IS NOT NULL 
          AND (th.carton_id IS NULL OR th.carton_id = '')
      `);
      
      console.log(`✅ Updated ${updateResult.affectedRows} existing transaction history records with carton_id`);
    } else {
      console.log('');
      console.log('⚠️  Carton ID column does not exist in tabStockTransaction');
      console.log('   Trigger created without carton_id support');
      console.log('   Please add carton_id column to tabStockTransaction first');
    }
    
    // Verify trigger
    console.log('');
    console.log('Verifying trigger...');
    const [triggerCheck] = await connection.execute(`
      SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE
      FROM INFORMATION_SCHEMA.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE()
        AND TRIGGER_NAME = 'trg_log_transaction_history_insert'
    `);
    
    if (triggerCheck.length > 0) {
      console.log('✅ Trigger verified:', triggerCheck[0].TRIGGER_NAME);
    } else {
      console.log('❌ Trigger not found!');
    }
    
    console.log('');
    console.log('============================================================');
    console.log('✅ Transaction History Carton ID Fix Complete!');
    console.log('============================================================');
    console.log('');
    console.log('The trigger will now correctly include carton_id');
    console.log('for all new transactions going forward.');
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ Error fixing transaction history carton_id:');
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
fixTransactionHistoryCartonId()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
