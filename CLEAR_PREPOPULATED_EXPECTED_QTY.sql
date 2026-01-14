-- Set expected_qty to 0 for cycle count lines that were pre-populated
-- Only keep expected_qty > 0 if it comes from actual stock ledger data
-- This script sets expected_qty to 0 for lines that don't have actual stock history

-- Set all expected_qty to 0 for lines that have actual_qty (ad-hoc counts don't have previous history)
-- expected_qty should only come from stock ledger lookup, not from carton pre-population
UPDATE tabCycleCountLine
SET expected_qty = 0
WHERE actual_qty IS NOT NULL;

-- Also set expected_qty to 0 for all lines in Draft/In Progress tasks (they shouldn't have expected_qty > 0 yet)
UPDATE tabCycleCountLine
SET expected_qty = 0
WHERE parent_title IN (
  SELECT title FROM tabCycleCountTask WHERE status IN ('Draft', 'In Progress')
);

-- Verify the changes
SELECT 
  parent_title,
  item_code,
  bin_location,
  carton_id,
  expected_qty,
  actual_qty,
  status
FROM tabCycleCountLine
WHERE actual_qty IS NOT NULL
ORDER BY parent_title, item_code;

