-- ============================================================
-- UPDATE TRANSACTION HISTORY WITH CARTON_ID
-- Run this AFTER creating tabTransactionHistory table
-- This will populate carton_id from tabStockTransaction if column exists
-- ============================================================

-- Check if carton_id column exists in tabStockTransaction
SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN 'carton_id column EXISTS in tabStockTransaction'
    ELSE 'carton_id column DOES NOT EXIST in tabStockTransaction'
  END as carton_id_status
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabStockTransaction'
  AND COLUMN_NAME = 'carton_id';

-- If carton_id exists, update history table
-- Note: This will only work if carton_id column exists in tabStockTransaction
UPDATE tabTransactionHistory th
INNER JOIN tabStockTransaction ts ON th.transaction_id = ts.id
SET th.carton_id = ts.carton_id
WHERE ts.carton_id IS NOT NULL
  AND EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'tabStockTransaction' 
    AND COLUMN_NAME = 'carton_id'
  );

-- Verify update
SELECT 
  COUNT(*) as total_records,
  COUNT(carton_id) as records_with_carton_id,
  COUNT(*) - COUNT(carton_id) as records_without_carton_id
FROM tabTransactionHistory;

SELECT '✅ Transaction History carton_id updated (if column exists)' as Status;
