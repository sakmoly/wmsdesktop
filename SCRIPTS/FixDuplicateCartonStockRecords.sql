-- ============================================================
-- FIX DUPLICATE CARTON STOCK RECORDS
-- ============================================================
-- This script fixes duplicate records in tabCartonStock that were
-- created due to UNIQUE KEY mismatch (UNIQUE KEY on batch_no but
-- INSERT doesn't include batch_no)
-- ============================================================

-- Step 1: Identify duplicate records
SELECT 
  'DUPLICATE RECORDS' as status,
  carton_id,
  item_code,
  warehouse,
  bin_location,
  batch_no,
  COUNT(*) as record_count,
  SUM(qty) as total_qty,
  GROUP_CONCAT(id ORDER BY id) as record_ids,
  GROUP_CONCAT(qty ORDER BY id) as quantities
FROM tabCartonStock
WHERE batch_no IS NULL  -- Only check records where batch_no is NULL (most common case)
GROUP BY carton_id, item_code, warehouse, bin_location, batch_no
HAVING COUNT(*) > 1;

-- Step 2: Consolidate duplicate records (keep the most recent record with correct quantity)
-- This will merge duplicate records into a single record
-- Strategy: Keep the record with the most recent updated_at (most likely to be correct)
CREATE TEMPORARY TABLE IF NOT EXISTS temp_duplicate_carton_stock AS
SELECT 
  carton_id,
  item_code,
  warehouse,
  bin_location,
  batch_no,
  MAX(updated_at) as latest_updated_at,  -- Get most recent updated_at
  MAX(id) as keep_id,  -- Keep the record with the most recent updated_at (usually has highest id)
  GROUP_CONCAT(id ORDER BY id) as all_ids,
  GROUP_CONCAT(qty ORDER BY updated_at DESC) as quantities  -- Show quantities for debugging
FROM tabCartonStock
WHERE batch_no IS NULL
GROUP BY carton_id, item_code, warehouse, bin_location, batch_no
HAVING COUNT(*) > 1;

-- Step 3: Update the record we're keeping (use the quantity from the most recent record)
-- Get the quantity from the record with the most recent updated_at
-- Note: This uses a subquery to find the most recent record (compatible with MySQL 5.7+)
UPDATE tabCartonStock cs
JOIN temp_duplicate_carton_stock temp
  ON cs.carton_id = temp.carton_id
  AND cs.item_code = temp.item_code
  AND cs.warehouse = temp.warehouse
  AND cs.bin_location = temp.bin_location
  AND (cs.batch_no = temp.batch_no OR (cs.batch_no IS NULL AND temp.batch_no IS NULL))
  AND cs.id = temp.keep_id
JOIN (
  -- Get the quantity from the most recent record (by updated_at, then by id)
  SELECT 
    cs2.carton_id,
    cs2.item_code,
    cs2.warehouse,
    cs2.bin_location,
    cs2.batch_no,
    cs2.qty,
    cs2.id
  FROM tabCartonStock cs2
  WHERE cs2.batch_no IS NULL
    AND NOT EXISTS (
      -- Find records where there's a more recent record (by updated_at or id)
      SELECT 1
      FROM tabCartonStock cs3
      WHERE cs3.carton_id = cs2.carton_id
        AND cs3.item_code = cs2.item_code
        AND cs3.warehouse = cs2.warehouse
        AND cs3.bin_location = cs2.bin_location
        AND (cs3.batch_no = cs2.batch_no OR (cs3.batch_no IS NULL AND cs2.batch_no IS NULL))
        AND (
          cs3.updated_at > cs2.updated_at
          OR (cs3.updated_at = cs2.updated_at AND cs3.id > cs2.id)
        )
    )
) latest
  ON latest.carton_id = cs.carton_id
  AND latest.item_code = cs.item_code
  AND latest.warehouse = cs.warehouse
  AND latest.bin_location = cs.bin_location
  AND (latest.batch_no = cs.batch_no OR (latest.batch_no IS NULL AND cs.batch_no IS NULL))
SET cs.qty = latest.qty,  -- Use quantity from most recent record
    cs.updated_at = NOW();

-- Step 4: Delete the duplicate records (keep only the one we updated)
DELETE cs FROM tabCartonStock cs
JOIN temp_duplicate_carton_stock temp
  ON cs.carton_id = temp.carton_id
  AND cs.item_code = temp.item_code
  AND cs.warehouse = temp.warehouse
  AND cs.bin_location = temp.bin_location
  AND (cs.batch_no = temp.batch_no OR (cs.batch_no IS NULL AND temp.batch_no IS NULL))
  AND cs.id != temp.keep_id;  -- Delete all except the one we kept

-- Step 5: Drop temporary table
DROP TEMPORARY TABLE IF EXISTS temp_duplicate_carton_stock;

-- Step 6: Verify no more duplicates
SELECT 
  'VERIFICATION' as status,
  COUNT(*) as remaining_duplicates
FROM (
  SELECT 
    carton_id,
    item_code,
    warehouse,
    bin_location,
    batch_no,
    COUNT(*) as record_count
  FROM tabCartonStock
  WHERE batch_no IS NULL
  GROUP BY carton_id, item_code, warehouse, bin_location, batch_no
  HAVING COUNT(*) > 1
) duplicates;

SELECT '✅ Duplicate carton stock records have been fixed!' as Status;
