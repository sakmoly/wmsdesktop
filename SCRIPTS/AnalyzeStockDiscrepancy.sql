-- Analyze Stock Discrepancy for SKU-HAT-301-BLU-OS
-- Main Items table shows: 96
-- Item Location Breakdown shows: 98

-- 1. Check tabItem.stock_qty
SELECT 
  code as item_code,
  name as item_name,
  stock_qty as item_stock_qty
FROM tabItem
WHERE code = 'SKU-HAT-301-BLU-OS';

-- 2. Check tabStockLedger total
SELECT 
  'Stock Ledger Total' as source,
  COALESCE(SUM(qty), 0) as total_qty,
  COUNT(*) as record_count,
  COUNT(DISTINCT bin_location) as location_count
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS';

-- 3. Check tabCartonStock total (if exists)
SELECT 
  'Carton Stock Total' as source,
  COALESCE(SUM(qty), 0) as total_qty,
  COUNT(*) as record_count,
  COUNT(DISTINCT carton_id) as carton_count,
  COUNT(DISTINCT bin_location) as location_count
FROM tabCartonStock
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND qty > 0
  AND (status IS NULL OR status = '' OR status = 'PUTAWAY');

-- 4. Check for duplicate records in tabCartonStock (by carton_id, item_code, bin_location)
SELECT 
  'Duplicate Check' as info,
  carton_id,
  item_code,
  bin_location,
  COUNT(*) as duplicate_count,
  SUM(qty) as total_qty_sum,
  GROUP_CONCAT(id ORDER BY id DESC) as record_ids,
  MAX(id) as latest_id,
  SUM(CASE WHEN id = MAX(id) THEN qty ELSE 0 END) as latest_qty
FROM tabCartonStock
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND qty > 0
  AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
GROUP BY carton_id, item_code, bin_location
HAVING COUNT(*) > 1;

-- 5. Check tabCartonStock at specific location (A1-R01-L3-B1)
SELECT 
  id,
  carton_id,
  item_code,
  bin_location,
  warehouse,
  qty,
  status,
  batch_no,
  created_at,
  updated_at
FROM tabCartonStock
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND bin_location = 'A1-R01-L3-B1'
  AND qty > 0
  AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
ORDER BY id DESC;

-- 6. Check tabStockLedger at specific location (A1-R01-L3-B1)
SELECT 
  id,
  item_code,
  bin_location,
  warehouse,
  qty,
  carton_id,
  last_transaction_date,
  updated_at
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND bin_location = 'A1-R01-L3-B1'
ORDER BY id DESC;

-- 7. Calculate what Item Location Breakdown should show (using latest record per carton+item+bin)
SELECT 
  'Item Location Breakdown Calculation' as info,
  cs.bin_location,
  cs.carton_id,
  cs.qty as latest_qty,
  cs.id as latest_id
FROM tabCartonStock cs
INNER JOIN (
  SELECT 
    carton_id,
    item_code,
    warehouse,
    bin_location,
    MAX(id) as max_id
  FROM tabCartonStock
  WHERE item_code = 'SKU-HAT-301-BLU-OS'
    AND qty > 0
    AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
  GROUP BY carton_id, item_code, warehouse, bin_location
) latest
  ON cs.carton_id = latest.carton_id
  AND cs.item_code = latest.item_code
  AND cs.warehouse = latest.warehouse
  AND cs.bin_location = latest.bin_location
  AND cs.id = latest.max_id
WHERE cs.item_code = 'SKU-HAT-301-BLU-OS'
  AND cs.bin_location = 'A1-R01-L3-B1'
ORDER BY cs.carton_id;

-- 8. Sum of latest records (what Item Location Breakdown should show)
SELECT 
  'Item Location Breakdown Total' as info,
  SUM(cs.qty) as total_qty
FROM tabCartonStock cs
INNER JOIN (
  SELECT 
    carton_id,
    item_code,
    warehouse,
    bin_location,
    MAX(id) as max_id
  FROM tabCartonStock
  WHERE item_code = 'SKU-HAT-301-BLU-OS'
    AND qty > 0
    AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
  GROUP BY carton_id, item_code, warehouse, bin_location
) latest
  ON cs.carton_id = latest.carton_id
  AND cs.item_code = latest.item_code
  AND cs.warehouse = latest.warehouse
  AND cs.bin_location = latest.bin_location
  AND cs.id = latest.max_id
WHERE cs.item_code = 'SKU-HAT-301-BLU-OS';
