-- ============================================================
-- CHECK FOR DUPLICATE STOCK RECORDS
-- ============================================================
-- This script helps identify duplicate records that might cause
-- Item Location Breakdown to show incorrect quantities
-- ============================================================

-- Replace with your test values
SET @item_code = 'SKU-HAT-301-BLU-OS';
SET @bin_location = 'A1-R01-L3-B1';
SET @carton_id = 'CTN-555444';
SET @warehouse = 'WH-MAIN';

-- 1. Check for duplicate records in tabStockLedger
SELECT 
  'tabStockLedger Duplicates' as check_type,
  item_code,
  warehouse,
  bin_location,
  carton_id,
  COUNT(*) as record_count,
  SUM(qty) as total_qty,
  GROUP_CONCAT(id ORDER BY id) as record_ids
FROM tabStockLedger
WHERE item_code = @item_code
  AND bin_location = @bin_location
  AND warehouse = @warehouse
GROUP BY item_code, warehouse, bin_location, carton_id
HAVING COUNT(*) > 1;

-- 2. Check for duplicate records in tabCartonStock
SELECT 
  'tabCartonStock Duplicates' as check_type,
  carton_id,
  item_code,
  warehouse,
  bin_location,
  COUNT(*) as record_count,
  SUM(qty) as total_qty,
  GROUP_CONCAT(id ORDER BY id) as record_ids
FROM tabCartonStock
WHERE item_code = @item_code
  AND bin_location = @bin_location
  AND carton_id = @carton_id
  AND warehouse = @warehouse
GROUP BY carton_id, item_code, warehouse, bin_location
HAVING COUNT(*) > 1;

-- 3. Check ALL records in tabStockLedger for this item+bin
SELECT 
  'tabStockLedger All Records' as check_type,
  id,
  item_code,
  warehouse,
  bin_location,
  carton_id,
  qty,
  qty_before,
  qty_reduced,
  last_transaction_type,
  last_transaction_ref,
  updated_at,
  created_at
FROM tabStockLedger
WHERE item_code = @item_code
  AND bin_location = @bin_location
  AND warehouse = @warehouse
ORDER BY updated_at DESC, created_at DESC;

-- 4. Check ALL records in tabCartonStock for this item+bin+carton
SELECT 
  'tabCartonStock All Records' as check_type,
  id,
  carton_id,
  item_code,
  warehouse,
  bin_location,
  qty,
  status,
  updated_at,
  created_at
FROM tabCartonStock
WHERE item_code = @item_code
  AND bin_location = @bin_location
  AND carton_id = @carton_id
  AND warehouse = @warehouse
ORDER BY updated_at DESC, created_at DESC;

-- 5. Check recent transactions for this item
SELECT 
  'Recent Transactions' as check_type,
  id,
  transaction_date,
  transaction_type,
  reference_doc_type,
  reference_doc,
  item_code,
  bin_location,
  qty_change,
  qty_before,
  qty_after,
  carton_id
FROM tabStockTransaction
WHERE item_code = @item_code
  AND bin_location = @bin_location
ORDER BY transaction_date DESC
LIMIT 10;

-- 6. Summary: Expected vs Actual
SELECT 
  'SUMMARY' as check_type,
  (SELECT stock_qty FROM tabItem WHERE code = @item_code) as item_stock_qty,
  (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = @item_code AND bin_location = @bin_location AND warehouse = @warehouse) as stock_ledger_qty,
  (SELECT COALESCE(SUM(qty), 0) FROM tabCartonStock WHERE item_code = @item_code AND bin_location = @bin_location AND carton_id = @carton_id AND warehouse = @warehouse) as carton_stock_qty,
  (SELECT COUNT(*) FROM tabStockLedger WHERE item_code = @item_code AND bin_location = @bin_location AND warehouse = @warehouse) as stock_ledger_record_count,
  (SELECT COUNT(*) FROM tabCartonStock WHERE item_code = @item_code AND bin_location = @bin_location AND carton_id = @carton_id AND warehouse = @warehouse) as carton_stock_record_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM tabStockLedger WHERE item_code = @item_code AND bin_location = @bin_location AND warehouse = @warehouse) > 1 
    THEN '❌ Duplicate records in tabStockLedger'
    ELSE '✅ No duplicates in tabStockLedger'
  END as stock_ledger_status,
  CASE 
    WHEN (SELECT COUNT(*) FROM tabCartonStock WHERE item_code = @item_code AND bin_location = @bin_location AND carton_id = @carton_id AND warehouse = @warehouse) > 1 
    THEN '❌ Duplicate records in tabCartonStock'
    ELSE '✅ No duplicates in tabCartonStock'
  END as carton_stock_status;
