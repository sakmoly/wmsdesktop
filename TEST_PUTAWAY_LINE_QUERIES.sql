-- ============================================================
-- TEST PUTAWAY LINE QUERIES
-- Test the exact queries used in completePutaway to find existing lines
-- ============================================================

-- Test data setup (use your actual data)
SET @putaway_task = 'PUT-20251230-0001';
SET @item_code = 'SKU-HAT-301-BLU-OS';
SET @rack = 'A1-R01-L1-B1';
SET @bin = 'B1';
SET @carton_id = 'PAW-ASN12225-1767129206';

-- ============================================================
-- Query 1: Check for existing line with exact location match
-- This is the first check in completePutaway (line 821-830)
-- ============================================================
SELECT 
  '=== Query 1: Exact Location Match ===' as Info;

SELECT 
  id, 
  carton_id, 
  qty,
  rack,
  bin,
  CONCAT('rack=', COALESCE(rack, 'NULL'), ' bin=', COALESCE(bin, 'NULL')) as location
FROM tabPutawayLine 
WHERE parent_title = @putaway_task
  AND item_code = @item_code
  AND (
    rack = @rack 
    OR (rack IS NULL AND @rack = '') 
    OR (rack = '' AND @rack IS NULL)
  )
  AND (
    bin = @bin 
    OR (bin IS NULL AND @bin = '') 
    OR (bin = '' AND @bin IS NULL)
  )
  AND (
    carton_id = @carton_id 
    OR (carton_id IS NULL AND @carton_id IS NULL)
  )
LIMIT 1;

-- ============================================================
-- Query 2: Check for any line with same item+carton (regardless of location)
-- This is the fallback check (line 857-864)
-- ============================================================
SELECT 
  '=== Query 2: Same Item+Carton (Any Location) ===' as Info;

SELECT 
  id, 
  rack, 
  bin, 
  carton_id,
  CONCAT('rack=', COALESCE(rack, 'NULL'), ' bin=', COALESCE(bin, 'NULL')) as location
FROM tabPutawayLine 
WHERE parent_title = @putaway_task
  AND item_code = @item_code
  AND (
    carton_id = @carton_id 
    OR (carton_id IS NULL AND @carton_id IS NULL)
  )
LIMIT 1;

-- ============================================================
-- Query 3: Final check before insert (exact match)
-- This is the safety check before INSERT
-- ============================================================
SELECT 
  '=== Query 3: Final Check Before Insert ===' as Info;

SELECT 
  id
FROM tabPutawayLine 
WHERE parent_title = @putaway_task
  AND item_code = @item_code
  AND rack = @rack
  AND bin = @bin
  AND (
    carton_id = @carton_id 
    OR (carton_id IS NULL AND @carton_id IS NULL)
  )
LIMIT 1;

-- ============================================================
-- Check all existing lines for this item
-- ============================================================
SELECT 
  '=== All Lines for This Item ===' as Info;

SELECT 
  id,
  carton_id,
  rack,
  bin,
  qty,
  CONCAT('rack=', COALESCE(rack, 'NULL'), ' bin=', COALESCE(bin, 'NULL')) as location_combined,
  created_at
FROM tabPutawayLine
WHERE parent_title = @putaway_task
  AND item_code = @item_code
ORDER BY created_at;

-- ============================================================
-- Test with different rack/bin values to see matching
-- ============================================================
SELECT 
  '=== Test: Will "A1-R01-L1-B1"/"B1" match "A1-R01"/"L1-B1"? ===' as Info;

-- Test case: Existing line has rack="A1-R01", bin="L1-B1"
-- New request has rack="A1-R01-L1-B1", bin="B1"
SET @existing_rack = 'A1-R01';
SET @existing_bin = 'L1-B1';
SET @new_rack = 'A1-R01-L1-B1';
SET @new_bin = 'B1';

SELECT 
  'Existing Line' as type,
  @existing_rack as rack,
  @existing_bin as bin,
  CONCAT(@existing_rack, '-', @existing_bin) as combined
UNION ALL
SELECT 
  'New Request' as type,
  @new_rack as rack,
  @new_bin as bin,
  CONCAT(@new_rack, '-', @new_bin) as combined;

-- Check if they would match in Query 1
SELECT 
  CASE 
    WHEN @existing_rack = @new_rack THEN '✅ Rack matches'
    WHEN (@existing_rack IS NULL AND @new_rack = '') THEN '✅ Rack matches (NULL vs empty)'
    WHEN (@existing_rack = '' AND @new_rack IS NULL) THEN '✅ Rack matches (empty vs NULL)'
    ELSE '❌ Rack does NOT match'
  END as rack_match,
  CASE 
    WHEN @existing_bin = @new_bin THEN '✅ Bin matches'
    WHEN (@existing_bin IS NULL AND @new_bin = '') THEN '✅ Bin matches (NULL vs empty)'
    WHEN (@existing_bin = '' AND @new_bin IS NULL) THEN '✅ Bin matches (empty vs NULL)'
    ELSE '❌ Bin does NOT match'
  END as bin_match;

-- ============================================================
-- END OF SCRIPT
-- ============================================================

