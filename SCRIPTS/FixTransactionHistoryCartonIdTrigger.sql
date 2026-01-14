-- Fix Transaction History Trigger to Include Carton ID
-- This script updates the trigger to correctly read carton_id from tabStockTransaction

USE wms_desktop;

-- Drop existing trigger
DROP TRIGGER IF EXISTS trg_log_transaction_history_insert;

-- Recreate trigger with carton_id support
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
  DECLARE v_error INT DEFAULT 0;
  
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
  
  -- Try to get carton_id from NEW (if column exists)
  -- Use error handler to gracefully handle if column doesn't exist
  BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET v_error = 1;
    -- Try to access NEW.carton_id directly
    -- If column exists, this will work; if not, handler will catch error
    SET v_carton_id = NEW.carton_id;
  END;
  
  -- If error occurred (column doesn't exist), v_carton_id will remain NULL
  -- This is fine - we'll just insert NULL
  
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
    v_carton_id,  -- Now correctly reads from NEW.carton_id
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

SELECT '✅ Trigger updated to include carton_id' as Status;

-- Update existing records that have carton_id in tabStockTransaction but NULL in tabTransactionHistory
UPDATE tabTransactionHistory th
INNER JOIN tabStockTransaction ts ON th.transaction_id = ts.id
SET th.carton_id = ts.carton_id
WHERE ts.carton_id IS NOT NULL 
  AND (th.carton_id IS NULL OR th.carton_id = '');

SELECT CONCAT('✅ Updated ', ROW_COUNT(), ' existing transaction history records with carton_id') as Status;
