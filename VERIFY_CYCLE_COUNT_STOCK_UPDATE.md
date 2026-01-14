# How to Verify Cycle Count Stock Updates

## Overview

After a cycle count task is completed, the stock ledger should be updated for items with discrepancies. This guide shows you how to verify the stock updates.

---

## Quick Verification Methods

### Method 1: Check Stock Transaction Log (Recommended)

The `tabStockTransaction` table records all stock movements, including cycle count adjustments.

**SQL Query:**
```sql
SELECT 
    transaction_date,
    transaction_type,
    reference_doc,
    item_code,
    warehouse,
    bin_location,
    qty_change,
    qty_before,
    qty_after,
    performed_by
FROM tabStockTransaction
WHERE transaction_type = 'CycleCount'
  AND reference_doc = 'CC-A1-R01-L1-B1-MK6SK143'  -- Replace with your task title
ORDER BY transaction_date DESC;
```

**What to Look For:**
- `transaction_type` = `'CycleCount'`
- `reference_doc` = Your cycle count task title
- `qty_change` = The discrepancy amount (+ or -)
- `qty_before` = Stock before adjustment
- `qty_after` = Stock after adjustment

---

### Method 2: Check Stock Ledger

The `tabStockLedger` table shows current stock quantities.

**SQL Query:**
```sql
SELECT 
    item_code,
    warehouse,
    bin_location,
    qty,
    last_transaction_type,
    last_transaction_ref,
    last_transaction_date,
    updated_at
FROM tabStockLedger
WHERE last_transaction_type = 'CycleCount'
  AND last_transaction_ref = 'CC-A1-R01-L1-B1-MK6SK143'  -- Replace with your task title
ORDER BY updated_at DESC;
```

**What to Look For:**
- `last_transaction_type` = `'CycleCount'`
- `last_transaction_ref` = Your cycle count task title
- `qty` = Current stock quantity (should reflect the adjustment)
- `last_transaction_date` = When the adjustment occurred

---

### Method 3: Compare Cycle Count Lines with Stock Ledger

Compare what was counted vs. what's in stock ledger.

**SQL Query:**
```sql
-- Get cycle count lines with discrepancies
SELECT 
    ccl.item_code,
    ccl.bin_location,
    ccl.expected_qty,
    ccl.actual_qty,
    ccl.discrepancy,
    ccl.counted_by
FROM tabCycleCountLine ccl
WHERE ccl.parent_title = 'CC-A1-R01-L1-B1-MK6SK143'  -- Replace with your task title
  AND ccl.actual_qty IS NOT NULL
  AND ccl.discrepancy IS NOT NULL
  AND ccl.discrepancy != 0
ORDER BY ccl.item_code;

-- Get current stock for those items
SELECT 
    sl.item_code,
    sl.warehouse,
    sl.bin_location,
    sl.qty as current_stock,
    sl.last_transaction_type,
    sl.last_transaction_ref,
    sl.last_transaction_date
FROM tabStockLedger sl
WHERE sl.item_code IN (
    SELECT DISTINCT item_code 
    FROM tabCycleCountLine 
    WHERE parent_title = 'CC-A1-R01-L1-B1-MK6SK143'  -- Replace with your task title
      AND discrepancy != 0
)
AND sl.warehouse = 'WH-MAIN'  -- Replace with your warehouse
ORDER BY sl.item_code, sl.bin_location;
```

---

### Method 4: Check All Recent Cycle Count Stock Updates

See all cycle count stock updates across all tasks.

**SQL Query:**
```sql
SELECT 
    st.reference_doc as task_title,
    st.item_code,
    st.warehouse,
    st.bin_location,
    st.qty_change,
    st.qty_before,
    st.qty_after,
    st.performed_by,
    st.transaction_date,
    cct.status as task_status,
    cct.count_date
FROM tabStockTransaction st
LEFT JOIN tabCycleCountTask cct ON st.reference_doc = cct.title
WHERE st.transaction_type = 'CycleCount'
  AND st.transaction_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)  -- Last 7 days
ORDER BY st.transaction_date DESC;
```

---

## Expected Results

### Example: Task `CC-A1-R01-L1-B1-MK6SK143`

**Cycle Count Line:**
- Item: `SKU-001`
- Expected: `50`
- Actual: `55`
- Discrepancy: `+5`

**Stock Transaction (Should Show):**
- `qty_change`: `+5`
- `qty_before`: `50`
- `qty_after`: `55`
- `transaction_type`: `'CycleCount'`
- `reference_doc`: `'CC-A1-R01-L1-B1-MK6SK143'`

**Stock Ledger (Should Show):**
- `qty`: `55` (updated from 50)
- `last_transaction_type`: `'CycleCount'`
- `last_transaction_ref`: `'CC-A1-R01-L1-B1-MK6SK143'`
- `last_transaction_date`: `2026-01-09 10:00:00` (or recent timestamp)

---

## Troubleshooting

### If Stock Was NOT Updated

**Check 1: Task Status**
```sql
SELECT title, status, items_with_discrepancy
FROM tabCycleCountTask
WHERE title = 'CC-A1-R01-L1-B1-MK6SK143';
```

- Status must be `'Completed'`
- If `items_with_discrepancy = 0`, no stock update is expected (no discrepancies)

**Check 2: Were There Discrepancies?**
```sql
SELECT 
    COUNT(*) as lines_with_discrepancy,
    SUM(CASE WHEN discrepancy != 0 THEN 1 ELSE 0 END) as non_zero_discrepancies
FROM tabCycleCountLine
WHERE parent_title = 'CC-A1-R01-L1-B1-MK6SK143'
  AND actual_qty IS NOT NULL;
```

- If `non_zero_discrepancies = 0`, no stock update is expected

**Check 3: Check Server Logs**
Look for these log messages:
```
[Cycle Count] ✅ Completed task ...
[Cycle Count] 📊 Found X lines with discrepancies
[Cycle Count] ✅ Updated stock for ...
```

**Check 4: Verify Tables Exist**
```sql
SELECT TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME IN ('tabStockLedger', 'tabStockTransaction');
```

Both tables should exist.

---

## Quick Verification Script

Run this complete verification query:

```sql
-- Complete verification for a cycle count task
SELECT 
    'Task Info' as section,
    cct.title,
    cct.status,
    cct.items_with_discrepancy,
    cct.counted_items,
    cct.total_items
FROM tabCycleCountTask cct
WHERE cct.title = 'CC-A1-R01-L1-B1-MK6SK143'

UNION ALL

SELECT 
    'Stock Transactions' as section,
    CONCAT('Found ', COUNT(*), ' transactions') as info,
    NULL as status,
    NULL as items_with_discrepancy,
    NULL as counted_items,
    NULL as total_items
FROM tabStockTransaction
WHERE transaction_type = 'CycleCount'
  AND reference_doc = 'CC-A1-R01-L1-B1-MK6SK143'

UNION ALL

SELECT 
    'Stock Ledger Updates' as section,
    CONCAT('Found ', COUNT(*), ' items updated') as info,
    NULL as status,
    NULL as items_with_discrepancy,
    NULL as counted_items,
    NULL as total_items
FROM tabStockLedger
WHERE last_transaction_type = 'CycleCount'
  AND last_transaction_ref = 'CC-A1-R01-L1-B1-MK6SK143';
```

---

## Summary

**To verify stock was updated:**

1. ✅ Check `tabStockTransaction` - Should have records with `transaction_type = 'CycleCount'`
2. ✅ Check `tabStockLedger` - Should have `last_transaction_type = 'CycleCount'` and `last_transaction_ref = task title`
3. ✅ Verify quantities match - Stock should reflect `actual_qty` from cycle count
4. ✅ Check timestamps - `last_transaction_date` should be recent

**If stock was NOT updated:**
- Check task status (must be "Completed")
- Check if there were discrepancies (`items_with_discrepancy > 0`)
- Check server logs for errors
- Verify tables exist
