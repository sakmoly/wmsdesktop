-- Compare ASN-0001 and TO-0001 Quantities
-- This script compares the quantities between ASN and Transfer Order

-- Step 1: Check ASN-0001 Items and Quantities
SELECT 
    'ASN-0001 Items' AS source,
    parent_title AS document,
    item_code,
    shipped_qty AS qty,
    carton_id
FROM tabAsnItemDetails
WHERE parent_title = 'ASN-0001'
ORDER BY item_code;

-- Step 2: Check TO-0001 Items and Quantities (Grouped by Store)
SELECT 
    'TO-0001 Items' AS source,
    parent_title AS document,
    store,
    item_code,
    allocated_qty AS qty
FROM tabTransferOrderItem
WHERE parent_title = 'TO-0001'
ORDER BY store, item_code;

-- Step 3: Summary - ASN Total Quantities by Item
SELECT 
    'ASN-0001 Summary' AS source,
    item_code,
    SUM(shipped_qty) AS total_qty,
    COUNT(*) AS carton_count
FROM tabAsnItemDetails
WHERE parent_title = 'ASN-0001'
GROUP BY item_code
ORDER BY item_code;

-- Step 4: Summary - TO Total Quantities by Item (across all stores)
SELECT 
    'TO-0001 Summary' AS source,
    item_code,
    SUM(allocated_qty) AS total_qty,
    COUNT(DISTINCT store) AS store_count
FROM tabTransferOrderItem
WHERE parent_title = 'TO-0001'
GROUP BY item_code
ORDER BY item_code;

-- Step 5: Comparison - ASN vs TO Quantities
SELECT 
    COALESCE(asn.item_code, to_items.item_code) AS item_code,
    COALESCE(asn.total_qty, 0) AS asn_total_qty,
    COALESCE(to_items.total_qty, 0) AS to_total_qty,
    (COALESCE(to_items.total_qty, 0) - COALESCE(asn.total_qty, 0)) AS difference,
    CASE 
        WHEN COALESCE(asn.total_qty, 0) = COALESCE(to_items.total_qty, 0) THEN 'MATCH'
        WHEN COALESCE(to_items.total_qty, 0) > COALESCE(asn.total_qty, 0) THEN 'TO EXCEEDS ASN'
        ELSE 'ASN EXCEEDS TO'
    END AS status
FROM (
    SELECT 
        item_code,
        SUM(shipped_qty) AS total_qty
    FROM tabAsnItemDetails
    WHERE parent_title = 'ASN-0001'
    GROUP BY item_code
) AS asn
FULL OUTER JOIN (
    SELECT 
        item_code,
        SUM(allocated_qty) AS total_qty
    FROM tabTransferOrderItem
    WHERE parent_title = 'TO-0001'
    GROUP BY item_code
) AS to_items ON asn.item_code = to_items.item_code
ORDER BY item_code;

-- Step 6: Detailed Comparison by Item and Store
SELECT 
    to_item.store,
    COALESCE(asn.item_code, to_item.item_code) AS item_code,
    COALESCE(asn.shipped_qty, 0) AS asn_qty,
    COALESCE(to_item.allocated_qty, 0) AS to_qty,
    (COALESCE(to_item.allocated_qty, 0) - COALESCE(asn.shipped_qty, 0)) AS difference,
    to_item.parent_title AS to_document
FROM tabTransferOrderItem to_item
LEFT JOIN (
    SELECT DISTINCT item_code, shipped_qty
    FROM tabAsnItemDetails
    WHERE parent_title = 'ASN-0001'
) AS asn ON to_item.item_code = asn.item_code
WHERE to_item.parent_title = 'TO-0001'
ORDER BY to_item.store, to_item.item_code;

