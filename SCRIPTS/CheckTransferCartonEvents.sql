-- Check if Transfer Carton has any packing events
-- Replace 'TC-MR-123461-1768330310848' with the actual TC ID

-- 1. Check if TC exists
SELECT 
  tc_id,
  status,
  to_no,
  store,
  created_on,
  sealed_on,
  dispatched_on
FROM tabTransferCarton
WHERE tc_id = 'TC-MR-123461-1768330310848';

-- 2. Check all events with this tc_id
SELECT 
  event_type,
  item_code,
  carton_id,
  qty,
  tc_id,
  user_id,
  event_time
FROM tabWmsScanEvent
WHERE tc_id = 'TC-MR-123461-1768330310848'
ORDER BY event_time DESC;

-- 3. Check packing events specifically
SELECT 
  event_type,
  item_code,
  carton_id,
  qty,
  tc_id,
  user_id,
  event_time
FROM tabWmsScanEvent
WHERE tc_id = 'TC-MR-123461-1768330310848'
  AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
ORDER BY event_time DESC;

-- 4. Check if items were picked for this Material Request
SELECT 
  event_type,
  item_code,
  carton_id,
  qty,
  material_request,
  source_bin,
  user_id,
  event_time
FROM tabWmsScanEvent
WHERE material_request = 'MR-123461'
  AND event_type IN ('PICK_ITEM', 'PACK_ITEM_TO_TC', 'PACK_BOX_TO_TC')
ORDER BY event_time DESC;

-- 5. Check Material Request items
SELECT 
  item_code,
  requested_qty,
  picked_qty,
  parent_title
FROM tabMaterialRequestItem
WHERE parent_title = 'MR-123461';
