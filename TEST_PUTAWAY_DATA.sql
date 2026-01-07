-- ============================================================
-- TEST PUTAWAY DATA INSERTION SCRIPT
-- This script creates test putaway tasks and stock ledger entries
-- to test quantity increase and location-based inventory display
-- ============================================================

-- Step 1: Get existing items from master data (limit to 5 items for testing)
-- You can modify this query to select specific items
SET @item_count = 0;
SELECT COUNT(*) INTO @item_count FROM tabItem WHERE stock_qty > 0 OR stock_qty IS NULL LIMIT 5;

-- Step 2: Create test ASN if it doesn't exist
INSERT IGNORE INTO tabAdvanceShippingNotice 
  (title, status, purchase_order, supplier, shipment_date, expected_arrival_date, total_shipped_qty, created_at, updated_at)
VALUES 
  ('ASN-TEST-001', 'Received', 'PO-TEST-001', 'Test Supplier', CURDATE(), CURDATE(), 1000.00, NOW(), NOW());

-- Step 3: Create test inbound session if it doesn't exist
INSERT IGNORE INTO tabInboundSession 
  (inbound_session, asn_no, status, started_at, started_by, created_at, updated_at)
VALUES 
  ('SESSION-TEST-001-DEVICE001-USER001', 'ASN-TEST-001', 'Completed', NOW(), 'SYSTEM', NOW(), NOW());

-- Step 4: Get warehouse name (use Main Warehouse or first available)
SET @warehouse_name = 'Main Warehouse';
SELECT name INTO @warehouse_name FROM tabWarehouse 
WHERE name LIKE '%Main%' OR name LIKE '%WH-MAIN%' OR warehouse_type = 'Warehouse' 
LIMIT 1;

-- If no warehouse found, use default
SET @warehouse_name = COALESCE(@warehouse_name, 'Main Warehouse');

-- Step 5: Create test putaway tasks with different statuses
-- Task 1: In Progress (with locations assigned)
INSERT IGNORE INTO tabPutawayTask 
  (title, status, source_type, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
VALUES 
  ('PUT-TEST-001', 'In Progress', 'ASN', 'ASN-TEST-001', 'SESSION-TEST-001-DEVICE001-USER001', 'SYSTEM', NOW(), NOW());

-- Task 2: Open (ready for putaway)
INSERT IGNORE INTO tabPutawayTask 
  (title, status, source_type, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
VALUES 
  ('PUT-TEST-002', 'Open', 'ASN', 'ASN-TEST-001', 'SESSION-TEST-001-DEVICE001-USER001', 'SYSTEM', NOW(), NOW());

-- Step 6: Create putaway lines with different locations
-- Get first 3 items from tabItem for testing
SET @item1 = (SELECT code FROM tabItem LIMIT 1 OFFSET 0);
SET @item2 = (SELECT code FROM tabItem LIMIT 1 OFFSET 1);
SET @item3 = (SELECT code FROM tabItem LIMIT 1 OFFSET 2);

-- If items exist, create putaway lines
-- Task 1: Items with locations (A1-R01-L1-B1 format)
INSERT IGNORE INTO tabPutawayLine 
  (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at)
SELECT 
  'PUT-TEST-001',
  CONCAT('BOX-', @item1, '-001'),
  @item1,
  50.00,
  'A1-R01',
  'L1-B1',
  NOW(),
  NOW()
WHERE @item1 IS NOT NULL;

INSERT IGNORE INTO tabPutawayLine 
  (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at)
SELECT 
  'PUT-TEST-001',
  CONCAT('BOX-', @item2, '-002'),
  @item2,
  75.00,
  'A1-R01',
  'L1-B2',
  NOW(),
  NOW()
WHERE @item2 IS NOT NULL;

INSERT IGNORE INTO tabPutawayLine 
  (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at)
SELECT 
  'PUT-TEST-001',
  CONCAT('BOX-', @item3, '-003'),
  @item3,
  100.00,
  'A2-R02',
  'L2-B1',
  NOW(),
  NOW()
WHERE @item3 IS NOT NULL;

-- Task 2: Items with different location format (RACK-BIN format)
INSERT IGNORE INTO tabPutawayLine 
  (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at)
SELECT 
  'PUT-TEST-002',
  CONCAT('BOX-', @item1, '-004'),
  @item1,
  25.00,
  'RACK-A',
  'BIN-01',
  NOW(),
  NOW()
WHERE @item1 IS NOT NULL;

INSERT IGNORE INTO tabPutawayLine 
  (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at)
SELECT 
  'PUT-TEST-002',
  CONCAT('BOX-', @item2, '-005'),
  @item2,
  30.00,
  'RACK-A',
  'BIN-02',
  NOW(),
  NOW()
WHERE @item2 IS NOT NULL;

-- Step 7: Insert stock ledger entries with locations
-- This simulates completed putaway with stock at specific locations

-- For PUT-TEST-001 (In Progress task with locations)
INSERT INTO tabStockLedger 
  (item_code, warehouse, bin_location, qty, reserved_qty, 
   last_transaction_date, last_transaction_type, last_transaction_ref, 
   updated_at, created_at)
SELECT 
  pl.item_code,
  @warehouse_name,
  CONCAT(pl.rack, '-', pl.bin) as bin_location,
  pl.qty,
  0 as reserved_qty,
  NOW() as last_transaction_date,
  'Putaway' as last_transaction_type,
  pl.parent_title as last_transaction_ref,
  NOW() as updated_at,
  NOW() as created_at
FROM tabPutawayLine pl
WHERE pl.parent_title = 'PUT-TEST-001'
  AND pl.rack IS NOT NULL
  AND pl.bin IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM tabStockLedger sl
    WHERE sl.item_code = pl.item_code
      AND sl.warehouse = @warehouse_name
      AND sl.bin_location = CONCAT(pl.rack, '-', pl.bin)
  )
ON DUPLICATE KEY UPDATE
  qty = qty + VALUES(qty),
  last_transaction_date = NOW(),
  last_transaction_type = 'Putaway',
  last_transaction_ref = VALUES(last_transaction_ref),
  updated_at = NOW();

-- For PUT-TEST-002 (Open task - add to stock ledger too for testing)
INSERT INTO tabStockLedger 
  (item_code, warehouse, bin_location, qty, reserved_qty, 
   last_transaction_date, last_transaction_type, last_transaction_ref, 
   updated_at, created_at)
SELECT 
  pl.item_code,
  @warehouse_name,
  CONCAT(pl.rack, '-', pl.bin) as bin_location,
  pl.qty,
  0 as reserved_qty,
  NOW() as last_transaction_date,
  'Putaway' as last_transaction_type,
  pl.parent_title as last_transaction_ref,
  NOW() as updated_at,
  NOW() as created_at
FROM tabPutawayLine pl
WHERE pl.parent_title = 'PUT-TEST-002'
  AND pl.rack IS NOT NULL
  AND pl.bin IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM tabStockLedger sl
    WHERE sl.item_code = pl.item_code
      AND sl.warehouse = @warehouse_name
      AND sl.bin_location = CONCAT(pl.rack, '-', pl.bin)
  )
ON DUPLICATE KEY UPDATE
  qty = qty + VALUES(qty),
  last_transaction_date = NOW(),
  last_transaction_type = 'Putaway',
  last_transaction_ref = VALUES(last_transaction_ref),
  updated_at = NOW();

-- Step 8: Create stock transaction records for audit trail
INSERT INTO tabStockTransaction
  (transaction_date, transaction_type, reference_doc_type, reference_doc, wms_transaction_title,
   item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
   source_bin, target_bin, performed_by, created_at)
SELECT 
  NOW() as transaction_date,
  'Putaway' as transaction_type,
  'Putaway Task' as reference_doc_type,
  pl.parent_title as reference_doc,
  pl.parent_title as wms_transaction_title,
  pl.item_code,
  @warehouse_name as warehouse,
  CONCAT(pl.rack, '-', pl.bin) as bin_location,
  pl.qty as qty_change,
  0 as qty_before,
  pl.qty as qty_after,
  NULL as source_bin,
  CONCAT(pl.rack, '-', pl.bin) as target_bin,
  'SYSTEM' as performed_by,
  NOW() as created_at
FROM tabPutawayLine pl
WHERE pl.parent_title IN ('PUT-TEST-001', 'PUT-TEST-002')
  AND pl.rack IS NOT NULL
  AND pl.bin IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM tabStockTransaction st
    WHERE st.reference_doc = pl.parent_title
      AND st.item_code = pl.item_code
      AND st.bin_location = CONCAT(pl.rack, '-', pl.bin)
      AND st.transaction_type = 'Putaway'
  );

-- Step 9: Update item stock_qty (sum of all locations for each item)
UPDATE tabItem i
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger sl
  WHERE sl.item_code = i.code
),
updated_at = NOW()
WHERE i.code IN (
  SELECT DISTINCT item_code 
  FROM tabPutawayLine 
  WHERE parent_title IN ('PUT-TEST-001', 'PUT-TEST-002')
);

-- Step 10: Verification queries
SELECT '=== PUTAWAY TASKS CREATED ===' as Status;
SELECT title, status, advance_shipping_notice, created_at 
FROM tabPutawayTask 
WHERE title IN ('PUT-TEST-001', 'PUT-TEST-002')
ORDER BY title;

SELECT '=== PUTAWAY LINES CREATED ===' as Status;
SELECT parent_title, item_code, qty, rack, bin, 
       CONCAT(rack, '-', bin) as bin_location
FROM tabPutawayLine 
WHERE parent_title IN ('PUT-TEST-001', 'PUT-TEST-002')
ORDER BY parent_title, item_code;

SELECT '=== STOCK LEDGER ENTRIES ===' as Status;
SELECT item_code, warehouse, bin_location, qty, 
       last_transaction_type, last_transaction_ref
FROM tabStockLedger 
WHERE last_transaction_ref IN ('PUT-TEST-001', 'PUT-TEST-002')
ORDER BY item_code, bin_location;

SELECT '=== ITEM STOCK QUANTITIES ===' as Status;
SELECT code as item_code, name as item_name, stock_qty
FROM tabItem 
WHERE code IN (
  SELECT DISTINCT item_code 
  FROM tabPutawayLine 
  WHERE parent_title IN ('PUT-TEST-001', 'PUT-TEST-002')
)
ORDER BY code;

SELECT '=== SUMMARY ===' as Status;
SELECT 
  COUNT(DISTINCT pt.title) as putaway_tasks,
  COUNT(pl.id) as putaway_lines,
  COUNT(DISTINCT sl.item_code) as items_with_stock,
  SUM(sl.qty) as total_stock_qty
FROM tabPutawayTask pt
LEFT JOIN tabPutawayLine pl ON pl.parent_title = pt.title
LEFT JOIN tabStockLedger sl ON sl.last_transaction_ref = pt.title
WHERE pt.title IN ('PUT-TEST-001', 'PUT-TEST-002');

-- ============================================================
-- END OF TEST DATA SCRIPT
-- ============================================================
-- 
-- To view the location breakdown in desktop app:
-- 1. Open Items list
-- 2. Select an item that was used in the test data
-- 3. Click "Show Location Breakdown" button
-- 4. You should see quantities by location (A1-R01-L1-B1, RACK-A-BIN-01, etc.)
--
-- To clean up test data (optional):
-- DELETE FROM tabStockTransaction WHERE reference_doc IN ('PUT-TEST-001', 'PUT-TEST-002');
-- DELETE FROM tabStockLedger WHERE last_transaction_ref IN ('PUT-TEST-001', 'PUT-TEST-002');
-- DELETE FROM tabPutawayLine WHERE parent_title IN ('PUT-TEST-001', 'PUT-TEST-002');
-- DELETE FROM tabPutawayTask WHERE title IN ('PUT-TEST-001', 'PUT-TEST-002');
-- ============================================================

