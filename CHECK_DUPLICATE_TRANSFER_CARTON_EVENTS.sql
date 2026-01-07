-- ============================================================
-- CHECK FOR DUPLICATE TRANSFER CARTON EVENTS
-- Find duplicate PACK_BOX_TO_TC events causing double quantities
-- ============================================================

-- Step 1: Check all events for this transfer carton
SELECT 
  '=== ALL EVENTS FOR TC-1767129300851 ===' as Info;

SELECT 
  id,
  event_type,
  tc_id,
  box_id,
  carton_id,
  item_code,
  qty,
  user_id,
  event_time,
  created_at
FROM tabWmsScanEvent
WHERE tc_id = 'TC-1767129300851'
ORDER BY event_time, item_code;

-- Step 2: Check for duplicate PACK_BOX_TO_TC events
SELECT 
  '=== DUPLICATE PACK_BOX_TO_TC EVENTS ===' as Info;

SELECT 
  tc_id,
  box_id,
  carton_id,
  item_code,
  COUNT(*) as duplicate_count,
  SUM(qty) as total_qty,
  GROUP_CONCAT(id ORDER BY id SEPARATOR ', ') as event_ids,
  GROUP_CONCAT(qty ORDER BY id SEPARATOR ' + ') as quantities,
  MIN(event_time) as first_event,
  MAX(event_time) as last_event
FROM tabWmsScanEvent
WHERE tc_id = 'TC-1767129300851'
  AND event_type = 'PACK_BOX_TO_TC'
  AND item_code IS NOT NULL
GROUP BY tc_id, box_id, carton_id, item_code
HAVING COUNT(*) > 1
ORDER BY total_qty DESC;

-- Step 3: Check specific item SKU-HAT-301-BLU-OS
SELECT 
  '=== EVENTS FOR SKU-HAT-301-BLU-OS ===' as Info;

SELECT 
  id,
  event_type,
  tc_id,
  box_id,
  carton_id,
  item_code,
  qty,
  user_id,
  event_time,
  offline_uuid
FROM tabWmsScanEvent
WHERE tc_id = 'TC-1767129300851'
  AND item_code = 'SKU-HAT-301-BLU-OS'
ORDER BY event_time;

-- Step 4: Check for duplicate offline_uuid (should be unique)
SELECT 
  '=== DUPLICATE OFFLINE_UUID (Should be 0) ===' as Info;

SELECT 
  offline_uuid,
  COUNT(*) as duplicate_count,
  GROUP_CONCAT(id ORDER BY id SEPARATOR ', ') as event_ids
FROM tabWmsScanEvent
WHERE tc_id = 'TC-1767129300851'
GROUP BY offline_uuid
HAVING COUNT(*) > 1;

-- Step 5: Check source carton PAW-ASN12225-1767129206
SELECT 
  '=== EVENTS FOR SOURCE CARTON PAW-ASN12225-1767129206 ===' as Info;

SELECT 
  id,
  event_type,
  tc_id,
  box_id,
  carton_id,
  item_code,
  qty,
  user_id,
  event_time
FROM tabWmsScanEvent
WHERE carton_id = 'PAW-ASN12225-1767129206'
  OR box_id = 'PAW-ASN12225-1767129206'
ORDER BY event_time;

-- Step 6: Calculate correct quantity (should be 75)
SELECT 
  '=== CORRECT QUANTITY CALCULATION ===' as Info;

SELECT 
  item_code,
  carton_id,
  box_id,
  COUNT(*) as event_count,
  SUM(qty) as total_qty,
  CASE 
    WHEN COUNT(*) > 1 THEN '⚠️ DUPLICATE EVENTS'
    ELSE '✅ Single Event'
  END as status
FROM tabWmsScanEvent
WHERE tc_id = 'TC-1767129300851'
  AND event_type = 'PACK_BOX_TO_TC'
  AND item_code = 'SKU-HAT-301-BLU-OS'
GROUP BY item_code, carton_id, box_id;

-- Step 7: Check if events are from same source carton
SELECT 
  '=== EVENTS BY SOURCE CARTON ===' as Info;

SELECT 
  COALESCE(box_id, carton_id) as source_carton,
  item_code,
  COUNT(*) as event_count,
  SUM(qty) as total_qty
FROM tabWmsScanEvent
WHERE tc_id = 'TC-1767129300851'
  AND event_type = 'PACK_BOX_TO_TC'
  AND item_code IS NOT NULL
GROUP BY COALESCE(box_id, carton_id), item_code
ORDER BY total_qty DESC;

-- ============================================================
-- FIX: Remove duplicate events (keep the first one)
-- ============================================================
-- Uncomment to fix:
/*
-- Option 1: If same tc_id + item_code + carton_id + qty, keep first
DELETE e2 FROM tabWmsScanEvent e2
INNER JOIN (
  SELECT 
    tc_id,
    item_code,
    carton_id,
    box_id,
    qty,
    MIN(id) as first_id
  FROM tabWmsScanEvent
  WHERE tc_id = 'TC-1767129300851'
    AND event_type = 'PACK_BOX_TO_TC'
    AND item_code IS NOT NULL
  GROUP BY tc_id, item_code, carton_id, box_id, qty
  HAVING COUNT(*) > 1
) dup ON 
  e2.tc_id = dup.tc_id
  AND e2.item_code = dup.item_code
  AND (e2.carton_id = dup.carton_id OR (e2.carton_id IS NULL AND dup.carton_id IS NULL))
  AND (e2.box_id = dup.box_id OR (e2.box_id IS NULL AND dup.box_id IS NULL))
  AND e2.qty = dup.qty
  AND e2.id > dup.first_id;
*/

-- ============================================================
-- END OF SCRIPT
-- ============================================================

