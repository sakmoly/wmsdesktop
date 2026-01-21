-- ============================================================
-- VERIFY STOCK UPDATE QUERIES
-- Run these queries to check if stock updates actually happened
-- ============================================================

-- Query 1: Check if stock ledger has entries for this putaway task
SELECT 
  '=== STOCK LEDGER ENTRIES ===' as Info;

SELECT 
  item_code,
  warehouse,
  bin_location,
  qty,
  last_transaction_type,
  last_transaction_ref,
  updated_at,
  created_at
FROM tabStockLedger
WHERE last_transaction_ref = 'PUT-20260120-0001'
ORDER BY updated_at DESC;

-- Query 2: Check transaction history
SELECT 
  '=== TRANSACTION HISTORY ENTRIES ===' as Info;

SELECT 
  id,
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

-- Query 3: Check if items have stock at the location
SELECT 
  '=== STOCK AT LOCATION A1-R02-L1-B2 ===' as Info;

SELECT 
  item_code,
  warehouse,
  bin_location,
  qty,
  last_transaction_type,
  last_transaction_ref,
  updated_at
FROM tabStockLedger
WHERE bin_location = 'A1-R02-L1-B2'
  AND item_code IN ('SKU-HAT-301-BLU-OS', 'SKU-HAT-301-GRN-OS')
ORDER BY item_code;

-- Query 4: Check total stock for these items (all locations)
SELECT 
  '=== TOTAL STOCK FOR ITEMS ===' as Info;

SELECT 
  item_code,
  warehouse,
  SUM(qty) as total_qty,
  COUNT(DISTINCT bin_location) as location_count
FROM tabStockLedger
WHERE item_code IN ('SKU-HAT-301-BLU-OS', 'SKU-HAT-301-GRN-OS')
  AND warehouse = 'WH-MAIN'
GROUP BY item_code, warehouse;

-- Query 5: Check tabItem.stock_qty
SELECT 
  '=== ITEM STOCK QTY ===' as Info;

SELECT 
  code as item_code,
  name as item_name,
  stock_qty,
  updated_at
FROM tabItem
WHERE code IN ('SKU-HAT-301-BLU-OS', 'SKU-HAT-301-GRN-OS');

-- Query 6: Check putaway lines location (to verify location was assigned)
SELECT 
  '=== PUTAWAY LINES LOCATION ===' as Info;

SELECT 
  item_code,
  qty,
  location_id,
  rack,
  bin,
  carton_id,
  updated_at
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260120-0001';

-- ============================================================
-- DIAGNOSIS
-- ============================================================
-- If Query 1 returns 0 rows:
--   → Stock ledger updates didn't happen
--   → Check backend logs for errors
--
-- If Query 2 returns 0 rows:
--   → Transaction history wasn't inserted
--   → Check backend logs for errors
--
-- If Query 3 returns 0 rows:
--   → Stock wasn't added to location A1-R02-L1-B2
--   → Check if location_id was passed correctly
--
-- If Query 6 shows location_id IS NULL:
--   → Location wasn't assigned to putaway lines
--   → Need to assign location first
-- ============================================================
