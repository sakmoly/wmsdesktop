/**
 * Fix Transaction History Aggregation Issue
 * 
 * This script verifies and fixes the transaction history aggregation trigger
 * to ensure individual scans are properly grouped and summed.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const connectionConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms_db',
  multipleStatements: true
};

async function checkAndFixTrigger() {
  let connection;
  
  try {
    connection = await mysql.createConnection(connectionConfig);
    console.log('✅ Connected to database');
    
    // Step 1: Check if trigger exists
    console.log('\n📋 Step 1: Checking if trigger exists...');
    const [triggers] = await connection.execute(`
      SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE, ACTION_STATEMENT
      FROM INFORMATION_SCHEMA.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE()
        AND TRIGGER_NAME = 'trg_log_transaction_history_insert'
    `);
    
    if (triggers.length === 0) {
      console.log('❌ Trigger does not exist! Creating it...');
      await createAggregationTrigger(connection);
    } else {
      console.log('✅ Trigger exists');
      console.log('   Event:', triggers[0].EVENT_MANIPULATION);
      console.log('   Table:', triggers[0].EVENT_OBJECT_TABLE);
      
      // Check if trigger has aggregation logic
      const triggerBody = triggers[0].ACTION_STATEMENT || '';
      if (triggerBody.includes('v_exists') && triggerBody.includes('qty_change + NEW.qty_change')) {
        console.log('✅ Trigger has aggregation logic');
      } else {
        console.log('⚠️  Trigger exists but may not have aggregation logic');
        console.log('   Recreating trigger with aggregation...');
        await recreateTrigger(connection);
      }
    }
    
    // Step 2: Check table structure
    console.log('\n📋 Step 2: Checking table structure...');
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabTransactionHistory'
        AND COLUMN_NAME IN ('carton_id', 'location_id', 'transaction_id')
    `);
    
    const hasCartonId = columns.some(col => col.COLUMN_NAME === 'carton_id');
    const hasLocationId = columns.some(col => col.COLUMN_NAME === 'location_id');
    const hasTransactionId = columns.some(col => col.COLUMN_NAME === 'transaction_id');
    
    console.log('   carton_id column:', hasCartonId ? '✅' : '❌');
    console.log('   location_id column:', hasLocationId ? '✅' : '❌');
    console.log('   transaction_id column:', hasTransactionId ? '✅' : '❌');
    
    // Step 3: Test aggregation with a sample query
    console.log('\n📋 Step 3: Testing aggregation logic...');
    const [testResults] = await connection.execute(`
      SELECT 
        item_code,
        bin_location,
        carton_id,
        reference_doc,
        DATE(transaction_date) as date,
        COUNT(*) as transaction_count,
        SUM(qty_change) as total_qty_change
      FROM tabStockTransaction
      WHERE reference_doc LIKE 'MR-%'
        AND transaction_type = 'Picking'
        AND DATE(transaction_date) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY item_code, bin_location, carton_id, reference_doc, DATE(transaction_date)
      HAVING COUNT(*) > 1
      LIMIT 5
    `);
    
    if (testResults.length > 0) {
      console.log(`⚠️  Found ${testResults.length} groups that should be aggregated:`);
      testResults.forEach((row, idx) => {
        console.log(`   ${idx + 1}. ${row.item_code} @ ${row.bin_location || 'NULL'} (${row.transaction_count} transactions, total: ${row.total_qty_change})`);
      });
      console.log('\n   These should be aggregated into single records in tabTransactionHistory');
    } else {
      console.log('✅ No unaggregated groups found (or all are already aggregated)');
    }
    
    // Step 4: Verify trigger is working
    console.log('\n📋 Step 4: Verifying trigger is active...');
    const [activeTriggers] = await connection.execute(`
      SHOW TRIGGERS WHERE \`Trigger\` = 'trg_log_transaction_history_insert'
    `);
    
    if (activeTriggers.length > 0) {
      console.log('✅ Trigger is active');
      console.log('   Status:', activeTriggers[0].Status || 'ACTIVE');
    } else {
      console.log('❌ Trigger is not active!');
    }
    
    console.log('\n✅ Verification complete!');
    console.log('\n📝 Next Steps:');
    console.log('   1. If trigger was recreated, test with a new pick operation');
    console.log('   2. Run the diagnostic SQL to check MR-0003 transactions');
    console.log('   3. If issues persist, check for NULL carton_id or location mismatches');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n✅ Database connection closed');
    }
  }
}

async function recreateTrigger(connection) {
  console.log('   Dropping existing trigger...');
  await connection.execute('DROP TRIGGER IF EXISTS trg_log_transaction_history_insert');
  
  await createAggregationTrigger(connection);
}

async function createAggregationTrigger(connection) {
  // Check table structure
  const [columns] = await connection.execute(`
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabTransactionHistory'
      AND COLUMN_NAME IN ('carton_id', 'location_id', 'transaction_id')
  `);
  
  const hasCartonId = columns.some(col => col.COLUMN_NAME === 'carton_id');
  const hasLocationId = columns.some(col => col.COLUMN_NAME === 'location_id');
  const hasTransactionId = columns.some(col => col.COLUMN_NAME === 'transaction_id');
  
  console.log('   Creating trigger with aggregation logic...');
  
  const triggerSql = `
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
      BEGIN
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_existing_id = NULL;
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
          AND (
            ${hasLocationId ? '(location_id = NEW.bin_location OR bin_location = NEW.bin_location)' : 'bin_location = NEW.bin_location'}
            OR (location_id IS NULL AND NEW.bin_location IS NULL)
            OR (bin_location IS NULL AND NEW.bin_location IS NULL)
          )
          AND (
            ${hasCartonId ? '(carton_id = NEW.carton_id OR (carton_id IS NULL AND NEW.carton_id IS NULL))' : '1=1'}
          )
          AND reference_doc = NEW.reference_doc
          AND transaction_type = NEW.transaction_type
          AND DATE(transaction_date) = DATE(NEW.transaction_date)
        LIMIT 1;
      END;
      
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
            transaction_date = NEW.transaction_date,
            updated_at = NOW()
        WHERE id = v_existing_id;
      ELSE
        -- If record does not exist, INSERT new record
        INSERT INTO tabTransactionHistory (
          ${hasTransactionId ? 'transaction_id,' : ''}
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
          ${hasLocationId ? 'location_id,' : ''}
          source_bin,
          target_bin,
          ${hasCartonId ? 'carton_id,' : ''}
          qty_change,
          qty_before,
          qty_after,
          performed_by,
          performed_by_name,
          notes,
          created_at
        ) VALUES (
          ${hasTransactionId ? 'NEW.id,' : ''}
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
          ${hasLocationId ? 'NEW.bin_location,' : ''}
          NEW.source_bin,
          NEW.target_bin,
          ${hasCartonId ? 'v_carton_id,' : ''}
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
  
  await connection.execute(triggerSql);
  console.log('   ✅ Trigger created successfully');
}

// Run the fix
checkAndFixTrigger().catch(console.error);
