-- ============================================================
-- TRACE PUTAWAY ITEM SOURCE
-- Find where putaway items were actually received from
-- ============================================================

-- Step 1: Check putaway lines for task PUT-20251230-0001
SELECT 
  '=== PUTAWAY LINES FOR TASK PUT-20251230-0001 ===' as Info;

SELECT 
  pl.id,
  pl.parent_title as putaway_task,
  pl.carton_id,
  pl.item_code,
  pl.qty as putaway_qty,
  pl.rack,
  pl.bin,
  pl.created_at,
  pl.updated_at
FROM tabPutawayLine pl
WHERE pl.parent_title = 'PUT-20251230-0001'
ORDER BY pl.item_code, pl.carton_id, pl.created_at;

-- Step 2: Check duplicate lines (same carton, item, rack, bin)
SELECT 
  '=== DUPLICATE PUTAWAY LINES (Same Carton, Item, Location) ===' as Info;

SELECT 
  carton_id,
  item_code,
  rack,
  bin,
  COUNT(*) as duplicate_count,
  SUM(qty) as total_qty,
  GROUP_CONCAT(id ORDER BY id) as line_ids
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
GROUP BY carton_id, item_code, rack, bin
HAVING COUNT(*) > 1;

-- Step 3: Trace items back to receiving events (SORT_TO_BOX)
SELECT 
  '=== ITEMS FROM SORT_TO_BOX EVENTS (Box Contents) ===' as Info;

SELECT 
  e.box_id,
  e.carton_id,
  e.item_code,
  SUM(e.qty) as total_received_qty,
  COUNT(*) as event_count,
  MIN(e.event_time) as first_sorted,
  MAX(e.event_time) as last_sorted,
  e.user_id as sorted_by
FROM tabWmsScanEvent e
WHERE e.event_type = 'SORT_TO_BOX'
  AND e.item_code IN (
    SELECT DISTINCT item_code 
    FROM tabPutawayLine 
    WHERE parent_title = 'PUT-20251230-0001'
  )
  AND (
    e.box_id IN (
      SELECT DISTINCT carton_id 
      FROM tabPutawayLine 
      WHERE parent_title = 'PUT-20251230-0001'
      AND carton_id LIKE 'BOX-%'
    )
    OR e.box_id IN (
      SELECT DISTINCT carton_id 
      FROM tabPutawayLine 
      WHERE parent_title = 'PUT-20251230-0001'
      AND carton_id LIKE 'PAW-%'
    )
  )
GROUP BY e.box_id, e.carton_id, e.item_code, e.user_id
ORDER BY e.item_code, e.box_id;

-- Step 4: Check PACK_BOX_TO_TC events (boxes packed into transfer cartons)
SELECT 
  '=== ITEMS FROM PACK_BOX_TO_TC EVENTS (Transfer Carton Contents) ===' as Info;

SELECT 
  e.tc_id,
  e.box_id,
  e.carton_id,
  e.item_code,
  SUM(e.qty) as total_packed_qty,
  COUNT(*) as event_count,
  MIN(e.event_time) as first_packed,
  MAX(e.event_time) as last_packed,
  e.user_id as packed_by
FROM tabWmsScanEvent e
WHERE e.event_type = 'PACK_BOX_TO_TC'
  AND e.item_code IN (
    SELECT DISTINCT item_code 
    FROM tabPutawayLine 
    WHERE parent_title = 'PUT-20251230-0001'
  )
  AND (
    e.tc_id IN (
      SELECT DISTINCT carton_id 
      FROM tabPutawayLine 
      WHERE parent_title = 'PUT-20251230-0001'
      AND carton_id LIKE 'PAW-%'
    )
    OR e.box_id IN (
      SELECT DISTINCT carton_id 
      FROM tabPutawayLine 
      WHERE parent_title = 'PUT-20251230-0001'
    )
  )
GROUP BY e.tc_id, e.box_id, e.carton_id, e.item_code, e.user_id
ORDER BY e.item_code, e.tc_id, e.box_id;

-- Step 5: Check inbound receiving lines (what was actually received)
SELECT 
  '=== INBOUND RECEIVING LINES (Actual Received Quantities) ===' as Info;

SELECT 
  irl.parent_title as inbound_session,
  irl.carton_id,
  irl.item_code,
  irl.expected_qty,
  irl.received_qty,
  irl.condition,
  irl.created_at as received_at
FROM tabInboundReceiveLine irl
WHERE irl.item_code IN (
  SELECT DISTINCT item_code 
  FROM tabPutawayLine 
  WHERE parent_title = 'PUT-20251230-0001'
)
AND irl.parent_title = 'SESSION-ASN12225-DEVICE001-USER786249'
ORDER BY irl.item_code, irl.carton_id;

-- Step 6: Compare putaway quantities vs received quantities
SELECT 
  '=== COMPARISON: PUTAWAY QTY vs RECEIVED QTY ===' as Info;

SELECT 
  pl.item_code,
  SUM(pl.qty) as total_putaway_qty,
  COALESCE(SUM(irl.received_qty), 0) as total_received_qty,
  (SUM(pl.qty) - COALESCE(SUM(irl.received_qty), 0)) as difference,
  CASE 
    WHEN SUM(pl.qty) > COALESCE(SUM(irl.received_qty), 0) THEN '⚠️ Putaway > Received'
    WHEN SUM(pl.qty) < COALESCE(SUM(irl.received_qty), 0) THEN '✅ Putaway < Received'
    ELSE '✅ Match'
  END as status
FROM tabPutawayLine pl
LEFT JOIN tabInboundReceiveLine irl ON 
  irl.item_code = pl.item_code 
  AND irl.parent_title = 'SESSION-ASN12225-DEVICE001-USER786249'
WHERE pl.parent_title = 'PUT-20251230-0001'
GROUP BY pl.item_code
ORDER BY ABS(difference) DESC;

-- Step 7: Check specific items with high quantities
SELECT 
  '=== HIGH QUANTITY ITEMS BREAKDOWN ===' as Info;

SELECT 
  pl.carton_id,
  pl.item_code,
  pl.qty,
  pl.rack,
  pl.bin,
  pl.created_at,
  -- Check if this carton_id exists in events
  (SELECT COUNT(*) FROM tabWmsScanEvent WHERE box_id = pl.carton_id AND item_code = pl.item_code) as events_for_box,
  (SELECT SUM(qty) FROM tabWmsScanEvent WHERE box_id = pl.carton_id AND item_code = pl.item_code) as qty_from_events
FROM tabPutawayLine pl
WHERE pl.parent_title = 'PUT-20251230-0001'
  AND pl.item_code = 'SKU-HAT-301-RED-OS'  -- Check the high quantity item
ORDER BY pl.qty DESC, pl.carton_id;

-- Step 8: Check for duplicate processing (same item processed multiple times)
SELECT 
  '=== POTENTIAL DUPLICATE PROCESSING ===' as Info;

SELECT 
  pl1.carton_id,
  pl1.item_code,
  pl1.rack,
  pl1.bin,
  pl1.qty as qty_1,
  pl2.qty as qty_2,
  (pl1.qty + pl2.qty) as total_duplicate_qty,
  pl1.id as line_id_1,
  pl2.id as line_id_2
FROM tabPutawayLine pl1
INNER JOIN tabPutawayLine pl2 ON 
  pl1.parent_title = pl2.parent_title
  AND pl1.carton_id = pl2.carton_id
  AND pl1.item_code = pl2.item_code
  AND pl1.rack = pl2.rack
  AND pl1.bin = pl2.bin
  AND pl1.id < pl2.id
WHERE pl1.parent_title = 'PUT-20251230-0001'
ORDER BY total_duplicate_qty DESC;

-- Step 9: Check stock ledger for these items (where they actually are)
SELECT 
  '=== CURRENT STOCK IN LEDGER (Where Items Actually Are) ===' as Info;

SELECT 
  sl.item_code,
  sl.warehouse,
  sl.bin_location,
  sl.qty as current_stock,
  sl.last_transaction_type,
  sl.last_transaction_ref,
  sl.last_transaction_date
FROM tabStockLedger sl
WHERE sl.item_code IN (
  SELECT DISTINCT item_code 
  FROM tabPutawayLine 
  WHERE parent_title = 'PUT-20251230-0001'
)
ORDER BY sl.item_code, sl.bin_location;

-- Step 10: Check stock transactions (audit trail)
SELECT 
  '=== STOCK TRANSACTIONS (Audit Trail) ===' as Info;

SELECT 
  st.transaction_date,
  st.transaction_type,
  st.item_code,
  st.warehouse,
  st.bin_location,
  st.qty_change,
  st.qty_before,
  st.qty_after,
  st.reference_doc,
  st.performed_by
FROM tabStockTransaction st
WHERE st.item_code IN (
  SELECT DISTINCT item_code 
  FROM tabPutawayLine 
  WHERE parent_title = 'PUT-20251230-0001'
)
AND st.reference_doc LIKE '%PUT-20251230-0001%'
ORDER BY st.transaction_date DESC, st.item_code
LIMIT 50;

-- ============================================================
-- SUMMARY QUERIES
-- ============================================================

-- Summary: Total putaway by item
SELECT 
  '=== SUMMARY: TOTAL PUTAWAY BY ITEM ===' as Info;

SELECT 
  item_code,
  COUNT(*) as line_count,
  SUM(qty) as total_putaway_qty,
  COUNT(DISTINCT carton_id) as unique_cartons,
  COUNT(DISTINCT rack) as unique_racks
FROM tabPutawayLine
WHERE parent_title = 'PUT-20251230-0001'
GROUP BY item_code
ORDER BY total_putaway_qty DESC;

-- ============================================================
-- END OF SCRIPT
-- ============================================================

