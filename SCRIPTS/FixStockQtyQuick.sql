-- Quick fix to update tabItem.stock_qty from tabCartonStock for SKU-JACKET-201-BLK-L
-- Run this SQL command directly in your MySQL client

UPDATE tabItem
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabCartonStock
  WHERE item_code = 'SKU-JACKET-201-BLK-L'
    AND qty > 0
    AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
),
updated_at = NOW()
WHERE code = 'SKU-JACKET-201-BLK-L';

-- Verify the update
SELECT 
  code,
  name,
  stock_qty,
  (SELECT COALESCE(SUM(qty), 0) FROM tabCartonStock WHERE item_code = 'SKU-JACKET-201-BLK-L' AND qty > 0 AND (status IS NULL OR status = '' OR status = 'PUTAWAY')) as carton_total
FROM tabItem
WHERE code = 'SKU-JACKET-201-BLK-L';
