-- Fix Warehouse Names in Stock Ledger
-- Normalize warehouse names to match location breakdown expectations
-- Run this script to fix existing data

-- Step 1: Check current warehouse names
SELECT 'Current warehouse names in Stock Ledger:' as Info;
SELECT DISTINCT warehouse, COUNT(*) as entry_count
FROM tabStockLedger
GROUP BY warehouse
ORDER BY entry_count DESC;

-- Step 2: Normalize warehouse names
-- Update "WH-MAIN" and variations to "Main Warehouse"
UPDATE tabStockLedger
SET warehouse = 'Main Warehouse'
WHERE warehouse IN ('WH-MAIN', 'WH-Main', 'Main', 'WHMAIN')
  AND warehouse != 'Main Warehouse';

-- Step 3: Verify the update
SELECT 'After normalization:' as Info;
SELECT DISTINCT warehouse, COUNT(*) as entry_count
FROM tabStockLedger
GROUP BY warehouse
ORDER BY entry_count DESC;

-- Step 4: Check for items with stock but no location breakdown
SELECT 'Items with stock but missing bin_location:' as Info;
SELECT 
  sl.item_code,
  sl.warehouse,
  COUNT(*) as entries_without_bin,
  SUM(sl.qty) as total_qty
FROM tabStockLedger sl
WHERE sl.bin_location IS NULL
  AND sl.qty > 0
GROUP BY sl.item_code, sl.warehouse
ORDER BY total_qty DESC
LIMIT 20;

-- Step 5: Check putaway lines that should have bin_location
SELECT 'Putaway lines with rack/bin but missing in stock ledger:' as Info;
SELECT 
  pl.item_code,
  pl.parent_title as putaway_task,
  CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), '')) as expected_bin_location,
  pl.qty as putaway_qty,
  sl.bin_location as actual_bin_location,
  sl.qty as stock_qty,
  CASE 
    WHEN sl.item_code IS NULL THEN 'MISSING IN STOCK LEDGER'
    WHEN sl.bin_location != CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), '')) THEN 'BIN LOCATION MISMATCH'
    WHEN sl.qty != pl.qty THEN 'QTY MISMATCH'
    ELSE 'OK'
  END as status
FROM tabPutawayLine pl
LEFT JOIN tabStockLedger sl ON 
  sl.item_code = pl.item_code 
  AND sl.warehouse = 'Main Warehouse'
  AND sl.bin_location = CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), ''))
WHERE pl.rack IS NOT NULL
  AND pl.parent_title IN (
    SELECT title FROM tabPutawayTask WHERE status = 'Completed' ORDER BY created_at DESC LIMIT 10
  )
ORDER BY pl.parent_title DESC, pl.item_code
LIMIT 50;

-- Step 6: Summary
SELECT 'Summary:' as Info;
SELECT 
  (SELECT COUNT(*) FROM tabStockLedger WHERE warehouse = 'Main Warehouse') as entries_main_warehouse,
  (SELECT COUNT(*) FROM tabStockLedger WHERE warehouse != 'Main Warehouse' AND warehouse IS NOT NULL) as entries_other_warehouses,
  (SELECT COUNT(*) FROM tabStockLedger WHERE bin_location IS NOT NULL) as entries_with_bin_location,
  (SELECT COUNT(*) FROM tabStockLedger WHERE bin_location IS NULL AND qty > 0) as entries_without_bin_location;

