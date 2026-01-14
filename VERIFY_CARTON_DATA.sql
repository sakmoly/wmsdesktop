-- ============================================================
-- Verification Script: Carton-Level Inventory Data
-- ============================================================
-- Run this after inserting test carton data to verify everything is working
-- ============================================================

-- Check 1: Verify bins were created
SELECT '=== BINS CREATED ===' AS Check;
SELECT 
    bin_id,
    warehouse_id,
    zone,
    aisle,
    rack,
    level,
    bin_type,
    is_active
FROM tabBin
ORDER BY bin_id;

-- Check 2: Verify cartons were created
SELECT '=== CARTONS CREATED ===' AS Check;
SELECT 
    carton_id,
    asn_no,
    status,
    current_bin_id,
    warehouse,
    created_on
FROM tabCarton
ORDER BY carton_id;

-- Check 3: Verify carton items
SELECT '=== CARTON ITEMS ===' AS Check;
SELECT 
    ci.carton_id,
    ci.item_code,
    ci.uom,
    ci.qty,
    ci.batch_no,
    ci.serial_no,
    ci.is_closed
FROM tabCartonItem ci
ORDER BY ci.carton_id, ci.item_code;

-- Check 4: Verify carton stock (inventory)
SELECT '=== CARTON STOCK (INVENTORY) ===' AS Check;
SELECT 
    cs.carton_id,
    cs.item_code,
    cs.warehouse,
    cs.bin_location,
    cs.qty,
    cs.uom,
    cs.status,
    b.zone,
    b.rack,
    b.level
FROM tabCartonStock cs
LEFT JOIN tabBin b ON cs.bin_location = b.bin_id
ORDER BY cs.item_code, cs.bin_location, cs.carton_id;

-- Check 5: Summary by Item (for Item Location Breakdown view)
SELECT '=== ITEM INVENTORY BY CARTON (SUMMARY) ===' AS Check;
SELECT 
    cs.item_code,
    cs.warehouse,
    cs.bin_location,
    COUNT(DISTINCT cs.carton_id) AS carton_count,
    SUM(cs.qty) AS total_qty,
    GROUP_CONCAT(DISTINCT cs.carton_id ORDER BY cs.carton_id SEPARATOR ', ') AS carton_ids
FROM tabCartonStock cs
WHERE cs.status = 'PUTAWAY'
GROUP BY cs.item_code, cs.warehouse, cs.bin_location
ORDER BY cs.item_code, cs.bin_location;

-- Check 6: Detailed view (what Item Location Breakdown should show)
SELECT '=== DETAILED ITEM LOCATION BREAKDOWN (Carton Level) ===' AS Check;
SELECT 
    cs.item_code AS 'Item Code',
    cs.warehouse AS 'Warehouse',
    cs.bin_location AS 'Location ID',
    b.zone AS 'Zone',
    b.aisle AS 'Aisle',
    b.rack AS 'Rack',
    b.level AS 'Level',
    b.position AS 'Bin',
    cs.carton_id AS 'Carton ID',
    cs.qty AS 'Quantity'
FROM tabCartonStock cs
LEFT JOIN tabBin b ON cs.bin_location = b.bin_id
WHERE cs.status = 'PUTAWAY'
ORDER BY cs.item_code, cs.bin_location, cs.carton_id;

-- Check 7: Count summary
SELECT '=== DATA COUNT SUMMARY ===' AS Check;
SELECT 
    (SELECT COUNT(*) FROM tabBin) AS total_bins,
    (SELECT COUNT(*) FROM tabCarton) AS total_cartons,
    (SELECT COUNT(*) FROM tabCartonItem) AS total_carton_items,
    (SELECT COUNT(*) FROM tabCartonStock) AS total_carton_stock_records,
    (SELECT COUNT(DISTINCT item_code) FROM tabCartonStock) AS unique_items,
    (SELECT COUNT(DISTINCT bin_location) FROM tabCartonStock) AS unique_bins;

-- Check 8: Verify carton_id column exists in tabStockTransaction
SELECT '=== VERIFY carton_id COLUMN IN tabStockTransaction ===' AS Check;
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'tabStockTransaction'
AND COLUMN_NAME = 'carton_id';

