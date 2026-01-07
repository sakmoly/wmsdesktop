-- Update Existing Putaway Tasks Stock
-- This script updates stock for existing putaway tasks that have locations assigned
-- but may not have stock updated yet

-- Step 1: Update Stock Ledger for Putaway Tasks with Locations
-- Only process tasks that have rack/bin assigned and are not already completed
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
    -- Skip if stock ledger entry already exists for this item+warehouse+location
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
  )
ON DUPLICATE KEY UPDATE
  qty = qty + VALUES(qty),
  last_transaction_date = NOW(),
  last_transaction_type = 'Putaway',
  last_transaction_ref = VALUES(last_transaction_ref),
  updated_at = NOW();

-- Step 2: Update existing Stock Ledger entries (add quantities for putaway tasks not yet processed)
-- This handles cases where stock ledger exists but wasn't updated by putaway
UPDATE tabStockLedger sl
INNER JOIN tabPutawayLine pl ON sl.item_code = pl.item_code
INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title
SET 
  sl.qty = sl.qty + pl.qty,
  sl.last_transaction_date = NOW(),
  sl.last_transaction_type = 'Putaway',
  sl.last_transaction_ref = pt.title,
  sl.updated_at = NOW()
WHERE pl.item_code IS NOT NULL 
  AND pl.qty > 0
  AND pl.rack IS NOT NULL
  AND sl.warehouse = COALESCE(
    (SELECT store FROM tabAdvanceShippingNotice WHERE title = pt.advance_shipping_notice LIMIT 1),
    'Main Warehouse'
  )
  AND sl.bin_location = CASE 
    WHEN pl.rack IS NOT NULL AND pl.bin IS NOT NULL THEN CONCAT(pl.rack, '-', pl.bin)
    WHEN pl.rack IS NOT NULL THEN pl.rack
    ELSE NULL
  END
  AND (sl.last_transaction_type != 'Putaway' OR sl.last_transaction_ref != pt.title);

-- Step 3: Create Stock Transaction Records for Audit Trail
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
  ) - pl.qty, 0) as qty_before,
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
    -- Skip if transaction already exists for this putaway task
    SELECT 1 
    FROM tabStockTransaction st
    WHERE st.reference_doc = pt.title
      AND st.item_code = pl.item_code
      AND st.transaction_type = 'Putaway'
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

-- Verification Query: Check what was updated
SELECT 
  'Putaway Tasks Updated' as summary,
  COUNT(*) as count
FROM tabPutawayTask
WHERE status = 'Completed'
  AND updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
UNION ALL
SELECT 
  'Stock Ledger Entries' as summary,
  COUNT(*) as count
FROM tabStockLedger
WHERE last_transaction_type = 'Putaway'
  AND updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
UNION ALL
SELECT 
  'Items Stock Updated' as summary,
  COUNT(*) as count
FROM tabItem
WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR);

