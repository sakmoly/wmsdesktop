# Material Request Stock Sync Fix - Summary

## ✅ Backend Fix Applied

### Problem
Material Request picking was updating `tabItem.stock_qty` from `tabStockLedger` only, but Item Location Breakdown uses `tabCartonStock`. This caused a discrepancy:
- **Main Items Table:** 146 (from `tabStockLedger`)
- **Item Location Breakdown:** 148 (from `tabCartonStock`)

### Fix
Updated `pickMaterialRequestItems` in `materialRequestController.js` to:
1. **Check if `tabCartonStock` exists and has data**
2. **If yes:** Use `tabCartonStock` sum (latest records only, matching Item Location Breakdown query)
3. **If no:** Fall back to `tabStockLedger` sum

**Priority:** `tabCartonStock` > `tabStockLedger`

This ensures both the Main Items table and Item Location Breakdown show the same quantity.

---

## 📋 Next Steps

### Step 1: Run Diagnostic Script

```sql
-- Run SCRIPTS/CheckStockSyncForMaterialRequest.sql
-- This will show current state and identify issues
```

### Step 2: Run Fix Script

```sql
-- Run SCRIPTS/FixMaterialRequestStockSync.sql
-- This will:
-- 1. Remove duplicate records in tabCartonStock
-- 2. Sync tabItem.stock_qty from tabCartonStock (priority)
-- 3. Sync tabItem.stock_qty from tabStockLedger (fallback)
-- 4. Verify sync
```

### Step 3: Ensure Triggers Are Active

```sql
-- Run SCRIPTS/CreateStockSyncTriggers.sql
-- This ensures automatic sync going forward
```

### Step 4: Restart API Server

```bash
# Restart the API server to apply code changes
cd wms-api
npm restart
```

### Step 5: Test Material Request Picking

1. Pick items for a Material Request
2. Check Main Items table
3. Check Item Location Breakdown
4. Both should show the same quantity

---

## 🎯 Expected Behavior

**Before Fix:**
- Main Items: `146` (from `tabStockLedger`)
- Item Location Breakdown: `148` (from `tabCartonStock`)
- **Difference:** `2 units`

**After Fix:**
- Main Items: `148` (from `tabCartonStock` - prioritized)
- Item Location Breakdown: `148` (from `tabCartonStock`)
- **Difference:** `0 units` ✅

---

**Status:** ✅ **BACKEND FIX APPLIED**  
**Database Fix:** 🔧 **REQUIRED** (Run fix script)  
**Date:** 2026-01-13
