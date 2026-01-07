# Fix: Total Stock Not Showing Correctly

## Problem

The **Item Location Breakdown** shows the correct total (425 units) by summing all locations, but the **main Items screen** might show a different value in the `Stock Qty` column.

## Root Cause

The `tabItem.stock_qty` field might not be updated correctly after putaway operations. This field should always equal the sum of all `tabStockLedger.qty` for that item.

## Solution

### Quick Fix: Run SQL Script

Run the diagnostic and fix script:

```sql
-- Run CHECK_STOCK_CALCULATION.sql to diagnose
-- Then run the fix below
```

**Fix Script:**
```sql
-- Update tabItem.stock_qty to match sum from tabStockLedger
UPDATE tabItem
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger
  WHERE item_code = tabItem.code
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1 
  FROM tabStockLedger 
  WHERE item_code = tabItem.code
);
```

### Verify the Fix

After running the fix, verify:

```sql
-- Check if stock_qty matches ledger total
SELECT 
  i.code as item_code,
  i.name as item_name,
  i.stock_qty as item_stock_qty,
  COALESCE(SUM(sl.qty), 0) as ledger_total_qty,
  CASE 
    WHEN ABS(i.stock_qty - COALESCE(SUM(sl.qty), 0)) < 0.01 THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as status
FROM tabItem i
LEFT JOIN tabStockLedger sl ON sl.item_code = i.code
WHERE i.code = 'SKU-HAT-301-BLU-OS'
GROUP BY i.code, i.name, i.stock_qty;
```

## Expected Behavior

### Item Location Breakdown (Correct)
- Shows **all locations** with quantities
- **Total Qty** = Sum of all locations (e.g., 425)
- This is calculated from `tabStockLedger` directly

### Main Items Screen (Should Match)
- **Stock Qty** column should show the same total (425)
- This comes from `tabItem.stock_qty`
- Should equal the sum of all `tabStockLedger` entries

## Why This Happens

1. **Stock updates might fail silently** - If the update query fails, `tabItem.stock_qty` doesn't get updated
2. **Multiple warehouses** - If stock exists in multiple warehouses, the sum includes all of them
3. **Existing stock** - If there was stock before putaway (200 units), the total (425) includes both old and new stock

## Understanding the Numbers

For **SKU-HAT-301-BLU-OS**:
- **Putaway Task:** 225 units put away (3 lines: 150 + 50 + 25)
- **Location Breakdown:** 425 total units
  - A1-R01-L1-B1-B1: 300 units
  - SL-01: 25 units  
  - STAGE-01-SL-01: 100 units
- **Difference:** 200 units (425 - 225 = 200)

This means:
- **200 units** were already in stock before this putaway
- **225 units** were added by the putaway task
- **Total = 425 units** (correct!)

## If You Want Only Putaway Quantity

If you want to see only the quantity from putaway tasks (not total stock), you would need to:
1. Query `tabPutawayLine` instead of `tabStockLedger`
2. Sum quantities from putaway lines only

But typically, **total stock** should include all sources (receiving, putaway, adjustments, etc.).

## Prevention

The API should automatically update `tabItem.stock_qty` after each putaway operation. If it's not updating:

1. **Check API logs** for errors during stock updates
2. **Verify the update query runs** - Check if `UPDATE tabItem SET stock_qty = ...` is executed
3. **Check for transaction rollbacks** - If the transaction rolls back, stock_qty won't be updated

## Manual Update Script

If automatic updates aren't working, you can run this periodically:

```sql
-- Update all items' stock_qty from stock ledger
UPDATE tabItem i
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger sl
  WHERE sl.item_code = i.code
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1 
  FROM tabStockLedger sl 
  WHERE sl.item_code = i.code
);
```

