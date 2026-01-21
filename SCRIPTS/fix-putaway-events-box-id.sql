-- Fix Putaway Events: Move box_id from tc_id to box_id column
-- This fixes the issue where putaway box IDs were stored in tc_id instead of box_id
-- Date: 2026-01-19

-- Step 1: Update PUTAWAY_TO_RACK events
UPDATE tabwmsscanevent
SET box_id = tc_id, tc_id = NULL
WHERE event_type = 'PUTAWAY_TO_RACK'
  AND box_id IS NULL
  AND tc_id IS NOT NULL
  AND (tc_id LIKE 'PAW-ASN%' OR tc_id LIKE 'BOX-%');

-- Step 2: Update other putaway-related events
UPDATE tabwmsscanevent
SET box_id = tc_id, tc_id = NULL
WHERE event_type IN ('PUTAWAY_TO_RACK', 'PUTAWAY_CONFIRM', 'PUTAWAY_COMPLETE', 'SORT_TO_BOX')
  AND box_id IS NULL
  AND tc_id IS NOT NULL
  AND (tc_id LIKE 'PAW-ASN%' OR tc_id LIKE 'BOX-%');

-- Step 3: Verify the fix
SELECT 
  event_type,
  COUNT(*) as total_events,
  SUM(CASE WHEN box_id IS NOT NULL THEN 1 ELSE 0 END) as has_box_id,
  SUM(CASE WHEN tc_id IS NOT NULL THEN 1 ELSE 0 END) as has_tc_id
FROM tabwmsscanevent
WHERE event_type IN ('PUTAWAY_TO_RACK', 'PUTAWAY_CONFIRM', 'PUTAWAY_COMPLETE', 'SORT_TO_BOX')
GROUP BY event_type;

-- Expected result:
-- PUTAWAY_TO_RACK events should have box_id filled and tc_id NULL
-- SORT_TO_BOX events should have box_id filled
