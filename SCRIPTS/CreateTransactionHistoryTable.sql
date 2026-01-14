-- ============================================================
-- CREATE SEPARATE TRANSACTION HISTORY TABLE
-- This table is for audit/history purposes only
-- Does NOT affect existing tabStockTransaction table
-- ============================================================

-- Create new transaction history table
CREATE TABLE IF NOT EXISTS tabTransactionHistory (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  
  -- Transaction Identification
  transaction_id BIGINT NOT NULL,                    -- Unique transaction ID (auto-increment)
  transaction_number VARCHAR(100) NULL,              -- Human-readable transaction number (e.g., TXN-20260113-001)
  transaction_date TIMESTAMP NOT NULL,               -- Transaction Date
  transaction_type VARCHAR(50) NOT NULL,             -- Transaction Type (Picking, Putaway, Dispatch, etc.)
  
  -- Reference Information
  reference_doc_type VARCHAR(100) NULL,               -- Document Type (Material Request, Transfer Carton, etc.)
  reference_doc VARCHAR(100) NULL,                   -- Reference Document Number (MR-123457, TC-123, etc.)
  wms_transaction_title VARCHAR(100) NULL,           -- WMS Transaction Title
  
  -- Item Information
  item_code VARCHAR(100) NOT NULL,                    -- Item Code
  item_name VARCHAR(255) NULL,                       -- Item Name (for easier reporting)
  warehouse VARCHAR(100) NOT NULL,                   -- Warehouse
  warehouse_name VARCHAR(255) NULL,                  -- Warehouse Name (for easier reporting)
  
  -- Location Information
  bin_location VARCHAR(100) NULL,                    -- Bin Location
  location_id VARCHAR(100) NULL,                     -- Location ID (if different from bin_location)
  source_bin VARCHAR(100) NULL,                      -- Source Bin (for transfers)
  target_bin VARCHAR(100) NULL,                      -- Target Bin (for transfers)
  
  -- Carton Information
  carton_id VARCHAR(100) NULL,                       -- Carton ID
  batch_no VARCHAR(100) NULL,                        -- Batch Number
  serial_no VARCHAR(100) NULL,                       -- Serial Number
  
  -- Quantity Information
  qty_change DECIMAL(10,2) NOT NULL,                 -- Stock In/Out (+ for increase, - for decrease)
  qty_before DECIMAL(10,2) NOT NULL,                 -- Previous Quantity (before transaction)
  qty_after DECIMAL(10,2) NOT NULL,                  -- Current Stock (after transaction)
  uom VARCHAR(50) NULL,                              -- Unit of Measure
  
  -- Stock Direction
  stock_direction VARCHAR(20) GENERATED ALWAYS AS (
    CASE 
      WHEN qty_change > 0 THEN 'IN'
      WHEN qty_change < 0 THEN 'OUT'
      ELSE 'ADJUSTMENT'
    END
  ) STORED,                                          -- Stock In/Out indicator
  
  -- User Information
  performed_by VARCHAR(100) NULL,                    -- User who performed the transaction
  performed_by_name VARCHAR(255) NULL,               -- User Name (for easier reporting)
  
  -- Additional Information
  notes TEXT NULL,                                    -- Additional notes
  reason_code VARCHAR(50) NULL,                      -- Reason code (for adjustments)
  status VARCHAR(50) NULL,                            -- Transaction status (Completed, Cancelled, etc.)
  
  -- Audit Fields
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,    -- Record creation timestamp
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP, -- Record update timestamp
  
  -- Indexes for Performance
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
COMMENT='Transaction History - Complete audit trail of all stock movements (separate from operational tabStockTransaction)';

-- ============================================================
-- CREATE TRIGGERS TO AUTO-POPULATE FROM tabStockTransaction
-- This ensures all transactions are automatically logged
-- without modifying existing code
-- ============================================================

DELIMITER $$

-- Trigger: After INSERT on tabStockTransaction
CREATE TRIGGER trg_log_transaction_history_insert
AFTER INSERT ON tabStockTransaction
FOR EACH ROW
BEGIN
  DECLARE v_transaction_number VARCHAR(100);
  DECLARE v_item_name VARCHAR(255);
  DECLARE v_warehouse_name VARCHAR(255);
  DECLARE v_user_name VARCHAR(255);
  
  -- Generate transaction number (TXN-YYYYMMDD-XXXXX)
  SET v_transaction_number = CONCAT('TXN-', DATE_FORMAT(NEW.transaction_date, '%Y%m%d'), '-', LPAD(NEW.id, 5, '0'));
  
  -- Get item name (if tabItem table exists)
  SELECT name INTO v_item_name
  FROM tabItem
  WHERE code = NEW.item_code
  LIMIT 1;
  
  -- Get warehouse name (if tabWarehouse table exists)
  SELECT name INTO v_warehouse_name
  FROM tabWarehouse
  WHERE code = NEW.warehouse
  LIMIT 1;
  
  -- Get user name (if tabUser table exists - adjust table name as needed)
  -- SELECT name INTO v_user_name
  -- FROM tabUser
  -- WHERE code = NEW.performed_by
  -- LIMIT 1;
  
  -- Insert into history table
  -- Note: If carton_id column doesn't exist in tabStockTransaction, 
  -- it will be NULL in the history table (which is fine)
  SET @carton_id_value = NULL;
  
  -- Try to get carton_id using prepared statement (if column exists)
  -- This is a workaround since we can't directly check column existence in trigger
  -- If carton_id column exists, it will be populated; otherwise NULL
  SET @sql = CONCAT('SELECT carton_id INTO @carton_id_value FROM tabStockTransaction WHERE id = ', NEW.id, ' LIMIT 1');
  
  -- For now, we'll use a simpler approach: set to NULL
  -- You can manually update carton_id later if needed, or modify this trigger
  -- after confirming carton_id column exists in tabStockTransaction
  
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
    NEW.bin_location,  -- Use bin_location as location_id
    NEW.source_bin,
    NEW.target_bin,
    NULL,  -- carton_id: Set to NULL for now (can be updated later if column exists)
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

-- ============================================================
-- ALTERNATIVE: Manual Backfill from Existing Data
-- Run this if you want to populate history from existing transactions
-- ============================================================

-- INSERT INTO tabTransactionHistory (
--   transaction_id,
--   transaction_number,
--   transaction_date,
--   transaction_type,
--   reference_doc_type,
--   reference_doc,
--   wms_transaction_title,
--   item_code,
--   warehouse,
--   bin_location,
--   location_id,
--   source_bin,
--   target_bin,
--   carton_id,
--   qty_change,
--   qty_before,
--   qty_after,
--   performed_by,
--   notes,
--   created_at
-- )
-- SELECT 
--   id as transaction_id,
--   CONCAT('TXN-', DATE_FORMAT(transaction_date, '%Y%m%d'), '-', LPAD(id, 5, '0')) as transaction_number,
--   transaction_date,
--   transaction_type,
--   reference_doc_type,
--   reference_doc,
--   wms_transaction_title,
--   item_code,
--   warehouse,
--   bin_location,
--   bin_location as location_id,
--   source_bin,
--   target_bin,
--   COALESCE(
--     (SELECT carton_id FROM tabStockTransaction t2 WHERE t2.id = tabStockTransaction.id),
--     NULL
--   ) as carton_id,
--   qty_change,
--   qty_before,
--   qty_after,
--   performed_by,
--   notes,
--   created_at
-- FROM tabStockTransaction
-- ORDER BY id;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Check table structure
SELECT 
  COLUMN_NAME,
  DATA_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT,
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabTransactionHistory'
ORDER BY ORDINAL_POSITION;

-- Check triggers
SELECT 
  TRIGGER_NAME,
  EVENT_MANIPULATION,
  EVENT_OBJECT_TABLE,
  ACTION_TIMING
FROM INFORMATION_SCHEMA.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
  AND TRIGGER_NAME = 'trg_log_transaction_history_insert';

-- Test: Check if trigger works (after inserting into tabStockTransaction)
-- SELECT COUNT(*) as total_history_records FROM tabTransactionHistory;

SELECT '✅ Transaction History table created successfully!' as Status;
SELECT '✅ Trigger created to auto-populate from tabStockTransaction!' as Status;
SELECT '📋 Note: Existing tabStockTransaction table is NOT modified' as Status;
