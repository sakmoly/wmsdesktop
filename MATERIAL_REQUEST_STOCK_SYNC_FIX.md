# Material Request Stock Sync Fix

## 🐛 Issue

**Problem:** Material Request process is working, but stock quantities don't match between:
- **Main Items Table:** Shows `Stock Qty: 146` (from `tabItem.stock_qty`)
- **Item Location Breakdown:** Shows `Qty: 148.00` (from `tabCartonStock`)

**Discrepancy:** 2 units difference

---

## 🔍 Root Cause

### Issue 1: Different Data Sources

**Main Items Table:**
- Uses `tabItem.stock_qty`
- Updated from `tabStockLedger` sum (line 1523-1536 in `materialRequestController.js`)

**Item Location Breakdown:**
- Uses `tabCartonStock` (latest records only)
- Queries with `GROUP BY carton_id, item_code, warehouse, bin_location, batch_no`

**Problem:** If `tabStockLedger` and `tabCartonStock` are not in sync, the quantities will differ.

---

### Issue 2: Duplicate Records in `tabCartonStock`

Even with the fix to include `batch_no` in GROUP BY, there might be existing duplicate records causing incorrect sums.

---

### Issue 3: Triggers May Not Be Active

The database triggers that automatically sync `tabItem.stock_qty` might not be active or might not be working correctly.

---

## ✅ Solution

### Step 1: Run Diagnostic Script

```sql
-- Run SCRIPTS/CheckStockSyncForMaterialRequest.sql
-- This will show:
-- - tabItem.stock_qty
-- - tabStockLedger total
-- - tabCartonStock total (latest records only)
-- - Duplicate records
-- - Trigger status
-- - Material Request transactions
```

### Step 2: Run Fix Script

```sql
-- Run SCRIPTS/FixMaterialRequestStockSync.sql
-- This will:
-- 1. Check trigger status
-- 2. Remove duplicate records in tabCartonStock
-- 3. Sync tabItem.stock_qty from tabCartonStock (priority)
-- 4. Sync tabItem.stock_qty from tabStockLedger (fallback)
-- 5. Verify sync for specific item
```

### Step 3: Ensure Triggers Are Active

```sql
-- Run SCRIPTS/CreateStockSyncTriggers.sql
-- This will create/update triggers to automatically sync tabItem.stock_qty
```

---

## 🔧 Backend Code Analysis

### Material Request Picking Updates Both Tables

**Location:** `wms-api/src/modules/material-request/materialRequestController.js`

**Carton-Level Mode (Lines 1050-1113):**
- Updates `tabCartonStock` ✅
- Does NOT update `tabStockLedger` ❌ (only carton-level)

**Bin-Level Mode (Lines 1114-1343):**
- Updates `tabStockLedger` ✅
- Updates `tabCartonStock` if `carton_id` provided ✅ (Lines 1344-1400)

**tabItem.stock_qty Update (Lines 1520-1537):**
- Calculated from `tabStockLedger` sum only
- **Problem:** If carton-level mode, should use `tabCartonStock` instead

---

## 🔧 Fix Required

### Update `tabItem.stock_qty` Calculation

**Current Code (Lines 1520-1537):**
```javascript
// Update tabItem.stock_qty for affected items
const itemCodes = [...new Set(items.map(item => item.item_code).filter(Boolean))];
for (const itemCode of itemCodes) {
  const [stockSum] = await connection.execute(`
    SELECT COALESCE(SUM(qty), 0) as total_qty
    FROM tabStockLedger
    WHERE item_code = ? AND warehouse = ?
  `, [itemCode, targetWarehouse]);
  
  const totalStockQty = parseFloat(stockSum[0].total_qty) || 0;
  
  await connection.execute(`
    UPDATE tabItem
    SET stock_qty = ?,
        updated_at = NOW()
    WHERE code = ?
  `, [totalStockQty, itemCode]);
}
```

**Problem:** Always uses `tabStockLedger`, but should prioritize `tabCartonStock` if carton-level mode.

**Fix:** Check if `tabCartonStock` exists and has data, use that; otherwise use `tabStockLedger`.

---

## 📋 Implementation Steps

### 1. Update Backend Code

Modify `pickMaterialRequestItems` to:
- Check if `tabCartonStock` has data for the item
- If yes, use `tabCartonStock` sum (latest records only)
- If no, use `tabStockLedger` sum

### 2. Run Database Fix Script

```sql
-- Run SCRIPTS/FixMaterialRequestStockSync.sql
-- This will sync existing data
```

### 3. Ensure Triggers Are Active

```sql
-- Run SCRIPTS/CreateStockSyncTriggers.sql
-- This will ensure automatic sync going forward
```

### 4. Rebuild Desktop App

- Rebuild to ensure code changes are applied
- Refresh Items list
- Verify Item Location Breakdown matches

---

## 🎯 Expected Behavior After Fix

**Before Fix:**
- Main Items table: `146` (from `tabStockLedger`)
- Item Location Breakdown: `148` (from `tabCartonStock`)
- **Difference:** `2 units`

**After Fix:**
- Main Items table: `148` (from `tabCartonStock` - prioritized)
- Item Location Breakdown: `148` (from `tabCartonStock`)
- **Difference:** `0 units` ✅

---

**Status:** 🔧 **FIX REQUIRED**  
**Date:** 2026-01-13  
**Item:** `SKU-HAT-301-BLU-OS`
