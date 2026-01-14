-- ============================================================
-- AUTO FIX STOCK DISCREPANCY
-- This script automatically diagnoses and fixes stock discrepancies
-- Run this script to fix the issue between Main Items table and Item Location Breakdown
-- ============================================================

SET @item_code = 'SKU-HAT-301-BLU-OS';  -- Change this to the item you want to fix

-- ============================================================
-- STEP 1: DIAGNOSTIC - Check Current State
-- ============================================================

SELECT 
  '=== STEP 1: CURRENT STATE ===' as info;

SELECT 
  i.code as item_code,
  i.stock_qty as item_stock_qty,
  (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = i.code) as ledger_total,
  (SELECT COUNT(*) FROM tabCartonStock WHERE item_code = i.code 
    AND qty > 0 AND (status IS NULL OR status = '' OR status = 'PUTAWAY')) as carton_stock_record_count,
  CASE 
    WHEN ABS(i.stock_qty - (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = i.code)) < 0.01 THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as status
FROM tabItem i
WHERE i.code = @item_code;

-- ============================================================
-- STEP 2: IDENTIFY DUPLICATE RECORDS
-- ============================================================

SELECT 
  '=== STEP 2: DUPLICATE RECORDS CHECK ===' as info;

SELECT 
  carton_id,
  item_code,
  bin_location,
  warehouse,
  batch_no,
  COUNT(*) as duplicate_count,
  SUM(qty) as total_qty_sum,
  MAX(id) as latest_id,
  GROUP_CONCAT(id ORDER BY id DESC) as all_ids
FROM tabCartonStock
WHERE item_code = @item_code
  AND qty > 0
  AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
GROUP BY carton_id, item_code, bin_location, warehouse, batch_no
HAVING COUNT(*) > 1;

-- ============================================================
-- STEP 3: DELETE DUPLICATE RECORDS (Keep Only Latest)
-- ============================================================

SELECT 
  '=== STEP 3: DELETING DUPLICATE RECORDS ===' as info;

-- Count duplicates before deletion
SET @duplicate_count_before = (
  SELECT COUNT(*) 
  FROM (
    SELECT carton_id, item_code, bin_location, warehouse, batch_no
    FROM tabCartonStock
    WHERE item_code = @item_code
      AND qty > 0
      AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
    GROUP BY carton_id, item_code, bin_location, warehouse, batch_no
    HAVING COUNT(*) > 1
  ) duplicates
);

SELECT CONCAT('Found ', @duplicate_count_before, ' duplicate groups') as info;

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
  WHERE item_code = @item_code
    AND qty > 0
    AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
  GROUP BY carton_id, item_code, warehouse, bin_location, batch_no
) latest
  ON cs1.carton_id = latest.carton_id
  AND cs1.item_code = latest.item_code
  AND cs1.warehouse = latest.warehouse
  AND cs1.bin_location = latest.bin_location
  AND (cs1.batch_no = latest.batch_no OR (cs1.batch_no IS NULL AND latest.batch_no IS NULL))
  AND cs1.id < latest.max_id
WHERE cs1.item_code = @item_code;

SELECT CONCAT('Deleted duplicate records. Rows affected: ', ROW_COUNT()) as info;

-- ============================================================
-- STEP 4: UPDATE tabItem.stock_qty FROM tabStockLedger
-- ============================================================

SELECT 
  '=== STEP 4: UPDATING tabItem.stock_qty ===' as info;

UPDATE tabItem
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger
  WHERE item_code = tabItem.code
),
updated_at = NOW()
WHERE code = @item_code;

SELECT CONCAT('Updated tabItem.stock_qty. Rows affected: ', ROW_COUNT()) as info;

-- ============================================================
-- STEP 5: VERIFICATION - Check if Fix Worked
-- ============================================================

SELECT 
  '=== STEP 5: VERIFICATION ===' as info;

SELECT 
  i.code as item_code,
  i.stock_qty as item_stock_qty,
  (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = i.code) as ledger_total,
  (SELECT COALESCE(SUM(cs.qty), 0) FROM tabCartonStock cs
    INNER JOIN (
      SELECT 
        carton_id,
        item_code,
        warehouse,
        bin_location,
        batch_no,
        MAX(id) as max_id
      FROM tabCartonStock
      WHERE item_code = cs.item_code
        AND qty > 0
        AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
      GROUP BY carton_id, item_code, warehouse, bin_location, batch_no
    ) latest
      ON cs.carton_id = latest.carton_id
      AND cs.item_code = latest.item_code
      AND cs.warehouse = latest.warehouse
      AND cs.bin_location = latest.bin_location
      AND (cs.batch_no = latest.batch_no OR (cs.batch_no IS NULL AND latest.batch_no IS NULL))
      AND cs.id = latest.max_id
    WHERE cs.item_code = i.code
      AND cs.qty > 0
      AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')) as carton_stock_total_corrected,
  CASE 
    WHEN ABS(i.stock_qty - (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = i.code)) < 0.01 
         AND ABS(i.stock_qty - (SELECT COALESCE(SUM(cs.qty), 0) FROM tabCartonStock cs
           INNER JOIN (
             SELECT carton_id, item_code, warehouse, bin_location, batch_no, MAX(id) as max_id
             FROM tabCartonStock
             WHERE item_code = cs.item_code
               AND qty > 0
               AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
             GROUP BY carton_id, item_code, warehouse, bin_location, batch_no
           ) latest
             ON cs.carton_id = latest.carton_id
             AND cs.item_code = latest.item_code
             AND cs.warehouse = latest.warehouse
             AND cs.bin_location = latest.bin_location
             AND (cs.batch_no = latest.batch_no OR (cs.batch_no IS NULL AND latest.batch_no IS NULL))
             AND cs.id = latest.max_id
           WHERE cs.item_code = i.code
             AND cs.qty > 0
             AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY'))) < 0.01
    THEN '✅ All Match'
    ELSE '❌ Still Mismatch'
  END as final_status
FROM tabItem i
WHERE i.code = @item_code;

-- ============================================================
-- STEP 6: SUMMARY
-- ============================================================

SELECT 
  '=== STEP 6: SUMMARY ===' as info;

SELECT 
  'Fix completed!' as message,
  CONCAT('Item: ', @item_code) as item,
  CONCAT('Duplicates removed: ', @duplicate_count_before) as duplicates_removed,
  CONCAT('tabItem.stock_qty updated: Yes') as stock_qty_updated,
  'Please refresh the desktop app to see the changes' as next_step;

-- ============================================================
-- END OF AUTO FIX SCRIPT
-- ============================================================
-- 
-- After running this script:
-- 1. Refresh the Items list in the desktop app
-- 2. Refresh the Item Location Breakdown
-- 3. Both should now show the same quantity
-- ============================================================
