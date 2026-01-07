-- ============================================================
-- FIX ITEM STOCK QUANTITY DISPLAY
-- This script ensures tabItem.stock_qty matches the sum from tabStockLedger
-- Run this if stock quantities are not showing in the main Items screen
-- ============================================================

-- Step 1: Update all items' stock_qty from stock ledger
UPDATE tabItem i
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger sl
  WHERE sl.item_code = i.code
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1 
  FROM tabStockLedger sl 
  WHERE sl.item_code = i.code
);

-- Step 2: Show verification - items with stock in ledger
SELECT 
  '=== ITEMS WITH STOCK IN LEDGER ===' as Info;

SELECT 
  i.code as item_code,
  i.name as item_name,
  i.stock_qty as item_stock_qty,
  COALESCE(SUM(sl.qty), 0) as ledger_total_qty,
  COUNT(DISTINCT sl.bin_location) as location_count
FROM tabItem i
LEFT JOIN tabStockLedger sl ON sl.item_code = i.code
WHERE EXISTS (
  SELECT 1 
  FROM tabStockLedger 
  WHERE item_code = i.code
)
GROUP BY i.code, i.name, i.stock_qty
ORDER BY ledger_total_qty DESC
LIMIT 20;

-- Step 3: Show items that need fixing (mismatch between item and ledger)
SELECT 
  '=== ITEMS NEEDING FIX (Mismatch) ===' as Info;

SELECT 
  i.code as item_code,
  i.name as item_name,
  i.stock_qty as current_item_stock,
  COALESCE(SUM(sl.qty), 0) as correct_stock_from_ledger,
  (COALESCE(SUM(sl.qty), 0) - i.stock_qty) as difference
FROM tabItem i
LEFT JOIN tabStockLedger sl ON sl.item_code = i.code
GROUP BY i.code, i.name, i.stock_qty
HAVING COALESCE(SUM(sl.qty), 0) != i.stock_qty
ORDER BY ABS(difference) DESC;

-- Step 4: Show specific item from your test (SKU-JEANS-021-BLU-32)
SELECT 
  '=== TEST ITEM DETAILS ===' as Info;

SELECT 
  i.code as item_code,
  i.name as item_name,
  i.stock_qty as item_stock_qty,
  COALESCE(SUM(sl.qty), 0) as ledger_total_qty
FROM tabItem i
LEFT JOIN tabStockLedger sl ON sl.item_code = i.code
WHERE i.code = 'SKU-JEANS-021-BLU-32'
GROUP BY i.code, i.name, i.stock_qty;

-- Show locations for this item
SELECT 
  '=== LOCATIONS FOR TEST ITEM ===' as Info;

SELECT 
  item_code,
  warehouse,
  bin_location,
  qty,
  last_transaction_type,
  last_transaction_ref
FROM tabStockLedger
WHERE item_code = 'SKU-JEANS-021-BLU-32'
ORDER BY bin_location;

-- ============================================================
-- INSTRUCTIONS
-- ============================================================
-- 1. Run this script to update all item stock quantities
-- 2. Refresh the Items list in the desktop app (close and reopen, or click refresh if available)
-- 3. The stock quantities should now match the location breakdown
-- ============================================================

