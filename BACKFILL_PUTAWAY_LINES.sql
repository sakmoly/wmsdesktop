-- ============================================================
-- BACKFILL: Create Putaway Lines for Existing Tasks
-- Use this if tasks were created before the fix was applied
-- ============================================================

-- Step 1: Check current state (run this first)
SELECT 
  '=== CURRENT STATE ===' as Info;

SELECT 
  pt.title,
  pt.box_id,
  pt.status,
  COUNT(pl.id) as existing_line_count
FROM tabPutawayTask pt
LEFT JOIN tabPutawayLine pl ON pl.parent_title = pt.title
WHERE pt.title IN ('PUT-20260101-0001', 'PUT-20260101-0002')
GROUP BY pt.title, pt.box_id, pt.status;

-- Step 2: Check if SORT_TO_BOX events exist for boxes
SELECT 
  '=== CHECKING FOR SORT_TO_BOX EVENTS ===' as Info;

SELECT 
  pt.title as putaway_task,
  pt.box_id,
  COUNT(DISTINCT e.item_code) as unique_items,
  SUM(e.qty) as total_qty
FROM tabPutawayTask pt
LEFT JOIN tabWmsScanEvent e ON e.box_id = pt.box_id 
  AND e.event_type = 'SORT_TO_BOX'
  AND e.item_code IS NOT NULL
  AND e.item_code != ''
  AND e.qty > 0
WHERE pt.title IN ('PUT-20260101-0001', 'PUT-20260101-0002')
  AND pt.box_id IS NOT NULL
GROUP BY pt.title, pt.box_id;

-- Step 3: Create lines for PUT-20260101-0001 (if box_id exists)
-- This uses the FIXED logic: GROUP BY box_id, use box_id as carton_id
INSERT INTO tabPutawayLine
  (parent_title, item_code, carton_id, qty, rack, bin, created_at, updated_at)
SELECT 
  'PUT-20260101-0001' as parent_title,
  e.item_code,
  e.box_id as carton_id,  -- CRITICAL: Use box_id as carton_id (not e.carton_id)
  SUM(e.qty) as qty,
  '' as rack,  -- Empty initially, will be set when location is scanned
  '' as bin,   -- Empty initially, will be set when location is scanned
  NOW() as created_at,
  NOW() as updated_at
FROM tabWmsScanEvent e
WHERE e.event_type = 'SORT_TO_BOX'
  AND e.box_id = (SELECT box_id FROM tabPutawayTask WHERE title = 'PUT-20260101-0001' LIMIT 1)
  AND e.box_id IS NOT NULL
  AND e.item_code IS NOT NULL
  AND e.item_code != ''
  AND e.qty > 0
  AND NOT EXISTS (
    -- Don't create if line already exists
    SELECT 1 
    FROM tabPutawayLine pl 
    WHERE pl.parent_title = 'PUT-20260101-0001' 
      AND pl.item_code = e.item_code
      AND (pl.carton_id = e.box_id OR (pl.carton_id IS NULL AND e.box_id IS NULL))
  )
GROUP BY e.item_code, e.box_id  -- CRITICAL: Group by box_id (not carton_id)
HAVING SUM(e.qty) > 0;

-- Step 4: Create lines for PUT-20260101-0002 (if box_id exists)
INSERT INTO tabPutawayLine
  (parent_title, item_code, carton_id, qty, rack, bin, created_at, updated_at)
SELECT 
  'PUT-20260101-0002' as parent_title,
  e.item_code,
  e.box_id as carton_id,  -- CRITICAL: Use box_id as carton_id
  SUM(e.qty) as qty,
  '' as rack,
  '' as bin,
  NOW() as created_at,
  NOW() as updated_at
FROM tabWmsScanEvent e
WHERE e.event_type = 'SORT_TO_BOX'
  AND e.box_id = (SELECT box_id FROM tabPutawayTask WHERE title = 'PUT-20260101-0002' LIMIT 1)
  AND e.box_id IS NOT NULL
  AND e.item_code IS NOT NULL
  AND e.item_code != ''
  AND e.qty > 0
  AND NOT EXISTS (
    SELECT 1 
    FROM tabPutawayLine pl 
    WHERE pl.parent_title = 'PUT-20260101-0002' 
      AND pl.item_code = e.item_code
      AND (pl.carton_id = e.box_id OR (pl.carton_id IS NULL AND e.box_id IS NULL))
  )
GROUP BY e.item_code, e.box_id
HAVING SUM(e.qty) > 0;

-- Step 5: Verify lines were created
SELECT 
  '=== VERIFICATION: LINES AFTER BACKFILL ===' as Info;

SELECT 
  pt.title,
  pt.box_id,
  pt.status,
  COUNT(pl.id) as line_count,
  SUM(pl.qty) as total_qty
FROM tabPutawayTask pt
LEFT JOIN tabPutawayLine pl ON pl.parent_title = pt.title
WHERE pt.title IN ('PUT-20260101-0001', 'PUT-20260101-0002')
GROUP BY pt.title, pt.box_id, pt.status;

-- Step 6: Show the created lines
SELECT 
  '=== CREATED LINES DETAILS ===' as Info;

SELECT 
  pl.id,
  pl.parent_title,
  pl.item_code,
  pl.carton_id,
  pl.qty,
  pl.rack,
  pl.bin,
  CASE 
    WHEN pl.carton_id = pt.box_id THEN '✅ CORRECT (carton_id = box_id)'
    ELSE '❌ WRONG (carton_id should equal box_id)'
  END as validation
FROM tabPutawayLine pl
JOIN tabPutawayTask pt ON pl.parent_title = pt.title
WHERE pl.parent_title IN ('PUT-20260101-0001', 'PUT-20260101-0002')
ORDER BY pl.parent_title, pl.item_code;

