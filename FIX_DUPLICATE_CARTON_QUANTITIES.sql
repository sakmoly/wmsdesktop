-- ============================================================
-- FIX DUPLICATE CARTON ID AND QUANTITIES IN PUTAWAY LINES
-- This script identifies and fixes duplicate putaway lines
-- ============================================================

-- Step 1: Show duplicates before fixing
SELECT 
  '=== DUPLICATES BEFORE FIX ===' as Info;

SELECT 
  parent_title,
  carton_id,
  item_code,
  rack,
  bin,
  COUNT(*) as duplicate_count,
  SUM(qty) as total_qty,
  GROUP_CONCAT(id ORDER BY id SEPARATOR ', ') as line_ids,
  GROUP_CONCAT(qty ORDER BY id SEPARATOR ' + ') as quantities
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
GROUP BY parent_title, carton_id, item_code, rack, bin
HAVING COUNT(*) > 1
ORDER BY total_qty DESC;

-- Step 2: Fix exact duplicates (same carton, item, rack, bin)
-- Update the first line with the sum of all duplicates
UPDATE tabPutawayLine pl1
INNER JOIN (
  SELECT 
    parent_title,
    carton_id,
    item_code,
    rack,
    bin,
    MIN(id) as first_id,
    SUM(qty) as total_qty
  FROM tabPutawayLine
  WHERE parent_title = 'PUT-20251230-0001'
  GROUP BY parent_title, carton_id, item_code, rack, bin
  HAVING COUNT(*) > 1
) duplicates ON 
  pl1.id = duplicates.first_id
SET pl1.qty = duplicates.total_qty,
    pl1.updated_at = NOW();

-- Step 3: Delete duplicate lines (keep only the first one)
DELETE pl2 FROM tabPutawayLine pl2
INNER JOIN (
  SELECT 
    parent_title,
    carton_id,
    item_code,
    rack,
    bin,
    MIN(id) as first_id
  FROM tabPutawayLine
  WHERE parent_title = 'PUT-20251230-0001'
  GROUP BY parent_title, carton_id, item_code, rack, bin
  HAVING COUNT(*) > 1
) duplicates ON 
  pl2.parent_title = duplicates.parent_title
  AND pl2.carton_id = duplicates.carton_id
  AND pl2.item_code = duplicates.item_code
  AND pl2.rack = duplicates.rack
  AND (pl2.bin = duplicates.bin OR (pl2.bin IS NULL AND duplicates.bin IS NULL))
  AND pl2.id > duplicates.first_id;

-- Step 4: Check for carton+item duplicates in different locations
-- This might be legitimate (box split to multiple locations) or duplicate
SELECT 
  '=== CARTON+ITEM IN MULTIPLE LOCATIONS ===' as Info;

SELECT 
  parent_title,
  carton_id,
  item_code,
  COUNT(*) as location_count,
  SUM(qty) as total_qty,
  GROUP_CONCAT(CONCAT(rack, '/', COALESCE(bin, 'NULL'), ' (', qty, ')') ORDER BY id SEPARATOR ', ') as locations
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
  AND carton_id IS NOT NULL
GROUP BY parent_title, carton_id, item_code
HAVING COUNT(*) > 1
ORDER BY total_qty DESC;

-- Step 5: Verify fix - show remaining duplicates (should be 0)
SELECT 
  '=== VERIFICATION: REMAINING DUPLICATES (Should be 0) ===' as Info;

SELECT 
  parent_title,
  carton_id,
  item_code,
  rack,
  bin,
  COUNT(*) as duplicate_count
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
GROUP BY parent_title, carton_id, item_code, rack, bin
HAVING COUNT(*) > 1;

-- Step 6: Show final putaway lines
SELECT 
  '=== FINAL PUTAWAY LINES ===' as Info;

SELECT 
  id,
  parent_title,
  carton_id,
  item_code,
  qty,
  rack,
  bin,
  created_at,
  updated_at
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
ORDER BY item_code, carton_id, rack, bin;

-- Step 7: Summary by item
SELECT 
  '=== SUMMARY BY ITEM ===' as Info;

SELECT 
  item_code,
  COUNT(*) as line_count,
  COUNT(DISTINCT carton_id) as unique_cartons,
  SUM(qty) as total_qty
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
GROUP BY item_code
ORDER BY item_code;

-- ============================================================
-- OPTIONAL: Fix for ALL putaway tasks (not just PUT-20251230-0001)
-- Uncomment to apply to all tasks:
/*
-- Fix all exact duplicates across all tasks
UPDATE tabPutawayLine pl1
INNER JOIN (
  SELECT 
    parent_title,
    carton_id,
    item_code,
    rack,
    bin,
    MIN(id) as first_id,
    SUM(qty) as total_qty
  FROM tabPutawayLine
  GROUP BY parent_title, carton_id, item_code, rack, bin
  HAVING COUNT(*) > 1
) duplicates ON 
  pl1.id = duplicates.first_id
SET pl1.qty = duplicates.total_qty,
    pl1.updated_at = NOW();

DELETE pl2 FROM tabPutawayLine pl2
INNER JOIN (
  SELECT 
    parent_title,
    carton_id,
    item_code,
    rack,
    bin,
    MIN(id) as first_id
  FROM tabPutawayLine
  GROUP BY parent_title, carton_id, item_code, rack, bin
  HAVING COUNT(*) > 1
) duplicates ON 
  pl2.parent_title = duplicates.parent_title
  AND pl2.carton_id = duplicates.carton_id
  AND pl2.item_code = duplicates.item_code
  AND pl2.rack = duplicates.rack
  AND (pl2.bin = duplicates.bin OR (pl2.bin IS NULL AND duplicates.bin IS NULL))
  AND pl2.id > duplicates.first_id;
*/

-- ============================================================
-- END OF SCRIPT
-- ============================================================

