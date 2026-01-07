-- Migration 002: Transfer In, Cycle Count, and Extended Tables
-- This migration creates tables for Transfer In, Cycle Count, and extends existing tables

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
  INDEX idx_status (status),
  INDEX idx_transfer_date (transfer_date)
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

-- Cycle Count Task (Parent)
CREATE TABLE IF NOT EXISTS tabCycleCountTask (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft', -- Draft, In Progress, Counting, Review, Completed, Cancelled
  count_type VARCHAR(50) NOT NULL, -- 'Full', 'Cycle', 'Spot'
  warehouse VARCHAR(100) NOT NULL,
  zone VARCHAR(100) NULL, -- NULL for Full count
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
  INDEX idx_count_type (count_type),
  INDEX idx_warehouse (warehouse),
  INDEX idx_zone (zone),
  INDEX idx_count_date (count_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cycle Count Line (Child Table)
CREATE TABLE IF NOT EXISTS tabCycleCountLine (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL, -- NULL if counting by item only
  expected_qty DECIMAL(10,2) NOT NULL, -- From tabStockLedger
  actual_qty DECIMAL(10,2) NULL, -- Entered by operator
  discrepancy DECIMAL(10,2) AS (COALESCE(actual_qty, 0) - expected_qty) STORED,
  counted_by VARCHAR(100) NULL,
  counted_on TIMESTAMP NULL,
  reviewed_by VARCHAR(100) NULL,
  reviewed_on TIMESTAMP NULL,
  approval_required BOOLEAN DEFAULT FALSE, -- TRUE if discrepancy exceeds threshold
  approved_by VARCHAR(100) NULL,
  approved_on TIMESTAMP NULL,
  discrepancy_reason TEXT NULL,
  status VARCHAR(50) DEFAULT 'Pending', -- Pending, Counting, Counted, Reviewed, Approved, Adjusted
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  INDEX idx_bin_location (bin_location),
  INDEX idx_status (status),
  INDEX idx_discrepancy (discrepancy),
  FOREIGN KEY (parent_title) REFERENCES tabCycleCountTask(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cycle Count Settings (Configuration)
CREATE TABLE IF NOT EXISTS tabCycleCountSettings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  warehouse VARCHAR(100) NOT NULL,
  zone VARCHAR(100) NULL, -- NULL for warehouse-wide settings
  count_frequency VARCHAR(50) DEFAULT 'Monthly', -- Daily, Weekly, Monthly, Quarterly, Annually
  discrepancy_threshold_percent DECIMAL(5,2) DEFAULT 5.00, -- Require approval if > 5%
  discrepancy_threshold_qty DECIMAL(10,2) DEFAULT 10.00, -- Require approval if > 10 units
  auto_adjust_small_discrepancies BOOLEAN DEFAULT FALSE, -- Auto-adjust if below threshold
  freeze_stock_during_count BOOLEAN DEFAULT TRUE,
  require_approval_for_negative BOOLEAN DEFAULT TRUE, -- Always require approval for stock loss
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_warehouse_zone (warehouse, zone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extend Putaway Task Table
ALTER TABLE tabPutawayTask 
ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'ASN' AFTER status,
ADD COLUMN IF NOT EXISTS transfer_in VARCHAR(100) NULL AFTER advance_shipping_notice;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_source_type ON tabPutawayTask(source_type);
CREATE INDEX IF NOT EXISTS idx_transfer_in ON tabPutawayTask(transfer_in);

-- Update existing records
UPDATE tabPutawayTask SET source_type = 'ASN' WHERE source_type IS NULL OR source_type = '';

-- Extend Inbound Session Table
ALTER TABLE tabInboundSession 
ADD COLUMN IF NOT EXISTS transfer_in VARCHAR(100) NULL AFTER transfer_order;

-- Create index for new column
CREATE INDEX IF NOT EXISTS idx_transfer_in ON tabInboundSession(transfer_in);

-- Material Request (from Warehouse to Showroom)
CREATE TABLE IF NOT EXISTS tabMaterialRequest (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft', -- Draft, Submitted, In Progress, Picked, Dispatched, Completed
  from_warehouse VARCHAR(100) NOT NULL, -- Warehouse code
  to_showroom VARCHAR(100) NOT NULL, -- Showroom code/name
  requested_date DATE NOT NULL,
  required_date DATE NULL,
  requested_by VARCHAR(100) NOT NULL,
  total_requested_qty DECIMAL(10,2) DEFAULT 0,
  total_picked_qty DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_from_warehouse (from_warehouse),
  INDEX idx_to_showroom (to_showroom),
  INDEX idx_status (status),
  INDEX idx_required_date (required_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Material Request Item (Child Table)
CREATE TABLE IF NOT EXISTS tabMaterialRequestItem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  requested_qty DECIMAL(10,2) NOT NULL,
  picked_qty DECIMAL(10,2) DEFAULT 0,
  pending_qty DECIMAL(10,2) AS (requested_qty - picked_qty) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  FOREIGN KEY (parent_title) REFERENCES tabMaterialRequest(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verification Queries
SELECT 'Transfer In Table Created' as Status;
SELECT COUNT(*) as existing_records FROM tabTransferIn;

SELECT 'Material Request Table Created' as Status;
SELECT COUNT(*) as existing_records FROM tabMaterialRequest;

SELECT 'Cycle Count Task Table Created' as Status;
SELECT COUNT(*) as existing_records FROM tabCycleCountTask;

SELECT 'Putaway Task Extended' as Status;
SELECT source_type, COUNT(*) as count FROM tabPutawayTask GROUP BY source_type;

SELECT 'Inbound Session Extended' as Status;
SELECT COUNT(*) as total_sessions, 
       COUNT(transfer_in) as sessions_with_transfer_in 
FROM tabInboundSession;

