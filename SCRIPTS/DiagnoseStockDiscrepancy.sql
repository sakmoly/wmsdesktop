-- ============================================================
-- DIAGNOSTIC SCRIPT: Item Qty vs Location Qty Discrepancy
-- ============================================================
-- This script helps identify why Item.stock_qty doesn't match
-- Item Location Breakdown quantities after Material Request picking
-- ============================================================

-- Replace with the item code from your image
SET @item_code = 'SKU-JACKET-201-BLK-L';
SET @bin_location = 'A1-R01-L3-B1';

-- 1. Check tabItem.stock_qty
SELECT 
  'tabItem.stock_qty' as source,
  code as item_code,
  stock_qty,
  updated_at
FROM tabItem
WHERE code = @item_code;

-- 2. Check tabStockLedger (sum by item)
SELECT 
  'tabStockLedger (SUM)' as source,
  item_code,
  SUM(qty) as total_qty,
  COUNT(*) as location_count
FROM tabStockLedger
WHERE item_code = @item_code
GROUP BY item_code;

-- 3. Check tabStockLedger (by bin location)
SELECT 
  'tabStockLedger (by bin)' as source,
  item_code,
  bin_location,
  qty,
  carton_id,
  last_transaction_type,
  last_transaction_ref,
  last_transaction_date,
  updated_at
FROM tabStockLedger
WHERE item_code = @item_code
  AND bin_location = @bin_location;

-- 4. Check tabCartonStock (sum by item)
SELECT 
  'tabCartonStock (SUM)' as source,
  item_code,
  SUM(qty) as total_qty,
  COUNT(*) as carton_count
FROM tabCartonStock
WHERE item_code = @item_code
  AND qty > 0
  AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
GROUP BY item_code;

-- 5. Check tabCartonStock (by bin location)
SELECT 
  'tabCartonStock (by bin)' as source,
  item_code,
  bin_location,
  carton_id,
  qty,
  status,
  warehouse,
  updated_at
FROM tabCartonStock
WHERE item_code = @item_code
  AND bin_location = @bin_location
  AND qty > 0
  AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
ORDER BY carton_id;

-- 6. Check ALL tabCartonStock entries for this item (all bins)
SELECT 
  'tabCartonStock (ALL bins)' as source,
  item_code,
  bin_location,
  carton_id,
  qty,
  status,
  warehouse,
  updated_at
FROM tabCartonStock
WHERE item_code = @item_code
  AND qty > 0
  AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
ORDER BY bin_location, carton_id;

-- 7. Check recent Material Request picking transactions
SELECT 
  'Recent Picking Transactions' as source,
  transaction_date,
  transaction_type,
  reference_doc,
  item_code,
  bin_location,
  qty_change,
  qty_before,
  qty_after,
  performed_by
FROM tabStockTransaction
WHERE item_code = @item_code
  AND transaction_type = 'Picking'
  AND reference_doc_type = 'Material Request'
ORDER BY transaction_date DESC
LIMIT 10;

-- 8. Check if triggers exist
SELECT 
  'Triggers' as source,
  TRIGGER_NAME,
  EVENT_OBJECT_TABLE,
  EVENT_MANIPULATION,
  ACTION_TIMING
FROM INFORMATION_SCHEMA.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
  AND TRIGGER_NAME LIKE 'trg_update_item_stock%'
ORDER BY TRIGGER_NAME;

-- 9. Summary comparison
SELECT 
  'SUMMARY' as source,
  (SELECT stock_qty FROM tabItem WHERE code = @item_code) as item_stock_qty,
  (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = @item_code) as stock_ledger_total,
  (SELECT COALESCE(SUM(qty), 0) FROM tabCartonStock WHERE item_code = @item_code AND qty > 0 AND (status IS NULL OR status = '' OR status = 'PUTAWAY')) as carton_stock_total,
  CASE 
    WHEN ABS((SELECT stock_qty FROM tabItem WHERE code = @item_code) - 
              (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = @item_code)) < 0.01 
    THEN '✅ Match (Item vs StockLedger)'
    ELSE '❌ Mismatch (Item vs StockLedger)'
  END as item_vs_ledger,
  CASE 
    WHEN ABS((SELECT stock_qty FROM tabItem WHERE code = @item_code) - 
              (SELECT COALESCE(SUM(qty), 0) FROM tabCartonStock WHERE item_code = @item_code AND qty > 0 AND (status IS NULL OR status = '' OR status = 'PUTAWAY'))) < 0.01 
    THEN '✅ Match (Item vs CartonStock)'
    ELSE '❌ Mismatch (Item vs CartonStock)'
  END as item_vs_carton;
