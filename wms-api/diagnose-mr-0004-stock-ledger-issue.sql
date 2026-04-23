-- Diagnostic SQL Script: Check MR-0004 Stock Ledger Issue
-- This script helps diagnose why stock ledger shows -1.00 instead of total picked quantity

-- 1. Check all stock transactions for MR-0004 (individual scans)
SELECT 
  id,
  transaction_date,
  item_code,
  bin_location,
  carton_id,
  reference_doc,
  qty_change,
  qty_before,
  qty_after,
  transaction_type
FROM tabStockTransaction
WHERE reference_doc = 'MR-0004'
ORDER BY transaction_date, id;

-- 2. Check aggregated transaction history for MR-0004
SELECT 
  id,
  transaction_date,
  item_code,
  bin_location,
  carton_id,
  reference_doc,
  qty_change,
  qty_before,
  qty_after,
  transaction_type
FROM tabTransactionHistory
WHERE reference_doc = 'MR-0004'
ORDER BY transaction_date, id;

-- 3. Check stock ledger entries for MR-0004 items
SELECT 
  item_code,
  warehouse,
  bin_location,
  qty,
  qty_before,
  qty_reduced,
  last_transaction_type,
  last_transaction_ref,
  last_transaction_date
FROM tabStockLedger
WHERE item_code IN (
  SELECT DISTINCT item_code 
  FROM tabStockTransaction 
  WHERE reference_doc = 'MR-0004'
)
ORDER BY item_code, bin_location;

-- 4. Check Material Request Item picked quantities
SELECT 
  item_code,
  requested_qty,
  picked_qty,
  scan_qty,
  status
FROM tabMaterialRequestItem
WHERE parent_title = 'MR-0004';

-- 5. Compare: Stock Transaction vs Transaction History vs Stock Ledger
-- This shows if aggregation is working correctly
SELECT 
  'Stock Transaction' as source,
  item_code,
  bin_location,
  COUNT(*) as transaction_count,
  SUM(qty_change) as total_qty_change,
  MIN(qty_before) as first_qty_before,
  MAX(qty_after) as last_qty_after
FROM tabStockTransaction
WHERE reference_doc = 'MR-0004'
GROUP BY item_code, bin_location

UNION ALL

SELECT 
  'Transaction History' as source,
  item_code,
  bin_location,
  COUNT(*) as transaction_count,
  SUM(qty_change) as total_qty_change,
  MIN(qty_before) as first_qty_before,
  MAX(qty_after) as last_qty_after
FROM tabTransactionHistory
WHERE reference_doc = 'MR-0004'
GROUP BY item_code, bin_location

UNION ALL

SELECT 
  'Stock Ledger' as source,
  item_code,
  bin_location,
  1 as transaction_count,
  qty_reduced as total_qty_change,
  qty_before as first_qty_before,
  qty as last_qty_after
FROM tabStockLedger
WHERE item_code IN (
  SELECT DISTINCT item_code 
  FROM tabStockTransaction 
  WHERE reference_doc = 'MR-0004'
)
ORDER BY item_code, bin_location, source;

-- 6. Check for SKU-HAT-301-GRN-OS specifically (the item showing -1.00)
SELECT 
  'Stock Transaction' as source,
  transaction_date,
  qty_change,
  qty_before,
  qty_after,
  bin_location,
  carton_id
FROM tabStockTransaction
WHERE reference_doc = 'MR-0004'
  AND item_code = 'SKU-HAT-301-GRN-OS'
ORDER BY transaction_date;

SELECT 
  'Transaction History' as source,
  transaction_date,
  qty_change,
  qty_before,
  qty_after,
  bin_location,
  carton_id
FROM tabTransactionHistory
WHERE reference_doc = 'MR-0004'
  AND item_code = 'SKU-HAT-301-GRN-OS'
ORDER BY transaction_date;

SELECT 
  'Stock Ledger' as source,
  last_transaction_date as transaction_date,
  qty_reduced as qty_change,
  qty_before,
  qty as qty_after,
  bin_location,
  carton_id
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-GRN-OS'
  AND last_transaction_ref = 'MR-0004'
ORDER BY last_transaction_date;

-- 7. Verify aggregation trigger is active
SHOW TRIGGERS WHERE `Trigger` = 'trg_log_transaction_history_insert';

-- 8. Check trigger definition
SHOW CREATE TRIGGER trg_log_transaction_history_insert;
