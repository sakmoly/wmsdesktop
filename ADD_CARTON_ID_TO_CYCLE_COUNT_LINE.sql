-- ============================================================
-- Add carton_id column to tabCycleCountLine
-- ============================================================
-- This script safely adds the carton_id column if it doesn't exist
-- Run this script to fix the "Unknown column 'carton_id'" error
-- ============================================================

-- Check if column exists and add it if it doesn't
SET @db_name = DATABASE();
SET @table_name = 'tabCycleCountLine';
SET @column_name = 'carton_id';

-- Check if column exists
SELECT COUNT(*) INTO @column_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = @db_name
  AND TABLE_NAME = @table_name
  AND COLUMN_NAME = @column_name;

-- Add column if it doesn't exist
SET @sql = IF(@column_exists = 0,
    CONCAT('ALTER TABLE ', @table_name, ' ADD COLUMN carton_id VARCHAR(100) NULL AFTER bin_location'),
    'SELECT "Column carton_id already exists" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index if column was added (or if it exists but index doesn't)
SELECT COUNT(*) INTO @index_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = @db_name
  AND TABLE_NAME = @table_name
  AND INDEX_NAME = 'idx_carton_id';

SET @index_sql = IF(@index_exists = 0 AND @column_exists = 0,
    CONCAT('ALTER TABLE ', @table_name, ' ADD INDEX idx_carton_id (carton_id)'),
    IF(@index_exists = 0,
        CONCAT('ALTER TABLE ', @table_name, ' ADD INDEX idx_carton_id (carton_id)'),
        'SELECT "Index idx_carton_id already exists" AS message'
    )
);

PREPARE idx_stmt FROM @index_sql;
EXECUTE idx_stmt;
DEALLOCATE PREPARE idx_stmt;

-- Verify the column was added
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = @db_name
  AND TABLE_NAME = @table_name
  AND COLUMN_NAME = @column_name;

SELECT 'carton_id column added successfully!' AS status;

