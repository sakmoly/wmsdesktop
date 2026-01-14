-- ============================================================
-- CHECK AND FIX ITEM STOCK QUANTITY FOR SKU-JACKET-201-BLK-L
-- This script checks and fixes tabItem.stock_qty for a specific item
-- ============================================================

-- Check current stock quantities
SELECT 
  '=== CURRENT STOCK QUANTITIES ===' as Info;

SELECT 
  i.code as item_code,
  i.name as item_name,
  i.stock_qty as item_stock_qty,
  COALESCE((SELECT SUM(qty) FROM tabCartonStock WHERE item_code = i.code AND qty > 0 AND (status IS NULL OR status = '' OR status = 'PUTAWAY')), 0) as carton_stock_total,
  COALESCE((SELECT SUM(qty) FROM tabStockLedger WHERE item_code = i.code), 0) as stock_ledger_total
FROM tabItem i
WHERE i.code = 'SKU-JACKET-201-BLK-L';

-- Check carton stock details
SELECT 
  '=== CARTON STOCK DETAILS ===' as Info;

SELECT 
  carton_id,
  item_code,
  bin_location,
  qty,
  status,
  warehouse
FROM tabCartonStock
WHERE item_code = 'SKU-JACKET-201-BLK-L'
  AND qty > 0
  AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
ORDER BY carton_id;

-- Fix tabItem.stock_qty from tabCartonStock
UPDATE tabItem i
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabCartonStock cs
  WHERE cs.item_code = i.code
    AND cs.qty > 0
    AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')
),
updated_at = NOW()
WHERE i.code = 'SKU-JACKET-201-BLK-L'
  AND EXISTS (
    SELECT 1 
    FROM tabCartonStock cs
    WHERE cs.item_code = i.code
      AND cs.qty > 0
      AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')
  );

-- Verify the fix
SELECT 
  '=== AFTER FIX (VERIFICATION) ===' as Info;

SELECT 
  i.code as item_code,
  i.name as item_name,
  i.stock_qty as item_stock_qty,
  COALESCE((SELECT SUM(qty) FROM tabCartonStock WHERE item_code = i.code AND qty > 0 AND (status IS NULL OR status = '' OR status = 'PUTAWAY')), 0) as carton_stock_total,
  CASE 
    WHEN i.stock_qty = COALESCE((SELECT SUM(qty) FROM tabCartonStock WHERE item_code = i.code AND qty > 0 AND (status IS NULL OR status = '' OR status = 'PUTAWAY')), 0)
    THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as status
FROM tabItem i
WHERE i.code = 'SKU-JACKET-201-BLK-L';
