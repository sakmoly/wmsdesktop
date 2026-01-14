-- ============================================================
-- MIGRATION: Update Discrepancy to Return 0 Instead of NULL
-- ============================================================
-- This migration fixes the discrepancy column in tabCycleCountLine
-- to ensure it always returns 0 instead of NULL when there's no value
-- 
-- Issue: Discrepancy is a GENERATED COLUMN that calculates actual_qty - expected_qty
-- When actual_qty is NULL, the calculation results in NULL
-- Solution: Update the generated column formula to use COALESCE to return 0
-- ============================================================

-- Step 1: Check current discrepancy column definition
SELECT 
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  GENERATION_EXPRESSION,
  EXTRA
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabCycleCountLine'
  AND COLUMN_NAME = 'discrepancy';

-- Step 2: Update expected_qty to 0 where it's NULL (if needed)
-- This ensures expected_qty is always 0, not NULL, for consistent discrepancy calculation
UPDATE tabCycleCountLine
SET expected_qty = 0
WHERE expected_qty IS NULL;

-- Step 3: Ensure actual_qty is set to 0 where it's NULL for records that should be counted
-- Note: Only update records that have been counted (status = 'Counted' or counted_by is not null)
-- But keep NULL for records that haven't been counted yet
-- Actually, let's NOT do this - we want actual_qty to remain NULL if not counted yet
-- The discrepancy formula should handle NULL actual_qty by returning 0

-- Step 4: Drop and recreate discrepancy column with improved formula
-- The new formula: COALESCE(actual_qty, 0) - COALESCE(expected_qty, 0)
-- This ensures discrepancy is always calculated and never NULL
-- IMPORTANT: This formula always returns a number (0 when actual_qty is NULL)

-- Note: We need to drop the index first if it exists, then drop the column
-- Drop index if exists (MySQL doesn't support IF EXISTS for DROP INDEX, so we'll use a procedure)
SET @index_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.STATISTICS 
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tabCycleCountLine'
    AND INDEX_NAME = 'idx_discrepancy'
);

SET @sql = IF(@index_exists > 0, 
  'ALTER TABLE tabCycleCountLine DROP INDEX idx_discrepancy',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Drop the existing discrepancy column
ALTER TABLE tabCycleCountLine
DROP COLUMN discrepancy;

-- Recreate discrepancy column with improved formula that handles NULL values
-- Formula: CASE WHEN actual_qty IS NULL THEN 0 ELSE (actual_qty - COALESCE(expected_qty, 0)) END
-- This ensures:
-- - When actual_qty is NULL (not counted yet): discrepancy = 0 (no variance calculated yet)
-- - When actual_qty exists: discrepancy = actual_qty - expected_qty (normal calculation)
-- - When expected_qty is NULL: discrepancy = actual_qty - 0 = actual_qty (opening stock)
-- IMPORTANT: This formula NEVER returns NULL - always returns a number
ALTER TABLE tabCycleCountLine
ADD COLUMN discrepancy DECIMAL(10,2) AS (
  CASE 
    WHEN actual_qty IS NULL THEN 0
    ELSE (actual_qty - COALESCE(expected_qty, 0))
  END
) STORED;

-- Step 5: Recreate index on discrepancy (if it existed before)
-- Check if index exists first (optional, MySQL will handle duplicate index error)
CREATE INDEX IF NOT EXISTS idx_discrepancy ON tabCycleCountLine(discrepancy);

-- Step 6: Verify the changes
SELECT 
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  GENERATION_EXPRESSION,
  EXTRA
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabCycleCountLine'
  AND COLUMN_NAME = 'discrepancy';

-- Step 7: Verify discrepancy values are correct (no NULLs)
SELECT 
  id,
  item_code,
  expected_qty,
  actual_qty,
  discrepancy,
  CASE 
    WHEN discrepancy IS NULL THEN '❌ NULL (should be 0)'
    WHEN discrepancy = 0 THEN '✅ 0 (correct)'
    ELSE CONCAT('✅ ', discrepancy, ' (variance)')
  END as discrepancy_status
FROM tabCycleCountLine
ORDER BY id DESC
LIMIT 50;

-- Step 8: Count records with NULL discrepancy (should be 0 after this migration)
SELECT 
  COUNT(*) as total_records,
  COUNT(discrepancy) as records_with_discrepancy,
  SUM(CASE WHEN discrepancy IS NULL THEN 1 ELSE 0 END) as records_with_null_discrepancy,
  SUM(CASE WHEN discrepancy = 0 THEN 1 ELSE 0 END) as records_with_zero_discrepancy,
  SUM(CASE WHEN discrepancy != 0 THEN 1 ELSE 0 END) as records_with_variance
FROM tabCycleCountLine;

-- ============================================================
-- Summary:
-- 1. Updated expected_qty to 0 where it was NULL
-- 2. Recreated discrepancy column with formula: COALESCE(actual_qty, 0) - COALESCE(expected_qty, 0)
-- 3. This ensures discrepancy is always calculated and never NULL
-- 4. When actual_qty is NULL (not counted yet), discrepancy = 0 - expected_qty = -expected_qty
-- 5. When actual_qty exists, discrepancy = actual_qty - expected_qty (normal calculation)
-- 6. When both are NULL or 0, discrepancy = 0 - 0 = 0
-- ============================================================

-- Note: The API layer (formatCycleCountLine) also handles NULL discrepancy values
-- by returning 0 instead of NULL. This provides double protection:
-- 1. Database level: Generated column formula handles NULLs
-- 2. API level: formatCycleCountLine function ensures 0 instead of NULL
-- ============================================================
