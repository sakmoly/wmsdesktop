-- Migration 006: Make expected_qty nullable in tabCycleCountLine
-- This allows ad-hoc cycle counts without previous history

-- Step 1: Make expected_qty nullable with default 0
ALTER TABLE tabCycleCountLine
MODIFY COLUMN expected_qty DECIMAL(10,2) NULL DEFAULT 0;

-- Step 2: Update discrepancy calculation to handle NULL expected_qty
-- Note: If discrepancy is a computed column, we may need to drop and recreate it
-- Check if discrepancy is a generated column first

-- For MySQL, if discrepancy is a STORED GENERATED column, we need to:
-- 1. Drop the old column
-- 2. Recreate it with NULL handling

-- Check current discrepancy column definition
-- If it's: discrepancy DECIMAL(10,2) AS (COALESCE(actual_qty, 0) - expected_qty) STORED
-- We need to change it to handle NULL expected_qty

ALTER TABLE tabCycleCountLine
DROP COLUMN IF EXISTS discrepancy;

ALTER TABLE tabCycleCountLine
ADD COLUMN discrepancy DECIMAL(10,2) AS (
  CASE 
    WHEN actual_qty IS NOT NULL AND expected_qty IS NOT NULL 
    THEN (actual_qty - expected_qty)
    ELSE NULL
  END
) STORED;

-- Verify the changes
SELECT 
  COLUMN_NAME,
  IS_NULLABLE,
  COLUMN_TYPE,
  COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabCycleCountLine'
  AND COLUMN_NAME IN ('expected_qty', 'discrepancy')
ORDER BY COLUMN_NAME;

