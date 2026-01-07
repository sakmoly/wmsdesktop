-- ============================================================
-- DETAILED TEST: Putaway Line Queries
-- Test the exact queries used in completePutaway
-- ============================================================

-- STEP 1: Set test parameters (update with your actual values)
SET @putaway_task = 'PUT-20251230-0001';
SET @item_code = 'SKU-HAT-301-BLU-OS';
SET @new_rack = 'A1-R01-L1-B1';
SET @new_bin = 'B1';
SET @new_carton_id = 'PAW-ASN12225-1767129206';

-- STEP 2: Show all existing lines for this item
SELECT 
  '=== ALL EXISTING LINES FOR THIS ITEM ===' as Info;

SELECT 
  id,
  carton_id,
  rack,
  bin,
  qty,
  CONCAT('rack=', COALESCE(rack, 'NULL'), ' | bin=', COALESCE(bin, 'NULL')) as location_combined,
  created_at,
  updated_at
FROM tabPutawayLine
WHERE parent_title = @putaway_task
  AND item_code = @item_code
ORDER BY created_at;

-- STEP 3: Test Query 1 - Exact Location Match
-- This is the FIRST check in completePutaway (line 821-830)
SELECT 
  '=== QUERY 1: Exact Location Match ===' as Info,
  'Looking for: rack=' as Info2,
  @new_rack as rack_value,
  'bin=' as Info3,
  @new_bin as bin_value,
  'carton_id=' as Info4,
  @new_carton_id as carton_value;

SELECT 
  id, 
  carton_id, 
  qty,
  rack,
  bin,
  CASE 
    WHEN rack = @new_rack THEN '✅ Rack MATCHES'
    WHEN (rack IS NULL AND @new_rack = '') THEN '✅ Rack MATCHES (NULL vs empty)'
    WHEN (rack = '' AND @new_rack IS NULL) THEN '✅ Rack MATCHES (empty vs NULL)'
    ELSE CONCAT('❌ Rack NO MATCH: existing=', COALESCE(rack, 'NULL'), ' new=', @new_rack)
  END as rack_match,
  CASE 
    WHEN bin = @new_bin THEN '✅ Bin MATCHES'
    WHEN (bin IS NULL AND @new_bin = '') THEN '✅ Bin MATCHES (NULL vs empty)'
    WHEN (bin = '' AND @new_bin IS NULL) THEN '✅ Bin MATCHES (empty vs NULL)'
    ELSE CONCAT('❌ Bin NO MATCH: existing=', COALESCE(bin, 'NULL'), ' new=', @new_bin)
  END as bin_match
FROM tabPutawayLine 
WHERE parent_title = @putaway_task
  AND item_code = @item_code
  AND (
    rack = @new_rack 
    OR (rack IS NULL AND @new_rack = '') 
    OR (rack = '' AND @new_rack IS NULL)
  )
  AND (
    bin = @new_bin 
    OR (bin IS NULL AND @new_bin = '') 
    OR (bin = '' AND @new_bin IS NULL)
  )
  AND (
    carton_id = @new_carton_id 
    OR (carton_id IS NULL AND @new_carton_id IS NULL)
  )
LIMIT 1;

-- STEP 4: Test Query 2 - Same Item+Carton (Any Location)
-- This is the FALLBACK check (line 857-864)
SELECT 
  '=== QUERY 2: Same Item+Carton (Any Location) ===' as Info,
  'Looking for: item_code=' as Info2,
  @item_code as item_value,
  'carton_id=' as Info3,
  @new_carton_id as carton_value;

SELECT 
  id, 
  rack, 
  bin, 
  carton_id,
  CONCAT('rack=', COALESCE(rack, 'NULL'), ' | bin=', COALESCE(bin, 'NULL')) as existing_location,
  CASE 
    WHEN rack = @new_rack AND bin = @new_bin THEN '✅ Same location'
    ELSE CONCAT('⚠️ Different location - will UPDATE')
  END as location_status
FROM tabPutawayLine 
WHERE parent_title = @putaway_task
  AND item_code = @item_code
  AND (
    carton_id = @new_carton_id 
    OR (carton_id IS NULL AND @new_carton_id IS NULL)
  )
LIMIT 1;

-- STEP 5: Test Query 3 - Final Check Before Insert
-- This is the SAFETY check before INSERT (line 901-910)
SELECT 
  '=== QUERY 3: Final Check Before Insert ===' as Info;

SELECT 
  id,
  'Line exists - INSERT will be SKIPPED' as action
FROM tabPutawayLine 
WHERE parent_title = @putaway_task
  AND item_code = @item_code
  AND rack = @new_rack
  AND bin = @new_bin
  AND (
    carton_id = @new_carton_id 
    OR (carton_id IS NULL AND @new_carton_id IS NULL)
  )
LIMIT 1;

-- STEP 6: Summary - What will happen?
SELECT 
  '=== PREDICTION: What Will Happen? ===' as Info;

SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM tabPutawayLine 
      WHERE parent_title = @putaway_task
        AND item_code = @item_code
        AND (
          (rack = @new_rack OR (rack IS NULL AND @new_rack = '') OR (rack = '' AND @new_rack IS NULL))
          AND (bin = @new_bin OR (bin IS NULL AND @new_bin = '') OR (bin = '' AND @new_bin IS NULL))
        )
        AND (carton_id = @new_carton_id OR (carton_id IS NULL AND @new_carton_id IS NULL))
    ) THEN '✅ Query 1 will FIND existing line → UPDATE existing line'
    WHEN EXISTS (
      SELECT 1 FROM tabPutawayLine 
      WHERE parent_title = @putaway_task
        AND item_code = @item_code
        AND (carton_id = @new_carton_id OR (carton_id IS NULL AND @new_carton_id IS NULL))
    ) THEN '⚠️ Query 2 will FIND line with different location → UPDATE location'
    ELSE '❌ No existing line found → INSERT new line'
  END as prediction;

-- STEP 7: Check for potential duplicates
SELECT 
  '=== CHECK FOR DUPLICATES ===' as Info;

SELECT 
  item_code,
  carton_id,
  rack,
  bin,
  COUNT(*) as duplicate_count,
  GROUP_CONCAT(id ORDER BY id) as line_ids
FROM tabPutawayLine
WHERE parent_title = @putaway_task
  AND item_code = @item_code
GROUP BY item_code, carton_id, rack, bin
HAVING COUNT(*) > 1;

-- ============================================================
-- END OF SCRIPT
-- ============================================================
-- 
-- INSTRUCTIONS:
-- 1. Update the variables at the top with your actual values
-- 2. Run this script in your MySQL client
-- 3. Check the results:
--    - Query 1 should find the line if location matches exactly
--    - If found: UPDATE will happen ✅
--    - If not found: Continue to Query 2
--    - Query 2 should find the line if item+carton matches
--    - If found: UPDATE location will happen ⚠️
--    - If not found: INSERT will happen ❌
-- 4. Check the "PREDICTION" section to see what will happen
-- 5. Check the "DUPLICATES" section to see if duplicates exist
-- ============================================================

