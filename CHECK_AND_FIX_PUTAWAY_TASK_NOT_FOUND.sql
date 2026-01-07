-- ============================================================
-- CHECK AND FIX PUTAWAY TASK NOT FOUND
-- For PUT-20251230-0001
-- ============================================================

-- Step 1: Check if the task exists
SELECT 
  '=== CHECKING FOR PUT-20251230-0001 ===' as Info;

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

-- Step 2: Find similar tasks (same date prefix)
SELECT 
  '=== SIMILAR TASKS (Same Date) ===' as Info;

SELECT 
  title,
  status,
  advance_shipping_notice,
  inbound_session,
  created_by,
  created_at
FROM tabPutawayTask
WHERE title LIKE 'PUT-20251230%'
ORDER BY created_at DESC;

-- Step 3: Find recent tasks
SELECT 
  '=== RECENT PUTAWAY TASKS ===' as Info;

SELECT 
  title,
  status,
  advance_shipping_notice,
  inbound_session,
  created_by,
  created_at
FROM tabPutawayTask
ORDER BY created_at DESC
LIMIT 10;

-- Step 4: Check for ASN-12225 tasks
SELECT 
  '=== TASKS FOR ASN-12225 ===' as Info;

SELECT 
  title,
  status,
  advance_shipping_notice,
  inbound_session,
  created_by,
  created_at
FROM tabPutawayTask
WHERE advance_shipping_notice = 'ASN-12225'
ORDER BY created_at DESC;

-- Step 5: Check putaway lines (might exist even if task doesn't)
SELECT 
  '=== PUTAWAY LINES FOR PUT-20251230-0001 ===' as Info;

SELECT 
  parent_title,
  item_code,
  carton_id,
  qty,
  rack,
  bin,
  created_at
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001';

-- Step 6: Check if ASN-12225 exists
SELECT 
  '=== CHECKING ASN-12225 ===' as Info;

SELECT 
  title,
  status,
  warehouse,
  created_at
FROM tabAdvanceShippingNotice
WHERE title = 'ASN-12225';

-- Step 7: Check inbound session
SELECT 
  '=== CHECKING INBOUND SESSION ===' as Info;

SELECT 
  inbound_session,
  asn_no,
  status,
  started_at,
  ended_at
FROM tabInboundSession
WHERE asn_no = 'ASN-12225'
ORDER BY started_at DESC
LIMIT 5;

-- ============================================================
-- CREATE PUTAWAY TASK (if needed)
-- ============================================================
-- Uncomment and run if you need to create the task manually:
/*
-- Get inbound session
SET @inbound_session = (
  SELECT inbound_session 
  FROM tabInboundSession 
  WHERE asn_no = 'ASN-12225' 
  ORDER BY started_at DESC 
  LIMIT 1
);

-- Create putaway task
INSERT INTO tabPutawayTask 
  (title, status, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
VALUES 
  ('PUT-20251230-0001', 'Draft', 'ASN-12225', @inbound_session, 'SYSTEM', NOW(), NOW());

-- Check if source_type column exists and add it if needed
-- (This is optional, only if your schema has source_type column)
-- INSERT INTO tabPutawayTask 
--   (title, status, source_type, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
-- VALUES 
--   ('PUT-20251230-0001', 'Draft', 'ASN', 'ASN-12225', @inbound_session, 'SYSTEM', NOW(), NOW());
*/

-- ============================================================
-- END OF SCRIPT
-- ============================================================

