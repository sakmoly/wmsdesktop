-- ============================================================
-- CHECK STOCK SYNC FOR MATERIAL REQUEST
-- This script checks if stock is synced between:
-- - tabItem.stock_qty
-- - tabStockLedger (sum)
-- - tabCartonStock (sum, latest records only)
-- ============================================================

SET @item_code = 'SKU-HAT-301-BLU-OS';  -- Change this to the item you want to check

-- 1. Check tabItem.stock_qty
SELECT 
  '=== tabItem.stock_qty ===' as info;

SELECT 
  code as item_code,
  name as item_name,
  stock_qty as item_stock_qty
FROM tabItem
WHERE code = @item_code;

-- 2. Check tabStockLedger total
SELECT 
  '=== tabStockLedger Total ===' as info;

SELECT 
  item_code,
  COALESCE(SUM(qty), 0) as ledger_total_qty,
  COUNT(*) as record_count,
  COUNT(DISTINCT bin_location) as location_count,
  GROUP_CONCAT(DISTINCT bin_location ORDER BY bin_location) as bin_locations
FROM tabStockLedger
WHERE item_code = @item_code
GROUP BY item_code;

-- 3. Check tabCartonStock total (latest records only)
SELECT 
  '=== tabCartonStock Total (Latest Records Only) ===' as info;

SELECT 
  cs.item_code,
  COALESCE(SUM(cs.qty), 0) as carton_stock_total_qty,
  COUNT(*) as record_count,
  COUNT(DISTINCT cs.bin_location) as location_count,
  GROUP_CONCAT(DISTINCT cs.bin_location ORDER BY cs.bin_location) as bin_locations
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
  WHERE item_code = @item_code
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
WHERE cs.item_code = @item_code
  AND cs.qty > 0
  AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')
GROUP BY cs.item_code;

-- 4. Check for duplicate records in tabCartonStock
SELECT 
  '=== Duplicate Records in tabCartonStock ===' as info;

SELECT 
  carton_id,
  item_code,
  bin_location,
  warehouse,
  batch_no,
  COUNT(*) as duplicate_count,
  SUM(qty) as total_qty_sum,
  MAX(id) as latest_id,
  GROUP_CONCAT(CONCAT('id:', id, ',qty:', qty) ORDER BY id DESC) as record_details
FROM tabCartonStock
WHERE item_code = @item_code
  AND qty > 0
  AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
GROUP BY carton_id, item_code, bin_location, warehouse, batch_no
HAVING COUNT(*) > 1;

-- 5. Check triggers status
SELECT 
  '=== Database Triggers Status ===' as info;

SELECT 
  TRIGGER_NAME,
  EVENT_MANIPULATION,
  EVENT_OBJECT_TABLE,
  ACTION_TIMING,
  ACTION_STATEMENT
FROM INFORMATION_SCHEMA.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
  AND TRIGGER_NAME LIKE 'trg_update_item_stock%'
ORDER BY TRIGGER_NAME;

-- 6. Check Material Request picking transactions
SELECT 
  '=== Material Request Picking Transactions ===' as info;

SELECT 
  st.transaction_date,
  st.transaction_type,
  st.reference_doc,
  st.item_code,
  st.bin_location,
  st.qty_change,
  st.qty_before,
  st.qty_after,
  st.performed_by
FROM tabStockTransaction st
WHERE st.item_code = @item_code
  AND st.reference_doc_type = 'Material Request'
  AND st.transaction_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY st.transaction_date DESC
LIMIT 20;

-- 7. Compare all three sources
SELECT 
  '=== COMPARISON ===' as info;

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
    ELSE '❌ Mismatch'
  END as sync_status
FROM tabItem i
WHERE i.code = @item_code;

-- ============================================================
-- END OF DIAGNOSTIC SCRIPT
-- ============================================================
