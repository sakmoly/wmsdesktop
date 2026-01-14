-- Check carton stock for a specific item at a specific bin location
-- Use this to verify if multiple cartons exist in tabCartonStock

-- Example: Check for SKU-JACKET-201-BLK-L at A1-R01-L1-B1
SELECT 
    carton_id,
    item_code,
    warehouse,
    bin_location,
    qty,
    status,
    created_on,
    updated_at
FROM tabCartonStock
WHERE item_code = 'SKU-JACKET-201-BLK-L'
  AND bin_location = 'A1-R01-L1-B1'
  AND qty > 0
ORDER BY carton_id;

-- Check all cartons for this item (any bin location)
SELECT 
    carton_id,
    item_code,
    warehouse,
    bin_location,
    qty,
    status,
    created_on,
    updated_at
FROM tabCartonStock
WHERE item_code = 'SKU-JACKET-201-BLK-L'
  AND qty > 0
ORDER BY bin_location, carton_id;

-- Check cycle count lines to see what carton IDs were used
SELECT 
    id,
    item_code,
    bin_location,
    carton_id,
    expected_qty,
    actual_qty,
    discrepancy,
    counted_by,
    counted_on,
    status
FROM tabCycleCountLine
WHERE item_code = 'SKU-JACKET-201-BLK-L'
  AND bin_location = 'A1-R01-L1-B1'
  AND actual_qty IS NOT NULL
ORDER BY counted_on DESC, carton_id;
