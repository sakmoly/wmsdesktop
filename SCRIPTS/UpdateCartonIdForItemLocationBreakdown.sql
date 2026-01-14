-- ============================================================================
-- Update Carton ID for Item Location Breakdown
-- ============================================================================
-- This script helps update carton IDs for existing stock that appears in 
-- the Item Location Breakdown window
-- ============================================================================

-- ============================================================================
-- STEP 1: Check Current State
-- ============================================================================

-- Check what stock entries exist in tabStockLedger (Item Location Breakdown source)
SELECT 'STEP 1: Current stock in tabStockLedger (for Item Location Breakdown):' as Info;
SELECT 
    item_code,
    warehouse,
    bin_location,
    carton_id,
    qty,
    updated_at
FROM tabStockLedger
WHERE qty > 0
ORDER BY item_code, bin_location, carton_id;

-- Check what carton stock exists in tabCartonStock
SELECT 'STEP 2: Current carton stock in tabCartonStock:' as Info;
SELECT 
    carton_id,
    item_code,
    warehouse,
    bin_location,
    qty,
    status,
    updated_at
FROM tabCartonStock
WHERE qty > 0
ORDER BY item_code, bin_location, carton_id;

-- Check items that need carton IDs (have stock but no carton_id)
SELECT 'STEP 3: Items with stock but missing carton_id in tabStockLedger:' as Info;
SELECT 
    item_code,
    warehouse,
    bin_location,
    qty,
    COUNT(*) as locations_without_carton
FROM tabStockLedger
WHERE qty > 0
  AND (carton_id IS NULL OR carton_id = '')
GROUP BY item_code, warehouse, bin_location
ORDER BY item_code, bin_location;

-- ============================================================================
-- STEP 2: Update Methods
-- ============================================================================

-- ============================================================================
-- METHOD 1: Update Carton ID in tabStockLedger (if column exists)
-- ============================================================================

-- Check if carton_id column exists in tabStockLedger
SELECT 'Checking if carton_id column exists in tabStockLedger...' as Info;
SELECT COUNT(*) as column_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabStockLedger'
  AND COLUMN_NAME = 'carton_id';

-- Example 1: Update carton_id for specific item+location combination
-- Replace the values below with your actual data:
-- UPDATE tabStockLedger
-- SET carton_id = 'CARTON-001',  -- Your carton ID
--     updated_at = NOW()
-- WHERE item_code = 'SKU-HAT-301-BLU-OS'  -- Your item code
--   AND warehouse = 'WH-MAIN'  -- Your warehouse code
--   AND bin_location = 'A1-R01-L1-B1'  -- Your bin location
--   AND (carton_id IS NULL OR carton_id = '')
--   AND qty > 0;

-- Example 2: Update carton_id for all items at a specific bin location
-- UPDATE tabStockLedger
-- SET carton_id = 'CARTON-001',  -- Your carton ID
--     updated_at = NOW()
-- WHERE warehouse = 'WH-MAIN'
--   AND bin_location = 'A1-R01-L1-B1'
--   AND (carton_id IS NULL OR carton_id = '')
--   AND qty > 0;

-- Example 3: Update carton_id for all items of a specific item code
-- UPDATE tabStockLedger
-- SET carton_id = 'CARTON-001',  -- Your carton ID
--     updated_at = NOW()
-- WHERE item_code = 'SKU-HAT-301-BLU-OS'
--   AND warehouse = 'WH-MAIN'
--   AND (carton_id IS NULL OR carton_id = '')
--   AND qty > 0;

-- ============================================================================
-- METHOD 2: Create/Update Carton Stock Entries (tabCartonStock)
-- ============================================================================

-- This creates carton stock entries from existing stock ledger entries
-- This is useful when you want to track stock at carton level

-- Example 1: Create carton stock entry for specific item+location
-- Replace values with your actual data:
-- INSERT INTO tabCartonStock 
--     (carton_id, item_code, warehouse, bin_location, qty, status)
-- VALUES 
--     ('CARTON-001', 'SKU-HAT-301-BLU-OS', 'WH-MAIN', 'A1-R01-L1-B1', 3.00, 'PUTAWAY')
-- ON DUPLICATE KEY UPDATE
--     qty = VALUES(qty),
--     updated_at = NOW(),
--     status = 'PUTAWAY',
--     bin_location = VALUES(bin_location);

-- Example 2: Create carton stock entries for all items at a bin location
-- This generates carton IDs automatically based on item code and bin location
INSERT INTO tabCartonStock 
    (carton_id, item_code, warehouse, bin_location, qty, status)
SELECT 
    CONCAT('CTN-', 
           UPPER(LEFT(item_code, 10)), '-',
           REPLACE(REPLACE(REPLACE(bin_location, '-', ''), ' ', ''), '_', ''), '-',
           DATE_FORMAT(NOW(), '%Y%m%d%H%i%s')) as carton_id,
    item_code,
    warehouse,
    bin_location,
    qty,
    'PUTAWAY' as status
FROM tabStockLedger
WHERE warehouse = 'WH-MAIN'  -- Change to your warehouse code
  AND bin_location IS NOT NULL
  AND qty > 0
  AND NOT EXISTS (
      SELECT 1 FROM tabCartonStock cs
      WHERE cs.item_code = tabStockLedger.item_code
        AND cs.warehouse = tabStockLedger.warehouse
        AND cs.bin_location = tabStockLedger.bin_location
        AND cs.qty > 0
  )
LIMIT 100;  -- Limit to prevent too many inserts at once

-- Example 3: Update existing carton stock entry
-- UPDATE tabCartonStock
-- SET carton_id = 'CARTON-NEW',  -- New carton ID
--     updated_at = NOW()
-- WHERE carton_id = 'CARTON-OLD'  -- Old carton ID
--   AND item_code = 'SKU-HAT-301-BLU-OS'
--   AND warehouse = 'WH-MAIN'
--   AND bin_location = 'A1-R01-L1-B1';

-- ============================================================================
-- METHOD 3: Bulk Update from Putaway/Cycle Count Data
-- ============================================================================

-- If you have carton IDs in putaway lines, you can use them to update stock ledger
-- Example: Update stock ledger carton_id from putaway lines
UPDATE tabStockLedger sl
INNER JOIN tabPutawayLine pl ON 
    sl.item_code = pl.item_code 
    AND sl.warehouse = 'WH-MAIN'  -- Your warehouse code
    AND sl.bin_location = CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), ''))
INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title AND pt.status = 'Completed'
SET sl.carton_id = pl.carton_id,
    sl.updated_at = NOW()
WHERE pl.carton_id IS NOT NULL
  AND pl.carton_id != ''
  AND (sl.carton_id IS NULL OR sl.carton_id = '')
  AND sl.qty > 0;

-- If you have carton IDs in cycle count lines, you can use them too
UPDATE tabStockLedger sl
INNER JOIN tabCycleCountLine ccl ON 
    sl.item_code = ccl.item_code 
    AND sl.warehouse = 'WH-MAIN'  -- Your warehouse code
    AND sl.bin_location = ccl.bin_location
INNER JOIN tabCycleCountTask cct ON ccl.parent_title = cct.title AND cct.status = 'Completed'
SET sl.carton_id = ccl.carton_id,
    sl.updated_at = NOW()
WHERE ccl.carton_id IS NOT NULL
  AND ccl.carton_id != ''
  AND (sl.carton_id IS NULL OR sl.carton_id = '')
  AND sl.qty > 0;

-- ============================================================================
-- STEP 3: Verify the Update
-- ============================================================================

-- Verify carton IDs in tabStockLedger
SELECT 'After update - carton IDs in tabStockLedger:' as Info;
SELECT 
    item_code,
    warehouse,
    bin_location,
    carton_id,
    qty,
    updated_at
FROM tabStockLedger
WHERE qty > 0
ORDER BY item_code, bin_location, carton_id;

-- Verify carton IDs in tabCartonStock
SELECT 'After update - carton IDs in tabCartonStock:' as Info;
SELECT 
    carton_id,
    item_code,
    warehouse,
    bin_location,
    qty,
    status
FROM tabCartonStock
WHERE qty > 0
ORDER BY item_code, bin_location, carton_id;

-- Check for items still missing carton IDs
SELECT 'Items still missing carton_id after update:' as Info;
SELECT 
    item_code,
    warehouse,
    bin_location,
    qty
FROM tabStockLedger
WHERE qty > 0
  AND (carton_id IS NULL OR carton_id = '')
ORDER BY item_code, bin_location;

-- Summary
SELECT 'Summary:' as Info;
SELECT 
    (SELECT COUNT(*) FROM tabStockLedger WHERE qty > 0) as total_stock_entries,
    (SELECT COUNT(*) FROM tabStockLedger WHERE qty > 0 AND carton_id IS NOT NULL AND carton_id != '') as entries_with_carton_id,
    (SELECT COUNT(*) FROM tabStockLedger WHERE qty > 0 AND (carton_id IS NULL OR carton_id = '')) as entries_without_carton_id,
    (SELECT COUNT(*) FROM tabCartonStock WHERE qty > 0) as total_carton_stock_entries;
