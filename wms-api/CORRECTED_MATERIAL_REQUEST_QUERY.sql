-- ✅ CORRECTED SQL Query for Material Request Events
-- The source_bin column does NOT exist, use rack and bin instead

-- Query 1: Get Material Request events with rack and bin
SELECT 
  event_type,
  transfer_order,
  item_code,
  qty,
  rack,
  bin,
  event_time
FROM tabWmsScanEvent
WHERE transfer_order = 'MR-0001'
  OR transfer_order LIKE 'MR-%'
ORDER BY event_time DESC;

-- Query 2: Get Material Request events with combined location
SELECT 
  event_type,
  transfer_order,
  item_code,
  qty,
  CONCAT(COALESCE(rack, ''), '-', COALESCE(bin, '')) as source_location,
  event_time
FROM tabWmsScanEvent
WHERE transfer_order = 'MR-0001'
  OR transfer_order LIKE 'MR-%'
ORDER BY event_time DESC;

-- Query 3: Check all events (to see if transfer_order is NULL)
SELECT 
  event_type,
  transfer_order,
  item_code,
  qty,
  rack,
  bin,
  event_time
FROM tabWmsScanEvent
ORDER BY event_time DESC
LIMIT 20;

-- Query 4: Check Material Request items with picked quantities
SELECT 
  parent_title,
  item_code,
  requested_qty,
  picked_qty,
  status,
  updated_at
FROM tabMaterialRequestItem
WHERE parent_title = 'MR-0001'
ORDER BY item_code;

