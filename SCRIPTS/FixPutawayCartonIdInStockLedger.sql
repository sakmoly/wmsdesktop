-- ============================================================================
-- Fix Putaway Carton ID in Stock Ledger
-- ============================================================================
-- This script updates carton_id in tabStockLedger and tabCartonStock
-- based on carton_id from completed putaway tasks
-- ============================================================================

-- ============================================================================
-- STEP 1: Check Current State
-- ============================================================================

-- Check if carton_id column exists in tabStockLedger
SELECT 'STEP 1: Check if carton_id column exists in tabStockLedger:' as Info;
SELECT COUNT(*) as column_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabStockLedger'
  AND COLUMN_NAME = 'carton_id';

-- Check putaway lines with carton IDs
SELECT 'STEP 2: Putaway lines with carton IDs from completed tasks:' as Info;
SELECT 
    pl.parent_title as putaway_task,
    pl.item_code,
    pl.carton_id,
    pl.qty,
    CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), '')) as bin_location,
    pl.location_id
FROM tabPutawayLine pl
INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title AND pt.status = 'Completed'
WHERE pl.carton_id IS NOT NULL
  AND pl.carton_id != ''
  AND pl.item_code IS NOT NULL
  AND pl.qty > 0
ORDER BY pl.parent_title, pl.item_code;

-- Check stock ledger entries that should have carton IDs from putaway
SELECT 'STEP 3: Stock ledger entries that should be updated:' as Info;
SELECT 
    sl.item_code,
    sl.warehouse,
    sl.bin_location,
    sl.carton_id as current_carton_id,
    pl.carton_id as putaway_carton_id,
    sl.qty,
    pt.title as putaway_task
FROM tabStockLedger sl
INNER JOIN tabPutawayLine pl ON 
    sl.item_code = pl.item_code 
    AND sl.warehouse IN (SELECT code FROM tabWarehouse WHERE warehouse_type = 'Warehouse')
    AND (
        sl.bin_location = pl.location_id 
        OR sl.bin_location = CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), ''))
    )
INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title AND pt.status = 'Completed'
WHERE pl.carton_id IS NOT NULL
  AND pl.carton_id != ''
  AND (sl.carton_id IS NULL OR sl.carton_id = '' OR sl.carton_id != pl.carton_id)
  AND sl.qty > 0
  AND sl.last_transaction_type = 'Putaway'
ORDER BY pt.title, sl.item_code;

-- ============================================================================
-- STEP 2: Update tabStockLedger with Carton IDs from Putaway Lines
-- ============================================================================

-- Update carton_id in tabStockLedger from completed putaway tasks
-- This matches stock ledger entries with putaway lines by item_code, warehouse, and bin_location
-- CRITICAL: Handle warehouse name to code normalization
UPDATE tabStockLedger sl
INNER JOIN tabPutawayLine pl ON 
    sl.item_code = pl.item_code 
    AND (
        -- Match bin_location by location_id or rack+bin combination
        sl.bin_location = pl.location_id 
        OR sl.bin_location = CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), ''))
        OR (pl.rack IS NOT NULL AND pl.bin IS NOT NULL AND sl.bin_location = CONCAT(pl.rack, '-', pl.bin))
        OR (pl.rack IS NOT NULL AND sl.bin_location = pl.rack)
        OR (pl.bin IS NOT NULL AND sl.bin_location = pl.bin)
    )
INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title AND pt.status = 'Completed'
-- Match by warehouse code or name (normalize)
LEFT JOIN tabWarehouse wh_stock ON (sl.warehouse = wh_stock.code OR sl.warehouse = wh_stock.name)
LEFT JOIN tabWarehouse wh_task ON (pt.warehouse = wh_task.code OR pt.warehouse = wh_task.name)
SET sl.carton_id = pl.carton_id,
    sl.updated_at = NOW()
WHERE pl.carton_id IS NOT NULL
  AND pl.carton_id != ''
  AND (sl.carton_id IS NULL OR sl.carton_id = '' OR sl.carton_id != pl.carton_id)
  AND sl.qty > 0
  AND sl.last_transaction_type = 'Putaway'
  AND sl.last_transaction_ref = pl.parent_title  -- Match by putaway task title
  AND (
    -- Match by warehouse code (both are codes)
    (wh_stock.code IS NOT NULL AND wh_task.code IS NOT NULL AND wh_stock.code = wh_task.code)
    -- OR match by warehouse name (both are names)
    OR (wh_stock.name IS NOT NULL AND wh_task.name IS NOT NULL AND wh_stock.name = wh_task.name)
    -- OR stock ledger has code, task has name that matches warehouse name
    OR (sl.warehouse = wh_task.code AND pt.warehouse = wh_task.name AND wh_stock.code = wh_task.code)
    -- OR stock ledger has name, task has code that matches warehouse code
    OR (sl.warehouse = wh_task.name AND pt.warehouse = wh_task.code AND wh_stock.name = wh_task.name)
  );

-- ============================================================================
-- STEP 3: Update/Create tabCartonStock Entries
-- ============================================================================

-- Create or update carton stock entries from putaway lines
-- CRITICAL: Normalize warehouse to CODE (not name)
INSERT INTO tabCartonStock 
    (carton_id, item_code, warehouse, bin_location, qty, status)
SELECT DISTINCT
    pl.carton_id,
    pl.item_code,
    -- Normalize warehouse: Get code from tabWarehouse if pt.warehouse is a name, otherwise use as-is
    COALESCE(
        (SELECT code FROM tabWarehouse WHERE name = pt.warehouse AND warehouse_type = 'Warehouse' LIMIT 1),
        (SELECT code FROM tabWarehouse WHERE code = pt.warehouse AND warehouse_type = 'Warehouse' LIMIT 1),
        -- Try to get from ASN if available
        (SELECT wh.code FROM tabAdvanceShippingNotice asn
         LEFT JOIN tabWarehouse wh ON asn.warehouse = wh.name OR asn.warehouse = wh.code
         WHERE asn.title = pt.advance_shipping_notice
           AND wh.warehouse_type = 'Warehouse'
         LIMIT 1),
        -- Fallback: use first warehouse code
        (SELECT code FROM tabWarehouse WHERE warehouse_type = 'Warehouse' ORDER BY code LIMIT 1),
        pt.warehouse  -- Last resort: use as-is
    ) as warehouse,
    COALESCE(pl.location_id, CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), ''))) as bin_location,
    SUM(pl.qty) as qty,
    'PUTAWAY' as status
FROM tabPutawayLine pl
INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title AND pt.status = 'Completed'
WHERE pl.carton_id IS NOT NULL
  AND pl.carton_id != ''
  AND pl.item_code IS NOT NULL
  AND pl.qty > 0
  AND COALESCE(pl.location_id, CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), ''))) IS NOT NULL
GROUP BY pl.carton_id, pl.item_code, warehouse, bin_location
ON DUPLICATE KEY UPDATE
    qty = VALUES(qty),
    updated_at = NOW(),
    status = 'PUTAWAY',
    bin_location = VALUES(bin_location);

-- ============================================================================
-- STEP 4: Verify the Update
-- ============================================================================

-- Verify carton IDs in tabStockLedger after update
SELECT 'STEP 4: After update - carton IDs in tabStockLedger:' as Info;
SELECT 
    sl.item_code,
    sl.warehouse,
    sl.bin_location,
    sl.carton_id,
    sl.qty,
    sl.last_transaction_type,
    sl.last_transaction_ref
FROM tabStockLedger sl
WHERE sl.last_transaction_type = 'Putaway'
  AND sl.qty > 0
ORDER BY sl.last_transaction_ref, sl.item_code, sl.bin_location;

-- Verify carton stock entries
SELECT 'STEP 5: Carton stock entries from putaway:' as Info;
SELECT 
    cs.carton_id,
    cs.item_code,
    cs.warehouse,
    cs.bin_location,
    cs.qty,
    cs.status
FROM tabCartonStock cs
WHERE cs.status = 'PUTAWAY'
ORDER BY cs.carton_id, cs.item_code, cs.bin_location;

-- Check for mismatches after update
SELECT 'STEP 6: Items where carton_id still doesn\'t match (should be 0 after update):' as Info;
SELECT 
    pl.parent_title as putaway_task,
    pl.item_code,
    pl.carton_id as putaway_carton_id,
    sl.carton_id as stock_ledger_carton_id,
    sl.warehouse,
    sl.bin_location,
    pl.qty as putaway_qty,
    sl.qty as stock_ledger_qty,
    CASE 
      WHEN sl.carton_id IS NULL OR sl.carton_id = '' THEN 'MISSING'
      WHEN sl.carton_id != pl.carton_id THEN 'MISMATCH'
      ELSE 'OK'
    END as status
FROM tabPutawayLine pl
INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title AND pt.status = 'Completed'
LEFT JOIN tabStockLedger sl ON 
    sl.item_code = pl.item_code 
    AND (
        sl.bin_location = pl.location_id 
        OR sl.bin_location = CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), ''))
    )
    AND sl.last_transaction_type = 'Putaway'
    AND sl.last_transaction_ref = pl.parent_title
WHERE pl.carton_id IS NOT NULL
  AND pl.carton_id != ''
  AND (sl.carton_id IS NULL OR sl.carton_id = '' OR sl.carton_id != pl.carton_id)
ORDER BY pl.parent_title, pl.item_code;

-- Summary
SELECT 'Summary:' as Info;
SELECT 
    (SELECT COUNT(*) FROM tabPutawayLine pl
     INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title AND pt.status = 'Completed'
     WHERE pl.carton_id IS NOT NULL AND pl.carton_id != '') as putaway_lines_with_carton_id,
    (SELECT COUNT(*) FROM tabStockLedger 
     WHERE last_transaction_type = 'Putaway' 
     AND carton_id IS NOT NULL 
     AND carton_id != '') as stock_ledger_entries_with_carton_id,
    (SELECT COUNT(*) FROM tabCartonStock 
     WHERE status = 'PUTAWAY') as carton_stock_entries;
