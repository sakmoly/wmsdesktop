-- ============================================================
-- CHECK AND CREATE PUTAWAY TASK FOR ASN-12225
-- ============================================================

-- Step 1: Check if ANY tasks exist
SELECT 
  '=== ALL PUTAWAY TASKS IN DATABASE ===' as Info;

SELECT 
  title,
  status,
  advance_shipping_notice,
  inbound_session,
  created_by,
  created_at,
  updated_at
FROM tabPutawayTask
ORDER BY created_at DESC;

-- Step 2: Check specifically for ASN-12225
SELECT 
  '=== TASKS FOR ASN-12225 ===' as Info;

SELECT 
  title,
  status,
  advance_shipping_notice,
  inbound_session,
  created_by,
  created_at,
  updated_at
FROM tabPutawayTask
WHERE advance_shipping_notice = 'ASN-12225'
ORDER BY created_at DESC;

-- Step 3: Check if ASN-12225 exists
SELECT 
  '=== CHECK IF ASN-12225 EXISTS ===' as Info;

SELECT 
  title,
  status,
  warehouse,
  created_at
FROM tabAdvanceShippingNotice
WHERE title = 'ASN-12225';

-- Step 4: Check inbound sessions for ASN-12225
SELECT 
  '=== INBOUND SESSIONS FOR ASN-12225 ===' as Info;

SELECT 
  title,
  asn_no,
  status,
  dock,
  started_by,
  started_at
FROM tabInboundSession
WHERE asn_no = 'ASN-12225'
ORDER BY started_at DESC;

-- Step 5: Check transfer cartons for ASN-12225
SELECT 
  '=== TRANSFER CARTONS FOR ASN-12225 ===' as Info;

SELECT 
  tc_id,
  asn_no,
  to_no,
  status,
  created_at
FROM tabTransferCarton
WHERE asn_no = 'ASN-12225'
ORDER BY created_at DESC
LIMIT 10;

-- Step 6: Check scan events for ASN-12225
SELECT 
  '=== SCAN EVENTS FOR ASN-12225 ===' as Info;

SELECT 
  event_type,
  tc_id,
  item_code,
  qty,
  event_time
FROM tabWmsScanEvent
WHERE asn_no = 'ASN-12225'
ORDER BY event_time DESC
LIMIT 20;

-- ============================================================
-- MANUAL TASK CREATION (if needed)
-- ============================================================
-- Uncomment below to manually create a task for ASN-12225
-- WARNING: Only do this if you understand the workflow!

/*
-- First, get or create an inbound session
SET @inbound_session = 'SESSION-ASN12225-DEVICE001-USER786249';
SET @user_id = 'USER-786249';

-- Check if inbound session exists
SELECT title FROM tabInboundSession WHERE title = @inbound_session;

-- If it doesn't exist, create it (uncomment):
-- INSERT INTO tabInboundSession (title, asn_no, status, dock, started_by, started_at)
-- VALUES (@inbound_session, 'ASN-12225', 'In Progress', 'DOCK-01', @user_id, NOW());

-- Generate task title (format: PUT-YYYYMMDD-XXXX)
SET @date_prefix = DATE_FORMAT(NOW(), '%Y%m%d');
SET @task_count = (
  SELECT COUNT(*) 
  FROM tabPutawayTask 
  WHERE title LIKE CONCAT('PUT-', @date_prefix, '%')
);
SET @sequence = LPAD(@task_count + 1, 4, '0');
SET @task_title = CONCAT('PUT-', @date_prefix, '-', @sequence);

-- Create the putaway task
INSERT INTO tabPutawayTask (
  title, 
  status, 
  advance_shipping_notice, 
  inbound_session, 
  created_by, 
  created_at, 
  updated_at
)
VALUES (
  @task_title,
  'Draft',
  'ASN-12225',
  @inbound_session,
  @user_id,
  NOW(),
  NOW()
);

-- Verify task was created
SELECT 
  '=== CREATED TASK ===' as Info,
  title,
  status,
  advance_shipping_notice,
  inbound_session
FROM tabPutawayTask
WHERE title = @task_title;
*/

-- ============================================================
-- END OF SCRIPT
-- ============================================================

