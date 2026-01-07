-- ============================================================
-- CHECK WHERE DUPLICATE PUTAWAY LINES ARE CREATED
-- Find the source of duplicate putaway lines for PUT-20251230-0001
-- ============================================================

-- Step 1: Check all putaway lines for this task
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
  created_at,
  updated_at
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
ORDER BY created_at, item_code, carton_id;

-- Step 2: Check for duplicate lines (same carton + item but different rack/bin)
SELECT 
  '=== DUPLICATE LINES (Same Carton + Item) ===' as Info;

SELECT 
  parent_title,
  carton_id,
  item_code,
  COUNT(*) as line_count,
  SUM(qty) as total_qty,
  GROUP_CONCAT(CONCAT('Rack:', COALESCE(rack, 'NULL'), ' Bin:', COALESCE(bin, 'NULL'), ' Qty:', qty) SEPARATOR ' | ') as line_details,
  GROUP_CONCAT(id ORDER BY id SEPARATOR ', ') as line_ids,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
GROUP BY parent_title, carton_id, item_code
HAVING COUNT(*) > 1
ORDER BY total_qty DESC;

-- Step 3: Check PUTAWAY events that created these lines
SELECT 
  '=== PUTAWAY EVENTS FOR THIS TASK ===' as Info;

SELECT 
  id,
  event_type,
  asn_no,
  tc_id,
  box_id,
  carton_id,
  item_code,
  qty,
  rack,
  bin,
  user_id,
  event_time,
  created_at,
  offline_uuid
FROM tabWmsScanEvent
WHERE event_type = 'PUTAWAY'
  AND asn_no = 'ASN-12225'
ORDER BY event_time, item_code;

-- Step 4: Check PUTAWAY_TO_RACK events
SELECT 
  '=== PUTAWAY_TO_RACK EVENTS ===' as Info;

SELECT 
  id,
  event_type,
  asn_no,
  tc_id,
  box_id,
  carton_id,
  item_code,
  qty,
  rack,
  bin,
  user_id,
  event_time,
  offline_uuid
FROM tabWmsScanEvent
WHERE event_type = 'PUTAWAY_TO_RACK'
  AND asn_no = 'ASN-12225'
ORDER BY event_time, item_code;

-- Step 5: Check for duplicate events (same offline_uuid)
SELECT 
  '=== DUPLICATE EVENTS (Same offline_uuid) ===' as Info;

SELECT 
  offline_uuid,
  event_type,
  COUNT(*) as event_count,
  GROUP_CONCAT(id ORDER BY id SEPARATOR ', ') as event_ids,
  GROUP_CONCAT(CONCAT('Rack:', COALESCE(rack, 'NULL'), ' Bin:', COALESCE(bin, 'NULL'), ' Qty:', qty) SEPARATOR ' | ') as event_details
FROM tabWmsScanEvent
WHERE event_type IN ('PUTAWAY', 'PUTAWAY_TO_RACK')
  AND asn_no = 'ASN-12225'
  AND offline_uuid IS NOT NULL
GROUP BY offline_uuid, event_type
HAVING COUNT(*) > 1;

-- Step 6: Check specific carton PAW-ASN12225-1767
SELECT 
  '=== EVENTS FOR CARTON PAW-ASN12225-1767 ===' as Info;

SELECT 
  id,
  event_type,
  asn_no,
  tc_id,
  box_id,
  carton_id,
  item_code,
  qty,
  rack,
  bin,
  user_id,
  event_time,
  offline_uuid
FROM tabWmsScanEvent
WHERE (carton_id LIKE '%PAW-ASN12225-1767%' OR box_id LIKE '%PAW-ASN12225-1767%')
  AND event_type IN ('PUTAWAY', 'PUTAWAY_TO_RACK', 'PACK_BOX_TO_TC', 'SORT_TO_BOX')
ORDER BY event_time;

-- Step 7: Check when putaway lines were created vs when events were received
SELECT 
  '=== TIMELINE: EVENTS vs PUTAWAY LINES ===' as Info;

SELECT 
  'Event' as source,
  id as record_id,
  event_type,
  item_code,
  carton_id,
  rack,
  bin,
  qty,
  event_time as timestamp
FROM tabWmsScanEvent
WHERE event_type IN ('PUTAWAY', 'PUTAWAY_TO_RACK')
  AND asn_no = 'ASN-12225'
  AND item_code = 'SKU-HAT-301-BLU-OS'
  AND (carton_id LIKE '%PAW-ASN12225-1767%' OR box_id LIKE '%PAW-ASN12225-1767%')

UNION ALL

SELECT 
  'PutawayLine' as source,
  id as record_id,
  'PUTAWAY_LINE' as event_type,
  item_code,
  carton_id,
  rack,
  bin,
  qty,
  created_at as timestamp
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
  AND item_code = 'SKU-HAT-301-BLU-OS'
  AND carton_id LIKE '%PAW-ASN12225-1767%'

ORDER BY timestamp;

-- Step 8: Check if mobile app sent duplicate events
SELECT 
  '=== CHECK FOR DUPLICATE EVENT SUBMISSIONS ===' as Info;

SELECT 
  DATE(event_time) as event_date,
  HOUR(event_time) as event_hour,
  MINUTE(event_time) as event_minute,
  event_type,
  item_code,
  carton_id,
  rack,
  bin,
  qty,
  COUNT(*) as duplicate_count,
  GROUP_CONCAT(id ORDER BY id SEPARATOR ', ') as event_ids
FROM tabWmsScanEvent
WHERE event_type IN ('PUTAWAY', 'PUTAWAY_TO_RACK')
  AND asn_no = 'ASN-12225'
  AND item_code = 'SKU-HAT-301-BLU-OS'
GROUP BY DATE(event_time), HOUR(event_time), MINUTE(event_time), event_type, item_code, carton_id, rack, bin, qty
HAVING COUNT(*) > 1
ORDER BY event_date DESC, event_hour DESC, event_minute DESC;

-- ============================================================
-- DIAGNOSIS
-- ============================================================
-- If duplicate events are found:
--   → Mobile app is sending duplicate events (fix mobile app)
-- 
-- If events are unique but putaway lines are duplicated:
--   → Backend API is creating duplicates (fix backend logic)
-- 
-- If one line has rack and another doesn't:
--   → Backend deduplication logic isn't handling NULL rack correctly
-- ============================================================

