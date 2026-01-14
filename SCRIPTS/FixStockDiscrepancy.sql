-- ============================================================
-- FIX STOCK DISCREPANCY
-- This script fixes the discrepancy between:
-- - Main Items table (tabItem.stock_qty)
-- - Item Location Breakdown (tabCartonStock)
-- ============================================================

-- Step 1: Check current state
SELECT 
  '=== CURRENT STATE ===' as info;

SELECT 
  i.code as item_code,
  i.stock_qty as item_stock_qty,
  (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = i.code) as ledger_total,
  (SELECT COALESCE(SUM(qty), 0) FROM tabCartonStock WHERE item_code = i.code 
    AND qty > 0 AND (status IS NULL OR status = '' OR status = 'PUTAWAY')) as carton_stock_total_raw,
  (SELECT COUNT(*) FROM tabCartonStock WHERE item_code = i.code 
    AND qty > 0 AND (status IS NULL OR status = '' OR status = 'PUTAWAY')) as carton_stock_record_count
FROM tabItem i
WHERE i.code = 'SKU-HAT-301-BLU-OS';

-- Step 2: Check for duplicate records in tabCartonStock
SELECT 
  '=== DUPLICATE RECORDS CHECK ===' as info;

SELECT 
  carton_id,
  item_code,
  bin_location,
  warehouse,
  batch_no,
  COUNT(*) as duplicate_count,
  SUM(qty) as total_qty_sum,
  GROUP_CONCAT(CONCAT('id:', id, ',qty:', qty, ',status:', IFNULL(status, 'NULL'), ',updated:', updated_at) ORDER BY id DESC SEPARATOR ' | ') as record_details,
  MAX(id) as latest_id,
  MAX(updated_at) as latest_updated
FROM tabCartonStock
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND qty > 0
  AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
GROUP BY carton_id, item_code, bin_location, warehouse, batch_no
HAVING COUNT(*) > 1;

-- Step 3: Calculate what the sum should be (using only latest records)
SELECT 
  '=== EXPECTED SUM (Latest Records Only) ===' as info;

SELECT 
  SUM(cs.qty) as expected_total_qty
FROM tabCartonStock cs
INNER JOIN (
  SELECT 
    carton_id,
    item_code,
    warehouse,
    bin_location,
    batch_no,
    MAX(id) as max_id
  FROM tabCartonStock
  WHERE item_code = 'SKU-HAT-301-BLU-OS'
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
WHERE cs.item_code = 'SKU-HAT-301-BLU-OS'
  AND cs.qty > 0
  AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY');

-- Step 4: Delete duplicate records (keep only the most recent by id)
-- WARNING: This will delete duplicate records. Review Step 2 results first!
SELECT 
  '=== DELETING DUPLICATE RECORDS ===' as info;

-- Delete duplicates for the specific item
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
  WHERE item_code = 'SKU-HAT-301-BLU-OS'
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
WHERE cs1.item_code = 'SKU-HAT-301-BLU-OS';

-- Step 5: Update tabItem.stock_qty to match tabStockLedger
SELECT 
  '=== UPDATING tabItem.stock_qty ===' as info;

UPDATE tabItem
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger
  WHERE item_code = tabItem.code
),
updated_at = NOW()
WHERE code = 'SKU-HAT-301-BLU-OS';

-- Step 6: Verify the fix
SELECT 
  '=== VERIFICATION ===' as info;

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
    WHEN ABS(i.stock_qty - (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = i.code)) < 0.01 THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as status
FROM tabItem i
WHERE i.code = 'SKU-HAT-301-BLU-OS';

-- ============================================================
-- END OF SCRIPT
-- ============================================================
-- 
-- After running this script:
-- 1. Refresh the Items list in the desktop app
-- 2. Refresh the Item Location Breakdown
-- 3. Both should now show the same quantity
-- ============================================================
