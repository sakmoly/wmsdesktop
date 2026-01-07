-- ============================================================
-- DIAGNOSE: Why Putaway Lines Are Not Showing
-- ============================================================

-- Step 1: Check if putaway tasks exist
SELECT 
  '=== PUTAWAY TASKS ===' as Info;

SELECT 
  title,
  box_id,
  status,
  created_at,
  updated_at
FROM tabPutawayTask
WHERE title IN ('PUT-20260101-0001', 'PUT-20260101-0002')
ORDER BY created_at DESC;

-- Step 2: Check if lines exist for these tasks
SELECT 
  '=== PUTAWAY LINES FOR THESE TASKS ===' as Info;

SELECT 
  pl.id,
  pl.parent_title,
  pl.item_code,
  pl.carton_id,
  pl.qty,
  pl.rack,
  pl.bin,
  pl.location_id,
  pl.created_at
FROM tabPutawayLine pl
WHERE pl.parent_title IN ('PUT-20260101-0001', 'PUT-20260101-0002')
ORDER BY pl.parent_title, pl.item_code;

-- Step 3: Check ALL lines (in case parent_title doesn't match exactly)
SELECT 
  '=== ALL PUTAWAY LINES (recent) ===' as Info;

SELECT 
  pl.id,
  pl.parent_title,
  pl.item_code,
  pl.carton_id,
  pl.qty,
  pl.rack,
  pl.bin,
  pl.created_at
FROM tabPutawayLine pl
ORDER BY pl.created_at DESC
LIMIT 20;

-- Step 4: Check if tasks have box_id and if lines should be linked
SELECT 
  '=== TASKS WITH BOX_ID ===' as Info;

SELECT 
  pt.title,
  pt.box_id,
  pt.status,
  (SELECT COUNT(*) FROM tabPutawayLine pl WHERE pl.parent_title = pt.title) as line_count
FROM tabPutawayTask pt
WHERE pt.title IN ('PUT-20260101-0001', 'PUT-20260101-0002');

-- Step 5: Check if SORT_TO_BOX events exist for the boxes
SELECT 
  '=== SORT_TO_BOX EVENTS FOR BOXES ===' as Info;

-- First get box_ids from tasks
SELECT 
  pt.title as putaway_task,
  pt.box_id,
  (SELECT COUNT(*) 
   FROM tabWmsScanEvent e 
   WHERE e.box_id = pt.box_id 
     AND e.event_type = 'SORT_TO_BOX') as event_count
FROM tabPutawayTask pt
WHERE pt.title IN ('PUT-20260101-0001', 'PUT-20260101-0002')
  AND pt.box_id IS NOT NULL;

-- Step 6: Show actual SORT_TO_BOX events if they exist
SELECT 
  '=== ACTUAL SORT_TO_BOX EVENTS ===' as Info;

SELECT 
  e.event_type,
  e.box_id,
  e.item_code,
  e.qty,
  e.carton_id,
  e.event_time
FROM tabWmsScanEvent e
WHERE e.event_type = 'SORT_TO_BOX'
  AND e.box_id IN (
    SELECT DISTINCT box_id 
    FROM tabPutawayTask 
    WHERE title IN ('PUT-20260101-0001', 'PUT-20260101-0002')
      AND box_id IS NOT NULL
  )
ORDER BY e.event_time DESC;

-- Step 7: Verify what the C# query would return
SELECT 
  '=== SIMULATE C# QUERY RESULT ===' as Info;

-- This simulates the C# query from PutawayTaskDataService.cs
SELECT 
  pl.parent_title,
  pl.carton_id,
  pl.item_code,
  pl.qty,
  pl.rack,
  pl.bin,
  NULL as location_id  -- Will be NULL if column doesn't exist
FROM tabPutawayLine pl
WHERE pl.parent_title IN ('PUT-20260101-0001', 'PUT-20260101-0002')
ORDER BY pl.parent_title, pl.item_code;

