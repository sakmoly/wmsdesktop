-- ============================================================
-- Simple script to add carton_id column to tabCycleCountLine
-- ============================================================
-- Run this script in your MySQL client or via command line
-- ============================================================

-- Add carton_id column (will fail if column already exists - that's OK)
ALTER TABLE tabCycleCountLine 
ADD COLUMN carton_id VARCHAR(100) NULL AFTER bin_location;

-- Add index for carton_id (will fail if index already exists - that's OK)
ALTER TABLE tabCycleCountLine 
ADD INDEX idx_carton_id (carton_id);

-- Verify the column was added
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tabCycleCountLine'
  AND COLUMN_NAME = 'carton_id';

SELECT '✅ carton_id column added successfully!' AS status;

