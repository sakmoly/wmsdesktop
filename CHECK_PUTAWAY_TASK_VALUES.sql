-- ============================================================
-- Verify Putaway Task Values for Transfer In INSLIP-123466
-- ============================================================

-- 1. Check Putaway Task
SELECT 
  title as 'Putaway Task',
  status as 'Status',
  source_type as 'Source Type',
  transfer_in as 'Transfer In',
  advance_shipping_notice as 'ASN/Transfer In Number',
  warehouse as 'Warehouse',
  inbound_session as 'Inbound Session',
  created_by as 'Created By',
  created_at as 'Created At',
  updated_at as 'Updated At'
FROM tabPutawayTask
WHERE transfer_in = 'INSLIP-123466'
   OR title = 'PUT-20260106-0005';

-- 2. Check Putaway Lines
SELECT 
  id as 'ID',
  parent_title as 'Putaway Task',
  item_code as 'Item Code',
  carton_id as 'Carton ID',
  qty as 'Quantity',
  rack as 'Rack',
  bin as 'Bin',
  status as 'Status',
  created_at as 'Created At',
  updated_at as 'Updated At'
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260106-0005'
ORDER BY item_code;

-- 3. Check Transfer In Status
SELECT 
  title as 'Transfer In',
  status as 'Status',
  from_showroom as 'From Showroom',
  to_warehouse as 'To Warehouse',
  received_by as 'Received By',
  received_on as 'Received On',
  total_qty as 'Total Qty',
  created_at as 'Created At',
  updated_at as 'Updated At'
FROM tabTransferIn
WHERE title = 'INSLIP-123466';

-- 4. Check Transfer In Items (verify all received)
SELECT 
  id as 'ID',
  parent_title as 'Transfer In',
  item_code as 'Item Code',
  qty as 'Expected Qty',
  received_qty as 'Received Qty',
  carton_id as 'Carton ID',
  CASE 
    WHEN received_qty = qty THEN '✅ Fully Received'
    WHEN received_qty > 0 THEN '⚠️ Partially Received'
    ELSE '❌ Not Received'
  END as 'Status',
  created_at as 'Created At',
  updated_at as 'Updated At'
FROM tabTransferInItem
WHERE parent_title = 'INSLIP-123466'
ORDER BY item_code;

-- 5. Complete Summary Query
SELECT 
  pt.title as 'Putaway Task',
  pt.status as 'Task Status',
  pt.source_type as 'Source Type',
  pt.transfer_in as 'Transfer In',
  pt.advance_shipping_notice as 'ASN/TI Number',
  pt.warehouse as 'Warehouse',
  COUNT(pl.id) as 'Line Count',
  GROUP_CONCAT(pl.item_code ORDER BY pl.item_code SEPARATOR ', ') as 'Items',
  GROUP_CONCAT(CONCAT(pl.item_code, ' (', pl.qty, ')') ORDER BY pl.item_code SEPARATOR ', ') as 'Items with Qty'
FROM tabPutawayTask pt
LEFT JOIN tabPutawayLine pl ON pt.title = pl.parent_title
WHERE pt.transfer_in = 'INSLIP-123466'
   OR pt.title = 'PUT-20260106-0005'
GROUP BY pt.title;

-- 6. Verify All Values Are Correct
SELECT 
  'Putaway Task' as 'Table',
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Found'
    ELSE '❌ Not Found'
  END as 'Status',
  COUNT(*) as 'Count'
FROM tabPutawayTask
WHERE transfer_in = 'INSLIP-123466'
   OR title = 'PUT-20260106-0005'

UNION ALL

SELECT 
  'Putaway Lines' as 'Table',
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Found'
    ELSE '❌ Not Found'
  END as 'Status',
  COUNT(*) as 'Count'
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260106-0005'

UNION ALL

SELECT 
  'Transfer In' as 'Table',
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Found'
    ELSE '❌ Not Found'
  END as 'Status',
  COUNT(*) as 'Count'
FROM tabTransferIn
WHERE title = 'INSLIP-123466'

UNION ALL

SELECT 
  'Transfer In Items' as 'Table',
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Found'
    ELSE '❌ Not Found'
  END as 'Status',
  COUNT(*) as 'Count'
FROM tabTransferInItem
WHERE parent_title = 'INSLIP-123466';

