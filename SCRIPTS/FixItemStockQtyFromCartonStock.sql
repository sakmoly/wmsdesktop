-- ============================================================
-- FIX ITEM STOCK QUANTITY FROM CARTON STOCK
-- This script updates tabItem.stock_qty to match the sum from tabCartonStock
-- Run this if stock quantities are not showing correctly after cycle count
-- ============================================================

-- Update tabItem.stock_qty from tabCartonStock (if exists)
-- For items with carton-level stock, use tabCartonStock as the source
UPDATE tabItem i
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabCartonStock cs
  WHERE cs.item_code = i.code
    AND cs.qty > 0
    AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1 
  FROM tabCartonStock cs
  WHERE cs.item_code = i.code
    AND cs.qty > 0
    AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')
);

-- For items without carton stock, use tabStockLedger
UPDATE tabItem i
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger sl
  WHERE sl.item_code = i.code
),
updated_at = NOW()
WHERE NOT EXISTS (
  SELECT 1 
  FROM tabCartonStock cs
  WHERE cs.item_code = i.code
    AND cs.qty > 0
    AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')
)
AND EXISTS (
  SELECT 1 
  FROM tabStockLedger sl
  WHERE sl.item_code = i.code
);

-- Show updated items
SELECT 
  '=== UPDATED ITEMS (from tabCartonStock) ===' as Info;

SELECT 
  i.code as item_code,
  i.name as item_name,
  i.stock_qty as item_stock_qty,
  COALESCE((SELECT SUM(qty) FROM tabCartonStock WHERE item_code = i.code AND qty > 0 AND (status IS NULL OR status = '' OR status = 'PUTAWAY')), 0) as carton_stock_total,
  COALESCE((SELECT SUM(qty) FROM tabStockLedger WHERE item_code = i.code), 0) as stock_ledger_total
FROM tabItem i
WHERE EXISTS (
  SELECT 1 
  FROM tabCartonStock cs
  WHERE cs.item_code = i.code
    AND cs.qty > 0
    AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')
)
ORDER BY i.code
LIMIT 20;
