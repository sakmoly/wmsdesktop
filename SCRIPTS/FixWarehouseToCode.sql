-- Fix Warehouse Names to Codes in Stock Ledger and Related Tables
-- This script converts warehouse NAMES (e.g., "Main Warehouse") to warehouse CODES (e.g., "WH-MAIN")
-- CRITICAL: tabStockLedger.warehouse should store warehouse CODE, not NAME

-- Step 1: Check current warehouse values in stock ledger
SELECT 'STEP 1: Current warehouse values in tabStockLedger:' as Info;
SELECT DISTINCT warehouse, COUNT(*) as entry_count
FROM tabStockLedger
GROUP BY warehouse
ORDER BY entry_count DESC;

-- Step 2: Check warehouse master data (code vs name)
SELECT 'STEP 2: Warehouse master data (code vs name):' as Info;
SELECT code, name, warehouse_type
FROM tabWarehouse
ORDER BY code;

-- Step 3: Update tabStockLedger - Convert warehouse NAMES to CODES
-- This updates "Main Warehouse" -> "WH-MAIN" (or appropriate code from tabWarehouse)
UPDATE tabStockLedger sl
INNER JOIN tabWarehouse wh ON sl.warehouse = wh.name
SET sl.warehouse = wh.code
WHERE sl.warehouse != wh.code;

-- Step 4: Update tabCartonStock - Convert warehouse NAMES to CODES
-- Check if tabCartonStock exists and has warehouse column
UPDATE tabCartonStock cs
INNER JOIN tabWarehouse wh ON cs.warehouse = wh.name
SET cs.warehouse = wh.code
WHERE cs.warehouse != wh.code;

-- Step 5: Update tabStockTransaction - Convert warehouse NAMES to CODES
UPDATE tabStockTransaction st
INNER JOIN tabWarehouse wh ON st.warehouse = wh.name
SET st.warehouse = wh.code
WHERE st.warehouse != wh.code;

-- Step 6: Handle any remaining warehouse names that don't match exactly
-- Try case-insensitive match
UPDATE tabStockLedger sl
INNER JOIN tabWarehouse wh ON UPPER(TRIM(sl.warehouse)) = UPPER(TRIM(wh.name))
SET sl.warehouse = wh.code
WHERE sl.warehouse != wh.code;

UPDATE tabCartonStock cs
INNER JOIN tabWarehouse wh ON UPPER(TRIM(cs.warehouse)) = UPPER(TRIM(wh.name))
SET cs.warehouse = wh.code
WHERE cs.warehouse != wh.code;

UPDATE tabStockTransaction st
INNER JOIN tabWarehouse wh ON UPPER(TRIM(st.warehouse)) = UPPER(TRIM(wh.name))
SET st.warehouse = wh.code
WHERE st.warehouse != wh.code;

-- Step 7: For any warehouse values that still don't match (orphaned), 
-- set to default warehouse code (WH-MAIN or first warehouse code)
UPDATE tabStockLedger sl
LEFT JOIN tabWarehouse wh ON sl.warehouse = wh.code OR sl.warehouse = wh.name
SET sl.warehouse = (SELECT code FROM tabWarehouse WHERE warehouse_type = 'Warehouse' ORDER BY code LIMIT 1)
WHERE wh.code IS NULL
  AND sl.warehouse NOT IN (SELECT code FROM tabWarehouse);

UPDATE tabCartonStock cs
LEFT JOIN tabWarehouse wh ON cs.warehouse = wh.code OR cs.warehouse = wh.name
SET cs.warehouse = (SELECT code FROM tabWarehouse WHERE warehouse_type = 'Warehouse' ORDER BY code LIMIT 1)
WHERE wh.code IS NULL
  AND cs.warehouse NOT IN (SELECT code FROM tabWarehouse);

UPDATE tabStockTransaction st
LEFT JOIN tabWarehouse wh ON st.warehouse = wh.code OR st.warehouse = wh.name
SET st.warehouse = (SELECT code FROM tabWarehouse WHERE warehouse_type = 'Warehouse' ORDER BY code LIMIT 1)
WHERE wh.code IS NULL
  AND st.warehouse NOT IN (SELECT code FROM tabWarehouse);

-- Step 8: Verify the update
SELECT 'STEP 8: After normalization - warehouse codes in tabStockLedger:' as Info;
SELECT DISTINCT warehouse, COUNT(*) as entry_count
FROM tabStockLedger
GROUP BY warehouse
ORDER BY entry_count DESC;

-- Step 9: Check if any warehouse names still exist (should be none)
SELECT 'STEP 9: Remaining warehouse names (should be 0):' as Info;
SELECT DISTINCT sl.warehouse
FROM tabStockLedger sl
LEFT JOIN tabWarehouse wh ON sl.warehouse = wh.code
WHERE wh.code IS NULL;

-- Step 10: Summary
SELECT 'STEP 10: Summary:' as Info;
SELECT 
  (SELECT COUNT(*) FROM tabStockLedger) as total_stock_ledger_entries,
  (SELECT COUNT(DISTINCT warehouse) FROM tabStockLedger) as unique_warehouses_in_ledger,
  (SELECT COUNT(*) FROM tabStockLedger WHERE warehouse IN (SELECT code FROM tabWarehouse)) as entries_with_valid_warehouse_code,
  (SELECT COUNT(*) FROM tabCartonStock) as total_carton_stock_entries,
  (SELECT COUNT(*) FROM tabStockTransaction) as total_stock_transactions;
