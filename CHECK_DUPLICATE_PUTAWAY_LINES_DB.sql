-- ============================================================
-- CHECK DUPLICATE PUTAWAY LINES IN DATABASE
-- For PUT-20251230-0001
-- ============================================================

-- Step 1: Check all lines for this task
SELECT 
  '=== ALL PUTAWAY LINES FOR PUT-20251230-0001 ===' as Info;

SELECT 
  id,
  parent_title,
  carton_id,
  item_code,
  qty,
  rack,
  bin,
  CONCAT(rack, '-', bin) as location,
  created_at,
  updated_at
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
ORDER BY created_at, item_code;

-- Step 2: Find duplicate lines (same item, different locations)
SELECT 
  '=== DUPLICATE LINES (Same Item, Different Locations) ===' as Info;

SELECT 
  parent_title,
  item_code,
  carton_id,
  COUNT(*) as line_count,
  GROUP_CONCAT(CONCAT('ID:', id, ' Rack:', COALESCE(rack, 'NULL'), ' Bin:', COALESCE(bin, 'NULL'), ' Qty:', qty) SEPARATOR ' | ') as line_details,
  SUM(qty) as total_qty
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
GROUP BY parent_title, item_code, carton_id
HAVING COUNT(*) > 1
ORDER BY total_qty DESC;

-- Step 3: Check for same item with different rack/bin parsing
SELECT 
  '=== SAME ITEM, DIFFERENT RACK/BIN PARSING ===' as Info;

SELECT 
  id,
  item_code,
  carton_id,
  rack,
  bin,
  CONCAT(rack, '-', bin) as full_location,
  qty,
  created_at
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
  AND item_code = 'SKU-HAT-301-BLU-OS'
ORDER BY created_at;

-- Step 4: Check if locations are actually the same (different parsing)
SELECT 
  '=== LOCATION COMPARISON ===' as Info;

SELECT 
  id,
  item_code,
  rack,
  bin,
  CONCAT(COALESCE(rack, ''), '-', COALESCE(bin, '')) as location_combined,
  CASE 
    WHEN CONCAT(COALESCE(rack, ''), '-', COALESCE(bin, '')) = 'A1-R01-L1-B1-B1' THEN '✅ Matches A1-R01-L1-B1-B1'
    WHEN CONCAT(COALESCE(rack, ''), '-', COALESCE(bin, '')) = 'A1-R01-L1-B1' THEN '✅ Matches A1-R01-L1-B1'
    ELSE '❌ Different'
  END as location_match
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
  AND item_code = 'SKU-HAT-301-BLU-OS';

-- ============================================================
-- FIX: Remove duplicate lines (keep the most recent one)
-- ============================================================
-- Uncomment to fix:
/*
-- Option 1: Keep the line with the most complete location (longest rack+bin)
DELETE pl2 FROM tabPutawayLine pl2
INNER JOIN (
  SELECT 
    parent_title,
    item_code,
    carton_id,
    MAX(LENGTH(CONCAT(COALESCE(rack, ''), '-', COALESCE(bin, '')))) as max_location_length
  FROM tabPutawayLine
  WHERE parent_title = 'PUT-20251230-0001'
    AND item_code = 'SKU-HAT-301-BLU-OS'
  GROUP BY parent_title, item_code, carton_id
) dup ON 
  pl2.parent_title = dup.parent_title
  AND pl2.item_code = dup.item_code
  AND (pl2.carton_id = dup.carton_id OR (pl2.carton_id IS NULL AND dup.carton_id IS NULL))
WHERE LENGTH(CONCAT(COALESCE(pl2.rack, ''), '-', COALESCE(pl2.bin, ''))) < dup.max_location_length;

-- Option 2: Keep the most recent line, delete older duplicates
DELETE pl2 FROM tabPutawayLine pl2
INNER JOIN (
  SELECT 
    parent_title,
    item_code,
    carton_id,
    MAX(id) as keep_id
  FROM tabPutawayLine
  WHERE parent_title = 'PUT-20251230-0001'
    AND item_code = 'SKU-HAT-301-BLU-OS'
  GROUP BY parent_title, item_code, carton_id
  HAVING COUNT(*) > 1
) dup ON 
  pl2.parent_title = dup.parent_title
  AND pl2.item_code = dup.item_code
  AND (pl2.carton_id = dup.carton_id OR (pl2.carton_id IS NULL AND dup.carton_id IS NULL))
WHERE pl2.id < dup.keep_id;
*/

-- ============================================================
-- END OF SCRIPT
-- ============================================================

