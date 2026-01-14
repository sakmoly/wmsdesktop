-- ============================================================================
-- Update Carton ID for Existing Stock - SQL Scripts
-- ============================================================================
-- Use these SQL scripts to update carton IDs for existing stock in the database
-- ============================================================================

-- ============================================================================
-- 1. Update Carton ID in tabStockLedger (if column exists)
-- ============================================================================

-- Check if carton_id column exists in tabStockLedger
SELECT COUNT(*) as column_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabStockLedger'
  AND COLUMN_NAME = 'carton_id';

-- Example 1: Update carton_id for specific item+bin combination
UPDATE tabStockLedger
SET carton_id = 'CARTON-001',
    updated_at = NOW()
WHERE item_code = 'SKU-001'
  AND warehouse = 'WH-MAIN'
  AND bin_location = 'A1-R01-L1-B1'
  AND (carton_id IS NULL OR carton_id = '')
  AND qty > 0;

-- Example 2: Update carton_id for all items at a specific bin location
UPDATE tabStockLedger
SET carton_id = 'CARTON-001',
    updated_at = NOW()
WHERE warehouse = 'WH-MAIN'
  AND bin_location = 'A1-R01-L1-B1'
  AND (carton_id IS NULL OR carton_id = '')
  AND qty > 0;

-- Example 3: Update carton_id for all items of a specific item code (across all bins)
UPDATE tabStockLedger
SET carton_id = 'CARTON-001',
    updated_at = NOW()
WHERE item_code = 'SKU-001'
  AND warehouse = 'WH-MAIN'
  AND (carton_id IS NULL OR carton_id = '')
  AND qty > 0;

-- Example 4: Update carton_id for all items in a warehouse (USE WITH CAUTION!)
-- UPDATE tabStockLedger
-- SET carton_id = 'CARTON-001',
--     updated_at = NOW()
-- WHERE warehouse = 'WH-MAIN'
--   AND (carton_id IS NULL OR carton_id = '')
--   AND qty > 0;

-- ============================================================================
-- 2. Create Carton Stock Entries from Stock Ledger (Migration)
-- ============================================================================

-- Check if tabCartonStock table exists
SELECT COUNT(*) as table_exists
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabCartonStock';

-- Example 1: Create carton stock entries for all items at a specific bin
INSERT INTO tabCartonStock 
    (carton_id, item_code, warehouse, bin_location, qty, status, created_at, updated_at)
SELECT 
    'CARTON-001' as carton_id,
    item_code,
    warehouse,
    bin_location,
    qty,
    'PUTAWAY' as status,
    NOW() as created_at,
    NOW() as updated_at
FROM tabStockLedger
WHERE warehouse = 'WH-MAIN'
  AND bin_location = 'A1-R01-L1-B1'
  AND qty > 0
ON DUPLICATE KEY UPDATE
    qty = VALUES(qty),
    updated_at = NOW(),
    status = 'PUTAWAY';

-- Example 2: Create carton stock entries for a specific item at all bins
INSERT INTO tabCartonStock 
    (carton_id, item_code, warehouse, bin_location, qty, status, created_at, updated_at)
SELECT 
    CONCAT('CARTON-', LPAD(ROW_NUMBER() OVER (ORDER BY bin_location), 3, '0')) as carton_id,
    item_code,
    warehouse,
    bin_location,
    qty,
    'PUTAWAY' as status,
    NOW() as created_at,
    NOW() as updated_at
FROM tabStockLedger
WHERE item_code = 'SKU-001'
  AND warehouse = 'WH-MAIN'
  AND bin_location IS NOT NULL
  AND qty > 0
ON DUPLICATE KEY UPDATE
    qty = VALUES(qty),
    updated_at = NOW(),
    status = 'PUTAWAY';

-- Example 3: Create carton stock entries with unique carton IDs per item+bin
-- This creates a new carton ID for each unique item+bin combination
INSERT INTO tabCartonStock 
    (carton_id, item_code, warehouse, bin_location, qty, status, created_at, updated_at)
SELECT 
    CONCAT('CARTON-', 
           UPPER(LEFT(item_code, 3)), '-',
           REPLACE(REPLACE(bin_location, '-', ''), ' ', ''), '-',
           DATE_FORMAT(NOW(), '%Y%m%d')) as carton_id,
    item_code,
    warehouse,
    bin_location,
    qty,
    'PUTAWAY' as status,
    NOW() as created_at,
    NOW() as updated_at
FROM tabStockLedger
WHERE warehouse = 'WH-MAIN'
  AND bin_location IS NOT NULL
  AND qty > 0
  AND NOT EXISTS (
      SELECT 1 FROM tabCartonStock cs
      WHERE cs.item_code = tabStockLedger.item_code
        AND cs.warehouse = tabStockLedger.warehouse
        AND cs.bin_location = tabStockLedger.bin_location
  );

-- ============================================================================
-- 3. Update Carton ID in tabCartonStock
-- ============================================================================

-- Example 1: Update carton_id for existing entries (change old to new)
UPDATE tabCartonStock
SET carton_id = 'CARTON-NEW',
    updated_at = NOW()
WHERE carton_id = 'CARTON-OLD'
  AND qty > 0;

-- Example 2: Update carton_id for specific item+bin
UPDATE tabCartonStock
SET carton_id = 'CARTON-002',
    updated_at = NOW()
WHERE item_code = 'SKU-001'
  AND warehouse = 'WH-MAIN'
  AND bin_location = 'A1-R01-L1-B1'
  AND carton_id = 'CARTON-001'
  AND qty > 0;

-- Example 3: Clear carton_id (set to NULL) - USE WITH CAUTION!
-- UPDATE tabCartonStock
-- SET carton_id = NULL,
--     updated_at = NOW()
-- WHERE carton_id = 'CARTON-001'
--   AND qty > 0;

-- ============================================================================
-- 4. Verification Queries
-- ============================================================================

-- Verify carton IDs in tabStockLedger (if column exists)
SELECT 
    item_code,
    bin_location,
    carton_id,
    qty,
    updated_at
FROM tabStockLedger
WHERE warehouse = 'WH-MAIN'
  AND bin_location = 'A1-R01-L1-B1'
ORDER BY item_code, carton_id;

-- Verify carton stock entries
SELECT 
    carton_id,
    item_code,
    bin_location,
    qty,
    status,
    updated_at
FROM tabCartonStock
WHERE warehouse = 'WH-MAIN'
  AND bin_location = 'A1-R01-L1-B1'
ORDER BY carton_id, item_code;

-- Compare quantities between tabStockLedger and tabCartonStock
SELECT 
    sl.item_code,
    sl.bin_location,
    sl.carton_id as stock_ledger_carton_id,
    sl.qty as stock_ledger_qty,
    COALESCE(SUM(cs.qty), 0) as carton_stock_total_qty,
    (sl.qty - COALESCE(SUM(cs.qty), 0)) as quantity_difference,
    GROUP_CONCAT(DISTINCT cs.carton_id ORDER BY cs.carton_id) as carton_ids_in_tabCartonStock
FROM tabStockLedger sl
LEFT JOIN tabCartonStock cs ON sl.item_code = cs.item_code 
    AND sl.warehouse = cs.warehouse 
    AND sl.bin_location = cs.bin_location
WHERE sl.warehouse = 'WH-MAIN'
  AND sl.bin_location = 'A1-R01-L1-B1'
GROUP BY sl.item_code, sl.bin_location, sl.carton_id, sl.qty
ORDER BY sl.item_code;

-- Find items without carton IDs
SELECT 
    item_code,
    bin_location,
    qty,
    updated_at
FROM tabStockLedger
WHERE warehouse = 'WH-MAIN'
  AND (carton_id IS NULL OR carton_id = '')
  AND qty > 0
ORDER BY item_code, bin_location;

-- Count items by carton ID
SELECT 
    carton_id,
    COUNT(DISTINCT item_code) as item_count,
    SUM(qty) as total_qty
FROM tabCartonStock
WHERE warehouse = 'WH-MAIN'
GROUP BY carton_id
ORDER BY carton_id;

-- ============================================================================
-- 5. Rollback Scripts (USE WITH CAUTION!)
-- ============================================================================

-- Rollback: Clear carton_id from tabStockLedger (if you made a mistake)
-- UPDATE tabStockLedger
-- SET carton_id = NULL,
--     updated_at = NOW()
-- WHERE warehouse = 'WH-MAIN'
--   AND bin_location = 'A1-R01-L1-B1'
--   AND carton_id = 'CARTON-001';

-- Rollback: Delete carton stock entries (if you made a mistake)
-- DELETE FROM tabCartonStock
-- WHERE warehouse = 'WH-MAIN'
--   AND bin_location = 'A1-R01-L1-B1'
--   AND carton_id = 'CARTON-001';

-- ============================================================================
-- IMPORTANT NOTES:
-- ============================================================================
-- 1. Always backup your database before running update scripts
-- 2. Test on a small dataset first (use WHERE clause with specific item/bin)
-- 3. Verify results after updates using the verification queries above
-- 4. Use transactions to ensure data consistency:
--    START TRANSACTION;
--    -- Your UPDATE statements here
--    -- Verify results
--    COMMIT; -- or ROLLBACK; if something is wrong
-- 5. Consider creating carton records in tabCarton table first (if applicable)
-- 6. Ensure carton IDs follow your naming conventions
-- ============================================================================
