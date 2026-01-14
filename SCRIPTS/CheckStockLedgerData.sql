-- ============================================================
-- CHECK STOCK LEDGER DATA FOR MR-123457
-- ============================================================
-- This script checks the actual data in tabStockLedger
-- to verify qty_before and qty_reduced values
-- ============================================================

-- Check picking transactions for MR-123457
SELECT 
  item_code,
  warehouse,
  bin_location,
  qty as remaining_stock,
  qty_before,
  qty_reduced,
  last_transaction_type,
  last_transaction_ref,
  last_transaction_date,
  CASE 
    WHEN qty_reduced IS NOT NULL THEN ABS(qty_reduced)
    WHEN qty_before IS NOT NULL AND qty_before > 0 THEN ABS(qty_before - qty)
    ELSE qty
  END as calculated_transaction_qty
FROM tabStockLedger
WHERE last_transaction_ref = 'MR-123457'
  AND last_transaction_type = 'Picking'
ORDER BY last_transaction_date DESC, item_code;

-- Check if qty_before and qty_reduced columns exist
SELECT 
  COLUMN_NAME,
  DATA_TYPE,
  IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabStockLedger'
  AND COLUMN_NAME IN ('qty_before', 'qty_reduced')
ORDER BY COLUMN_NAME;

-- Summary: Count records with/without qty_before and qty_reduced
SELECT 
  last_transaction_type,
  COUNT(*) as total_records,
  SUM(CASE WHEN qty_before IS NULL OR qty_before = 0 THEN 1 ELSE 0 END) as records_without_qty_before,
  SUM(CASE WHEN qty_before IS NOT NULL AND qty_before > 0 THEN 1 ELSE 0 END) as records_with_qty_before,
  SUM(CASE WHEN qty_reduced IS NULL THEN 1 ELSE 0 END) as records_without_qty_reduced,
  SUM(CASE WHEN qty_reduced IS NOT NULL THEN 1 ELSE 0 END) as records_with_qty_reduced
FROM tabStockLedger
WHERE last_transaction_ref = 'MR-123457'
GROUP BY last_transaction_type;
