-- ============================================================
-- CHECK STOCK CALCULATION FOR SKU-HAT-301-BLU-OS
-- This script helps diagnose why total stock doesn't match
-- ============================================================

-- Step 1: Check tabItem.stock_qty
SELECT 
  '=== ITEM STOCK (tabItem.stock_qty) ===' as Info;

SELECT 
  code as item_code,
  name as item_name,
  stock_qty,
  updated_at
FROM tabItem
WHERE code = 'SKU-HAT-301-BLU-OS';

-- Step 2: Check stock ledger entries (all locations)
SELECT 
  '=== STOCK LEDGER ENTRIES (All Locations) ===' as Info;

SELECT 
  item_code,
  warehouse,
  bin_location,
  qty,
  reserved_qty,
  last_transaction_type,
  last_transaction_ref,
  created_at,
  updated_at
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
ORDER BY warehouse, bin_location;

-- Step 3: Calculate total from stock ledger
SELECT 
  '=== CALCULATED TOTAL FROM STOCK LEDGER ===' as Info;

SELECT 
  item_code,
  COUNT(*) as location_count,
  SUM(qty) as total_qty,
  SUM(reserved_qty) as total_reserved_qty,
  SUM(qty) - SUM(reserved_qty) as available_qty
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
GROUP BY item_code;

-- Step 4: Check by warehouse
SELECT 
  '=== STOCK BY WAREHOUSE ===' as Info;

SELECT 
  item_code,
  warehouse,
  COUNT(*) as location_count,
  SUM(qty) as total_qty
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
GROUP BY item_code, warehouse
ORDER BY warehouse;

-- Step 5: Check putaway lines for this item
SELECT 
  '=== PUTAWAY LINES FOR THIS ITEM ===' as Info;

SELECT 
  pl.parent_title as putaway_task,
  pl.carton_id,
  pl.item_code,
  pl.qty as putaway_qty,
  pl.rack,
  pl.bin,
  pt.status as task_status,
  pt.created_at as task_created
FROM tabPutawayLine pl
INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title
WHERE pl.item_code = 'SKU-HAT-301-BLU-OS'
ORDER BY pt.created_at DESC, pl.rack, pl.bin;

-- Step 6: Check stock transactions for this item
SELECT 
  '=== STOCK TRANSACTIONS (Recent) ===' as Info;

SELECT 
  transaction_date,
  transaction_type,
  reference_doc,
  warehouse,
  bin_location,
  qty_change,
  qty_before,
  qty_after,
  performed_by
FROM tabStockTransaction
WHERE item_code = 'SKU-HAT-301-BLU-OS'
ORDER BY transaction_date DESC
LIMIT 20;

-- Step 7: Compare item stock vs ledger total
SELECT 
  '=== COMPARISON: Item Stock vs Ledger Total ===' as Info;

SELECT 
  i.code as item_code,
  i.name as item_name,
  i.stock_qty as item_stock_qty,
  COALESCE(SUM(sl.qty), 0) as ledger_total_qty,
  (COALESCE(SUM(sl.qty), 0) - i.stock_qty) as difference,
  CASE 
    WHEN ABS(COALESCE(SUM(sl.qty), 0) - i.stock_qty) < 0.01 THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as status
FROM tabItem i
LEFT JOIN tabStockLedger sl ON sl.item_code = i.code
WHERE i.code = 'SKU-HAT-301-BLU-OS'
GROUP BY i.code, i.name, i.stock_qty;

-- Step 8: Check for duplicate locations (same item, warehouse, bin)
SELECT 
  '=== DUPLICATE LOCATIONS (Should be 0) ===' as Info;

SELECT 
  item_code,
  warehouse,
  bin_location,
  COUNT(*) as duplicate_count,
  SUM(qty) as total_qty
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
GROUP BY item_code, warehouse, bin_location
HAVING COUNT(*) > 1;

-- Step 9: Check location breakdown details
SELECT 
  '=== LOCATION BREAKDOWN DETAILS ===' as Info;

SELECT 
  sl.item_code,
  sl.warehouse,
  sl.bin_location,
  sl.qty,
  CONCAT(sl.warehouse, 
         CASE WHEN sl.bin_location IS NOT NULL THEN CONCAT('/', sl.bin_location) ELSE '' END
  ) as full_location,
  sl.last_transaction_type,
  sl.last_transaction_ref,
  sl.created_at
FROM tabStockLedger sl
WHERE sl.item_code = 'SKU-HAT-301-BLU-OS'
ORDER BY sl.warehouse, sl.bin_location;

-- ============================================================
-- FIX: Update item stock_qty to match ledger
-- ============================================================
-- Uncomment to fix the stock_qty:
/*
UPDATE tabItem
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger
  WHERE item_code = 'SKU-HAT-301-BLU-OS'
),
updated_at = NOW()
WHERE code = 'SKU-HAT-301-BLU-OS';
*/

-- ============================================================
-- END OF SCRIPT
-- ============================================================

