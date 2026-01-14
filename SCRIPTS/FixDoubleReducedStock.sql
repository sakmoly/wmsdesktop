-- ============================================================
-- FIX DOUBLE-REDUCED STOCK FROM DISPATCH
-- ============================================================
-- This script fixes items that were double-reduced during dispatch
-- (stock was reduced during picking AND dispatch)
-- ============================================================

-- Step 1: Identify items that were double-reduced
-- (items with Dispatch transactions after Picking transactions for the same Material Request)
SELECT 
  'DOUBLE REDUCTION DETECTED' as status,
  st1.item_code,
  st1.bin_location,
  st1.reference_doc as material_request,
  st1.transaction_date as picking_date,
  st1.qty_change as picking_reduction,
  st2.transaction_date as dispatch_date,
  st2.qty_change as dispatch_reduction,
  st2.reference_doc as transfer_carton,
  ABS(st2.qty_change) as amount_to_add_back
FROM tabStockTransaction st1
JOIN tabStockTransaction st2 
  ON st1.item_code = st2.item_code 
  AND st1.bin_location = st2.bin_location
  AND st1.reference_doc = st2.reference_doc
WHERE st1.transaction_type = 'Picking'
  AND st2.transaction_type = 'Dispatch'
  AND st1.reference_doc_type = 'Material Request'
  AND st2.reference_doc_type = 'Transfer Carton'
  AND st2.transaction_date > st1.transaction_date
ORDER BY st2.transaction_date DESC;

-- Step 2: Add back the incorrectly reduced stock in tabStockLedger
UPDATE tabStockLedger sl
JOIN (
  SELECT 
    st2.item_code,
    st2.bin_location,
    st2.warehouse,
    ABS(st2.qty_change) as amount_to_add_back
  FROM tabStockTransaction st1
  JOIN tabStockTransaction st2 
    ON st1.item_code = st2.item_code 
    AND st1.bin_location = st2.bin_location
    AND st1.reference_doc = st2.reference_doc
  WHERE st1.transaction_type = 'Picking'
    AND st2.transaction_type = 'Dispatch'
    AND st1.reference_doc_type = 'Material Request'
    AND st2.reference_doc_type = 'Transfer Carton'
    AND st2.transaction_date > st1.transaction_date
) corrections
  ON sl.item_code = corrections.item_code
  AND sl.bin_location = corrections.bin_location
  AND sl.warehouse = corrections.warehouse
SET sl.qty = sl.qty + corrections.amount_to_add_back,
    sl.updated_at = NOW();

-- Step 3: Update tabItem.stock_qty to match tabStockLedger sum
UPDATE tabItem i
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger
  WHERE item_code = i.code
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1
  FROM tabStockLedger
  WHERE item_code = i.code
);

-- Step 4: Verify the fix
SELECT 
  'VERIFICATION' as status,
  i.code as item_code,
  i.stock_qty as item_stock_qty,
  COALESCE(SUM(sl.qty), 0) as stock_ledger_total,
  CASE 
    WHEN ABS(i.stock_qty - COALESCE(SUM(sl.qty), 0)) < 0.01 THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as status_check
FROM tabItem i
LEFT JOIN tabStockLedger sl ON sl.item_code = i.code
WHERE EXISTS (
  SELECT 1
  FROM tabStockTransaction st1
  JOIN tabStockTransaction st2 
    ON st1.item_code = st2.item_code 
    AND st1.bin_location = st2.bin_location
    AND st1.reference_doc = st2.reference_doc
  WHERE st1.transaction_type = 'Picking'
    AND st2.transaction_type = 'Dispatch'
    AND st1.reference_doc_type = 'Material Request'
    AND st2.reference_doc_type = 'Transfer Carton'
    AND st2.transaction_date > st1.transaction_date
    AND st1.item_code = i.code
)
GROUP BY i.code, i.stock_qty;

SELECT '✅ Double-reduced stock has been fixed!' as Status;
