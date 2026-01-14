-- ============================================================
-- Test Data: Carton-Level Inventory
-- ============================================================
-- This script inserts test carton-level inventory data
-- Run this after Migration 005 to see carton-level inventory
-- ============================================================

-- ============================================================
-- PART 0: Clean up old test data (if exists)
-- ============================================================
-- Delete old test cartons and related data first
DELETE FROM tabCartonStock WHERE carton_id LIKE 'CARTON-%';
DELETE FROM tabCartonItem WHERE carton_id LIKE 'CARTON-%';
DELETE FROM tabCarton WHERE carton_id LIKE 'CARTON-%';
DELETE FROM tabBin WHERE bin_id LIKE 'BIN-%';

-- ============================================================
-- PART 1: Create Test Bins using actual Location IDs from tabLocation
-- ============================================================
-- Use actual location IDs from tabLocation table
-- This ensures bins match your location master data

-- Insert bins from tabLocation (use actual location IDs)
INSERT IGNORE INTO tabBin (bin_id, warehouse_id, zone, aisle, rack, level, position, bin_type, is_active)
SELECT 
    location_id as bin_id,
    COALESCE(warehouse, 'WH-MAIN') as warehouse_id,
    zone,
    aisle,
    parent_rack as rack,
    level,
    bin_id as position,
    'STORAGE' as bin_type,
    TRUE as is_active
FROM tabLocation
WHERE location_id IN ('A1-R01-L1-B1', 'A1-R01-L2-B1', 'A1-R02-L1-B2', 'B3-R01-L1-B3', 'B3-R02-L1-B4')
AND NOT EXISTS (SELECT 1 FROM tabBin WHERE bin_id = tabLocation.location_id);

-- If locations don't exist in tabLocation, create them with correct IDs
INSERT IGNORE INTO tabBin (bin_id, warehouse_id, zone, aisle, rack, level, position, bin_type, is_active)
SELECT 'A1-R01-L1-B1', 'WH-MAIN', 'Zone A', 'Aisle 01', 'Rack 01', '1', 'B1', 'STORAGE', TRUE
WHERE NOT EXISTS (SELECT 1 FROM tabBin WHERE bin_id = 'A1-R01-L1-B1')
UNION ALL
SELECT 'A1-R01-L2-B1', 'WH-MAIN', 'Zone A', 'Aisle 01', 'Rack 01', '2', 'B1', 'STORAGE', TRUE
WHERE NOT EXISTS (SELECT 1 FROM tabBin WHERE bin_id = 'A1-R01-L2-B1')
UNION ALL
SELECT 'A1-R02-L1-B2', 'WH-MAIN', 'Zone A', 'Aisle 01', 'Rack 02', '1', 'B2', 'STORAGE', TRUE
WHERE NOT EXISTS (SELECT 1 FROM tabBin WHERE bin_id = 'A1-R02-L1-B2')
UNION ALL
SELECT 'B3-R01-L1-B3', 'WH-MAIN', 'Zone B', 'Aisle 02', 'Rack 01', '1', 'B3', 'STORAGE', TRUE
WHERE NOT EXISTS (SELECT 1 FROM tabBin WHERE bin_id = 'B3-R01-L1-B3')
UNION ALL
SELECT 'B3-R02-L1-B4', 'WH-MAIN', 'Zone B', 'Aisle 02', 'Rack 02', '1', 'B4', 'STORAGE', TRUE
WHERE NOT EXISTS (SELECT 1 FROM tabBin WHERE bin_id = 'B3-R02-L1-B4');

-- ============================================================
-- PART 2: Create Test Cartons
-- ============================================================

INSERT IGNORE INTO tabCarton (carton_id, asn_no, supplier_carton_barcode, status, current_bin_id, warehouse, created_on)
VALUES
    ('CARTON-001', 'ASN-0001', 'SUPPLIER-CARTON-001', 'PUTAWAY', 'A1-R01-L1-B1', 'WH-MAIN', NOW()),
    ('CARTON-002', 'ASN-0001', 'SUPPLIER-CARTON-002', 'PUTAWAY', 'A1-R01-L1-B1', 'WH-MAIN', NOW()),
    ('CARTON-003', 'ASN-0002', 'SUPPLIER-CARTON-003', 'PUTAWAY', 'A1-R01-L2-B1', 'WH-MAIN', NOW()),
    ('CARTON-004', 'ASN-0002', 'SUPPLIER-CARTON-004', 'PUTAWAY', 'A1-R02-L1-B2', 'WH-MAIN', NOW()),
    ('CARTON-005', 'ASN-0003', 'SUPPLIER-CARTON-005', 'PUTAWAY', 'B3-R01-L1-B3', 'WH-MAIN', NOW()),
    ('CARTON-006', 'ASN-0003', 'SUPPLIER-CARTON-006', 'PUTAWAY', 'B3-R01-L1-B3', 'WH-MAIN', NOW()),
    ('CARTON-007', 'ASN-0004', 'SUPPLIER-CARTON-007', 'PUTAWAY', 'B3-R02-L1-B4', 'WH-MAIN', NOW());

-- ============================================================
-- PART 3: Create Carton Items
-- ============================================================
-- Note: Uses actual item codes from your database, or defaults if none found

-- Insert carton items (using subqueries to get items dynamically)
INSERT IGNORE INTO tabCartonItem (carton_id, item_code, uom, qty, batch_no, serial_no, is_closed)
SELECT 'CARTON-001', COALESCE((SELECT item_code FROM tabStockLedger LIMIT 1), (SELECT code FROM tabItem LIMIT 1), 'SKU-HAT-301-BLU-OS'), 'Nos', 10.00, NULL, NULL, FALSE
WHERE NOT EXISTS (SELECT 1 FROM tabCartonItem WHERE carton_id = 'CARTON-001');

INSERT IGNORE INTO tabCartonItem (carton_id, item_code, uom, qty, batch_no, serial_no, is_closed)
SELECT 'CARTON-002', COALESCE((SELECT item_code FROM tabStockLedger LIMIT 1), (SELECT code FROM tabItem LIMIT 1), 'SKU-HAT-301-BLU-OS'), 'Nos', 15.00, NULL, NULL, FALSE
WHERE NOT EXISTS (SELECT 1 FROM tabCartonItem WHERE carton_id = 'CARTON-002');

INSERT IGNORE INTO tabCartonItem (carton_id, item_code, uom, qty, batch_no, serial_no, is_closed)
SELECT 'CARTON-003', COALESCE((SELECT item_code FROM tabStockLedger WHERE item_code != (SELECT item_code FROM tabStockLedger LIMIT 1) LIMIT 1), (SELECT code FROM tabItem WHERE code != (SELECT code FROM tabItem LIMIT 1) LIMIT 1), 'SKU-HAT-301-GRN-OS'), 'Nos', 20.00, NULL, NULL, FALSE
WHERE NOT EXISTS (SELECT 1 FROM tabCartonItem WHERE carton_id = 'CARTON-003');

INSERT IGNORE INTO tabCartonItem (carton_id, item_code, uom, qty, batch_no, serial_no, is_closed)
SELECT 'CARTON-004', COALESCE((SELECT item_code FROM tabStockLedger LIMIT 1), (SELECT code FROM tabItem LIMIT 1), 'SKU-HAT-301-BLU-OS'), 'Nos', 25.00, NULL, NULL, FALSE
WHERE NOT EXISTS (SELECT 1 FROM tabCartonItem WHERE carton_id = 'CARTON-004');

INSERT IGNORE INTO tabCartonItem (carton_id, item_code, uom, qty, batch_no, serial_no, is_closed)
SELECT 'CARTON-005', COALESCE((SELECT item_code FROM tabStockLedger WHERE item_code != (SELECT item_code FROM tabStockLedger LIMIT 1) LIMIT 1), (SELECT code FROM tabItem WHERE code != (SELECT code FROM tabItem LIMIT 1) LIMIT 1), 'SKU-HAT-301-GRN-OS'), 'Nos', 30.00, NULL, NULL, FALSE
WHERE NOT EXISTS (SELECT 1 FROM tabCartonItem WHERE carton_id = 'CARTON-005');

INSERT IGNORE INTO tabCartonItem (carton_id, item_code, uom, qty, batch_no, serial_no, is_closed)
SELECT 'CARTON-006', COALESCE((SELECT item_code FROM tabStockLedger LIMIT 1), (SELECT code FROM tabItem LIMIT 1), 'SKU-HAT-301-BLU-OS'), 'Nos', 12.00, NULL, NULL, FALSE
WHERE NOT EXISTS (SELECT 1 FROM tabCartonItem WHERE carton_id = 'CARTON-006');

INSERT IGNORE INTO tabCartonItem (carton_id, item_code, uom, qty, batch_no, serial_no, is_closed)
SELECT 'CARTON-007', COALESCE((SELECT item_code FROM tabStockLedger WHERE item_code != (SELECT item_code FROM tabStockLedger LIMIT 1) LIMIT 1), (SELECT code FROM tabItem WHERE code != (SELECT code FROM tabItem LIMIT 1) LIMIT 1), 'SKU-HAT-301-GRN-OS'), 'Nos', 18.00, NULL, NULL, FALSE
WHERE NOT EXISTS (SELECT 1 FROM tabCartonItem WHERE carton_id = 'CARTON-007');

-- ============================================================
-- PART 4: Create Carton Stock (Carton-Level Inventory)
-- ============================================================
-- Insert carton stock using item_code from carton items

INSERT IGNORE INTO tabCartonStock (carton_id, item_code, warehouse, bin_location, qty, uom, batch_no, serial_no, status)
SELECT ci.carton_id, ci.item_code, 'WH-MAIN', 
       c.current_bin_id as bin_location,
       ci.qty, ci.uom, ci.batch_no, ci.serial_no, 'PUTAWAY'
FROM tabCartonItem ci
INNER JOIN tabCarton c ON ci.carton_id = c.carton_id
WHERE ci.carton_id IN ('CARTON-001', 'CARTON-002', 'CARTON-003', 'CARTON-004', 'CARTON-005', 'CARTON-006', 'CARTON-007')
AND NOT EXISTS (SELECT 1 FROM tabCartonStock WHERE carton_id = ci.carton_id AND item_code = ci.item_code);

-- ============================================================
-- PART 5: Verification Queries
-- ============================================================

-- Show created cartons
SELECT 
    c.carton_id,
    c.status,
    c.current_bin_id as bin_location,
    ci.item_code,
    ci.qty,
    cs.qty as stock_qty
FROM tabCarton c
LEFT JOIN tabCartonItem ci ON c.carton_id = ci.carton_id
LEFT JOIN tabCartonStock cs ON c.carton_id = cs.carton_id AND ci.item_code = cs.item_code
ORDER BY c.carton_id;

-- Show carton stock summary by item
SELECT 
    item_code,
    warehouse,
    bin_location,
    COUNT(DISTINCT carton_id) as carton_count,
    SUM(qty) as total_qty
FROM tabCartonStock
GROUP BY item_code, warehouse, bin_location
ORDER BY item_code, bin_location;

-- Show item inventory by carton (for Item Location Breakdown)
SELECT 
    cs.item_code,
    cs.warehouse,
    cs.bin_location,
    cs.carton_id,
    cs.qty,
    b.zone,
    b.aisle,
    b.rack,
    b.level
FROM tabCartonStock cs
LEFT JOIN tabBin b ON cs.bin_location = b.bin_id
WHERE cs.status = 'PUTAWAY'
ORDER BY cs.item_code, cs.bin_location, cs.carton_id;

-- ============================================================
-- PART 6: Summary
-- ============================================================

SELECT 
    'Migration 005 Test Data Inserted' AS status,
    (SELECT COUNT(*) FROM tabBin) AS total_bins,
    (SELECT COUNT(*) FROM tabCarton) AS total_cartons,
    (SELECT COUNT(*) FROM tabCartonItem) AS total_carton_items,
    (SELECT COUNT(*) FROM tabCartonStock) AS total_carton_stock_records;

