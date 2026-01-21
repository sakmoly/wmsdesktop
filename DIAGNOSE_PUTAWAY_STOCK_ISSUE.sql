-- Diagnostic Queries for Transfer In Putaway Stock Not Updating
-- Replace 'PUT-20260121-0001' with your actual putaway task title
-- Replace 'INSLIP-123457' with your actual Transfer In number

-- 1. Check Putaway Task Status and Details
SELECT 
  title,
  status,
  transfer_in,
  source_type,
  warehouse,
  location_id,
  created_at,
  updated_at
FROM tabPutawayTask
WHERE title = 'PUT-20260121-0001';

-- 2. Check Putaway Lines - CRITICAL: location_id must NOT be NULL
SELECT 
  parent_title,
  item_code,
  qty,
  carton_id,
  location_id,  -- ⚠️ MUST NOT BE NULL
  rack,
  bin,
  created_at,
  updated_at
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260121-0001'
ORDER BY item_code;

-- 3. Check if Location ID is Missing (This will cause stock updates to skip)
SELECT 
  COUNT(*) as total_lines,
  SUM(CASE WHEN location_id IS NULL THEN 1 ELSE 0 END) as missing_location_id,
  SUM(CASE WHEN item_code IS NULL THEN 1 ELSE 0 END) as missing_item_code,
  SUM(CASE WHEN qty <= 0 THEN 1 ELSE 0 END) as zero_qty
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260121-0001';

-- 4. Check Transfer In Warehouse
SELECT 
  title,
  status,
  to_warehouse,  -- ⚠️ MUST NOT BE NULL
  warehouse,
  from_warehouse
FROM tabTransferIn
WHERE title = 'INSLIP-123457';

-- 5. Check Stock Ledger (Should have entries after stock update)
SELECT 
  item_code,
  warehouse,
  bin_location,
  qty,
  last_transaction_type,
  last_transaction_ref,
  updated_at
FROM tabStockLedger
WHERE last_transaction_ref = 'PUT-20260121-0001'
ORDER BY item_code;

-- 6. Check Transaction History (Should have entries after stock update)
SELECT 
  transaction_type,
  warehouse,
  bin_location,
  location_id,
  item_code,
  carton_id,
  qty_change,
  reference_doc,
  created_at
FROM tabTransactionHistory
WHERE reference_doc = 'PUT-20260121-0001'
ORDER BY created_at DESC;

-- 7. Check Item On-Hand (If stock posting is enabled)
SELECT 
  code,
  name,
  stock_qty
FROM tabItem
WHERE code IN (
  SELECT DISTINCT item_code 
  FROM tabPutawayLine 
  WHERE parent_title = 'PUT-20260121-0001'
);

-- 8. Summary: What's Wrong?
SELECT 
  'Putaway Task Status' as check_item,
  CASE 
    WHEN status = 'Completed' THEN '❌ WRONG: Status is Completed (idempotency will skip)'
    WHEN status = 'In Progress' THEN '✅ OK: Status is In Progress'
    WHEN status = 'Open' THEN '✅ OK: Status is Open'
    ELSE CONCAT('⚠️ UNKNOWN: Status is ', status)
  END as status_check
FROM tabPutawayTask
WHERE title = 'PUT-20260121-0001'

UNION ALL

SELECT 
  'Location ID on Lines' as check_item,
  CASE 
    WHEN COUNT(*) = 0 THEN '❌ ERROR: No putaway lines found'
    WHEN SUM(CASE WHEN location_id IS NULL THEN 1 ELSE 0 END) > 0 
      THEN CONCAT('❌ WRONG: ', SUM(CASE WHEN location_id IS NULL THEN 1 ELSE 0 END), ' line(s) missing location_id')
    ELSE CONCAT('✅ OK: All ', COUNT(*), ' line(s) have location_id')
  END as status_check
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260121-0001'

UNION ALL

SELECT 
  'Transfer In Warehouse' as check_item,
  CASE 
    WHEN to_warehouse IS NULL THEN '❌ WRONG: to_warehouse is NULL'
    ELSE CONCAT('✅ OK: to_warehouse = ', to_warehouse)
  END as status_check
FROM tabTransferIn
WHERE title = 'INSLIP-123457'

UNION ALL

SELECT 
  'Stock Ledger Entries' as check_item,
  CASE 
    WHEN COUNT(*) = 0 THEN '❌ MISSING: No stock ledger entries found'
    ELSE CONCAT('✅ OK: ', COUNT(*), ' stock ledger entry/entries found')
  END as status_check
FROM tabStockLedger
WHERE last_transaction_ref = 'PUT-20260121-0001'

UNION ALL

SELECT 
  'Transaction History Entries' as check_item,
  CASE 
    WHEN COUNT(*) = 0 THEN '❌ MISSING: No transaction history entries found'
    ELSE CONCAT('✅ OK: ', COUNT(*), ' transaction history entry/entries found')
  END as status_check
FROM tabTransactionHistory
WHERE reference_doc = 'PUT-20260121-0001';
