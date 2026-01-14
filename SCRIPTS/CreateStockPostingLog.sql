-- ============================================================
-- CREATE STOCK POSTING LOG TABLE
-- ============================================================
-- This table ensures idempotency for stock posting operations
-- Prevents duplicate stock updates from the same transaction
-- ============================================================

CREATE TABLE IF NOT EXISTS tabStockPostingLog (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  posting_key VARCHAR(255) NOT NULL UNIQUE,
  transaction_type VARCHAR(50) NOT NULL,
  transaction_id VARCHAR(100) NOT NULL,
  item_codes TEXT NULL, -- JSON array of affected item codes
  warehouse VARCHAR(100) NULL,
  posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  posted_by VARCHAR(100) NULL,
  notes TEXT NULL,
  INDEX idx_transaction_type (transaction_type),
  INDEX idx_transaction_id (transaction_id),
  INDEX idx_posted_at (posted_at),
  INDEX idx_warehouse (warehouse)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- VERIFICATION
-- ============================================================

SELECT 'Stock Posting Log table created successfully' as status;
