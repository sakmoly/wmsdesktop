-- ============================================================
-- MIGRATION 007: Stock Ledger Carton-Level Support
-- ============================================================
-- This migration adds carton-level tracking to stock ledger
-- to support multiple putaway operations with different cartons
-- at the same bin location.
-- ============================================================

-- ============================================================
-- STEP 1: Add carton_id column to tabStockLedger if missing
-- ============================================================

-- Check if carton_id column exists
SET @column_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'tabStockLedger' 
    AND COLUMN_NAME = 'carton_id'
);

-- Add carton_id column if it doesn't exist
SET @sql = IF(@column_exists = 0,
    'ALTER TABLE tabStockLedger ADD COLUMN carton_id VARCHAR(80) NULL AFTER bin_location',
    'SELECT "Column carton_id already exists" AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- STEP 2: Remove old unique key constraint if it exists
-- ============================================================

-- Check if old unique key exists
SET @key_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'tabStockLedger' 
    AND INDEX_NAME = 'uk_item_warehouse_bin'
);

-- Drop old unique key if it exists
SET @sql = IF(@key_exists > 0,
    'ALTER TABLE tabStockLedger DROP INDEX uk_item_warehouse_bin',
    'SELECT "Index uk_item_warehouse_bin does not exist" AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- STEP 3: Add new unique key constraint with carton_id
-- ============================================================

-- Check if new unique key already exists
SET @new_key_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'tabStockLedger' 
    AND INDEX_NAME = 'uq_stockledger_item_bin_carton'
);

-- Add new unique key if it doesn't exist
SET @sql = IF(@new_key_exists = 0,
    'ALTER TABLE tabStockLedger ADD UNIQUE KEY uq_stockledger_item_bin_carton (warehouse, bin_location, item_code, carton_id)',
    'SELECT "Index uq_stockledger_item_bin_carton already exists" AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- STEP 4: Add index on carton_id for performance
-- ============================================================

-- Check if carton_id index exists
SET @carton_index_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'tabStockLedger' 
    AND INDEX_NAME = 'idx_carton_id'
);

-- Add index if it doesn't exist
SET @sql = IF(@carton_index_exists = 0,
    'ALTER TABLE tabStockLedger ADD INDEX idx_carton_id (carton_id)',
    'SELECT "Index idx_carton_id already exists" AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- STEP 5: Verify available_qty is calculated correctly
-- ============================================================

-- Check if available_qty is a generated column
SET @available_qty_type = (
    SELECT COLUMN_TYPE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'tabStockLedger' 
    AND COLUMN_NAME = 'available_qty'
);

-- If available_qty is not a generated column, we should update it
-- Note: This is informational only - the column should be: 
-- available_qty DECIMAL(10,2) AS (qty - reserved_qty) STORED

SELECT 
    'Migration 007 completed' AS status,
    @column_exists AS carton_id_column_exists,
    @key_exists AS old_key_exists,
    @new_key_exists AS new_key_exists,
    @carton_index_exists AS carton_index_exists,
    @available_qty_type AS available_qty_column_type;

-- ============================================================
-- STEP 6: Data Migration (Optional - for existing records)
-- ============================================================

-- If there are existing records without carton_id, they will remain with carton_id = NULL
-- This is acceptable as NULL carton_id represents bin-level stock (legacy records)
-- New putaway operations with carton_id will create separate ledger entries

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Verify table structure
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'tabStockLedger'
AND COLUMN_NAME IN ('carton_id', 'available_qty', 'qty', 'reserved_qty')
ORDER BY ORDINAL_POSITION;

-- Verify unique key constraint
SELECT 
    INDEX_NAME,
    GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'tabStockLedger'
AND INDEX_NAME IN ('uk_item_warehouse_bin', 'uq_stockledger_item_bin_carton')
GROUP BY INDEX_NAME;
