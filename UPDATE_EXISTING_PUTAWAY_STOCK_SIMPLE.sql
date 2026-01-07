-- Simple Update Script for Existing Putaway Stock
-- This script updates stock for putaway tasks that have locations but stock wasn't updated
-- Run this script to backfill stock data for existing putaway tasks

-- ============================================
-- IMPORTANT: Review the queries before running
-- ============================================

-- Step 1: Check current state (run this first to see what will be updated)
SELECT 
  pt.title as putaway_task,
  pt.status as task_status,
  pt.advance_shipping_notice as asn,
  COUNT(pl.id) as lines_count,
  SUM(pl.qty) as total_qty,
  COUNT(CASE WHEN pl.rack IS NOT NULL THEN 1 END) as lines_with_location
FROM tabPutawayTask pt
LEFT JOIN tabPutawayLine pl ON pt.title = pl.parent_title
WHERE pt.status != 'Completed' OR EXISTS (
  SELECT 1 FROM tabPutawayLine pl2 
  WHERE pl2.parent_title = pt.title 
    AND pl2.rack IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM tabStockLedger sl
      WHERE sl.item_code = pl2.item_code
        AND sl.last_transaction_ref = pt.title
        AND sl.last_transaction_type = 'Putaway'
    )
)
GROUP BY pt.title, pt.status, pt.advance_shipping_notice;

-- Step 2: Update Stock Ledger for Putaway Lines with Locations
-- This will insert or update stock ledger entries
INSERT INTO tabStockLedger 
  (item_code, warehouse, bin_location, qty, reserved_qty, 
   last_transaction_date, last_transaction_type, last_transaction_ref, 
   updated_at, created_at)
SELECT 
  pl.item_code,
  COALESCE(
    (SELECT store FROM tabAdvanceShippingNotice WHERE title = pt.advance_shipping_notice LIMIT 1),
    'Main Warehouse'
  ) as warehouse,
  CASE 
    WHEN pl.rack IS NOT NULL AND pl.bin IS NOT NULL THEN CONCAT(pl.rack, '-', pl.bin)
    WHEN pl.rack IS NOT NULL THEN pl.rack
    ELSE NULL
  END as bin_location,
  pl.qty,
  0 as reserved_qty,
  NOW() as last_transaction_date,
  'Putaway' as last_transaction_type,
  pt.title as last_transaction_ref,
  NOW() as updated_at,
  NOW() as created_at
FROM tabPutawayLine pl
INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title
WHERE pl.item_code IS NOT NULL 
  AND pl.qty > 0
  AND pl.rack IS NOT NULL
  AND NOT EXISTS (
    -- Skip if stock ledger entry already exists for this putaway task
    SELECT 1 
    FROM tabStockLedger sl
    WHERE sl.item_code = pl.item_code
      AND sl.warehouse = COALESCE(
        (SELECT store FROM tabAdvanceShippingNotice WHERE title = pt.advance_shipping_notice LIMIT 1),
        'Main Warehouse'
      )
      AND sl.bin_location = CASE 
        WHEN pl.rack IS NOT NULL AND pl.bin IS NOT NULL THEN CONCAT(pl.rack, '-', pl.bin)
        WHEN pl.rack IS NOT NULL THEN pl.rack
        ELSE NULL
      END
      AND sl.last_transaction_ref = pt.title
      AND sl.last_transaction_type = 'Putaway'
  )
ON DUPLICATE KEY UPDATE
  qty = qty + VALUES(qty),
  last_transaction_date = NOW(),
  last_transaction_type = 'Putaway',
  last_transaction_ref = VALUES(last_transaction_ref),
  updated_at = NOW();

-- Step 3: Create Stock Transaction Records (only if they don't exist)
INSERT INTO tabStockTransaction
  (transaction_date, transaction_type, reference_doc_type, reference_doc, wms_transaction_title,
   item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
   source_bin, target_bin, performed_by, created_at)
SELECT 
  NOW() as transaction_date,
  'Putaway' as transaction_type,
  'Putaway Task' as reference_doc_type,
  pt.title as reference_doc,
  pt.title as wms_transaction_title,
  pl.item_code,
  COALESCE(
    (SELECT store FROM tabAdvanceShippingNotice WHERE title = pt.advance_shipping_notice LIMIT 1),
    'Main Warehouse'
  ) as warehouse,
  CASE 
    WHEN pl.rack IS NOT NULL AND pl.bin IS NOT NULL THEN CONCAT(pl.rack, '-', pl.bin)
    WHEN pl.rack IS NOT NULL THEN pl.rack
    ELSE NULL
  END as bin_location,
  pl.qty as qty_change,
  GREATEST(0, COALESCE((
    SELECT qty FROM tabStockLedger 
    WHERE item_code = pl.item_code
      AND warehouse = COALESCE(
        (SELECT store FROM tabAdvanceShippingNotice WHERE title = pt.advance_shipping_notice LIMIT 1),
        'Main Warehouse'
      )
      AND bin_location = CASE 
        WHEN pl.rack IS NOT NULL AND pl.bin IS NOT NULL THEN CONCAT(pl.rack, '-', pl.bin)
        WHEN pl.rack IS NOT NULL THEN pl.rack
        ELSE NULL
      END
  ) - pl.qty, 0)) as qty_before,
  COALESCE((
    SELECT qty FROM tabStockLedger 
    WHERE item_code = pl.item_code
      AND warehouse = COALESCE(
        (SELECT store FROM tabAdvanceShippingNotice WHERE title = pt.advance_shipping_notice LIMIT 1),
        'Main Warehouse'
      )
      AND bin_location = CASE 
        WHEN pl.rack IS NOT NULL AND pl.bin IS NOT NULL THEN CONCAT(pl.rack, '-', pl.bin)
        WHEN pl.rack IS NOT NULL THEN pl.rack
        ELSE NULL
      END
  ), pl.qty) as qty_after,
  NULL as source_bin,
  CASE 
    WHEN pl.rack IS NOT NULL AND pl.bin IS NOT NULL THEN CONCAT(pl.rack, '-', pl.bin)
    WHEN pl.rack IS NOT NULL THEN pl.rack
    ELSE NULL
  END as target_bin,
  COALESCE(pt.created_by, 'SYSTEM') as performed_by,
  NOW() as created_at
FROM tabPutawayLine pl
INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title
WHERE pl.item_code IS NOT NULL 
  AND pl.qty > 0
  AND pl.rack IS NOT NULL
  AND NOT EXISTS (
    -- Skip if transaction already exists
    SELECT 1 
    FROM tabStockTransaction st
    WHERE st.reference_doc = pt.title
      AND st.item_code = pl.item_code
      AND st.transaction_type = 'Putaway'
      AND st.wms_transaction_title = pt.title
  );

-- Step 4: Update tabItem.stock_qty (sum of all locations for each item)
UPDATE tabItem i
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger 
  WHERE item_code = i.code
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1 
  FROM tabPutawayLine pl
  INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title
  WHERE pl.item_code = i.code
    AND pl.rack IS NOT NULL
);

-- Step 5: Mark putaway tasks as "Completed" if they have locations assigned
UPDATE tabPutawayTask pt
SET status = 'Completed',
    updated_at = CURRENT_TIMESTAMP
WHERE status != 'Completed'
  AND EXISTS (
    SELECT 1 
    FROM tabPutawayLine pl
    WHERE pl.parent_title = pt.title
      AND pl.rack IS NOT NULL
      AND pl.item_code IS NOT NULL
      AND pl.qty > 0
  );

-- Step 6: Verification - Check what was updated
SELECT 
  'Putaway Tasks Marked Completed' as summary,
  COUNT(*) as count
FROM tabPutawayTask
WHERE status = 'Completed'
  AND updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
UNION ALL
SELECT 
  'Stock Ledger Entries Created/Updated' as summary,
  COUNT(*) as count
FROM tabStockLedger
WHERE last_transaction_type = 'Putaway'
  AND updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
UNION ALL
SELECT 
  'Stock Transactions Created' as summary,
  COUNT(*) as count
FROM tabStockTransaction
WHERE transaction_type = 'Putaway'
  AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
UNION ALL
SELECT 
  'Items Stock Updated' as summary,
  COUNT(*) as count
FROM tabItem
WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR);

-- Step 7: Show sample updated data
SELECT 
  pt.title as putaway_task,
  pt.status,
  pl.item_code,
  pl.qty,
  CONCAT(pl.rack, IFNULL(CONCAT('-', pl.bin), '')) as location,
  sl.qty as stock_qty,
  i.stock_qty as item_total_stock
FROM tabPutawayTask pt
INNER JOIN tabPutawayLine pl ON pt.title = pl.parent_title
LEFT JOIN tabStockLedger sl ON sl.item_code = pl.item_code
  AND sl.last_transaction_ref = pt.title
  AND sl.last_transaction_type = 'Putaway'
LEFT JOIN tabItem i ON i.code = pl.item_code
WHERE pt.status = 'Completed'
  AND pl.rack IS NOT NULL
ORDER BY pt.title, pl.item_code
LIMIT 20;

