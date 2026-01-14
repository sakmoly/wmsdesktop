-- ============================================================================
-- Fix Carton Stock from Stock Ledger
-- ============================================================================
-- This script syncs tabCartonStock quantities with tabStockLedger
-- when tabStockLedger has carton_id and shows different quantities
-- ============================================================================

-- ============================================================================
-- STEP 1: Check Current State - Find Mismatches
-- ============================================================================

SELECT 'STEP 1: Finding carton stock mismatches...' as Info;

-- Find carton stock entries that don't match stock ledger
SELECT 
    sl.item_code,
    sl.warehouse,
    sl.bin_location,
    sl.carton_id,
    sl.qty as stock_ledger_qty,
    cs.qty as carton_stock_qty,
    (sl.qty - cs.qty) as difference,
    sl.last_transaction_type,
    sl.last_transaction_ref,
    sl.last_transaction_date
FROM tabStockLedger sl
INNER JOIN tabCartonStock cs ON 
    sl.carton_id = cs.carton_id 
    AND sl.item_code = cs.item_code 
    AND sl.warehouse = cs.warehouse 
    AND sl.bin_location = cs.bin_location
WHERE sl.carton_id IS NOT NULL
  AND sl.carton_id != ''
  AND ABS(sl.qty - cs.qty) > 0.01  -- Allow for small floating point differences
ORDER BY ABS(sl.qty - cs.qty) DESC, sl.item_code, sl.bin_location;

-- Count of mismatches
SELECT 
    'Total mismatches found:' as Info,
    COUNT(*) as mismatch_count
FROM tabStockLedger sl
INNER JOIN tabCartonStock cs ON 
    sl.carton_id = cs.carton_id 
    AND sl.item_code = cs.item_code 
    AND sl.warehouse = cs.warehouse 
    AND sl.bin_location = cs.bin_location
WHERE sl.carton_id IS NOT NULL
  AND sl.carton_id != ''
  AND ABS(sl.qty - cs.qty) > 0.01;

-- ============================================================================
-- STEP 2: Update Carton Stock from Stock Ledger
-- ============================================================================

SELECT 'STEP 2: Updating tabCartonStock from tabStockLedger...' as Info;

-- Update carton stock to match stock ledger
UPDATE tabCartonStock cs
INNER JOIN tabStockLedger sl ON 
    sl.carton_id = cs.carton_id 
    AND sl.item_code = cs.item_code 
    AND sl.warehouse = cs.warehouse 
    AND sl.bin_location = cs.bin_location
SET cs.qty = sl.qty,
    cs.updated_at = NOW()
WHERE sl.carton_id IS NOT NULL
  AND sl.carton_id != ''
  AND ABS(sl.qty - cs.qty) > 0.01;  -- Only update if there's a difference

-- ============================================================================
-- STEP 3: Handle Stock Ledger Entries with Carton ID but No Carton Stock Entry
-- ============================================================================

SELECT 'STEP 3: Finding stock ledger entries with carton_id but no carton stock entry...' as Info;

-- Find stock ledger entries that have carton_id but no corresponding carton stock entry
SELECT 
    sl.item_code,
    sl.warehouse,
    sl.bin_location,
    sl.carton_id,
    sl.qty,
    sl.last_transaction_type,
    sl.last_transaction_ref
FROM tabStockLedger sl
LEFT JOIN tabCartonStock cs ON 
    sl.carton_id = cs.carton_id 
    AND sl.item_code = cs.item_code 
    AND sl.warehouse = cs.warehouse 
    AND sl.bin_location = cs.bin_location
WHERE sl.carton_id IS NOT NULL
  AND sl.carton_id != ''
  AND cs.carton_id IS NULL
  AND sl.qty > 0
ORDER BY sl.item_code, sl.bin_location;

-- Create carton stock entries for stock ledger entries that have carton_id but no carton stock
SELECT 'STEP 4: Creating missing carton stock entries...' as Info;

INSERT INTO tabCartonStock 
    (carton_id, item_code, warehouse, bin_location, qty, status)
SELECT 
    sl.carton_id,
    sl.item_code,
    sl.warehouse,
    sl.bin_location,
    sl.qty,
    'PUTAWAY' as status  -- Default status, adjust if needed
FROM tabStockLedger sl
LEFT JOIN tabCartonStock cs ON 
    sl.carton_id = cs.carton_id 
    AND sl.item_code = cs.item_code 
    AND sl.warehouse = cs.warehouse 
    AND sl.bin_location = cs.bin_location
WHERE sl.carton_id IS NOT NULL
  AND sl.carton_id != ''
  AND cs.carton_id IS NULL
  AND sl.qty > 0
ON DUPLICATE KEY UPDATE
    qty = VALUES(qty),
    updated_at = NOW(),
    status = 'PUTAWAY';

-- ============================================================================
-- STEP 4: Verify the Fix
-- ============================================================================

SELECT 'STEP 5: After update - Verifying carton stock matches stock ledger...' as Info;

-- Check remaining mismatches (should be 0 or minimal)
SELECT 
    'Remaining mismatches:' as Info,
    COUNT(*) as remaining_mismatches
FROM tabStockLedger sl
INNER JOIN tabCartonStock cs ON 
    sl.carton_id = cs.carton_id 
    AND sl.item_code = cs.item_code 
    AND sl.warehouse = cs.warehouse 
    AND sl.bin_location = cs.bin_location
WHERE sl.carton_id IS NOT NULL
  AND sl.carton_id != ''
  AND ABS(sl.qty - cs.qty) > 0.01;

-- Show any remaining mismatches
SELECT 
    sl.item_code,
    sl.warehouse,
    sl.bin_location,
    sl.carton_id,
    sl.qty as stock_ledger_qty,
    cs.qty as carton_stock_qty,
    (sl.qty - cs.qty) as difference
FROM tabStockLedger sl
INNER JOIN tabCartonStock cs ON 
    sl.carton_id = cs.carton_id 
    AND sl.item_code = cs.item_code 
    AND sl.warehouse = cs.warehouse 
    AND sl.bin_location = cs.bin_location
WHERE sl.carton_id IS NOT NULL
  AND sl.carton_id != ''
  AND ABS(sl.qty - cs.qty) > 0.01
ORDER BY ABS(sl.qty - cs.qty) DESC;

-- ============================================================================
-- STEP 5: Summary
-- ============================================================================

SELECT 'Summary:' as Info;
SELECT 
    (SELECT COUNT(*) FROM tabStockLedger 
     WHERE carton_id IS NOT NULL AND carton_id != '') as stock_ledger_entries_with_carton,
    (SELECT COUNT(*) FROM tabCartonStock 
     WHERE qty > 0) as carton_stock_entries,
    (SELECT COUNT(*) 
     FROM tabStockLedger sl
     INNER JOIN tabCartonStock cs ON 
        sl.carton_id = cs.carton_id 
        AND sl.item_code = cs.item_code 
        AND sl.warehouse = cs.warehouse 
        AND sl.bin_location = cs.bin_location
     WHERE sl.carton_id IS NOT NULL
       AND sl.carton_id != ''
       AND ABS(sl.qty - cs.qty) <= 0.01) as matched_entries,
    (SELECT COUNT(*) 
     FROM tabStockLedger sl
     INNER JOIN tabCartonStock cs ON 
        sl.carton_id = cs.carton_id 
        AND sl.item_code = cs.item_code 
        AND sl.warehouse = cs.warehouse 
        AND sl.bin_location = cs.bin_location
     WHERE sl.carton_id IS NOT NULL
       AND sl.carton_id != ''
       AND ABS(sl.qty - cs.qty) > 0.01) as mismatched_entries;

-- ============================================================================
-- STEP 6: Specific Item Check (for debugging)
-- ============================================================================

-- Check specific item mentioned in the issue
SELECT 'STEP 6: Checking SKU-HAT-301-BLU-OS at A1-R01-L3-B1...' as Info;
SELECT 
    'Stock Ledger' as source,
    sl.item_code,
    sl.warehouse,
    sl.bin_location,
    sl.carton_id,
    sl.qty,
    sl.last_transaction_type,
    sl.last_transaction_ref,
    sl.last_transaction_date
FROM tabStockLedger sl
WHERE sl.item_code = 'SKU-HAT-301-BLU-OS'
  AND sl.bin_location = 'A1-R01-L3-B1'
  AND sl.carton_id IS NOT NULL
UNION ALL
SELECT 
    'Carton Stock' as source,
    cs.item_code,
    cs.warehouse,
    cs.bin_location,
    cs.carton_id,
    cs.qty,
    cs.status as last_transaction_type,
    NULL as last_transaction_ref,
    cs.updated_at as last_transaction_date
FROM tabCartonStock cs
WHERE cs.item_code = 'SKU-HAT-301-BLU-OS'
  AND cs.bin_location = 'A1-R01-L3-B1'
ORDER BY source, carton_id;
