# Transfer Carton Double Stock Reduction Fix

## 🐛 Issue

**Problem:** After dispatching a Transfer Carton, stock is reduced **twice** (doubled reduction), and Item Location Breakdown shows incorrect quantities.

**Root Cause:** Stock is being reduced in TWO places:
1. **During Picking** (`POST /api/material-requests/:title/pick-items`) - ✅ CORRECT
2. **During Dispatch** (`POST /api/transfer-cartons/dispatch`) - ❌ WRONG (causes double reduction)

---

## ✅ Fix Applied

**File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

**Change:** Disabled stock reduction in dispatch function for Material Requests.

**Before:**
```javascript
// For Material Request transfer cartons, reduce stock when dispatched
if (isMaterialRequest) {
  // ... stock reduction logic ...
}
```

**After:**
```javascript
// For Material Request transfer cartons, DO NOT reduce stock when dispatched
// Stock was already reduced during picking (POST /api/material-requests/:title/pick-items)
// Dispatch is just a status change to indicate the carton was physically sent out
// Reducing stock again would cause DOUBLE REDUCTION
if (false && isMaterialRequest) { // DISABLED: Stock already reduced during picking
  // ... stock reduction logic (disabled) ...
}
```

---

## 📋 Stock Reduction Workflow

### For Material Requests:

1. **Picking (Step 2):** ✅ **PRIMARY STOCK REDUCTION**
   - API: `POST /api/material-requests/:title/pick-items`
   - Reduces stock from `tabStockLedger` at bin level
   - Reduces stock from `tabCartonStock` at carton level
   - Updates `tabItem.stock_qty` (aggregated total)
   - Creates `tabStockTransaction` log entry

2. **Creating Transfer Carton (Step 4):** ✅ **NO STOCK REDUCTION**
   - API: `POST /api/transfer-cartons/create`
   - Just creates the transfer carton record
   - Does NOT reduce stock

3. **Sealing Transfer Carton (Step 5):** ✅ **NO STOCK REDUCTION**
   - API: `POST /api/transfer-cartons/seal`
   - Just updates status to "Sealed"
   - Does NOT reduce stock

4. **Dispatching Transfer Carton (Step 6):** ✅ **NO STOCK REDUCTION** (FIXED)
   - API: `POST /api/transfer-cartons/dispatch`
   - Just updates status to "Dispatched"
   - Does NOT reduce stock (stock was already reduced during picking)

### For Regular Transfer Orders (Non-Material Requests):

- Stock reduction happens during **dispatch** (as before)
- This fix only affects Material Requests

---

## 🔍 Why This Happens

### Material Request Workflow:
1. User picks items → Stock reduced immediately
2. User creates transfer carton → No stock change
3. User seals carton → No stock change
4. User dispatches carton → **Should NOT reduce stock again** (was already reduced)

### Previous Behavior (WRONG):
- Picking: Stock reduced ✅
- Dispatch: Stock reduced again ❌ → **DOUBLE REDUCTION**

### Fixed Behavior (CORRECT):
- Picking: Stock reduced ✅
- Dispatch: No stock reduction ✅ → **SINGLE REDUCTION**

---

## 🧪 Testing

### Test 1: Verify Stock Reduction During Picking

**Before Picking:**
```sql
SELECT stock_qty FROM tabItem WHERE code = 'SKU-HAT-301-BLU-OS';
SELECT qty FROM tabStockLedger WHERE item_code = 'SKU-HAT-301-BLU-OS' AND bin_location = 'A1-R01-L3-B1';
SELECT qty FROM tabCartonStock WHERE item_code = 'SKU-HAT-301-BLU-OS' AND carton_id = 'CTN-555444';
```

**Pick Items:**
```bash
POST /api/material-requests/MR-123461/pick-items
{
  "warehouse": "WH-MAIN",
  "user_id": "USER-150526",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "picked_qty": 2,
      "source_bin": "A1-R01-L3-B1",
      "carton_id": "CTN-555444"
    }
  ]
}
```

**After Picking:**
```sql
-- Stock should be reduced by 2
SELECT stock_qty FROM tabItem WHERE code = 'SKU-HAT-301-BLU-OS';
SELECT qty FROM tabStockLedger WHERE item_code = 'SKU-HAT-301-BLU-OS' AND bin_location = 'A1-R01-L3-B1';
SELECT qty FROM tabCartonStock WHERE item_code = 'SKU-HAT-301-BLU-OS' AND carton_id = 'CTN-555444';
```

### Test 2: Verify No Stock Reduction During Dispatch

**Before Dispatch:**
```sql
SELECT stock_qty FROM tabItem WHERE code = 'SKU-HAT-301-BLU-OS';
SELECT qty FROM tabStockLedger WHERE item_code = 'SKU-HAT-301-BLU-OS' AND bin_location = 'A1-R01-L3-B1';
SELECT qty FROM tabCartonStock WHERE item_code = 'SKU-HAT-301-BLU-OS' AND carton_id = 'CTN-555444';
```

**Dispatch Transfer Carton:**
```bash
POST /api/transfer-cartons/dispatch
{
  "tc_id": "TC-MR-123461-...",
  "dispatched_by": "USER-150526"
}
```

**After Dispatch:**
```sql
-- Stock should NOT change (same as before dispatch)
SELECT stock_qty FROM tabItem WHERE code = 'SKU-HAT-301-BLU-OS';
SELECT qty FROM tabStockLedger WHERE item_code = 'SKU-HAT-301-BLU-OS' AND bin_location = 'A1-R01-L3-B1';
SELECT qty FROM tabCartonStock WHERE item_code = 'SKU-HAT-301-BLU-OS' AND carton_id = 'CTN-555444';
```

**Expected Result:**
- Stock quantities should be **the same** before and after dispatch
- Only the transfer carton status should change to "Dispatched"

### Test 3: Verify Item Location Breakdown

1. Open desktop app
2. Go to Items screen
3. Select item: `SKU-HAT-301-BLU-OS`
4. Click "Show Location Breakdown"
5. Click "Refresh" button
6. Verify quantity matches `tabItem.stock_qty`

**Expected Result:**
- Item Location Breakdown should show correct quantity
- Should match `tabItem.stock_qty`
- Should match sum of `tabCartonStock` or `tabStockLedger`

---

## 📱 Mobile App Impact

**No changes required** - The mobile app can continue using the same API calls.

**Workflow:**
1. Pick items → Stock reduced ✅
2. Create transfer carton → No stock change ✅
3. Seal carton → No stock change ✅
4. Dispatch carton → No stock change ✅ (fixed)

---

## 🔧 Fixing Existing Double-Reduced Stock

If you have items that were already double-reduced, you can fix them by:

### Option 1: Add back the incorrectly reduced stock

```sql
-- Find items that were double-reduced during dispatch
-- (items with Dispatch transactions after Picking transactions)
SELECT 
  st1.item_code,
  st1.bin_location,
  st1.qty_change as picking_reduction,
  st2.qty_change as dispatch_reduction,
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

-- Add back the incorrectly reduced stock
UPDATE tabStockLedger sl
JOIN (
  SELECT 
    st2.item_code,
    st2.bin_location,
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
SET sl.qty = sl.qty + corrections.amount_to_add_back,
    sl.updated_at = NOW();
```

### Option 2: Recalculate from transactions

```sql
-- Recalculate stock from transaction history
-- (This is more complex and may require custom logic)
```

---

## ✅ Verification Checklist

After dispatching a Material Request Transfer Carton:

- [ ] `tabItem.stock_qty` is NOT reduced (same as before dispatch)
- [ ] `tabStockLedger.qty` at bin is NOT reduced (same as before dispatch)
- [ ] `tabCartonStock.qty` at carton is NOT reduced (same as before dispatch)
- [ ] Item Location Breakdown shows correct quantity
- [ ] Main Items table shows correct quantity
- [ ] Both Item Location Breakdown and Main Items table match
- [ ] Transfer carton status is "Dispatched"

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-13  
**API Endpoint:** `POST /api/transfer-cartons/dispatch`  
**Impact:** Material Request transfer cartons only (regular Transfer Orders unchanged)
