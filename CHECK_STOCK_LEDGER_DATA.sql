-- ============================================================
-- Check Stock Ledger Data
-- ============================================================
-- Use this to verify what stock ledger data exists in your database
-- ============================================================

-- 1. Check if tabStockLedger table exists and has data
SELECT 
    COUNT(*) as total_records,
    COUNT(DISTINCT item_code) as unique_items,
    COUNT(DISTINCT warehouse) as unique_warehouses
FROM tabStockLedger;

-- 2. List all items in stock ledger
SELECT 
    item_code,
    warehouse,
    COUNT(*) as location_count,
    SUM(qty) as total_qty
FROM tabStockLedger
GROUP BY item_code, warehouse
ORDER BY item_code, warehouse
LIMIT 20;

-- 3. Check specific item (SKU-001) in all warehouses
SELECT 
    item_code,
    warehouse,
    bin_location,
    qty,
    reserved_qty,
    available_qty,
    last_transaction_date,
    last_transaction_type
FROM tabStockLedger
WHERE item_code = 'SKU-001'
ORDER BY warehouse, bin_location;

-- 4. Check all items in WH-MAIN warehouse
SELECT 
    item_code,
    bin_location,
    qty,
    reserved_qty,
    available_qty,
    last_transaction_date
FROM tabStockLedger
WHERE warehouse = 'WH-MAIN'
ORDER BY item_code, bin_location
LIMIT 20;

-- 5. Check if item SKU-001 exists in item master
SELECT 
    code,
    item_name,
    stock_qty,
    uom
FROM tabItem
WHERE code = 'SKU-001';

-- 6. List first 10 items that have stock ledger entries
SELECT DISTINCT
    sl.item_code,
    i.item_name,
    sl.warehouse,
    SUM(sl.qty) as total_qty
FROM tabStockLedger sl
LEFT JOIN tabItem i ON sl.item_code = i.code
GROUP BY sl.item_code, i.item_name, sl.warehouse
ORDER BY sl.item_code
LIMIT 10;

