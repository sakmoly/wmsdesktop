-- ============================================================
-- FIX OLD STOCK LEDGER RECORDS
-- ============================================================
-- This script fixes old records where qty_before and qty_reduced
-- have incorrect values
-- ============================================================

-- Step 1: Update qty_before for records where it's NULL or 0
-- Calculate qty_before from qty_reduced and remaining stock
UPDATE tabStockLedger
SET qty_before = qty + ABS(qty_reduced)
WHERE (qty_before IS NULL OR qty_before = 0)
  AND qty_reduced IS NOT NULL
  AND qty_reduced > 0
  AND last_transaction_type = 'Picking';

-- Step 2: Update qty_reduced to negative for picking transactions
-- Old records might have positive values (wrong), should be negative
UPDATE tabStockLedger
SET qty_reduced = -ABS(qty_reduced)
WHERE last_transaction_type = 'Picking'
  AND qty_reduced > 0;

-- Step 3: Verify the updates
SELECT 
  item_code,
  qty as remaining_stock,
  qty_before,
  qty_reduced,
  last_transaction_type,
  last_transaction_ref,
  CASE 
    WHEN qty_reduced IS NOT NULL THEN ABS(qty_reduced)
    WHEN qty_before IS NOT NULL AND qty_before > 0 THEN ABS(qty_before - qty)
    ELSE 0
  END as calculated_transaction_qty
FROM tabStockLedger
WHERE last_transaction_ref = 'MR-123457'
  AND last_transaction_type = 'Picking'
ORDER BY last_transaction_date DESC;

SELECT '✅ Old Stock Ledger records updated!' as Status;
