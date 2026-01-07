-- ============================================================
-- MIGRATION 003: Stock Tracking and Routing Logic
-- ============================================================
-- This migration adds:
-- 1. Real-time stock tracking (tabStockLedger, tabStockTransaction)
-- 2. Routing service support (no new tables, uses existing)
-- 3. Extends existing tables for routing logic
-- ============================================================

-- ============================================================
-- PART 1: Stock Ledger (Real-time stock by Item + Warehouse + Bin)
-- ============================================================

CREATE TABLE IF NOT EXISTS tabStockLedger (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL, -- NULL for warehouse-level stock (at dock)
  qty DECIMAL(10,2) NOT NULL DEFAULT 0,
  reserved_qty DECIMAL(10,2) DEFAULT 0,
  available_qty DECIMAL(10,2) AS (qty - reserved_qty) STORED,
  last_transaction_date TIMESTAMP NULL,
  last_transaction_type VARCHAR(50) NULL, -- 'Receiving', 'Putaway', 'Picking', 'CycleCount', etc.
  last_transaction_ref VARCHAR(100) NULL, -- Reference document
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_item_warehouse_bin (item_code, warehouse, bin_location),
  INDEX idx_item_code (item_code),
  INDEX idx_warehouse (warehouse),
  INDEX idx_bin_location (bin_location),
  INDEX idx_last_transaction_date (last_transaction_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PART 2: Stock Transaction Log (Audit trail of all stock movements)
-- ============================================================

CREATE TABLE IF NOT EXISTS tabStockTransaction (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transaction_date TIMESTAMP NOT NULL,
  transaction_type VARCHAR(50) NOT NULL, -- 'Receiving', 'Putaway', 'Picking', 'CycleCount', 'TransferIn', 'MaterialRequest'
  reference_doc_type VARCHAR(100) NULL, -- 'Advance Shipping Notice', 'Transfer In', 'Transfer Order', etc.
  reference_doc VARCHAR(100) NULL,
  wms_transaction_title VARCHAR(100) NULL, -- Link to tabWmsTransaction
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL,
  qty_change DECIMAL(10,2) NOT NULL, -- Positive for increase, negative for decrease
  qty_before DECIMAL(10,2) NOT NULL,
  qty_after DECIMAL(10,2) NOT NULL,
  source_bin VARCHAR(100) NULL, -- For transfers
  target_bin VARCHAR(100) NULL, -- For transfers
  performed_by VARCHAR(100) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transaction_date (transaction_date),
  INDEX idx_transaction_type (transaction_type),
  INDEX idx_reference_doc (reference_doc),
  INDEX idx_wms_transaction (wms_transaction_title),
  INDEX idx_item_code (item_code),
  INDEX idx_warehouse (warehouse),
  INDEX idx_bin_location (bin_location)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PART 3: Verify Transfer In tables exist (from MIGRATION_002)
-- ============================================================

-- Transfer In (from Showroom to Warehouse)
CREATE TABLE IF NOT EXISTS tabTransferIn (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft', -- Draft, Submitted, In Transit, Received, Completed
  from_showroom VARCHAR(100) NOT NULL,
  to_warehouse VARCHAR(100) NOT NULL,
  transfer_date DATE NOT NULL,
  expected_arrival_date DATE NULL,
  prepared_by VARCHAR(100) NOT NULL,
  received_by VARCHAR(100) NULL,
  received_on TIMESTAMP NULL,
  total_qty DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_from_showroom (from_showroom),
  INDEX idx_to_warehouse (to_warehouse),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transfer In Item (Child Table)
CREATE TABLE IF NOT EXISTS tabTransferInItem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  qty DECIMAL(10,2) NOT NULL,
  carton_id VARCHAR(100) NULL,
  received_qty DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  FOREIGN KEY (parent_title) REFERENCES tabTransferIn(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PART 4: Verify Cycle Count tables exist (from MIGRATION_002)
-- ============================================================

-- Cycle Count Task
CREATE TABLE IF NOT EXISTS tabCycleCountTask (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft', -- Draft, Scheduled, In Progress, Completed, Cancelled
  count_type VARCHAR(50) NOT NULL, -- 'Full', 'Cycle', 'Spot'
  warehouse VARCHAR(100) NOT NULL,
  zone VARCHAR(100) NULL,
  count_date DATE NOT NULL,
  scheduled_start_time TIME NULL,
  scheduled_end_time TIME NULL,
  freeze_stock BOOLEAN DEFAULT FALSE,
  created_by VARCHAR(100) NOT NULL,
  assigned_to VARCHAR(100) NULL,
  total_items INT DEFAULT 0,
  counted_items INT DEFAULT 0,
  items_with_discrepancy INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_warehouse (warehouse),
  INDEX idx_zone (zone),
  INDEX idx_count_date (count_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cycle Count Line
CREATE TABLE IF NOT EXISTS tabCycleCountLine (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL,
  expected_qty DECIMAL(10,2) NOT NULL,
  actual_qty DECIMAL(10,2) NULL,
  discrepancy DECIMAL(10,2) AS (COALESCE(actual_qty, 0) - expected_qty) STORED,
  counted_by VARCHAR(100) NULL,
  counted_on TIMESTAMP NULL,
  reviewed_by VARCHAR(100) NULL,
  reviewed_on TIMESTAMP NULL,
  approval_required BOOLEAN DEFAULT FALSE,
  approved_by VARCHAR(100) NULL,
  approved_on TIMESTAMP NULL,
  discrepancy_reason TEXT NULL,
  status VARCHAR(50) DEFAULT 'Pending', -- Pending, Counted, Reviewed, Approved, Rejected
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  INDEX idx_bin_location (bin_location),
  INDEX idx_status (status),
  FOREIGN KEY (parent_title) REFERENCES tabCycleCountTask(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PART 5: Verify existing table extensions (from MIGRATION_002)
-- ============================================================

-- Extend Putaway Task (if not already done)
-- Note: Errors for duplicate columns will be caught and ignored by migration script
ALTER TABLE tabPutawayTask 
ADD COLUMN source_type VARCHAR(50) DEFAULT 'ASN' AFTER status;

ALTER TABLE tabPutawayTask 
ADD COLUMN transfer_in VARCHAR(100) NULL AFTER advance_shipping_notice;

-- Create indexes (errors for duplicate indexes will be caught and ignored)
CREATE INDEX idx_source_type ON tabPutawayTask(source_type);

CREATE INDEX idx_transfer_in_putaway ON tabPutawayTask(transfer_in);

-- Update existing records to have default source_type (if column exists)
UPDATE tabPutawayTask SET source_type = 'ASN' WHERE source_type IS NULL OR source_type = '';

-- Extend Inbound Session (if not already done)
-- Note: Errors for duplicate columns will be caught and ignored by migration script
ALTER TABLE tabInboundSession 
ADD COLUMN transfer_in VARCHAR(100) NULL AFTER transfer_order;

-- Create index (errors for duplicate indexes will be caught and ignored)
CREATE INDEX idx_transfer_in_inbound ON tabInboundSession(transfer_in);

-- ============================================================
-- PART 6: Initial Data Setup (Optional)
-- ============================================================

-- Note: Stock ledger will be populated automatically as transactions occur
-- No initial data needed for stock tracking tables

-- ============================================================
-- PART 7: Verification Queries
-- ============================================================

-- Verify tables created
SELECT 
    'tabStockLedger' as table_name,
    COUNT(*) as exists_check
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'tabStockLedger'

UNION ALL

SELECT 
    'tabStockTransaction' as table_name,
    COUNT(*) as exists_check
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'tabStockTransaction'

UNION ALL

SELECT 
    'tabTransferIn' as table_name,
    COUNT(*) as exists_check
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'tabTransferIn'

UNION ALL

SELECT 
    'tabCycleCountTask' as table_name,
    COUNT(*) as exists_check
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'tabCycleCountTask';

-- Verify columns added
SELECT 
    'tabPutawayTask.source_type' as column_check,
    COUNT(*) as exists_check
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'tabPutawayTask' 
AND COLUMN_NAME = 'source_type'

UNION ALL

SELECT 
    'tabInboundSession.transfer_in' as column_check,
    COUNT(*) as exists_check
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'tabInboundSession' 
AND COLUMN_NAME = 'transfer_in';

