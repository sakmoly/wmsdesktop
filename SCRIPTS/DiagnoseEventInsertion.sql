-- ============================================================
-- DIAGNOSE EVENT INSERTION ISSUES
-- This script helps identify why events are not being inserted
-- ============================================================

-- 1. Check recent events (last 24 hours)
SELECT 
  '=== RECENT EVENTS (Last 24 Hours) ===' as info;

SELECT 
  id,
  offline_uuid,
  event_type,
  event_time,
  user_id,
  item_code,
  qty,
  tc_id,
  carton_id,
  source_bin,
  material_request,
  transfer_order,
  created_at
FROM tabWmsScanEvent
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
ORDER BY created_at DESC
LIMIT 50;

-- 2. Check for duplicate offline_uuid (should not exist due to UNIQUE constraint)
SELECT 
  '=== DUPLICATE offline_uuid CHECK ===' as info;

SELECT 
  offline_uuid,
  COUNT(*) as duplicate_count,
  GROUP_CONCAT(id ORDER BY id DESC) as record_ids,
  GROUP_CONCAT(event_type ORDER BY id DESC) as event_types,
  GROUP_CONCAT(created_at ORDER BY id DESC) as created_dates
FROM tabWmsScanEvent
GROUP BY offline_uuid
HAVING COUNT(*) > 1
LIMIT 20;

-- 3. Check table structure (verify UNIQUE constraint exists)
SELECT 
  '=== TABLE STRUCTURE CHECK ===' as info;

SELECT 
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_KEY,
  COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabWmsScanEvent'
ORDER BY ORDINAL_POSITION;

-- 4. Check indexes (verify UNIQUE index on offline_uuid)
SELECT 
  '=== INDEXES CHECK ===' as info;

SELECT 
  INDEX_NAME,
  COLUMN_NAME,
  NON_UNIQUE,
  INDEX_TYPE
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabWmsScanEvent'
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

-- 5. Check for events with missing required fields
SELECT 
  '=== EVENTS WITH MISSING REQUIRED FIELDS ===' as info;

SELECT 
  id,
  offline_uuid,
  event_type,
  event_time,
  device_id,
  user_id,
  CASE 
    WHEN offline_uuid IS NULL OR offline_uuid = '' THEN 'Missing offline_uuid'
    WHEN event_type IS NULL OR event_type = '' THEN 'Missing event_type'
    WHEN event_time IS NULL THEN 'Missing event_time'
    WHEN device_id IS NULL OR device_id = '' THEN 'Missing device_id'
    WHEN user_id IS NULL OR user_id = '' THEN 'Missing user_id'
    ELSE 'OK'
  END as issue
FROM tabWmsScanEvent
WHERE offline_uuid IS NULL 
   OR offline_uuid = ''
   OR event_type IS NULL 
   OR event_type = ''
   OR event_time IS NULL
   OR device_id IS NULL 
   OR device_id = ''
   OR user_id IS NULL 
   OR user_id = ''
ORDER BY created_at DESC
LIMIT 20;

-- 6. Check PACK_ITEM_TO_TC events specifically
SELECT 
  '=== PACK_ITEM_TO_TC EVENTS (Last 24 Hours) ===' as info;

SELECT 
  id,
  offline_uuid,
  event_type,
  event_time,
  user_id,
  item_code,
  qty,
  tc_id,
  carton_id,
  source_bin,
  material_request,
  transfer_order,
  created_at
FROM tabWmsScanEvent
WHERE event_type IN ('PACK_ITEM_TO_TC', 'PACK_BOX_TO_TC')
  AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
ORDER BY created_at DESC
LIMIT 50;

-- 7. Check Transfer Carton status for recent TCs
SELECT 
  '=== TRANSFER CARTON STATUS CHECK ===' as info;

SELECT DISTINCT
  tc.tc_id,
  tc.status,
  tc.created_on,
  tc.sealed_on,
  tc.dispatched_on,
  COUNT(e.id) as event_count
FROM tabTransferCarton tc
LEFT JOIN tabWmsScanEvent e ON e.tc_id = tc.tc_id
WHERE tc.created_on >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY tc.tc_id, tc.status, tc.created_on, tc.sealed_on, tc.dispatched_on
ORDER BY tc.created_on DESC
LIMIT 20;

-- 8. Check for events that might be rejected due to carton validation
SELECT 
  '=== CARTON STOCK CHECK (For Recent Events) ===' as info;

SELECT DISTINCT
  e.carton_id,
  e.item_code,
  e.source_bin,
  e.bin_location,
  cs.qty as carton_stock_qty,
  cs.status as carton_stock_status,
  COUNT(e.id) as event_count
FROM tabWmsScanEvent e
LEFT JOIN tabCartonStock cs ON cs.carton_id = e.carton_id 
  AND cs.item_code = e.item_code
  AND cs.bin_location = COALESCE(e.source_bin, e.bin_location)
WHERE e.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
  AND e.carton_id IS NOT NULL
  AND e.item_code IS NOT NULL
GROUP BY e.carton_id, e.item_code, e.source_bin, e.bin_location, cs.qty, cs.status
ORDER BY e.created_at DESC
LIMIT 20;

-- ============================================================
-- END OF DIAGNOSTIC SCRIPT
-- ============================================================
