-- ============================================================
-- FIX DUPLICATE PUTAWAY TASKS
-- This script identifies and helps fix duplicate putaway tasks
-- ============================================================

-- Step 1: Find duplicate tasks (same title)
SELECT 
  '=== DUPLICATE PUTAWAY TASKS ===' as Info;

SELECT 
  title,
  COUNT(*) as duplicate_count,
  GROUP_CONCAT(status ORDER BY COALESCE(updated_at, created_at) DESC) as statuses,
  GROUP_CONCAT(COALESCE(updated_at, created_at) ORDER BY COALESCE(updated_at, created_at) DESC) as dates
FROM tabPutawayTask
GROUP BY title
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, title;

-- Step 2: Show details of duplicate tasks
SELECT 
  '=== DETAILS OF DUPLICATE TASKS ===' as Info;

SELECT 
  title,
  status,
  advance_shipping_notice,
  inbound_session,
  created_by,
  created_at,
  updated_at,
  COALESCE(updated_at, created_at) as sort_date
FROM tabPutawayTask
WHERE title IN (
  SELECT title 
  FROM tabPutawayTask 
  GROUP BY title 
  HAVING COUNT(*) > 1
)
ORDER BY title, sort_date DESC;

-- Step 3: Show putaway lines for duplicate tasks
SELECT 
  '=== PUTAWAY LINES FOR DUPLICATE TASKS ===' as Info;

SELECT 
  pl.parent_title,
  COUNT(*) as line_count,
  GROUP_CONCAT(CONCAT(pl.item_code, ' (', pl.qty, ')') SEPARATOR ', ') as items
FROM tabPutawayLine pl
WHERE pl.parent_title IN (
  SELECT title 
  FROM tabPutawayTask 
  GROUP BY title 
  HAVING COUNT(*) > 1
)
GROUP BY pl.parent_title
ORDER BY pl.parent_title;

-- ============================================================
-- OPTIONAL: Clean up duplicates (keep most recent, delete older ones)
-- ============================================================
-- WARNING: Run this only after reviewing the duplicates above!
-- This will delete older duplicate tasks, keeping only the most recent one

-- SAFE DELETE: Delete duplicate tasks (keeping most recent one)
-- This uses a subquery to identify which rows to delete
-- WARNING: Since title is PRIMARY KEY, duplicates shouldn't exist, but this cleans up if they do
-- Run Step 1 and Step 2 first to review duplicates before running this!

-- Uncomment the following to delete duplicate tasks (keeping most recent):
/*
DELETE pt1 FROM tabPutawayTask pt1
INNER JOIN (
    SELECT title, MAX(COALESCE(updated_at, created_at)) as max_date
    FROM tabPutawayTask
    GROUP BY title
    HAVING COUNT(*) > 1
) duplicates ON pt1.title = duplicates.title
WHERE COALESCE(pt1.updated_at, pt1.created_at) < duplicates.max_date;
*/

-- ============================================================
-- ALTERNATIVE: Update all duplicates to have same status (most recent)
-- ============================================================
-- This updates all duplicate tasks to match the most recent one's status

-- Uncomment to update duplicates:
/*
UPDATE tabPutawayTask pt1
INNER JOIN (
  SELECT title, status, COALESCE(updated_at, created_at) as max_date
  FROM tabPutawayTask
  WHERE (title, COALESCE(updated_at, created_at)) IN (
    SELECT title, MAX(COALESCE(updated_at, created_at))
    FROM tabPutawayTask
    GROUP BY title
  )
) pt2 ON pt1.title = pt2.title
SET pt1.status = pt2.status,
    pt1.updated_at = NOW()
WHERE pt1.title IN (
  SELECT title 
  FROM tabPutawayTask 
  GROUP BY title 
  HAVING COUNT(*) > 1
);
*/

-- ============================================================
-- VERIFICATION: After cleanup, check for remaining duplicates
-- ============================================================
SELECT 
  '=== REMAINING DUPLICATES (should be 0) ===' as Info;

SELECT 
  title,
  COUNT(*) as count
FROM tabPutawayTask
GROUP BY title
HAVING COUNT(*) > 1;

-- ============================================================
-- END OF SCRIPT
-- ============================================================

