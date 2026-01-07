-- ============================================================
-- FIND AND FIX DUPLICATE PUTAWAY LINES
-- This script identifies duplicate putaway lines and traces their source
-- ============================================================

-- Step 1: Find exact duplicates (same carton, item, rack, bin)
SELECT 
  '=== EXACT DUPLICATES (Same Carton, Item, Location) ===' as Info;

SELECT 
  carton_id,
  item_code,
  rack,
  bin,
  COUNT(*) as duplicate_count,
  SUM(qty) as total_duplicate_qty,
  GROUP_CONCAT(id ORDER BY id SEPARATOR ', ') as line_ids,
  GROUP_CONCAT(qty ORDER BY id SEPARATOR ' + ') as quantities,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
GROUP BY carton_id, item_code, rack, bin
HAVING COUNT(*) > 1
ORDER BY total_duplicate_qty DESC;

-- Step 2: Show the duplicate lines in detail
SELECT 
  '=== DUPLICATE LINES DETAIL ===' as Info;

SELECT 
  pl1.id as line_id_1,
  pl1.carton_id,
  pl1.item_code,
  pl1.qty as qty_1,
  pl1.rack,
  pl1.bin,
  pl1.created_at as created_1,
  pl2.id as line_id_2,
  pl2.qty as qty_2,
  pl2.created_at as created_2,
  (pl1.qty + pl2.qty) as total_qty
FROM tabPutawayLine pl1
INNER JOIN tabPutawayLine pl2 ON 
  pl1.parent_title = pl2.parent_title
  AND pl1.carton_id = pl2.carton_id
  AND pl1.item_code = pl2.item_code
  AND pl1.rack = pl2.rack
  AND pl1.bin = pl2.bin
  AND pl1.id < pl2.id
WHERE pl1.parent_title = 'PUT-20251230-0001'
ORDER BY total_qty DESC;

-- Step 3: Trace back to source events for duplicates
SELECT 
  '=== SOURCE EVENTS FOR DUPLICATE ITEM ===' as Info;

-- Check SORT_TO_BOX events
SELECT 
  'SORT_TO_BOX Events' as event_source,
  e.box_id,
  e.carton_id,
  e.item_code,
  SUM(e.qty) as total_qty_from_events,
  COUNT(*) as event_count,
  MIN(e.event_time) as first_event,
  MAX(e.event_time) as last_event
FROM tabWmsScanEvent e
WHERE e.event_type = 'SORT_TO_BOX'
  AND e.item_code = 'SKU-HAT-301-RED-OS'
  AND (
    e.box_id = 'PAW-ASN12225-1767124123207'
    OR e.box_id = 'BOX-WHMAIN-123882'
  )
GROUP BY e.box_id, e.carton_id, e.item_code

UNION ALL

-- Check PACK_BOX_TO_TC events
SELECT 
  'PACK_BOX_TO_TC Events' as event_source,
  e.tc_id as box_id,
  e.box_id as carton_id,
  e.item_code,
  SUM(e.qty) as total_qty_from_events,
  COUNT(*) as event_count,
  MIN(e.event_time) as first_event,
  MAX(e.event_time) as last_event
FROM tabWmsScanEvent e
WHERE e.event_type = 'PACK_BOX_TO_TC'
  AND e.item_code = 'SKU-HAT-301-RED-OS'
  AND (
    e.tc_id = 'PAW-ASN12225-1767124123207'
    OR e.box_id = 'PAW-ASN12225-1767124123207'
    OR e.box_id = 'BOX-WHMAIN-123882'
  )
GROUP BY e.tc_id, e.box_id, e.item_code;

-- Step 4: Compare putaway quantity vs actual received quantity
SELECT 
  '=== PUTAWAY QTY vs RECEIVED QTY COMPARISON ===' as Info;

SELECT 
  pl.item_code,
  pl.carton_id,
  SUM(pl.qty) as total_putaway_qty,
  COUNT(*) as putaway_line_count,
  -- Check SORT_TO_BOX events
  COALESCE((
    SELECT SUM(e.qty)
    FROM tabWmsScanEvent e
    WHERE e.event_type = 'SORT_TO_BOX'
      AND e.item_code = pl.item_code
      AND e.box_id = pl.carton_id
  ), 0) as qty_from_sort_events,
  -- Check PACK_BOX_TO_TC events
  COALESCE((
    SELECT SUM(e.qty)
    FROM tabWmsScanEvent e
    WHERE e.event_type = 'PACK_BOX_TO_TC'
      AND e.item_code = pl.item_code
      AND (e.tc_id = pl.carton_id OR e.box_id = pl.carton_id)
  ), 0) as qty_from_pack_events,
  -- Check inbound receiving
  COALESCE((
    SELECT SUM(irl.received_qty)
    FROM tabInboundReceiveLine irl
    WHERE irl.item_code = pl.item_code
      AND irl.parent_title = 'SESSION-ASN12225-DEVICE001-USER786249'
  ), 0) as qty_received_inbound,
  -- Calculate difference
  (SUM(pl.qty) - COALESCE((
    SELECT SUM(e.qty)
    FROM tabWmsScanEvent e
    WHERE e.event_type = 'SORT_TO_BOX'
      AND e.item_code = pl.item_code
      AND e.box_id = pl.carton_id
  ), 0)) as difference_from_sort,
  CASE 
    WHEN SUM(pl.qty) > COALESCE((
      SELECT SUM(e.qty)
      FROM tabWmsScanEvent e
      WHERE e.event_type = 'SORT_TO_BOX'
        AND e.item_code = pl.item_code
        AND e.box_id = pl.carton_id
    ), 0) THEN '⚠️ Putaway > Source'
    WHEN SUM(pl.qty) < COALESCE((
      SELECT SUM(e.qty)
      FROM tabWmsScanEvent e
      WHERE e.event_type = 'SORT_TO_BOX'
        AND e.item_code = pl.item_code
        AND e.box_id = pl.carton_id
    ), 0) THEN '✅ Putaway < Source'
    ELSE '✅ Match'
  END as status
FROM tabPutawayLine pl
WHERE pl.parent_title = 'PUT-20251230-0001'
GROUP BY pl.item_code, pl.carton_id
ORDER BY ABS(difference_from_sort) DESC;

-- Step 5: Show all events for the problematic item
SELECT 
  '=== ALL EVENTS FOR SKU-HAT-301-RED-OS ===' as Info;

SELECT 
  e.event_type,
  e.event_time,
  e.box_id,
  e.tc_id,
  e.carton_id,
  e.item_code,
  e.qty,
  e.user_id,
  e.device_id,
  e.inbound_session
FROM tabWmsScanEvent e
WHERE e.item_code = 'SKU-HAT-301-RED-OS'
  AND e.inbound_session = 'SESSION-ASN12225-DEVICE001-USER786249'
ORDER BY e.event_time, e.event_type;

-- Step 6: Check if putaway was completed multiple times
SELECT 
  '=== PUTAWAY COMPLETION EVENTS ===' as Info;

SELECT 
  e.event_type,
  e.event_time,
  e.putaway_task,
  e.item_code,
  e.qty,
  e.rack,
  e.bin,
  e.user_id
FROM tabWmsScanEvent e
WHERE e.event_type IN ('PUTAWAY_COMPLETE', 'PUTAWAY_TO_RACK')
  AND e.item_code = 'SKU-HAT-301-RED-OS'
ORDER BY e.event_time DESC;

-- ============================================================
-- FIX: Remove duplicate lines (keep the first one, sum quantities)
-- ============================================================
-- Uncomment to fix duplicates:
/*
-- Step 1: Update the first line with sum of all duplicates
UPDATE tabPutawayLine pl1
INNER JOIN (
  SELECT 
    carton_id,
    item_code,
    rack,
    bin,
    MIN(id) as first_id,
    SUM(qty) as total_qty
  FROM tabPutawayLine
  WHERE parent_title = 'PUT-20251230-0001'
  GROUP BY carton_id, item_code, rack, bin
  HAVING COUNT(*) > 1
) duplicates ON 
  pl1.id = duplicates.first_id
SET pl1.qty = duplicates.total_qty,
    pl1.updated_at = NOW();

-- Step 2: Delete duplicate lines (keep only the first one)
DELETE pl2 FROM tabPutawayLine pl2
INNER JOIN (
  SELECT 
    carton_id,
    item_code,
    rack,
    bin,
    MIN(id) as first_id
  FROM tabPutawayLine
  WHERE parent_title = 'PUT-20251230-0001'
  GROUP BY carton_id, item_code, rack, bin
  HAVING COUNT(*) > 1
) duplicates ON 
  pl2.carton_id = duplicates.carton_id
  AND pl2.item_code = duplicates.item_code
  AND pl2.rack = duplicates.rack
  AND pl2.bin = duplicates.bin
  AND pl2.id > duplicates.first_id;
*/

-- ============================================================
-- END OF SCRIPT
-- ============================================================

