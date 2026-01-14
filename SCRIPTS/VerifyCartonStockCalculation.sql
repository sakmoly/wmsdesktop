-- ============================================================
-- VERIFY CARTON STOCK CALCULATION
-- This script verifies if tabItem.stock_qty matches the sum from tabCartonStock
-- ============================================================

-- Check current stock quantities for SKU-JACKET-201-BLK-L
SELECT 
  '=== CURRENT STOCK QUANTITIES ===' as Info;

SELECT 
  i.code as item_code,
  i.name as item_name,
  i.stock_qty as item_stock_qty,
  COALESCE((SELECT SUM(qty) FROM tabCartonStock WHERE item_code = i.code AND qty > 0 AND (status IS NULL OR status = '' OR status = 'PUTAWAY')), 0) as carton_stock_total,
  COALESCE((SELECT SUM(qty) FROM tabStockLedger WHERE item_code = i.code), 0) as stock_ledger_total,
  CASE 
    WHEN i.stock_qty = COALESCE((SELECT SUM(qty) FROM tabCartonStock WHERE item_code = i.code AND qty > 0 AND (status IS NULL OR status = '' OR status = 'PUTAWAY')), 0)
    THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as status
FROM tabItem i
WHERE i.code = 'SKU-JACKET-201-BLK-L';

-- Check all cartons for this item
SELECT 
  '=== ALL CARTONS FOR SKU-JACKET-201-BLK-L ===' as Info;

SELECT 
  carton_id,
  item_code,
  warehouse,
  bin_location,
  qty,
  status,
  batch_no,
  created_on,
  updated_at
FROM tabCartonStock
WHERE item_code = 'SKU-JACKET-201-BLK-L'
  AND qty > 0
ORDER BY carton_id;

-- Show the sum calculation
SELECT 
  '=== CALCULATION VERIFICATION ===' as Info;

SELECT 
  COUNT(*) as carton_count,
  SUM(qty) as total_qty,
  GROUP_CONCAT(CONCAT(carton_id, ':', qty) ORDER BY carton_id SEPARATOR ', ') as carton_details
FROM tabCartonStock
WHERE item_code = 'SKU-JACKET-201-BLK-L'
  AND qty > 0
  AND (status IS NULL OR status = '' OR status = 'PUTAWAY');
