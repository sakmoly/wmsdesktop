-- ============================================================
-- TEST SCRIPT: Material Request Stock Reduction
-- ============================================================
-- This script helps verify that stock is correctly reduced
-- at both item level and bin/carton level after Material Request picking
-- ============================================================

-- Replace with your test values
SET @item_code = 'SKU-JACKET-201-BLK-L';
SET @bin_location = 'A1-R01-L3-B1';  -- Or try different formats like "Rack 01-B1"
SET @carton_id = 'CTN-555444';
SET @warehouse = 'WH-MAIN';

-- 1. Check stock BEFORE picking
SELECT 
  'BEFORE PICKING' as stage,
  'tabItem' as table_name,
  code as item_code,
  stock_qty,
  updated_at
FROM tabItem
WHERE code = @item_code;

SELECT 
  'BEFORE PICKING' as stage,
  'tabStockLedger' as table_name,
  item_code,
  bin_location,
  qty,
  carton_id,
  last_transaction_type,
  last_transaction_ref,
  updated_at
FROM tabStockLedger
WHERE item_code = @item_code
  AND bin_location = @bin_location;

SELECT 
  'BEFORE PICKING' as stage,
  'tabCartonStock' as table_name,
  item_code,
  bin_location,
  carton_id,
  qty,
  status,
  updated_at
FROM tabCartonStock
WHERE item_code = @item_code
  AND bin_location = @bin_location
  AND carton_id = @carton_id;

-- 2. After picking via API, check stock again
-- (Run this after calling POST /api/material-requests/:title/pick-items)

SELECT 
  'AFTER PICKING' as stage,
  'tabItem' as table_name,
  code as item_code,
  stock_qty,
  updated_at
FROM tabItem
WHERE code = @item_code;

SELECT 
  'AFTER PICKING' as stage,
  'tabStockLedger' as table_name,
  item_code,
  bin_location,
  qty,
  carton_id,
  qty_before,
  qty_reduced,
  last_transaction_type,
  last_transaction_ref,
  updated_at
FROM tabStockLedger
WHERE item_code = @item_code
  AND bin_location = @bin_location;

SELECT 
  'AFTER PICKING' as stage,
  'tabCartonStock' as table_name,
  item_code,
  bin_location,
  carton_id,
  qty,
  status,
  updated_at
FROM tabCartonStock
WHERE item_code = @item_code
  AND bin_location = @bin_location
  AND carton_id = @carton_id;

-- 3. Check transaction history
SELECT 
  'TRANSACTION HISTORY' as stage,
  transaction_date,
  transaction_type,
  reference_doc,
  item_code,
  bin_location,
  qty_change,
  qty_before,
  qty_after,
  source_bin,
  performed_by
FROM tabStockTransaction
WHERE item_code = @item_code
  AND transaction_type = 'Picking'
  AND reference_doc_type = 'Material Request'
ORDER BY transaction_date DESC
LIMIT 5;

-- 4. Verify consistency
SELECT 
  'VERIFICATION' as stage,
  (SELECT stock_qty FROM tabItem WHERE code = @item_code) as item_stock_qty,
  (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = @item_code) as stock_ledger_total,
  (SELECT COALESCE(SUM(qty), 0) FROM tabCartonStock WHERE item_code = @item_code AND qty > 0 AND (status IS NULL OR status = '' OR status = 'PUTAWAY')) as carton_stock_total,
  CASE 
    WHEN ABS((SELECT stock_qty FROM tabItem WHERE code = @item_code) - 
              (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = @item_code)) < 0.01 
    THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as item_vs_ledger_status,
  CASE 
    WHEN ABS((SELECT stock_qty FROM tabItem WHERE code = @item_code) - 
              (SELECT COALESCE(SUM(qty), 0) FROM tabCartonStock WHERE item_code = @item_code AND qty > 0 AND (status IS NULL OR status = '' OR status = 'PUTAWAY'))) < 0.01 
    THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as item_vs_carton_status;
