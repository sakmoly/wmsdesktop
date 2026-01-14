-- Performance Optimization: Add Missing Indexes
-- This script adds composite indexes to improve query performance

USE wms_desktop;

-- ============================================================
-- 1. OPTIMIZE tabCartonStock
-- ============================================================

-- Composite index for item+warehouse+status queries (used in Item Location Breakdown)
CREATE INDEX IF NOT EXISTS idx_carton_item_warehouse_status 
ON tabCartonStock(item_code, warehouse, status, qty, bin_location);

-- Composite index for the latest record query
CREATE INDEX IF NOT EXISTS idx_carton_item_warehouse_bin_id 
ON tabCartonStock(item_code, warehouse, bin_location, id DESC);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_carton_status_qty 
ON tabCartonStock(status, qty) WHERE qty > 0;

SELECT '✅ Step 1: tabCartonStock indexes created' as Status;

-- ============================================================
-- 2. OPTIMIZE tabStockLedger
-- ============================================================

-- Composite index for item+warehouse queries
CREATE INDEX IF NOT EXISTS idx_stock_item_warehouse_bin 
ON tabStockLedger(item_code, warehouse, bin_location);

-- Index for reserved_qty queries
CREATE INDEX IF NOT EXISTS idx_stock_reserved 
ON tabStockLedger(item_code, warehouse, reserved_qty) WHERE reserved_qty > 0;

SELECT '✅ Step 2: tabStockLedger indexes created' as Status;

-- ============================================================
-- 3. OPTIMIZE tabLocation
-- ============================================================

-- Composite index for location matching (used in Item Location Breakdown)
CREATE INDEX IF NOT EXISTS idx_location_warehouse_bin 
ON tabLocation(warehouse, bin_id, location_id);

-- Index for parent_rack matching
CREATE INDEX IF NOT EXISTS idx_location_warehouse_rack 
ON tabLocation(warehouse, parent_rack, bin_id);

SELECT '✅ Step 3: tabLocation indexes created' as Status;

-- ============================================================
-- 4. OPTIMIZE tabTransactionHistory
-- ============================================================

-- Composite index for date range queries (most common)
CREATE INDEX IF NOT EXISTS idx_history_date_desc 
ON tabTransactionHistory(transaction_date DESC, id DESC);

-- Composite index for item+date queries
CREATE INDEX IF NOT EXISTS idx_history_item_date 
ON tabTransactionHistory(item_code, transaction_date DESC, id DESC);

-- Composite index for warehouse+date queries
CREATE INDEX IF NOT EXISTS idx_history_warehouse_date 
ON tabTransactionHistory(warehouse, transaction_date DESC, id DESC);

-- Composite index for type+date queries
CREATE INDEX IF NOT EXISTS idx_history_type_date 
ON tabTransactionHistory(transaction_type, transaction_date DESC, id DESC);

-- Composite index for carton+date queries
CREATE INDEX IF NOT EXISTS idx_history_carton_date 
ON tabTransactionHistory(carton_id, transaction_date DESC, id DESC) WHERE carton_id IS NOT NULL;

SELECT '✅ Step 4: tabTransactionHistory indexes created' as Status;

-- ============================================================
-- 5. VERIFY INDEXES
-- ============================================================

SELECT 
    TABLE_NAME,
    INDEX_NAME,
    GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as COLUMNS
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('tabCartonStock', 'tabStockLedger', 'tabLocation', 'tabTransactionHistory')
  AND INDEX_NAME != 'PRIMARY'
GROUP BY TABLE_NAME, INDEX_NAME
ORDER BY TABLE_NAME, INDEX_NAME;

SELECT '✅ Step 5: Index verification complete' as Status;
