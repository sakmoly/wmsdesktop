/**
 * Update Transaction History Trigger to Aggregate Records
 * Aggregates transactions by: item_code + location_id + carton_id + reference_doc + transaction_type + same day
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

async function updateTriggerForAggregation() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    console.log('🔧 Updating Transaction History Trigger for Aggregation...\n');

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

    // Step 2: Check column existence
    console.log('Step 2: Checking column existence...');
    const [transactionIdColumn] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabTransactionHistory'
        AND COLUMN_NAME = 'transaction_id'
    `);
    const hasTransactionIdColumn = transactionIdColumn.length > 0;

    const [cartonIdColumn] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabStockTransaction'
        AND COLUMN_NAME = 'carton_id'
    `);
    const hasCartonIdColumn = cartonIdColumn.length > 0;

    const [locationIdColumn] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabTransactionHistory'
        AND COLUMN_NAME = 'location_id'
    `);
    const hasLocationIdColumn = locationIdColumn.length > 0;

    console.log(`✅ transaction_id column: ${hasTransactionIdColumn ? 'exists' : 'does not exist'}`);
    console.log(`✅ carton_id column: ${hasCartonIdColumn ? 'exists' : 'does not exist'}`);
    console.log(`✅ location_id column: ${hasLocationIdColumn ? 'exists' : 'does not exist'}\n`);

    // Step 3: Drop existing trigger
    console.log('Step 3: Dropping existing trigger...');
    await connection.query('DROP TRIGGER IF EXISTS trg_log_transaction_history_insert');
    console.log('✅ Step 3: Trigger dropped.\n');

    // Step 4: Create new trigger with aggregation logic
    console.log('Step 4: Creating new trigger with aggregation logic...');

    let triggerSql;

    if (hasCartonIdColumn && hasLocationIdColumn && hasTransactionIdColumn) {
      // Full version with all columns
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
          DECLARE v_existing_id INT DEFAULT NULL;
          DECLARE v_existing_qty_change DECIMAL(15,2) DEFAULT 0;
          DECLARE v_existing_qty_before DECIMAL(15,2) DEFAULT 0;
          
          -- Generate transaction number
          SET v_transaction_number = CONCAT('TXN-', DATE_FORMAT(NEW.transaction_date, '%Y%m%d'), '-', LPAD(NEW.id, 5, '0'));
          
          -- Get carton_id from NEW
          SET v_carton_id = NEW.carton_id;
          
          -- ✅ AGGREGATION CHECK: Check if record exists with same item_code, location, carton_id, reference_doc, transaction_type, same day
          SELECT 
            id, 
            qty_change, 
            qty_before
          INTO 
            v_existing_id,
            v_existing_qty_change,
            v_existing_qty_before
          FROM tabTransactionHistory
          WHERE item_code = NEW.item_code
            AND (location_id = NEW.bin_location OR bin_location = NEW.bin_location)
            AND (carton_id = NEW.carton_id OR (carton_id IS NULL AND NEW.carton_id IS NULL))
            AND reference_doc = NEW.reference_doc
            AND transaction_type = NEW.transaction_type
            AND DATE(transaction_date) = DATE(NEW.transaction_date)
          LIMIT 1;
          
          SET v_exists = IF(v_existing_id IS NOT NULL, 1, 0);
          
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
          
          -- If record exists, UPDATE (aggregate)
          IF v_exists = 1 THEN
            UPDATE tabTransactionHistory
            SET qty_change = qty_change + NEW.qty_change,
                qty_after = NEW.qty_after,
                transaction_date = NEW.transaction_date, -- Update to latest transaction time
                updated_at = NOW()
            WHERE id = v_existing_id;
          ELSE
            -- If record does not exist, INSERT new record
            INSERT INTO tabTransactionHistory (
              transaction_id,
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
              NEW.id,
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
      // Simplified version without optional columns
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
          DECLARE v_existing_id INT DEFAULT NULL;
          
          -- Generate transaction number
          SET v_transaction_number = CONCAT('TXN-', DATE_FORMAT(NEW.transaction_date, '%Y%m%d'), '-', LPAD(NEW.id, 5, '0'));
          
          -- ✅ AGGREGATION CHECK: Check if record exists
          SELECT id
          INTO v_existing_id
          FROM tabTransactionHistory
          WHERE item_code = NEW.item_code
            AND bin_location = NEW.bin_location
            AND reference_doc = NEW.reference_doc
            AND transaction_type = NEW.transaction_type
            AND DATE(transaction_date) = DATE(NEW.transaction_date)
            ${hasCartonIdColumn ? 'AND (carton_id = NEW.carton_id OR (carton_id IS NULL AND NEW.carton_id IS NULL))' : ''}
          LIMIT 1;
          
          SET v_exists = IF(v_existing_id IS NOT NULL, 1, 0);
          
          -- Get item name
          BEGIN
            DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_item_name = NULL;
            SELECT name INTO v_item_name
            FROM tabItem
            WHERE code = NEW.item_code
            LIMIT 1;
          END;
          
          -- Get warehouse name
          BEGIN
            DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_warehouse_name = NULL;
            SELECT name INTO v_warehouse_name
            FROM tabWarehouse
            WHERE code = NEW.warehouse
            LIMIT 1;
          END;
          
          -- If record exists, UPDATE (aggregate)
          IF v_exists = 1 THEN
            UPDATE tabTransactionHistory
            SET qty_change = qty_change + NEW.qty_change,
                qty_after = NEW.qty_after,
                transaction_date = NEW.transaction_date,
                updated_at = NOW()
            WHERE id = v_existing_id;
          ELSE
            -- If record does not exist, INSERT new record
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
              ${hasLocationIdColumn ? 'location_id,' : ''}
              source_bin,
              target_bin,
              ${hasCartonIdColumn ? 'carton_id,' : ''}
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
              ${hasLocationIdColumn ? 'NEW.bin_location,' : ''}
              NEW.source_bin,
              NEW.target_bin,
              ${hasCartonIdColumn ? 'NEW.carton_id,' : ''}
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
    console.log('✅ Step 4: Trigger created with aggregation logic.\n');

    console.log('✅ Update completed successfully!');
    console.log('\n📋 Summary:');
    console.log('  - Trigger now aggregates transactions by:');
    console.log('    • item_code');
    console.log('    • location_id / bin_location');
    console.log('    • carton_id');
    console.log('    • reference_doc');
    console.log('    • transaction_type');
    console.log('    • same day (DATE(transaction_date))');
    console.log('  - If record exists: UPDATE qty_change (sum), qty_after (latest)');
    console.log('  - If record does not exist: INSERT new record');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await connection.end();
  }
}

updateTriggerForAggregation();
