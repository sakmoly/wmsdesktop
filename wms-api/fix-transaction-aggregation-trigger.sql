-- Fix Transaction History Aggregation Trigger
-- This script recreates the trigger to ensure individual scans are properly aggregated

-- Step 1: Drop existing trigger
DROP TRIGGER IF EXISTS trg_log_transaction_history_insert;

-- Step 2: Create new trigger with aggregation logic
-- Note: Adjust column names based on your table structure
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
  DECLARE v_exists INT DEFAULT 0;
  DECLARE v_existing_id INT DEFAULT NULL;
  DECLARE v_existing_qty_change DECIMAL(15,2) DEFAULT 0;
  DECLARE v_existing_qty_before DECIMAL(15,2) DEFAULT 0;
  
  -- Generate transaction number
  SET v_transaction_number = CONCAT('TXN-', DATE_FORMAT(NEW.transaction_date, '%Y%m%d'), '-', LPAD(NEW.id, 5, '0'));
  
  -- Get carton_id from NEW
  SET v_carton_id = NEW.carton_id;
  
  -- ✅ AGGREGATION CHECK: Check if record exists with same criteria
  -- Matches: item_code, location (bin_location or location_id), carton_id, reference_doc, transaction_type, same day
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
        (location_id = NEW.bin_location OR bin_location = NEW.bin_location)
        OR (location_id IS NULL AND NEW.bin_location IS NULL)
        OR (bin_location IS NULL AND NEW.bin_location IS NULL)
      )
      AND (
        (carton_id = NEW.carton_id)
        OR (carton_id IS NULL AND NEW.carton_id IS NULL)
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
  
  -- If record exists, UPDATE (aggregate qty_change)
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
END$$

DELIMITER ;

-- Step 3: Verify trigger was created
SHOW TRIGGERS WHERE `Trigger` = 'trg_log_transaction_history_insert';

-- Step 4: Test aggregation (optional - check if there are unaggregated records)
SELECT 
  'Unaggregated groups' as check_type,
  COUNT(*) as count
FROM (
  SELECT 
    item_code,
    bin_location,
    carton_id,
    reference_doc,
    DATE(transaction_date) as date,
    COUNT(*) as transaction_count
  FROM tabStockTransaction
  WHERE reference_doc LIKE 'MR-%'
    AND transaction_type = 'Picking'
    AND DATE(transaction_date) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
  GROUP BY item_code, bin_location, carton_id, reference_doc, DATE(transaction_date)
  HAVING COUNT(*) > 1
) as unaggregated;
