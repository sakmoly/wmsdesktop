-- ============================================================
-- AUTOMATIC STOCK QUANTITY SYNC TRIGGERS
-- ============================================================
-- This script creates database triggers to automatically update
-- tabItem.stock_qty whenever tabStockLedger or tabCartonStock changes
-- ============================================================

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trg_update_item_stock_after_stock_ledger_insert;
DROP TRIGGER IF EXISTS trg_update_item_stock_after_stock_ledger_update;
DROP TRIGGER IF EXISTS trg_update_item_stock_after_stock_ledger_delete;
DROP TRIGGER IF EXISTS trg_update_item_stock_after_carton_stock_insert;
DROP TRIGGER IF EXISTS trg_update_item_stock_after_carton_stock_update;
DROP TRIGGER IF EXISTS trg_update_item_stock_after_carton_stock_delete;

DELIMITER $$

-- ============================================================
-- TRIGGERS FOR tabStockLedger
-- ============================================================

-- Trigger: After INSERT on tabStockLedger
CREATE TRIGGER trg_update_item_stock_after_stock_ledger_insert
AFTER INSERT ON tabStockLedger
FOR EACH ROW
BEGIN
  -- Check if tabCartonStock exists and has stock for this item
  SET @has_carton_stock = (
    SELECT COUNT(*) > 0
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabCartonStock'
  );
  
  IF @has_carton_stock > 0 THEN
    -- Use tabCartonStock if available (more accurate for carton-level)
    UPDATE tabItem
    SET stock_qty = (
      SELECT COALESCE(SUM(qty), 0)
      FROM tabCartonStock
      WHERE item_code = NEW.item_code
        AND qty > 0
        AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
    ),
    updated_at = NOW()
    WHERE code = NEW.item_code
      AND EXISTS (
        SELECT 1
        FROM tabCartonStock
        WHERE item_code = NEW.item_code
          AND qty > 0
          AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
      );
    
    -- If no carton stock, use stock ledger
    UPDATE tabItem
    SET stock_qty = (
      SELECT COALESCE(SUM(qty), 0)
      FROM tabStockLedger
      WHERE item_code = NEW.item_code
    ),
    updated_at = NOW()
    WHERE code = NEW.item_code
      AND NOT EXISTS (
        SELECT 1
        FROM tabCartonStock
        WHERE item_code = NEW.item_code
          AND qty > 0
          AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
      );
  ELSE
    -- No carton stock table, use stock ledger
    UPDATE tabItem
    SET stock_qty = (
      SELECT COALESCE(SUM(qty), 0)
      FROM tabStockLedger
      WHERE item_code = NEW.item_code
    ),
    updated_at = NOW()
    WHERE code = NEW.item_code;
  END IF;
END$$

-- Trigger: After UPDATE on tabStockLedger
CREATE TRIGGER trg_update_item_stock_after_stock_ledger_update
AFTER UPDATE ON tabStockLedger
FOR EACH ROW
BEGIN
  -- Check if tabCartonStock exists and has stock for this item
  SET @has_carton_stock = (
    SELECT COUNT(*) > 0
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabCartonStock'
  );
  
  IF @has_carton_stock > 0 THEN
    -- Use tabCartonStock if available (more accurate for carton-level)
    UPDATE tabItem
    SET stock_qty = (
      SELECT COALESCE(SUM(qty), 0)
      FROM tabCartonStock
      WHERE item_code = NEW.item_code
        AND qty > 0
        AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
    ),
    updated_at = NOW()
    WHERE code = NEW.item_code
      AND EXISTS (
        SELECT 1
        FROM tabCartonStock
        WHERE item_code = NEW.item_code
          AND qty > 0
          AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
      );
    
    -- If no carton stock, use stock ledger
    UPDATE tabItem
    SET stock_qty = (
      SELECT COALESCE(SUM(qty), 0)
      FROM tabStockLedger
      WHERE item_code = NEW.item_code
    ),
    updated_at = NOW()
    WHERE code = NEW.item_code
      AND NOT EXISTS (
        SELECT 1
        FROM tabCartonStock
        WHERE item_code = NEW.item_code
          AND qty > 0
          AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
      );
  ELSE
    -- No carton stock table, use stock ledger
    UPDATE tabItem
    SET stock_qty = (
      SELECT COALESCE(SUM(qty), 0)
      FROM tabStockLedger
      WHERE item_code = NEW.item_code
    ),
    updated_at = NOW()
    WHERE code = NEW.item_code;
  END IF;
END$$

-- Trigger: After DELETE on tabStockLedger
CREATE TRIGGER trg_update_item_stock_after_stock_ledger_delete
AFTER DELETE ON tabStockLedger
FOR EACH ROW
BEGIN
  -- Check if tabCartonStock exists and has stock for this item
  SET @has_carton_stock = (
    SELECT COUNT(*) > 0
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabCartonStock'
  );
  
  IF @has_carton_stock > 0 THEN
    -- Use tabCartonStock if available (more accurate for carton-level)
    UPDATE tabItem
    SET stock_qty = (
      SELECT COALESCE(SUM(qty), 0)
      FROM tabCartonStock
      WHERE item_code = OLD.item_code
        AND qty > 0
        AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
    ),
    updated_at = NOW()
    WHERE code = OLD.item_code
      AND EXISTS (
        SELECT 1
        FROM tabCartonStock
        WHERE item_code = OLD.item_code
          AND qty > 0
          AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
      );
    
    -- If no carton stock, use stock ledger
    UPDATE tabItem
    SET stock_qty = (
      SELECT COALESCE(SUM(qty), 0)
      FROM tabStockLedger
      WHERE item_code = OLD.item_code
    ),
    updated_at = NOW()
    WHERE code = OLD.item_code
      AND NOT EXISTS (
        SELECT 1
        FROM tabCartonStock
        WHERE item_code = OLD.item_code
          AND qty > 0
          AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
      );
  ELSE
    -- No carton stock table, use stock ledger
    UPDATE tabItem
    SET stock_qty = (
      SELECT COALESCE(SUM(qty), 0)
      FROM tabStockLedger
      WHERE item_code = OLD.item_code
    ),
    updated_at = NOW()
    WHERE code = OLD.item_code;
  END IF;
END$$

-- ============================================================
-- TRIGGERS FOR tabCartonStock
-- ============================================================

-- Trigger: After INSERT on tabCartonStock
CREATE TRIGGER trg_update_item_stock_after_carton_stock_insert
AFTER INSERT ON tabCartonStock
FOR EACH ROW
BEGIN
  -- Only update if status is PUTAWAY or NULL/empty
  IF (NEW.status IS NULL OR NEW.status = '' OR NEW.status = 'PUTAWAY') AND NEW.qty > 0 THEN
    UPDATE tabItem
    SET stock_qty = (
      SELECT COALESCE(SUM(qty), 0)
      FROM tabCartonStock
      WHERE item_code = NEW.item_code
        AND qty > 0
        AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
    ),
    updated_at = NOW()
    WHERE code = NEW.item_code;
  END IF;
END$$

-- Trigger: After UPDATE on tabCartonStock
CREATE TRIGGER trg_update_item_stock_after_carton_stock_update
AFTER UPDATE ON tabCartonStock
FOR EACH ROW
BEGIN
  -- Update if status changed or quantity changed
  IF (NEW.status IS NULL OR NEW.status = '' OR NEW.status = 'PUTAWAY') AND NEW.qty > 0 THEN
    UPDATE tabItem
    SET stock_qty = (
      SELECT COALESCE(SUM(qty), 0)
      FROM tabCartonStock
      WHERE item_code = NEW.item_code
        AND qty > 0
        AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
    ),
    updated_at = NOW()
    WHERE code = NEW.item_code;
  ELSE
    -- If status changed to non-PUTAWAY, recalculate from stock ledger
    UPDATE tabItem
    SET stock_qty = (
      SELECT COALESCE(SUM(qty), 0)
      FROM tabStockLedger
      WHERE item_code = NEW.item_code
    ),
    updated_at = NOW()
    WHERE code = NEW.item_code;
  END IF;
END$$

-- Trigger: After DELETE on tabCartonStock
CREATE TRIGGER trg_update_item_stock_after_carton_stock_delete
AFTER DELETE ON tabCartonStock
FOR EACH ROW
BEGIN
  -- Check if there's still carton stock for this item
  SET @remaining_carton_stock = (
    SELECT COALESCE(SUM(qty), 0)
    FROM tabCartonStock
    WHERE item_code = OLD.item_code
      AND qty > 0
      AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
  );
  
  IF @remaining_carton_stock > 0 THEN
    -- Still has carton stock, use carton stock
    UPDATE tabItem
    SET stock_qty = @remaining_carton_stock,
        updated_at = NOW()
    WHERE code = OLD.item_code;
  ELSE
    -- No more carton stock, use stock ledger
    UPDATE tabItem
    SET stock_qty = (
      SELECT COALESCE(SUM(qty), 0)
      FROM tabStockLedger
      WHERE item_code = OLD.item_code
    ),
    updated_at = NOW()
    WHERE code = OLD.item_code;
  END IF;
END$$

DELIMITER ;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Show created triggers
SELECT 
  TRIGGER_NAME,
  EVENT_MANIPULATION,
  EVENT_OBJECT_TABLE,
  ACTION_TIMING
FROM INFORMATION_SCHEMA.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
  AND TRIGGER_NAME LIKE 'trg_update_item_stock%'
ORDER BY TRIGGER_NAME;

SELECT '✅ Stock sync triggers created successfully!' as Status;
