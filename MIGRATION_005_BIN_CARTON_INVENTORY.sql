-- ============================================================
-- MIGRATION 005: Bin + Carton Level Inventory Support
-- ============================================================
-- This migration adds support for carton-level inventory tracking
-- alongside existing bin-level tracking
-- ============================================================

-- ============================================================
-- PART 1: Bin Master Table
-- ============================================================

CREATE TABLE IF NOT EXISTS tabBin (
  bin_id VARCHAR(100) PRIMARY KEY,
  warehouse_id VARCHAR(100) NOT NULL,
  zone VARCHAR(100) NULL,
  aisle VARCHAR(100) NULL,
  rack VARCHAR(100) NULL,
  level VARCHAR(100) NULL,
  position VARCHAR(100) NULL,
  barcode VARCHAR(100) NULL,
  is_active BOOLEAN DEFAULT TRUE,
  bin_type VARCHAR(50) DEFAULT 'STORAGE',
  -- STORAGE, DOCK, STAGING, PICK, DAMAGE, QA
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_warehouse (warehouse_id),
  INDEX idx_bin_type (bin_type),
  INDEX idx_barcode (barcode),
  INDEX idx_warehouse_type (warehouse_id, bin_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PART 2: Carton Master Table
-- ============================================================

CREATE TABLE IF NOT EXISTS tabCarton (
  carton_id VARCHAR(100) PRIMARY KEY,
  asn_no VARCHAR(100) NULL,
  supplier_carton_barcode VARCHAR(100) NULL,
  status VARCHAR(50) DEFAULT 'RECEIVED_NOT_PUTAWAY',
  -- RECEIVED_NOT_PUTAWAY, PUTAWAY, PICKED, SHIPPED, ADJUSTED
  current_bin_id VARCHAR(100) NULL,
  warehouse VARCHAR(100) NOT NULL,
  last_moved_on TIMESTAMP NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  remarks TEXT NULL,
  INDEX idx_asn_no (asn_no),
  INDEX idx_status (status),
  INDEX idx_current_bin (current_bin_id),
  INDEX idx_warehouse (warehouse),
  INDEX idx_warehouse_status (warehouse, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PART 3: Carton Item Table
-- ============================================================

CREATE TABLE IF NOT EXISTS tabCartonItem (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  carton_id VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  uom VARCHAR(50) NOT NULL,
  qty DECIMAL(10,2) NOT NULL,
  batch_no VARCHAR(100) NULL,
  serial_no VARCHAR(100) NULL,
  is_closed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (carton_id) REFERENCES tabCarton(carton_id) ON DELETE CASCADE,
  INDEX idx_carton_id (carton_id),
  INDEX idx_item_code (item_code),
  INDEX idx_batch_no (batch_no),
  INDEX idx_carton_item (carton_id, item_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PART 4: Carton Stock Table (Carton-Level Inventory)
-- ============================================================

CREATE TABLE IF NOT EXISTS tabCartonStock (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  carton_id VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NOT NULL,
  qty DECIMAL(10,2) NOT NULL DEFAULT 0,
  uom VARCHAR(50) NULL,
  batch_no VARCHAR(100) NULL,
  serial_no VARCHAR(100) NULL,
  status VARCHAR(50) DEFAULT 'PUTAWAY',
  -- PUTAWAY, PICKED, SHIPPED, ADJUSTED
  last_moved_on TIMESTAMP NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_carton_item_batch (carton_id, item_code, batch_no),
  INDEX idx_carton_id (carton_id),
  INDEX idx_item_code (item_code),
  INDEX idx_warehouse (warehouse),
  INDEX idx_bin_location (bin_location),
  INDEX idx_status (status),
  INDEX idx_warehouse_bin (warehouse, bin_location),
  INDEX idx_item_warehouse_bin (item_code, warehouse, bin_location)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PART 5: Extend Stock Transaction Table
-- ============================================================

-- Add carton_id column to stock transaction (if not exists)
-- Using a stored procedure approach that works with statement splitting
-- First, check if column exists, then add if it doesn't
-- Note: This will be handled by the MigrationService to check before adding

-- ============================================================
-- PART 6: Create Default Bins (if needed)
-- ============================================================

-- Insert default DOCK bin for each warehouse (if not exists)
INSERT IGNORE INTO tabBin (bin_id, warehouse_id, bin_type, is_active)
SELECT 
    CONCAT(warehouse, '-DOCK-01') as bin_id,
    warehouse as warehouse_id,
    'DOCK' as bin_type,
    TRUE as is_active
FROM (
    SELECT DISTINCT warehouse 
    FROM tabStockLedger 
    WHERE warehouse IS NOT NULL
    UNION
    SELECT DISTINCT name as warehouse 
    FROM tabWarehouse 
    WHERE name IS NOT NULL
) AS warehouses
WHERE NOT EXISTS (
    SELECT 1 FROM tabBin 
    WHERE warehouse_id = warehouses.warehouse 
    AND bin_type = 'DOCK'
);

-- Insert default STAGING bin for each warehouse (if not exists)
INSERT IGNORE INTO tabBin (bin_id, warehouse_id, bin_type, is_active)
SELECT 
    CONCAT(warehouse, '-STAGING-01') as bin_id,
    warehouse as warehouse_id,
    'STAGING' as bin_type,
    TRUE as is_active
FROM (
    SELECT DISTINCT warehouse 
    FROM tabStockLedger 
    WHERE warehouse IS NOT NULL
    UNION
    SELECT DISTINCT name as warehouse 
    FROM tabWarehouse 
    WHERE name IS NOT NULL
) AS warehouses
WHERE NOT EXISTS (
    SELECT 1 FROM tabBin 
    WHERE warehouse_id = warehouses.warehouse 
    AND bin_type = 'STAGING'
);

-- ============================================================
-- PART 7: Add carton_id to tabCycleCountLine (for carton-level cycle counting)
-- ============================================================
-- This allows tracking which specific carton is being counted
-- in carton-level inventory mode

ALTER TABLE tabCycleCountLine
ADD COLUMN IF NOT EXISTS carton_id VARCHAR(100) NULL AFTER bin_location;

-- Add index for carton_id if it doesn't exist
-- Note: MySQL doesn't support IF NOT EXISTS for indexes, so we'll handle this in MigrationService

-- ============================================================
-- PART 8: Migration Complete
-- ============================================================

SELECT 'Migration 005: Bin + Carton Level Inventory Support - COMPLETE' AS status;

