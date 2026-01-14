-- ============================================================
-- AUTO FIX STOCK DISCREPANCY FOR ALL ITEMS
-- This script automatically fixes stock discrepancies for ALL items
-- Use this if you want to fix the entire database
-- ============================================================

-- ============================================================
-- STEP 1: DELETE DUPLICATE RECORDS IN tabCartonStock (All Items)
-- ============================================================

SELECT 
  '=== STEP 1: DELETING DUPLICATE RECORDS (All Items) ===' as info;

-- Count total duplicates before deletion
SET @total_duplicates = (
  SELECT COUNT(*) 
  FROM (
    SELECT carton_id, item_code, bin_location, warehouse, batch_no
    FROM tabCartonStock
    WHERE qty > 0
      AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
    GROUP BY carton_id, item_code, bin_location, warehouse, batch_no
    HAVING COUNT(*) > 1
  ) duplicates
);

SELECT CONCAT('Found ', @total_duplicates, ' duplicate groups across all items') as info;

-- Delete duplicates, keeping only the most recent record (highest id)
DELETE cs1 FROM tabCartonStock cs1
INNER JOIN (
  SELECT 
    carton_id,
    item_code,
    warehouse,
    bin_location,
    batch_no,
    MAX(id) as max_id
  FROM tabCartonStock
  WHERE qty > 0
    AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
  GROUP BY carton_id, item_code, warehouse, bin_location, batch_no
) latest
  ON cs1.carton_id = latest.carton_id
  AND cs1.item_code = latest.item_code
  AND cs1.warehouse = latest.warehouse
  AND cs1.bin_location = latest.bin_location
  AND (cs1.batch_no = latest.batch_no OR (cs1.batch_no IS NULL AND latest.batch_no IS NULL))
  AND cs1.id < latest.max_id;

SELECT CONCAT('Deleted duplicate records. Rows affected: ', ROW_COUNT()) as info;

-- ============================================================
-- STEP 2: UPDATE tabItem.stock_qty FOR ALL ITEMS
-- ============================================================

SELECT 
  '=== STEP 2: UPDATING tabItem.stock_qty (All Items) ===' as info;

UPDATE tabItem
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger
  WHERE item_code = tabItem.code
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1 
  FROM tabStockLedger 
  WHERE item_code = tabItem.code
);

SELECT CONCAT('Updated tabItem.stock_qty for all items. Rows affected: ', ROW_COUNT()) as info;

-- ============================================================
-- STEP 3: VERIFICATION - Check Items with Mismatches
-- ============================================================

SELECT 
  '=== STEP 3: VERIFICATION - Items with Mismatches ===' as info;

SELECT 
  i.code as item_code,
  i.name as item_name,
  i.stock_qty as item_stock_qty,
  (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = i.code) as ledger_total,
  ABS(i.stock_qty - (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = i.code)) as difference,
  CASE 
    WHEN ABS(i.stock_qty - (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = i.code)) < 0.01 THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as status
FROM tabItem i
WHERE EXISTS (
  SELECT 1 
  FROM tabStockLedger 
  WHERE item_code = i.code
)
HAVING ABS(item_stock_qty - ledger_total) >= 0.01
ORDER BY ABS(difference) DESC
LIMIT 20;

-- ============================================================
-- STEP 4: SUMMARY
-- ============================================================

SELECT 
  '=== STEP 4: SUMMARY ===' as info;

SELECT 
  'Auto-fix completed for all items!' as message,
  CONCAT('Duplicates removed: ', @total_duplicates) as duplicates_removed,
  CONCAT('Items updated: ', (SELECT COUNT(*) FROM tabItem WHERE EXISTS (SELECT 1 FROM tabStockLedger WHERE item_code = tabItem.code))) as items_updated,
  'Please refresh the desktop app to see the changes' as next_step;

-- ============================================================
-- END OF AUTO FIX SCRIPT (ALL ITEMS)
-- ============================================================
-- 
-- After running this script:
-- 1. Refresh the Items list in the desktop app
-- 2. All items should now have correct stock_qty
-- 3. Item Location Breakdown should match Main Items table
-- ============================================================
