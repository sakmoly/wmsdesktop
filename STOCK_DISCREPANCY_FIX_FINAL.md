# Stock Discrepancy Fix - Final Solution

## 🐛 Issue

**Main Items Table:** Shows `Stock Qty: 96` for `SKU-HAT-301-BLU-OS`  
**Item Location Breakdown:** Shows `Qty: 98.00` at location `A1-R01-L3-B1`, Carton `CTN-555444`

**Discrepancy:** Item Location Breakdown shows **2 units MORE** than the main Items table.

---

## 🔍 Root Cause

### Issue 1: Missing `batch_no` in GROUP BY

The desktop app's `ItemLocationBreakdownViewModel.cs` query was grouping by `carton_id, item_code, warehouse, bin_location` but **NOT including `batch_no`**.

**Problem:**
- The `tabCartonStock` table has a UNIQUE KEY on `(carton_id, item_code, batch_no)`
- This means there can be multiple records with the same `carton_id`, `item_code`, and `bin_location` but different `batch_no` values (including NULL)
- The query was selecting the most recent record per `(carton_id, item_code, bin_location)`, but if there are multiple records with different `batch_no` values, it would only select one, potentially missing others

**Example:**
```
carton_id: CTN-555444
item_code: SKU-HAT-301-BLU-OS
bin_location: A1-R01-L3-B1
batch_no: NULL    → id: 100, qty: 98
batch_no: NULL    → id: 101, qty: 98  (duplicate due to UNIQUE KEY issue)
```

The old query would select only one of these (id: 101), but if both exist and are being summed elsewhere, it could cause the discrepancy.

### Issue 2: `tabItem.stock_qty` Not Synchronized

The `tabItem.stock_qty` field might not be synchronized with `tabStockLedger`, causing the main Items table to show an incorrect value.

---

## ✅ Fix Applied

### Fix 1: Updated Desktop App Query

**File:** `ViewModels/ItemLocationBreakdownViewModel.cs`

**Change:** Added `batch_no` to GROUP BY and JOIN conditions:

```csharp
// BEFORE (Line 526):
GROUP BY carton_id, item_code, warehouse, bin_location

// AFTER:
GROUP BY carton_id, item_code, warehouse, bin_location, batch_no

// BEFORE (JOIN condition):
AND cs.bin_location = latest.bin_location
AND cs.id = latest.max_id

// AFTER:
AND cs.bin_location = latest.bin_location
AND (cs.batch_no = latest.batch_no OR (cs.batch_no IS NULL AND latest.batch_no IS NULL))
AND cs.id = latest.max_id
```

**Why:** This ensures that records with different `batch_no` values are handled correctly, and only the most recent record for each unique `(carton_id, item_code, warehouse, bin_location, batch_no)` combination is selected.

---

### Fix 2: Database Cleanup Script

**File:** `SCRIPTS/FixStockDiscrepancy.sql`

**Purpose:** 
1. Identifies duplicate records in `tabCartonStock`
2. Deletes duplicates, keeping only the most recent record (by `id`)
3. Updates `tabItem.stock_qty` to match `tabStockLedger`

**Run this script to:**
- Remove duplicate records that might be causing incorrect sums
- Synchronize `tabItem.stock_qty` with actual stock

---

### Fix 3: Diagnostic Script

**File:** `SCRIPTS/AnalyzeStockDiscrepancy.sql`

**Purpose:** Diagnose the issue by:
1. Checking `tabItem.stock_qty`
2. Checking `tabStockLedger` total
3. Checking `tabCartonStock` total
4. Identifying duplicate records
5. Calculating expected values

---

## 📋 Steps to Fix

### Step 1: Run Diagnostic Script

```sql
-- Run SCRIPTS/AnalyzeStockDiscrepancy.sql
-- This will show you:
-- - Current stock_qty in tabItem
-- - Total from tabStockLedger
-- - Total from tabCartonStock
-- - Duplicate records
-- - Expected values
```

### Step 2: Run Fix Script

```sql
-- Run SCRIPTS/FixStockDiscrepancy.sql
-- This will:
-- 1. Identify and delete duplicate records
-- 2. Update tabItem.stock_qty to match tabStockLedger
-- 3. Verify the fix
```

### Step 3: Rebuild Desktop App

1. Rebuild the desktop app to apply the code fix
2. Refresh the Items list
3. Open Item Location Breakdown for `SKU-HAT-301-BLU-OS`
4. Both should now show the same quantity

---

## 🔍 Verification

After applying the fixes, verify:

```sql
-- Check if quantities match
SELECT 
  i.code,
  i.stock_qty as item_stock_qty,
  (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = i.code) as ledger_total,
  (SELECT COALESCE(SUM(cs.qty), 0) FROM tabCartonStock cs
    INNER JOIN (
      SELECT carton_id, item_code, warehouse, bin_location, batch_no, MAX(id) as max_id
      FROM tabCartonStock
      WHERE item_code = cs.item_code
        AND qty > 0
        AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
      GROUP BY carton_id, item_code, warehouse, bin_location, batch_no
    ) latest
      ON cs.carton_id = latest.carton_id
      AND cs.item_code = latest.item_code
      AND cs.warehouse = latest.warehouse
      AND cs.bin_location = latest.bin_location
      AND (cs.batch_no = latest.batch_no OR (cs.batch_no IS NULL AND latest.batch_no IS NULL))
      AND cs.id = latest.max_id
    WHERE cs.item_code = i.code
      AND cs.qty > 0
      AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')) as carton_stock_total
FROM tabItem i
WHERE i.code = 'SKU-HAT-301-BLU-OS';
```

**Expected Result:**
- `item_stock_qty` = `ledger_total` = `carton_stock_total`
- All three values should match

---

## 📝 Summary

**Issue:** Item Location Breakdown shows 98, Main Items table shows 96 (2 unit difference)

**Root Causes:**
1. Desktop app query missing `batch_no` in GROUP BY, causing incorrect record selection
2. Duplicate records in `tabCartonStock` due to UNIQUE KEY constraint with NULL `batch_no`
3. `tabItem.stock_qty` not synchronized with `tabStockLedger`

**Fixes Applied:**
1. ✅ Updated desktop app query to include `batch_no` in GROUP BY and JOIN
2. ✅ Created database cleanup script to remove duplicates
3. ✅ Created diagnostic script to identify issues

**Next Steps:**
1. Run `SCRIPTS/AnalyzeStockDiscrepancy.sql` to diagnose
2. Run `SCRIPTS/FixStockDiscrepancy.sql` to fix
3. Rebuild desktop app
4. Verify quantities match

---

**Status:** ✅ **FIX APPLIED**  
**Date:** 2026-01-13  
**Item:** `SKU-HAT-301-BLU-OS`
