-- ============================================================
-- CHECK SOURCE CARTON ISSUE
-- ============================================================
-- This script checks if carton_id is being sent in packing events
-- ============================================================

-- Check events for Transfer Carton TC-MR-123457-1768306175846
SELECT 
  event_type,
  item_code,
  carton_id,  -- ← Check if this is NULL
  box_id,
  qty,
  event_time,
  user_id,
  tc_id
FROM tabWmsScanEvent
WHERE tc_id = 'TC-MR-123457-1768306175846'
  AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
ORDER BY event_time DESC;

-- Summary: Count events with/without carton_id
SELECT 
  event_type,
  COUNT(*) as total_events,
  SUM(CASE WHEN carton_id IS NULL OR carton_id = '' THEN 1 ELSE 0 END) as events_without_carton_id,
  SUM(CASE WHEN carton_id IS NOT NULL AND carton_id != '' THEN 1 ELSE 0 END) as events_with_carton_id
FROM tabWmsScanEvent
WHERE tc_id = 'TC-MR-123457-1768306175846'
  AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
GROUP BY event_type;

-- Check all Transfer Cartons for MR-123457
SELECT 
  tc_id,
  status,
  created_on
FROM tabTransferCarton
WHERE to_no = 'MR-123457'
ORDER BY created_on DESC;
