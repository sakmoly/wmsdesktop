-- Diagnostic SQL Script for MR-0003 Qty Change Bug
-- Run these queries to identify the root cause

-- 1. Check Material Request Item Picked Quantities
SELECT 
  item_code,
  requested_qty,
  picked_qty,
  scan_qty,
  status,
  updated_at
FROM tabMaterialRequestItem
WHERE parent_title = 'MR-0003'
ORDER BY item_code;

-- 2. Check ALL Stock Transactions for MR-0003 (Individual scans)
SELECT 
  id,
  transaction_date,
  item_code,
  warehouse,
  bin_location,
  carton_id,
  reference_doc,
  qty_change,
  qty_before,
  qty_after,
  transaction_type,
  performed_by,
  created_at
FROM tabStockTransaction
WHERE reference_doc = 'MR-0003'
ORDER BY transaction_date, id;

-- 3. Check Aggregated Transaction History for MR-0003
SELECT 
  id,
  transaction_date,
  item_code,
  warehouse,
  bin_location,
  location_id,
  carton_id,
  reference_doc,
  qty_change,
  qty_before,
  qty_after,
  transaction_type,
  performed_by,
  updated_at
FROM tabTransactionHistory
WHERE reference_doc = 'MR-0003'
ORDER BY transaction_date, id;

-- 4. Compare: Sum of individual transactions vs aggregated history
SELECT 
  'Individual Transactions' as source,
  item_code,
  bin_location,
  carton_id,
  COUNT(*) as transaction_count,
  SUM(qty_change) as total_qty_change,
  MIN(qty_before) as first_qty_before,
  MAX(qty_after) as last_qty_after
FROM tabStockTransaction
WHERE reference_doc = 'MR-0003'
GROUP BY item_code, bin_location, carton_id

UNION ALL

SELECT 
  'Aggregated History' as source,
  item_code,
  bin_location,
  carton_id,
  1 as transaction_count,
  qty_change as total_qty_change,
  qty_before as first_qty_before,
  qty_after as last_qty_after
FROM tabTransactionHistory
WHERE reference_doc = 'MR-0003'
ORDER BY item_code, source;

-- 5. Check for transactions that should be aggregated but aren't
-- (Same item, location, carton, reference, same day, but multiple records)
SELECT 
  item_code,
  bin_location,
  carton_id,
  reference_doc,
  DATE(transaction_date) as date,
  COUNT(*) as transaction_count,
  SUM(qty_change) as total_qty_change,
  MIN(qty_before) as first_qty_before,
  MAX(qty_after) as last_qty_after,
  GROUP_CONCAT(id ORDER BY transaction_date SEPARATOR ', ') as transaction_ids
FROM tabStockTransaction
WHERE reference_doc = 'MR-0003'
GROUP BY item_code, bin_location, carton_id, reference_doc, DATE(transaction_date)
HAVING COUNT(*) > 1;

-- 6. Check if aggregation trigger is active
SHOW TRIGGERS WHERE `Trigger` = 'trg_log_transaction_history_insert';

-- 7. Check Stock Ledger for MR-0003 items
SELECT 
  sl.item_code,
  sl.warehouse,
  sl.bin_location,
  sl.carton_id,
  sl.qty,
  sl.qty_before,
  sl.qty_reduced,
  sl.last_transaction_date,
  sl.last_transaction_type,
  sl.last_transaction_ref
FROM tabStockLedger sl
WHERE sl.last_transaction_ref = 'MR-0003'
ORDER BY sl.item_code, sl.bin_location;

-- 8. Verify: Calculate expected qty_change from picked_qty
SELECT 
  mri.item_code,
  mri.requested_qty,
  mri.picked_qty,
  CASE 
    WHEN mri.picked_qty > 0 THEN -mri.picked_qty
    ELSE 0
  END as expected_qty_change
FROM tabMaterialRequestItem mri
WHERE mri.parent_title = 'MR-0003'
ORDER BY mri.item_code;
