-- ============================================================
-- CHECK PUTAWAY TASK EXISTS
-- Use this to verify if a putaway task exists in the database
-- ============================================================

-- Check for specific task
SELECT 
  '=== CHECKING FOR TASK: PUT-20251230-0001 ===' as Info;

SELECT 
  title,
  status,
  advance_shipping_notice,
  inbound_session,
  created_by,
  created_at,
  updated_at
FROM tabPutawayTask
WHERE title = 'PUT-20251230-0001';

-- Check for similar tasks (in case of typo or different format)
SELECT 
  '=== SIMILAR TASKS (LIKE PUT-20251230%) ===' as Info;

SELECT 
  title,
  status,
  advance_shipping_notice,
  inbound_session,
  created_by,
  created_at,
  updated_at
FROM tabPutawayTask
WHERE title LIKE 'PUT-20251230%'
ORDER BY created_at DESC;

-- Check all recent putaway tasks
SELECT 
  '=== ALL RECENT PUTAWAY TASKS (Last 10) ===' as Info;

SELECT 
  title,
  status,
  advance_shipping_notice,
  inbound_session,
  created_by,
  created_at,
  updated_at
FROM tabPutawayTask
ORDER BY created_at DESC
LIMIT 10;

-- Check if there are any tasks with similar date
SELECT 
  '=== ALL TASKS FROM 2025-12-30 ===' as Info;

SELECT 
  title,
  status,
  advance_shipping_notice,
  inbound_session,
  created_by,
  created_at,
  updated_at
FROM tabPutawayTask
WHERE DATE(created_at) = '2025-12-30'
   OR title LIKE 'PUT-20251230%'
ORDER BY created_at DESC;

-- Check putaway lines for the task (if task exists)
SELECT 
  '=== PUTAWAY LINES FOR PUT-20251230-0001 ===' as Info;

SELECT 
  parent_title,
  carton_id,
  item_code,
  qty,
  rack,
  bin,
  created_at
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
ORDER BY item_code;

-- ============================================================
-- END OF SCRIPT
-- ============================================================

