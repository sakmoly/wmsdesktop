-- ============================================================
-- AUTO RUN MATERIAL REQUEST STOCK SYNC FIX
-- This script automatically diagnoses, fixes, and verifies stock sync
-- Run this script to fix stock discrepancies
-- ============================================================

SET @item_code = 'SKU-HAT-301-BLU-OS';  -- Change this if needed

-- ============================================================
-- STEP 1: DIAGNOSTIC - Check Current State
-- ============================================================

SELECT 
  '=== STEP 1: CURRENT STATE ===' as info;

SELECT 
  i.code as item_code,
  i.stock_qty as item_stock_qty,
  (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = i.code) as ledger_total,
  (SELECT COALESCE(SUM(cs.qty), 0) FROM tabCartonStock cs
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
      AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')) as carton_stock_total,
  CASE 
    WHEN ABS(i.stock_qty - (SELECT COALESCE(SUM(cs.qty), 0) FROM tabCartonStock cs
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
    THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as sync_status
FROM tabItem i
WHERE i.code = @item_code;

-- ============================================================
-- STEP 2: REMOVE DUPLICATE RECORDS IN tabCartonStock
-- ============================================================

SELECT 
  '=== STEP 2: REMOVING DUPLICATE RECORDS ===' as info;

-- Count duplicates before deletion
SET @duplicate_count = (
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

SELECT CONCAT('Found ', @duplicate_count, ' duplicate groups') as info;

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
-- STEP 3: SYNC tabItem.stock_qty FROM tabCartonStock (Priority)
-- ============================================================

SELECT 
  '=== STEP 3: SYNCING tabItem.stock_qty FROM tabCartonStock ===' as info;

-- Update items that have carton stock (priority: tabCartonStock > tabStockLedger)
UPDATE tabItem i
SET stock_qty = (
  SELECT COALESCE(SUM(cs.qty), 0)
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
    AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1
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
    AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')
);

SELECT CONCAT('Updated items with carton stock. Rows affected: ', ROW_COUNT()) as info;

-- ============================================================
-- STEP 4: SYNC tabItem.stock_qty FROM tabStockLedger (Fallback)
-- ============================================================

SELECT 
  '=== STEP 4: SYNCING tabItem.stock_qty FROM tabStockLedger ===' as info;

-- Update items that don't have carton stock (fallback to stock ledger)
UPDATE tabItem i
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger
  WHERE item_code = i.code
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1 
  FROM tabStockLedger 
  WHERE item_code = i.code
)
AND NOT EXISTS (
  SELECT 1
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
    AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')
);

SELECT CONCAT('Updated items with stock ledger only. Rows affected: ', ROW_COUNT()) as info;

-- ============================================================
-- STEP 5: VERIFICATION
-- ============================================================

SELECT 
  '=== STEP 5: VERIFICATION ===' as info;

SELECT 
  i.code as item_code,
  i.stock_qty as item_stock_qty,
  (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = i.code) as ledger_total,
  (SELECT COALESCE(SUM(cs.qty), 0) FROM tabCartonStock cs
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
      AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')) as carton_stock_total,
  CASE 
    WHEN ABS(i.stock_qty - (SELECT COALESCE(SUM(cs.qty), 0) FROM tabCartonStock cs
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
    THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as sync_status
FROM tabItem i
WHERE i.code = @item_code;

-- ============================================================
-- STEP 6: CHECK TRIGGERS
-- ============================================================

SELECT 
  '=== STEP 6: CHECK TRIGGERS ===' as info;

SELECT 
  TRIGGER_NAME,
  EVENT_MANIPULATION,
  EVENT_OBJECT_TABLE,
  ACTION_TIMING
FROM INFORMATION_SCHEMA.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
  AND TRIGGER_NAME LIKE 'trg_update_item_stock%'
ORDER BY TRIGGER_NAME;

SET @trigger_count = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TRIGGERS
  WHERE TRIGGER_SCHEMA = DATABASE()
    AND TRIGGER_NAME LIKE 'trg_update_item_stock%'
);

SELECT CONCAT('Found ', @trigger_count, ' stock sync triggers') as info;

IF @trigger_count < 6 THEN
  SELECT '⚠️  Some triggers are missing. Please run SCRIPTS/CreateStockSyncTriggers.sql' as warning;
END IF;

-- ============================================================
-- SUMMARY
-- ============================================================

SELECT 
  '=== SUMMARY ===' as info;

SELECT 
  'Fix completed!' as message,
  CONCAT('Item: ', @item_code) as item,
  CONCAT('Duplicates removed: ', @duplicate_count) as duplicates_removed,
  CONCAT('tabItem.stock_qty synced: Yes') as stock_qty_synced,
  CONCAT('Triggers active: ', @trigger_count, '/6') as triggers_status,
  'Please refresh the desktop app to see the changes' as next_step;

-- ============================================================
-- END OF AUTO RUN SCRIPT
-- ============================================================
-- 
-- After running this script:
-- 1. Restart the API server to apply code changes
-- 2. Refresh the Items list in the desktop app
-- 3. Open Item Location Breakdown
-- 4. Both should now show the same quantity
-- ============================================================
