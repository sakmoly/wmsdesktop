-- ============================================================
-- CHECK FOR DUPLICATE PUTAWAY LINES
-- Find duplicate carton IDs and quantities in putaway lines
-- ============================================================

-- Step 1: Find exact duplicates (same carton, item, rack, bin)
SELECT 
  '=== EXACT DUPLICATES (Same Carton, Item, Location) ===' as Info;

SELECT 
  parent_title,
  carton_id,
  item_code,
  rack,
  bin,
  COUNT(*) as duplicate_count,
  SUM(qty) as total_qty,
  GROUP_CONCAT(id ORDER BY id SEPARATOR ', ') as line_ids,
  GROUP_CONCAT(qty ORDER BY id SEPARATOR ' + ') as quantities,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
GROUP BY parent_title, carton_id, item_code, rack, bin
HAVING COUNT(*) > 1
ORDER BY total_qty DESC;

-- Step 2: Find duplicates by carton_id and item_code (same box, same item, different locations)
SELECT 
  '=== DUPLICATE CARTON + ITEM (Different Locations) ===' as Info;

SELECT 
  parent_title,
  carton_id,
  item_code,
  COUNT(*) as location_count,
  SUM(qty) as total_qty,
  GROUP_CONCAT(CONCAT(rack, '/', bin) ORDER BY id SEPARATOR ', ') as locations,
  GROUP_CONCAT(qty ORDER BY id SEPARATOR ' + ') as quantities
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
  AND carton_id IS NOT NULL
GROUP BY parent_title, carton_id, item_code
HAVING COUNT(*) > 1
ORDER BY total_qty DESC;

-- Step 3: Show all lines for the specific carton
SELECT 
  '=== ALL LINES FOR BOX-WHMAIN-759335 ===' as Info;

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
WHERE carton_id = 'BOX-WHMAIN-759335'
ORDER BY created_at;

-- Step 4: Check if quantities match source events
SELECT 
  '=== SOURCE EVENTS FOR BOX-WHMAIN-759335 ===' as Info;

-- Check SORT_TO_BOX events
SELECT 
  'SORT_TO_BOX' as event_type,
  box_id,
  item_code,
  SUM(qty) as total_qty,
  COUNT(*) as event_count
FROM tabWmsScanEvent
WHERE event_type = 'SORT_TO_BOX'
  AND box_id = 'BOX-WHMAIN-759335'
GROUP BY box_id, item_code

UNION ALL

-- Check PACK_BOX_TO_TC events
SELECT 
  'PACK_BOX_TO_TC' as event_type,
  box_id,
  item_code,
  SUM(qty) as total_qty,
  COUNT(*) as event_count
FROM tabWmsScanEvent
WHERE event_type = 'PACK_BOX_TO_TC'
  AND box_id = 'BOX-WHMAIN-759335'
GROUP BY box_id, item_code;

-- Step 5: Compare putaway quantity vs source events
SELECT 
  '=== COMPARISON: PUTAWAY QTY vs SOURCE EVENTS ===' as Info;

SELECT 
  pl.carton_id,
  pl.item_code,
  SUM(pl.qty) as putaway_total_qty,
  COUNT(*) as putaway_line_count,
  COALESCE((
    SELECT SUM(e.qty)
    FROM tabWmsScanEvent e
    WHERE e.event_type = 'SORT_TO_BOX'
      AND e.box_id = pl.carton_id
      AND e.item_code = pl.item_code
  ), 0) as sort_event_qty,
  COALESCE((
    SELECT SUM(e.qty)
    FROM tabWmsScanEvent e
    WHERE e.event_type = 'PACK_BOX_TO_TC'
      AND e.box_id = pl.carton_id
      AND e.item_code = pl.item_code
  ), 0) as pack_event_qty,
  CASE 
    WHEN SUM(pl.qty) > COALESCE((
      SELECT SUM(e.qty)
      FROM tabWmsScanEvent e
      WHERE e.event_type = 'SORT_TO_BOX'
        AND e.box_id = pl.carton_id
        AND e.item_code = pl.item_code
    ), 0) THEN '⚠️ Putaway > Source'
    WHEN SUM(pl.qty) < COALESCE((
      SELECT SUM(e.qty)
      FROM tabWmsScanEvent e
      WHERE e.event_type = 'SORT_TO_BOX'
        AND e.box_id = pl.carton_id
        AND e.item_code = pl.item_code
    ), 0) THEN '✅ Putaway < Source'
    ELSE '✅ Match'
  END as status
FROM tabPutawayLine pl
WHERE pl.parent_title = 'PUT-20251230-0001'
  AND pl.carton_id = 'BOX-WHMAIN-759335'
GROUP BY pl.carton_id, pl.item_code;

-- ============================================================
-- FIX: Remove duplicate lines (keep one, sum quantities if same location)
-- ============================================================
-- Uncomment to fix:
/*
-- Option 1: If same carton+item+location, keep first and sum quantities
UPDATE tabPutawayLine pl1
INNER JOIN (
  SELECT 
    parent_title,
    carton_id,
    item_code,
    rack,
    bin,
    MIN(id) as first_id,
    SUM(qty) as total_qty
  FROM tabPutawayLine
  WHERE parent_title = 'PUT-20251230-0001'
  GROUP BY parent_title, carton_id, item_code, rack, bin
  HAVING COUNT(*) > 1
) dup ON pl1.id = dup.first_id
SET pl1.qty = dup.total_qty,
    pl1.updated_at = NOW();

DELETE pl2 FROM tabPutawayLine pl2
INNER JOIN (
  SELECT 
    parent_title,
    carton_id,
    item_code,
    rack,
    bin,
    MIN(id) as first_id
  FROM tabPutawayLine
  WHERE parent_title = 'PUT-20251230-0001'
  GROUP BY parent_title, carton_id, item_code, rack, bin
  HAVING COUNT(*) > 1
) dup ON pl2.parent_title = dup.parent_title
  AND pl2.carton_id = dup.carton_id
  AND pl2.item_code = dup.item_code
  AND pl2.rack = dup.rack
  AND pl2.bin = dup.bin
  AND pl2.id > dup.first_id;
*/

-- ============================================================
-- END OF SCRIPT
-- ============================================================

