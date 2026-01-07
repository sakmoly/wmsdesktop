-- ============================================================
-- SIMPLE TEST PUTAWAY DATA - CUSTOMIZE ITEM CODES HERE
-- ============================================================
-- 
-- INSTRUCTIONS:
-- 1. First, run the query below to see available items
-- 2. Replace @item1, @item2, @item3 with your actual item codes
-- 3. Run the main script
-- ============================================================

-- STEP 0: View available items (run this first to see what items you have)
SELECT '=== AVAILABLE ITEMS ===' as Info;
SELECT code as item_code, name as item_name, stock_qty, 
       CASE WHEN stock_qty > 0 THEN 'Has Stock' ELSE 'No Stock' END as stock_status
FROM tabItem 
ORDER BY code
LIMIT 20;

-- ============================================================
-- STEP 1: SET YOUR ITEM CODES HERE (replace with actual codes)
-- ============================================================
-- Example: SET @item1 = 'SKU-001';
--          SET @item2 = 'SKU-002';
--          SET @item3 = 'SKU-003';

SET @item1 = (SELECT code FROM tabItem LIMIT 1 OFFSET 0);
SET @item2 = (SELECT code FROM tabItem LIMIT 1 OFFSET 1);
SET @item3 = (SELECT code FROM tabItem LIMIT 1 OFFSET 2);

-- ============================================================
-- STEP 2: SET WAREHOUSE NAME
-- ============================================================
SET @warehouse_name = 'Main Warehouse';
SELECT name INTO @warehouse_name FROM tabWarehouse 
WHERE name LIKE '%Main%' OR name LIKE '%WH-MAIN%' OR warehouse_type = 'Warehouse' 
LIMIT 1;
SET @warehouse_name = COALESCE(@warehouse_name, 'Main Warehouse');

-- ============================================================
-- STEP 3: CREATE TEST ASN AND SESSION
-- ============================================================
INSERT IGNORE INTO tabAdvanceShippingNotice 
  (title, status, purchase_order, supplier, shipment_date, expected_arrival_date, total_shipped_qty, created_at, updated_at)
VALUES 
  ('ASN-TEST-001', 'Received', 'PO-TEST-001', 'Test Supplier', CURDATE(), CURDATE(), 1000.00, NOW(), NOW());

INSERT IGNORE INTO tabInboundSession 
  (inbound_session, asn_no, status, started_at, started_by, created_at, updated_at)
VALUES 
  ('SESSION-TEST-001', 'ASN-TEST-001', 'Completed', NOW(), 'SYSTEM', NOW(), NOW());

-- ============================================================
-- STEP 4: CREATE PUTAWAY TASK
-- ============================================================
INSERT IGNORE INTO tabPutawayTask 
  (title, status, source_type, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
VALUES 
  ('PUT-TEST-001', 'In Progress', 'ASN', 'ASN-TEST-001', 'SESSION-TEST-001', 'SYSTEM', NOW(), NOW());

-- ============================================================
-- STEP 5: CREATE PUTAWAY LINES WITH LOCATIONS
-- ============================================================
-- Location Format 1: A1-R01-L1-B1 (4-part format)
INSERT IGNORE INTO tabPutawayLine 
  (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at)
VALUES 
  ('PUT-TEST-001', CONCAT('BOX-', @item1, '-001'), @item1, 50.00, 'A1-R01', 'L1-B1', NOW(), NOW()),
  ('PUT-TEST-001', CONCAT('BOX-', @item1, '-002'), @item1, 25.00, 'A1-R01', 'L1-B2', NOW(), NOW()),
  ('PUT-TEST-001', CONCAT('BOX-', @item2, '-001'), @item2, 75.00, 'A2-R02', 'L2-B1', NOW(), NOW()),
  ('PUT-TEST-001', CONCAT('BOX-', @item3, '-001'), @item3, 100.00, 'A2-R02', 'L2-B2', NOW(), NOW());

-- Location Format 2: RACK-A-BIN-01 (2-part format)
INSERT IGNORE INTO tabPutawayLine 
  (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at)
VALUES 
  ('PUT-TEST-001', CONCAT('BOX-', @item1, '-003'), @item1, 30.00, 'RACK-A', 'BIN-01', NOW(), NOW()),
  ('PUT-TEST-001', CONCAT('BOX-', @item2, '-002'), @item2, 40.00, 'RACK-B', 'BIN-02', NOW(), NOW());

-- ============================================================
-- STEP 6: INSERT STOCK LEDGER ENTRIES (This makes items visible by location)
-- ============================================================
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
ON DUPLICATE KEY UPDATE
  qty = qty + VALUES(qty),
  last_transaction_date = NOW(),
  last_transaction_type = 'Putaway',
  last_transaction_ref = VALUES(last_transaction_ref),
  updated_at = NOW();

-- ============================================================
-- STEP 7: CREATE STOCK TRANSACTIONS (Audit trail)
-- ============================================================
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
WHERE pl.parent_title = 'PUT-TEST-001'
  AND pl.rack IS NOT NULL
  AND pl.bin IS NOT NULL;

-- ============================================================
-- STEP 8: UPDATE ITEM STOCK QUANTITIES
-- ============================================================
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
  WHERE parent_title = 'PUT-TEST-001'
);

-- ============================================================
-- VERIFICATION: View the created data
-- ============================================================
SELECT '=== PUTAWAY TASK ===' as Info;
SELECT title, status, advance_shipping_notice, created_at 
FROM tabPutawayTask 
WHERE title = 'PUT-TEST-001';

SELECT '=== PUTAWAY LINES ===' as Info;
SELECT parent_title, item_code, qty, rack, bin, 
       CONCAT(rack, '-', bin) as bin_location
FROM tabPutawayLine 
WHERE parent_title = 'PUT-TEST-001'
ORDER BY item_code, rack, bin;

SELECT '=== STOCK BY LOCATION ===' as Info;
SELECT item_code, warehouse, bin_location, qty, 
       last_transaction_type, last_transaction_ref
FROM tabStockLedger 
WHERE last_transaction_ref = 'PUT-TEST-001'
ORDER BY item_code, bin_location;

SELECT '=== ITEM TOTALS ===' as Info;
SELECT code as item_code, name as item_name, stock_qty
FROM tabItem 
WHERE code IN (
  SELECT DISTINCT item_code 
  FROM tabPutawayLine 
  WHERE parent_title = 'PUT-TEST-001'
)
ORDER BY code;

-- ============================================================
-- HOW TO VIEW IN DESKTOP APP:
-- ============================================================
-- 1. Open the Items list in desktop app
-- 2. Find and select one of the items used in test data (@item1, @item2, or @item3)
-- 3. Click "Show Location Breakdown" button
-- 4. You should see:
--    - Location ID (e.g., "A1-R01-L1-B1", "RACK-A-BIN-01")
--    - Warehouse name
--    - Rack and Bin details
--    - Quantity at each location
--    - Total quantity
-- ============================================================

