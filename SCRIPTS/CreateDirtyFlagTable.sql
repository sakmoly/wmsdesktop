-- Create table to track items that need stock recalculation
-- This enables self-healing: items marked as dirty will be recalculated on next transaction

CREATE TABLE IF NOT EXISTS tabStockDirtyFlag (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reason VARCHAR(255) NULL,
  recalculated_at TIMESTAMP NULL,
  recalculated_count INT DEFAULT 0,
  UNIQUE KEY uk_item_warehouse (item_code, warehouse),
  INDEX idx_marked_at (marked_at),
  INDEX idx_recalculated_at (recalculated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add comment
ALTER TABLE tabStockDirtyFlag COMMENT = 'Tracks items that need stock recalculation due to discrepancies';
