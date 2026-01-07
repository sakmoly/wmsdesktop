-- Migration 001: Stock Ledger and Real-Time Stock Tracking
-- This migration creates tables for real-time stock tracking by Item + Warehouse + Bin

-- Stock Ledger (Real-time stock tracking by Item + Warehouse + Bin)
CREATE TABLE IF NOT EXISTS tabStockLedger (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL, -- NULL for warehouse-level stock (e.g., at dock)
  qty DECIMAL(10,2) NOT NULL DEFAULT 0,
  reserved_qty DECIMAL(10,2) DEFAULT 0,
  available_qty DECIMAL(10,2) AS (qty - reserved_qty) STORED,
  last_transaction_date TIMESTAMP NULL,
  last_transaction_type VARCHAR(50) NULL, -- 'Receiving', 'Putaway', 'Picking', 'CycleCount', 'TransferIn', 'MaterialRequest'
  last_transaction_ref VARCHAR(100) NULL, -- Reference document (ASN, TO, etc.)
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_item_warehouse_bin (item_code, warehouse, bin_location),
  INDEX idx_item_code (item_code),
  INDEX idx_warehouse (warehouse),
  INDEX idx_bin_location (bin_location),
  INDEX idx_last_transaction_date (last_transaction_date),
  INDEX idx_item_warehouse (item_code, warehouse)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stock Transaction Log (Complete audit trail of all stock movements)
CREATE TABLE IF NOT EXISTS tabStockTransaction (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transaction_date TIMESTAMP NOT NULL,
  transaction_type VARCHAR(50) NOT NULL, -- 'Receiving', 'Putaway', 'Picking', 'CycleCount', 'TransferIn', 'MaterialRequest'
  reference_doc_type VARCHAR(100) NULL, -- 'Advance Shipping Notice', 'Transfer In', 'Transfer Order', 'Material Request', 'Putaway Task', 'Cycle Count Task'
  reference_doc VARCHAR(100) NULL, -- ASN-0001, TI-0001, TO-0002, MR-0001, PUT-0001, CC-0001
  wms_transaction_title VARCHAR(100) NULL, -- Link to tabWmsTransaction.title
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL,
  qty_change DECIMAL(10,2) NOT NULL, -- Positive for increase, negative for decrease
  qty_before DECIMAL(10,2) NOT NULL,
  qty_after DECIMAL(10,2) NOT NULL,
  source_bin VARCHAR(100) NULL, -- For transfers (e.g., DOCK-01)
  target_bin VARCHAR(100) NULL, -- For transfers (e.g., RACK-A-01-BIN-05)
  performed_by VARCHAR(100) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_transaction_date (transaction_date),
  INDEX idx_transaction_type (transaction_type),
  INDEX idx_reference_doc (reference_doc),
  INDEX idx_wms_transaction (wms_transaction_title),
  INDEX idx_item_code (item_code),
  INDEX idx_warehouse (warehouse),
  INDEX idx_bin_location (bin_location),
  INDEX idx_item_warehouse_date (item_code, warehouse, transaction_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verification Queries
SELECT 'Stock Ledger Table Created' as Status;
SELECT COUNT(*) as existing_records FROM tabStockLedger;

SELECT 'Stock Transaction Table Created' as Status;
SELECT COUNT(*) as existing_records FROM tabStockTransaction;

