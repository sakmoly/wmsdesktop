-- ============================================================
-- AUTO SETUP TRANSACTION HISTORY TABLE
-- This script automatically creates and configures everything
-- Run this script to set up transaction history automatically
-- ============================================================

-- ============================================================
-- STEP 1: CREATE TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS tabTransactionHistory (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  
  -- Transaction Identification
  transaction_id BIGINT NOT NULL,
  transaction_number VARCHAR(100) NULL,
  transaction_date TIMESTAMP NOT NULL,
  transaction_type VARCHAR(50) NOT NULL,
  
  -- Reference Information
  reference_doc_type VARCHAR(100) NULL,
  reference_doc VARCHAR(100) NULL,
  wms_transaction_title VARCHAR(100) NULL,
  
  -- Item Information
  item_code VARCHAR(100) NOT NULL,
  item_name VARCHAR(255) NULL,
  warehouse VARCHAR(100) NOT NULL,
  warehouse_name VARCHAR(255) NULL,
  
  -- Location Information
  bin_location VARCHAR(100) NULL,
  location_id VARCHAR(100) NULL,
  source_bin VARCHAR(100) NULL,
  target_bin VARCHAR(100) NULL,
  
  -- Carton Information
  carton_id VARCHAR(100) NULL,
  batch_no VARCHAR(100) NULL,
  serial_no VARCHAR(100) NULL,
  
  -- Quantity Information
  qty_change DECIMAL(10,2) NOT NULL,
  qty_before DECIMAL(10,2) NOT NULL,
  qty_after DECIMAL(10,2) NOT NULL,
  uom VARCHAR(50) NULL,
  
  -- Stock Direction
  stock_direction VARCHAR(20) GENERATED ALWAYS AS (
    CASE 
      WHEN qty_change > 0 THEN 'IN'
      WHEN qty_change < 0 THEN 'OUT'
      ELSE 'ADJUSTMENT'
    END
  ) STORED,
  
  -- User Information
  performed_by VARCHAR(100) NULL,
  performed_by_name VARCHAR(255) NULL,
  
  -- Additional Information
  notes TEXT NULL,
  reason_code VARCHAR(50) NULL,
  status VARCHAR(50) NULL,
  
  -- Audit Fields
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes
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

SELECT '✅ Step 1: Table created' as Status;

-- ============================================================
-- STEP 2: DROP EXISTING TRIGGER (IF EXISTS)
-- ============================================================

DROP TRIGGER IF EXISTS trg_log_transaction_history_insert;

SELECT '✅ Step 2: Existing trigger dropped (if any)' as Status;

-- ============================================================
-- STEP 3: CREATE TRIGGER
-- ============================================================

DELIMITER $$

CREATE TRIGGER trg_log_transaction_history_insert
AFTER INSERT ON tabStockTransaction
FOR EACH ROW
BEGIN
  DECLARE v_transaction_number VARCHAR(100);
  DECLARE v_item_name VARCHAR(255) DEFAULT NULL;
  DECLARE v_warehouse_name VARCHAR(255) DEFAULT NULL;
  DECLARE v_user_name VARCHAR(255) DEFAULT NULL;
  DECLARE v_carton_id VARCHAR(100) DEFAULT NULL;
  
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
  
  -- Try to get carton_id if column exists (using dynamic approach)
  -- Check if carton_id column exists in tabStockTransaction
  SET @has_carton_id = (
    SELECT COUNT(*) > 0
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabStockTransaction'
      AND COLUMN_NAME = 'carton_id'
  );
  
  -- If carton_id column exists, try to get it
  -- Note: We can't directly access NEW.carton_id if column might not exist
  -- So we'll set it to NULL and update later if needed
  SET v_carton_id = NULL;
  
  -- Insert into history table
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
END$$

DELIMITER ;

SELECT '✅ Step 3: Trigger created' as Status;

-- ============================================================
-- STEP 4: UPDATE CARTON_ID FROM EXISTING DATA
-- ============================================================

-- Check if carton_id column exists in tabStockTransaction
SET @has_carton_id_col = (
  SELECT COUNT(*) > 0
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tabStockTransaction'
    AND COLUMN_NAME = 'carton_id'
);

-- If carton_id exists, update history table
SET @update_sql = IF(
  @has_carton_id_col > 0,
  'UPDATE tabTransactionHistory th
   INNER JOIN tabStockTransaction ts ON th.transaction_id = ts.id
   SET th.carton_id = ts.carton_id
   WHERE ts.carton_id IS NOT NULL',
  'SELECT "carton_id column does not exist in tabStockTransaction" as message'
);

PREPARE stmt FROM @update_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT IF(@has_carton_id_col > 0, '✅ Step 4: Carton ID updated', '⚠️ Step 4: Carton ID column not found (skipped)') as Status;

-- ============================================================
-- STEP 5: BACKFILL EXISTING TRANSACTIONS (OPTIONAL)
-- ============================================================

-- Count existing transactions in tabStockTransaction
SET @existing_count = (SELECT COUNT(*) FROM tabStockTransaction);
SET @history_count = (SELECT COUNT(*) FROM tabTransactionHistory);

-- If history table is empty but transactions exist, backfill
IF @history_count = 0 AND @existing_count > 0 THEN
  INSERT INTO tabTransactionHistory (
    transaction_id,
    transaction_number,
    transaction_date,
    transaction_type,
    reference_doc_type,
    reference_doc,
    wms_transaction_title,
    item_code,
    warehouse,
    bin_location,
    location_id,
    source_bin,
    target_bin,
    qty_change,
    qty_before,
    qty_after,
    performed_by,
    notes,
    created_at
  )
  SELECT 
    id as transaction_id,
    CONCAT('TXN-', DATE_FORMAT(transaction_date, '%Y%m%d'), '-', LPAD(id, 5, '0')) as transaction_number,
    transaction_date,
    transaction_type,
    reference_doc_type,
    reference_doc,
    wms_transaction_title,
    item_code,
    warehouse,
    bin_location,
    bin_location as location_id,
    source_bin,
    target_bin,
    qty_change,
    qty_before,
    qty_after,
    performed_by,
    notes,
    created_at
  FROM tabStockTransaction
  ORDER BY id;
  
  SELECT CONCAT('✅ Step 5: Backfilled ', @existing_count, ' existing transactions') as Status;
ELSE
  SELECT CONCAT('✅ Step 5: History already has ', @history_count, ' records (skipped backfill)') as Status;
END IF;

-- ============================================================
-- STEP 6: VERIFICATION
-- ============================================================

SELECT '============================================================' as '';
SELECT 'VERIFICATION RESULTS' as '';
SELECT '============================================================' as '';

-- Check table exists
SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Table tabTransactionHistory exists'
    ELSE '❌ Table tabTransactionHistory NOT found'
  END as table_status
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabTransactionHistory';

-- Check trigger exists
SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Trigger trg_log_transaction_history_insert exists'
    ELSE '❌ Trigger NOT found'
  END as trigger_status
FROM INFORMATION_SCHEMA.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
  AND TRIGGER_NAME = 'trg_log_transaction_history_insert';

-- Count records
SELECT 
  COUNT(*) as total_history_records,
  COUNT(DISTINCT item_code) as unique_items,
  COUNT(DISTINCT transaction_type) as unique_transaction_types,
  MIN(transaction_date) as earliest_transaction,
  MAX(transaction_date) as latest_transaction
FROM tabTransactionHistory;

-- Check recent transactions
SELECT 
  'Recent Transactions (Last 5)' as info,
  transaction_number,
  transaction_date,
  transaction_type,
  item_code,
  qty_change,
  stock_direction
FROM tabTransactionHistory
ORDER BY id DESC
LIMIT 5;

SELECT '============================================================' as '';
SELECT '✅ SETUP COMPLETE!' as '';
SELECT '============================================================' as '';
SELECT 'The transaction history table is now active and will automatically' as '';
SELECT 'capture all future transactions from tabStockTransaction.' as '';
SELECT '' as '';
SELECT 'Next: Test by performing a transaction (Material Request, Putaway, etc.)' as '';
SELECT 'and verify it appears in tabTransactionHistory.' as '';
