# Stock Ledger Issue in Picking - Analysis

## Problem Identified

**Transfer Carton Details:**
- Items packed: 2 of each (SKU-HAT-301-BLU-OS, SKU-HAT-301-GRN-OS, SKU-JACKET-201-BLK-L, SKU-JACKET-201-BLK-M)
- Source Carton: `CTN-555444` for all items
- Total packed: 8 items (2 × 4 items)

**Stock Ledger:**
- `SKU-HAT-301-GRN-OS` at `A1-R01-L3-B1`: Quantity `99.00`, Qty +/- `100.00`, Last Transaction Type `Picking`, Last Transaction Ref `MR-123457`
- `SKU-HAT-301-BLU-OS` at `A1-R01-L3-B1`: Quantity `98.00`, Qty +/- `100.00`, Last Transaction Type `Picking`, Last Transaction Ref `MR-123457`

**Discrepancy:**
- Stock Ledger shows **100 items reduced** (Qty +/-: 100.00) during picking
- Transfer Carton shows only **2 items packed** per item
- **Stock was reduced by 100, but only 2 were actually packed!**

---

## Root Cause Analysis

### Issue 1: Stock Reduced During Picking (Not Packing)

**Current Flow:**
1. User picks items via `POST /api/material-requests/:title/pick-items`
   - This API **reduces stock immediately** in `tabStockLedger` and `tabCartonStock`
   - Stock is reduced by the `picked_qty` (e.g., 100)

2. User packs items to Transfer Carton
   - Items are packed via `PACK_ITEM_TO_TC` events
   - Only 2 items per item were actually packed
   - **But stock was already reduced by 100 during picking!**

3. Transfer Carton is dispatched
   - `dispatchTransferCarton` tries to reduce stock again
   - But stock was already reduced during picking
   - **Double reduction or incorrect quantities**

### Issue 2: Stock Reduction Happens Too Early

**Problem:** Stock should be reduced when items are **dispatched** (sent out), not when they are **picked** (collected from bin).

**Correct Flow Should Be:**
1. **Picking:** Collect items from bin → No stock reduction (items still in warehouse)
2. **Packing:** Pack items to Transfer Carton → No stock reduction (items still in warehouse)
3. **Dispatching:** Send Transfer Carton out → **Stock reduction happens here** (items leaving warehouse)

**Current Flow (Wrong):**
1. **Picking:** Collect items → **Stock reduced immediately** ❌
2. **Packing:** Pack to TC → No additional reduction
3. **Dispatching:** Send out → Tries to reduce again (but already reduced) ❌

---

## Expected Behavior

### Stock Ledger Should Show:

**After Picking (Items Collected):**
- Stock should **NOT be reduced** yet
- Items are still in warehouse (just moved to staging/picking area)

**After Packing (Items in Transfer Carton):**
- Stock should **NOT be reduced** yet
- Items are still in warehouse (in sealed Transfer Carton)

**After Dispatching (Transfer Carton Sent Out):**
- Stock **SHOULD be reduced** here
- Items are leaving the warehouse
- Reduction should match **actual packed quantities** (2 per item, not 100)

---

## Current Code Issues

### 1. `pickMaterialRequestItems` Reduces Stock Too Early

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Line 1189-1195:** Stock is reduced during picking:
```javascript
// Update stock ledger (decrease from source bin)
await connection.execute(`
  INSERT INTO tabStockLedger 
    (${insertFields})
  VALUES (${insertValues})
  ON DUPLICATE KEY UPDATE
    ${updateFields}
`, [...insertParams, ...updateParams]);
```

**Problem:** This reduces stock when items are picked, but items are still in the warehouse.

### 2. `dispatchTransferCarton` Tries to Reduce Stock Again

**File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

**Line 956-965:** Stock is reduced again during dispatch:
```javascript
// Update stock ledger (decrease from source bin)
await connection.execute(
  `
  INSERT INTO tabStockLedger 
    (${insertFields})
  VALUES (${insertValues})
  ON DUPLICATE KEY UPDATE
    ${updateFields}
  `,
  [...insertParams, ...updateParams]
);
```

**Problem:** Stock was already reduced during picking, so this causes incorrect quantities.

---

## Solution Options

### Option 1: Don't Reduce Stock During Picking (Recommended)

**Change:** Remove stock reduction from `pickMaterialRequestItems`

**Keep stock reduction only in:**
- `dispatchTransferCarton` - When Transfer Carton is dispatched (items leave warehouse)

**Pros:**
- ✅ Stock matches actual quantities dispatched
- ✅ No double reduction
- ✅ Stock reflects items still in warehouse

**Cons:**
- ⚠️ Stock will show items as "available" even if they're picked (but not dispatched)
- ⚠️ Need to track "picked but not dispatched" separately

### Option 2: Reduce Stock Only When Dispatched (Current Intended Behavior)

**Change:** 
- Remove stock reduction from `pickMaterialRequestItems`
- Keep stock reduction in `dispatchTransferCarton`
- Use **actual packed quantities** from Transfer Carton events (not picked quantities)

**Pros:**
- ✅ Stock matches dispatched quantities
- ✅ No double reduction
- ✅ Accurate inventory

**Cons:**
- ⚠️ Need to fix existing incorrect stock ledger entries

### Option 3: Use Reserved Quantity During Picking

**Change:**
- During picking: Reduce `available_qty` but keep `qty` (reserve stock)
- During dispatching: Reduce `qty` (actually remove stock)

**Pros:**
- ✅ Shows reserved stock
- ✅ Accurate available quantities

**Cons:**
- ⚠️ More complex logic
- ⚠️ Need to handle cancellation of picks

---

## Recommended Fix

**Use Option 2: Reduce Stock Only When Dispatched**

### Changes Required:

1. **Remove stock reduction from `pickMaterialRequestItems`:**
   - Don't update `tabStockLedger` during picking
   - Don't update `tabCartonStock` during picking
   - Only update `picked_qty` in `tabMaterialRequestItem`

2. **Fix `dispatchTransferCarton` to use actual packed quantities:**
   - Get quantities from Transfer Carton events (not from Material Request)
   - Reduce stock by actual packed quantities (2 per item, not 100)

3. **Fix existing incorrect stock ledger entries:**
   - Run SQL script to correct quantities
   - Add back stock that was incorrectly reduced during picking

---

## SQL Script to Fix Existing Data

```sql
-- Find Material Requests where stock was incorrectly reduced
-- Add back the difference between picked_qty and actual packed quantities

-- This is a complex fix that requires:
-- 1. Finding all Material Requests with dispatched Transfer Cartons
-- 2. Calculating actual packed quantities from events
-- 3. Calculating incorrectly reduced quantities from picking
-- 4. Adding back the difference
```

---

## Summary

**Root Cause:** Stock is being reduced during **picking** (when items are collected), but should only be reduced during **dispatching** (when items leave warehouse).

**Impact:** 
- Stock Ledger shows incorrect quantities (reduced by 100, but only 2 were packed)
- Double reduction when dispatching
- Inventory accuracy issues

**Fix:** Remove stock reduction from picking, only reduce stock when Transfer Carton is dispatched using actual packed quantities.

---

**Status:** 🔍 **ANALYSIS COMPLETE - FIX REQUIRED**  
**Date:** 2026-01-13
