-- ============================================================
-- DIAGNOSE STOCK UPDATE ISSUE
-- Run this to check why stock is not updating after trigger
-- ============================================================

-- Step 1: Check Putaway Task Status
SELECT 
  '=== PUTAWAY TASK STATUS ===' as Info;

SELECT 
  title as putaway_task,
  status,
  source_type,
  transfer_in,
  warehouse,
  created_at
FROM tabPutawayTask
WHERE title = 'PUT-20260120-0001';

-- Step 2: Check Putaway Lines - DO THEY HAVE LOCATION?
SELECT 
  '=== PUTAWAY LINES - LOCATION CHECK ===' as Info;

SELECT 
  pl.item_code,
  pl.qty,
  pl.location_id,
  pl.rack,
  pl.bin,
  pl.carton_id,
  CASE 
    WHEN pl.location_id IS NOT NULL THEN '✅ Has location_id'
    WHEN pl.rack IS NOT NULL OR pl.bin IS NOT NULL THEN '⚠️ Has rack/bin (no location_id)'
    ELSE '❌ NO LOCATION'
  END as location_status
FROM tabPutawayLine pl
WHERE pl.parent_title = 'PUT-20260120-0001';

-- Step 3: Check Stock Ledger - IS STOCK THERE?
SELECT 
  '=== STOCK LEDGER CHECK ===' as Info;

SELECT 
  item_code,
  warehouse,
  bin_location,
  qty,
  last_transaction_type,
  last_transaction_ref,
  updated_at
FROM tabStockLedger
WHERE last_transaction_ref = 'PUT-20260120-0001'
ORDER BY updated_at DESC;

-- Step 4: Check Transaction History - ARE TRANSACTIONS RECORDED?
SELECT 
  '=== TRANSACTION HISTORY CHECK ===' as Info;

SELECT 
  transaction_type,
  warehouse,
  bin_location,
  location_id,
  item_code,
  qty_change,
  reference_doc,
  created_at
FROM tabTransactionHistory
WHERE reference_doc = 'PUT-20260120-0001'
ORDER BY created_at DESC;

-- Step 5: Check tabItem.stock_qty - IS IT UPDATED?
SELECT 
  '=== ITEM STOCK QTY CHECK ===' as Info;

SELECT 
  i.code as item_code,
  i.name as item_name,
  i.stock_qty as item_stock_qty,
  COALESCE(SUM(sl.qty), 0) as ledger_total_qty,
  CASE 
    WHEN ABS(i.stock_qty - COALESCE(SUM(sl.qty), 0)) < 0.01 THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as status
FROM tabItem i
LEFT JOIN tabStockLedger sl ON sl.item_code = i.code
WHERE i.code IN ('SKU-HAT-301-BLU-OS', 'SKU-HAT-301-GRN-OS')
GROUP BY i.code, i.name, i.stock_qty;

-- Step 6: Check for Stock with Location A1-R02-L1-B2
SELECT 
  '=== STOCK AT LOCATION A1-R02-L1-B2 ===' as Info;

SELECT 
  item_code,
  warehouse,
  bin_location,
  qty,
  last_transaction_type,
  last_transaction_ref
FROM tabStockLedger
WHERE bin_location = 'A1-R02-L1-B2'
  AND item_code IN ('SKU-HAT-301-BLU-OS', 'SKU-HAT-301-GRN-OS')
ORDER BY item_code;

-- Step 7: Check tabCartonStock (if exists)
SELECT 
  '=== CARTON STOCK CHECK ===' as Info;

SELECT 
  carton_id,
  item_code,
  warehouse,
  bin_location,
  qty,
  status,
  updated_at
FROM tabCartonStock
WHERE carton_id = 'CTN-TI-123457-20260120-001335-578'
  AND item_code IN ('SKU-HAT-301-BLU-OS', 'SKU-HAT-301-GRN-OS')
ORDER BY item_code, updated_at DESC;

-- ============================================================
-- SUMMARY
-- ============================================================
-- After running this:
-- 1. If putaway lines have NO location_id → Location needs to be assigned first
-- 2. If stock ledger is empty → Stock updates didn't happen
-- 3. If transaction history is empty → processPutawayCompletionEvent didn't run
-- 4. If tabItem.stock_qty is 0 but ledger has stock → Need to update tabItem
-- ============================================================
