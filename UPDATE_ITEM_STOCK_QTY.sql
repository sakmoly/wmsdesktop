-- ============================================================
-- UPDATE ITEM STOCK QUANTITIES FROM STOCK LEDGER
-- This script updates tabItem.stock_qty to match the sum of all locations
-- Run this if stock quantities are not showing correctly in the main screen
-- ============================================================

-- Update all items' stock_qty from stock ledger
UPDATE tabItem i
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger sl
  WHERE sl.item_code = i.code
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1 
  FROM tabStockLedger sl 
  WHERE sl.item_code = i.code
);

-- Show items that were updated
SELECT 
  '=== UPDATED ITEMS ===' as Info;

SELECT 
  code as item_code,
  name as item_name,
  stock_qty,
  (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = tabItem.code) as calculated_stock,
  CASE 
    WHEN stock_qty = (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = tabItem.code) 
    THEN '✅ Match' 
    ELSE '❌ Mismatch' 
  END as status
FROM tabItem
WHERE EXISTS (
  SELECT 1 
  FROM tabStockLedger 
  WHERE item_code = tabItem.code
)
ORDER BY code
LIMIT 20;

-- Show items with stock in stock ledger but zero in tabItem
SELECT 
  '=== ITEMS WITH STOCK BUT ZERO IN tabItem ===' as Info;

SELECT 
  sl.item_code,
  i.name as item_name,
  SUM(sl.qty) as total_stock_ledger_qty,
  i.stock_qty as current_item_stock_qty
FROM tabStockLedger sl
LEFT JOIN tabItem i ON i.code = sl.item_code
GROUP BY sl.item_code, i.name, i.stock_qty
HAVING SUM(sl.qty) > 0 AND (i.stock_qty IS NULL OR i.stock_qty = 0)
ORDER BY total_stock_ledger_qty DESC;

-- ============================================================
-- END OF SCRIPT
-- ============================================================
-- 
-- After running this script:
-- 1. Refresh the Items list in the desktop app
-- 2. The stock quantities should now match the location breakdown
-- ============================================================

