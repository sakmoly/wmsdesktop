-- Quick Check: Why Stock Updates Are Failing
-- Replace 'PUT-20260121-0001' with your actual putaway task title

-- 1. Check Putaway Lines Location State
SELECT 
  parent_title,
  item_code,
  qty,
  location_id,  -- ⚠️ CRITICAL: Must NOT be NULL
  rack,         -- ⚠️ Must NOT be 'TBD'
  bin,          -- ⚠️ Must NOT be 'TBD'
  carton_id
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260121-0001'
ORDER BY item_code;

-- 2. Check Putaway Task Location
SELECT 
  title,
  status,
  location_id,  -- ⚠️ May be set here if not on lines
  transfer_in,
  source_type
FROM tabPutawayTask
WHERE title = 'PUT-20260121-0001';

-- 3. Summary: What's Wrong?
SELECT 
  'Lines with location_id' as check_item,
  CONCAT(
    SUM(CASE WHEN location_id IS NOT NULL AND location_id != 'TBD' AND location_id != 'TBD-TBD' THEN 1 ELSE 0 END),
    ' / ',
    COUNT(*),
    ' lines have valid location_id'
  ) as status_check
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260121-0001'

UNION ALL

SELECT 
  'Lines with TBD location' as check_item,
  CONCAT(
    SUM(CASE WHEN (rack = 'TBD' OR bin = 'TBD' OR location_id = 'TBD' OR location_id = 'TBD-TBD') THEN 1 ELSE 0 END),
    ' / ',
    COUNT(*),
    ' lines have TBD location'
  ) as status_check
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260121-0001'

UNION ALL

SELECT 
  'Task location_id' as check_item,
  CASE 
    WHEN location_id IS NULL THEN '❌ NULL'
    WHEN location_id = 'TBD' OR location_id = 'TBD-TBD' THEN '❌ TBD'
    ELSE CONCAT('✅ ', location_id)
  END as status_check
FROM tabPutawayTask
WHERE title = 'PUT-20260121-0001';

-- 4. FIX: Update Location on Lines (if missing)
-- UNCOMMENT AND RUN THIS IF location_id IS NULL OR TBD:
/*
UPDATE tabPutawayLine
SET location_id = 'A1-R02-L1-B2',  -- Replace with actual location
    rack = 'A1-R02-L1',              -- Replace with actual rack
    bin = 'B2',                      -- Replace with actual bin
    updated_at = NOW()
WHERE parent_title = 'PUT-20260121-0001'
  AND (location_id IS NULL 
       OR location_id = 'TBD' 
       OR location_id = 'TBD-TBD'
       OR rack = 'TBD'
       OR bin = 'TBD');
*/
