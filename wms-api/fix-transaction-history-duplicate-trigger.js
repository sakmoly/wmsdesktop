/**
 * Fix Transaction History Trigger to Prevent Duplicates
 * Adds idempotency check to prevent duplicate inserts
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms'
};

async function fixTransactionHistoryTrigger() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    console.log('🔧 Fixing Transaction History Trigger to Prevent Duplicates...\n');

    // Step 1: Check if trigger exists
    console.log('Step 1: Checking if trigger exists...');
    const [triggers] = await connection.execute(`
      SELECT TRIGGER_NAME 
      FROM INFORMATION_SCHEMA.TRIGGERS 
      WHERE TRIGGER_SCHEMA = DATABASE() 
        AND TRIGGER_NAME = 'trg_log_transaction_history_insert'
    `);

    if (triggers.length === 0) {
      console.log('⚠️  Trigger does not exist. Please run the setup script first.');
      return;
    }

    console.log('✅ Trigger exists.\n');

    // Step 2: Drop existing trigger
    console.log('Step 2: Dropping existing trigger...');
    await connection.query('DROP TRIGGER IF EXISTS trg_log_transaction_history_insert');
    console.log('✅ Step 2: Trigger dropped.\n');

    // Step 3: Check if carton_id column exists in tabStockTransaction
    console.log('Step 3: Checking for carton_id column...');
    const [cartonIdColumn] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabStockTransaction'
        AND COLUMN_NAME = 'carton_id'
    `);
    const hasCartonIdColumn = cartonIdColumn.length > 0;
    console.log(`✅ Step 3: carton_id column ${hasCartonIdColumn ? 'exists' : 'does not exist'}.\n`);

    // Step 4: Check if transaction_id column exists in tabTransactionHistory
    console.log('Step 4: Checking for transaction_id column in tabTransactionHistory...');
    const [transactionIdColumn] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabTransactionHistory'
        AND COLUMN_NAME = 'transaction_id'
    `);
    const hasTransactionIdColumn = transactionIdColumn.length > 0;
    console.log(`✅ Step 4: transaction_id column ${hasTransactionIdColumn ? 'exists' : 'does not exist'}.\n`);

    // Step 5: Create new trigger with idempotency check
    console.log('Step 5: Creating new trigger with idempotency check...');
    
    let triggerSql;
    
    if (hasCartonIdColumn) {
      // Trigger with carton_id support and idempotency check
      triggerSql = `
        CREATE TRIGGER trg_log_transaction_history_insert
        AFTER INSERT ON tabStockTransaction
        FOR EACH ROW
        BEGIN
          DECLARE v_transaction_number VARCHAR(100);
          DECLARE v_item_name VARCHAR(255) DEFAULT NULL;
          DECLARE v_warehouse_name VARCHAR(255) DEFAULT NULL;
          DECLARE v_user_name VARCHAR(255) DEFAULT NULL;
          DECLARE v_carton_id VARCHAR(100) DEFAULT NULL;
          DECLARE v_exists INT DEFAULT 0;
          
          -- ✅ IDEMPOTENCY CHECK: Check if record already exists
          ${hasTransactionIdColumn ? `
          SELECT COUNT(*) INTO v_exists
          FROM tabTransactionHistory
          WHERE transaction_id = NEW.id
          LIMIT 1;
          ` : `
          -- Check by reference_doc, item_code, location, qty_change, and transaction_date (within 1 second)
          SELECT COUNT(*) INTO v_exists
          FROM tabTransactionHistory
          WHERE reference_doc = NEW.reference_doc
            AND item_code = NEW.item_code
            AND (location_id = NEW.bin_location OR bin_location = NEW.bin_location)
            AND qty_change = NEW.qty_change
            AND ABS(TIMESTAMPDIFF(SECOND, transaction_date, NEW.transaction_date)) <= 1
          LIMIT 1;
          `}
          
          -- Only insert if record doesn't exist
          IF v_exists = 0 THEN
            -- Generate transaction number
            SET v_transaction_number = CONCAT('TXN-', DATE_FORMAT(NEW.transaction_date, '%Y%m%d'), '-', LPAD(NEW.id, 5, '0'));
            
            -- Get item name (if tabItem exists)
            BEGIN
              DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_item_name = NULL;
              SELECT name INTO v_item_name
              FROM tabItem
              WHERE code = NEW.item_code
              LIMIT 1;
            END;
            
            -- Get warehouse name (if tabWarehouse exists)
            BEGIN
              DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_warehouse_name = NULL;
              SELECT name INTO v_warehouse_name
              FROM tabWarehouse
              WHERE code = NEW.warehouse
              LIMIT 1;
            END;
            
            -- Get carton_id from NEW
            SET v_carton_id = NEW.carton_id;
            
            -- Insert into history table
            INSERT INTO tabTransactionHistory (
              ${hasTransactionIdColumn ? 'transaction_id,' : ''}
              transaction_number,
              transaction_date,
              transaction_type,
              reference_doc_type,
              reference_doc,
              wms_transaction_title,
              item_code,
              item_name,
              warehouse,
              warehouse_name,
              bin_location,
              location_id,
              source_bin,
              target_bin,
              carton_id,
              qty_change,
              qty_before,
              qty_after,
              performed_by,
              performed_by_name,
              notes,
              created_at
            ) VALUES (
              ${hasTransactionIdColumn ? 'NEW.id,' : ''}
              v_transaction_number,
              NEW.transaction_date,
              NEW.transaction_type,
              NEW.reference_doc_type,
              NEW.reference_doc,
              NEW.wms_transaction_title,
              NEW.item_code,
              v_item_name,
              NEW.warehouse,
              v_warehouse_name,
              NEW.bin_location,
              NEW.bin_location,
              NEW.source_bin,
              NEW.target_bin,
              v_carton_id,
              NEW.qty_change,
              NEW.qty_before,
              NEW.qty_after,
              NEW.performed_by,
              v_user_name,
              NEW.notes,
              NEW.created_at
            );
          END IF;
        END
      `;
    } else {
      // Trigger without carton_id and with idempotency check
      triggerSql = `
        CREATE TRIGGER trg_log_transaction_history_insert
        AFTER INSERT ON tabStockTransaction
        FOR EACH ROW
        BEGIN
          DECLARE v_transaction_number VARCHAR(100);
          DECLARE v_item_name VARCHAR(255) DEFAULT NULL;
          DECLARE v_warehouse_name VARCHAR(255) DEFAULT NULL;
          DECLARE v_user_name VARCHAR(255) DEFAULT NULL;
          DECLARE v_exists INT DEFAULT 0;
          
          -- ✅ IDEMPOTENCY CHECK: Check if record already exists
          ${hasTransactionIdColumn ? `
          SELECT COUNT(*) INTO v_exists
          FROM tabTransactionHistory
          WHERE transaction_id = NEW.id
          LIMIT 1;
          ` : `
          -- Check by reference_doc, item_code, location, qty_change, and transaction_date (within 1 second)
          SELECT COUNT(*) INTO v_exists
          FROM tabTransactionHistory
          WHERE reference_doc = NEW.reference_doc
            AND item_code = NEW.item_code
            AND (location_id = NEW.bin_location OR bin_location = NEW.bin_location)
            AND qty_change = NEW.qty_change
            AND ABS(TIMESTAMPDIFF(SECOND, transaction_date, NEW.transaction_date)) <= 1
          LIMIT 1;
          `}
          
          -- Only insert if record doesn't exist
          IF v_exists = 0 THEN
            -- Generate transaction number
            SET v_transaction_number = CONCAT('TXN-', DATE_FORMAT(NEW.transaction_date, '%Y%m%d'), '-', LPAD(NEW.id, 5, '0'));
            
            -- Get item name (if tabItem exists)
            BEGIN
              DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_item_name = NULL;
              SELECT name INTO v_item_name
              FROM tabItem
              WHERE code = NEW.item_code
              LIMIT 1;
            END;
            
            -- Get warehouse name (if tabWarehouse exists)
            BEGIN
              DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_warehouse_name = NULL;
              SELECT name INTO v_warehouse_name
              FROM tabWarehouse
              WHERE code = NEW.warehouse
              LIMIT 1;
            END;
            
            -- Insert into history table
            INSERT INTO tabTransactionHistory (
              ${hasTransactionIdColumn ? 'transaction_id,' : ''}
              transaction_number,
              transaction_date,
              transaction_type,
              reference_doc_type,
              reference_doc,
              wms_transaction_title,
              item_code,
              item_name,
              warehouse,
              warehouse_name,
              bin_location,
              location_id,
              source_bin,
              target_bin,
              qty_change,
              qty_before,
              qty_after,
              performed_by,
              performed_by_name,
              notes,
              created_at
            ) VALUES (
              ${hasTransactionIdColumn ? 'NEW.id,' : ''}
              v_transaction_number,
              NEW.transaction_date,
              NEW.transaction_type,
              NEW.reference_doc_type,
              NEW.reference_doc,
              NEW.wms_transaction_title,
              NEW.item_code,
              v_item_name,
              NEW.warehouse,
              v_warehouse_name,
              NEW.bin_location,
              NEW.bin_location,
              NEW.source_bin,
              NEW.target_bin,
              NEW.qty_change,
              NEW.qty_before,
              NEW.qty_after,
              NEW.performed_by,
              v_user_name,
              NEW.notes,
              NEW.created_at
            );
          END IF;
        END
      `;
    }

    await connection.query(triggerSql);
    console.log('✅ Step 5: Trigger created with idempotency check.\n');

    console.log('✅ Fix completed successfully!');
    console.log('\n📋 Summary:');
    console.log('  - Trigger now checks for existing records before inserting');
    console.log(`  - Uses ${hasTransactionIdColumn ? 'transaction_id' : 'reference_doc + item_code + location + qty_change + transaction_date'} for duplicate detection`);
    console.log('  - Prevents duplicate transaction history entries');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await connection.end();
  }
}

fixTransactionHistoryTrigger();
