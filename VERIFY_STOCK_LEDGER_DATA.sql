-- ============================================================
-- Quick Verification Script for Stock Ledger Data
-- ============================================================
-- Run this to check if you have any stock ledger data
-- ============================================================

-- 1. Check if table exists and has any records
SELECT 
    'Total Records' as check_type,
    COUNT(*) as count
FROM tabStockLedger

UNION ALL

SELECT 
    'Unique Items' as check_type,
    COUNT(DISTINCT item_code) as count
FROM tabStockLedger

UNION ALL

SELECT 
    'Unique Warehouses' as check_type,
    COUNT(DISTINCT warehouse) as count
FROM tabStockLedger;

-- 2. Show sample records (first 10)
SELECT 
    item_code,
    warehouse,
    bin_location,
    qty,
    last_transaction_type,
    last_transaction_date
FROM tabStockLedger
ORDER BY last_transaction_date DESC
LIMIT 10;

-- 3. Check for WH-MAIN specifically
SELECT 
    item_code,
    bin_location,
    qty,
    last_transaction_type
FROM tabStockLedger
WHERE warehouse = 'WH-MAIN'
ORDER BY item_code
LIMIT 10;

-- 4. List all warehouses that have stock
SELECT DISTINCT warehouse
FROM tabStockLedger
ORDER BY warehouse;

-- 5. Check if item SKU-001 exists anywhere
SELECT 
    item_code,
    warehouse,
    bin_location,
    qty
FROM tabStockLedger
WHERE item_code LIKE '%SKU-001%' OR item_code = 'SKU-001'
ORDER BY warehouse;

