-- ============================================================
-- FIX DUPLICATE CARTON STOCK RECORDS (SIMPLE VERSION)
-- ============================================================
-- This script fixes duplicate records in tabCartonStock by
-- keeping only the most recent record (by updated_at, then id)
-- and deleting all older duplicates
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
  GROUP_CONCAT(id ORDER BY updated_at DESC, id DESC) as record_ids,
  GROUP_CONCAT(qty ORDER BY updated_at DESC, id DESC) as quantities,
  GROUP_CONCAT(updated_at ORDER BY updated_at DESC, id DESC) as update_dates
FROM tabCartonStock
WHERE batch_no IS NULL  -- Only check records where batch_no is NULL (most common case)
GROUP BY carton_id, item_code, warehouse, bin_location, batch_no
HAVING COUNT(*) > 1;

-- Step 2: Delete duplicate records, keeping only the most recent one
-- Strategy: Keep the record with the highest id (usually most recent)
-- For each duplicate group, keep MAX(id) and delete all others
DELETE cs1 FROM tabCartonStock cs1
INNER JOIN (
  -- Find all duplicate groups
  SELECT 
    carton_id,
    item_code,
    warehouse,
    bin_location,
    batch_no,
    MAX(id) as keep_id  -- Keep the record with highest id (most recent)
  FROM tabCartonStock
  WHERE batch_no IS NULL
  GROUP BY carton_id, item_code, warehouse, bin_location, batch_no
  HAVING COUNT(*) > 1
) duplicates
  ON cs1.carton_id = duplicates.carton_id
  AND cs1.item_code = duplicates.item_code
  AND cs1.warehouse = duplicates.warehouse
  AND cs1.bin_location = duplicates.bin_location
  AND (cs1.batch_no = duplicates.batch_no OR (cs1.batch_no IS NULL AND duplicates.batch_no IS NULL))
  AND cs1.id != duplicates.keep_id;  -- Delete all except the one we're keeping

-- Step 3: Verify no more duplicates
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

-- Step 4: Show remaining records for verification
SELECT 
  'REMAINING RECORDS' as status,
  carton_id,
  item_code,
  warehouse,
  bin_location,
  qty,
  updated_at
FROM tabCartonStock
WHERE batch_no IS NULL
  AND carton_id = 'CTN-555444'  -- Replace with your carton_id
  AND item_code = 'SKU-HAT-301-BLU-OS'  -- Replace with your item_code
ORDER BY updated_at DESC;

SELECT '✅ Duplicate carton stock records have been fixed!' as Status;
