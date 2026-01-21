# ASN vs Transfer In Putaway - Stock Update Comparison & Fix

**Date**: 2026-01-20  
**Status**: ✅ **FIXED**

---

## 🚨 Problem

**Issue**: Stock, stock ledger, and stock history not updating for Transfer In Putaway.

**Root Cause**: 
1. `completePutaway` API only checked ASN for warehouse (not Transfer In)
2. `processPutawayCompletionEvent` used wrong field (`warehouse` instead of `to_warehouse`) for Transfer In
3. Both should use the **same stock update logic** regardless of source type

---

## ✅ Changes Applied

### 1. Fixed `completePutaway` to Handle Transfer In Putaway

**File**: `wms-api/src/modules/putaway/putawayController.js`  
**Lines**: 2349-2382

**Before**: Only checked ASN for warehouse
```javascript
// Only checked ASN
if (taskInfo.length > 0 && taskInfo[0].advance_shipping_notice) {
  // Get warehouse from ASN only
}
```

**After**: Checks both ASN and Transfer In
```javascript
// Check if task is Transfer In or ASN
const isTransferInTask = (hasSourceType && task.source_type === 'TransferIn') || 
                         (hasTransferIn && task.transfer_in);

if (isTransferInTask) {
  // Transfer In: Get warehouse from tabTransferIn.to_warehouse
  if (hasTransferIn && task.transfer_in) {
    const [transferInInfo] = await connection.execute(
      `SELECT to_warehouse FROM tabTransferIn WHERE title = ? LIMIT 1`,
      [task.transfer_in]
    );
    if (transferInInfo.length > 0 && transferInInfo[0].to_warehouse) {
      warehouse = transferInInfo[0].to_warehouse;
    }
  }
} else if (hasAdvanceShippingNotice && task.advance_shipping_notice) {
  // ASN: Get warehouse from ASN (existing logic)
}
```

### 2. Fixed `processPutawayCompletionEvent` to Use Correct Field

**File**: `wms-api/src/modules/events/eventController.js`  
**Lines**: 2590-2598

**Before**: Used wrong field name
```javascript
const [transferInInfo] = await connection.execute(
  `SELECT warehouse FROM tabTransferIn WHERE name = ? LIMIT 1`,  // ❌ Wrong: 'warehouse' and 'name'
  [task.transfer_in]
);
```

**After**: Uses correct field
```javascript
const [transferInInfo] = await connection.execute(
  `SELECT to_warehouse FROM tabTransferIn WHERE title = ? LIMIT 1`,  // ✅ Correct: 'to_warehouse' and 'title'
  [task.transfer_in]
);
```

---

## 📊 Stock Update Logic (Same for Both)

Both ASN and Transfer In Putaway now use the **exact same stock update logic**:

### 1. Stock Ledger Update (MOVE Pattern)

**Location**: `wms-api/src/modules/putaway/putawayController.js` (Lines 2933-3048)

**Pattern**: MOVE (decrease from staging, increase at target)

```javascript
// STEP 1: Decrease stock at FROM location (staging)
await connection.execute(
  `INSERT INTO tabStockLedger (...) VALUES (...)
   ON DUPLICATE KEY UPDATE qty = ?`,
  [itemCode, warehouse, fromLocation, fromNewQty, ...]
);

// STEP 2: Increase stock at TO location (target)
await connection.execute(
  `INSERT INTO tabStockLedger (...) VALUES (...)
   ON DUPLICATE KEY UPDATE qty = ?`,
  [itemCode, warehouse, binLocation, newQty, ...]
);
```

### 2. Stock Transaction History

**Location**: `wms-api/src/modules/putaway/putawayController.js` (Lines 3154-3202)

**Creates transaction record**:
```javascript
INSERT INTO tabStockTransaction (
  transaction_date,
  transaction_type,  // 'Putaway'
  reference_doc,     // Putaway task title
  item_code,
  warehouse,
  bin_location,
  carton_id,
  qty_change,
  qty_before,
  qty_after,
  source_bin,
  target_bin,
  performed_by
) VALUES (...)
```

### 3. Carton Stock Update (if enabled)

**Location**: `wms-api/src/modules/putaway/putawayController.js` (Lines 3050-3143)

**Updates `tabCartonStock`** using MOVE pattern (same as stock ledger)

---

## 🔄 Complete Flow (Same for ASN and Transfer In)

### Step 1: Get Warehouse
```
ASN Putaway:
  → Get from tabPutawayTask.advance_shipping_notice
  → Lookup tabAdvanceShippingNotice.warehouse
  → Normalize to warehouse CODE

Transfer In Putaway:
  → Get from tabPutawayTask.transfer_in
  → Lookup tabTransferIn.to_warehouse  ✅ FIXED
  → Normalize to warehouse CODE
```

### Step 2: Process Putaway Lines
```
For each putaway line:
  1. Get FROM location (staging/receiving)
  2. Decrease stock at FROM location
  3. Increase stock at TO location (target)
  4. Create stock transaction record
  5. Update carton stock (if enabled)
```

### Step 3: Update Stock Ledger
```
INSERT INTO tabStockLedger (
  item_code,
  warehouse,      // ✅ Same for ASN and Transfer In
  bin_location,
  qty,
  carton_id,
  last_transaction_type,  // 'Putaway'
  last_transaction_ref   // Putaway task title
) VALUES (...)
ON DUPLICATE KEY UPDATE qty = ?
```

### Step 4: Create Stock Transaction
```
INSERT INTO tabStockTransaction (
  transaction_type,  // 'Putaway'
  reference_doc,      // Putaway task title
  item_code,
  warehouse,         // ✅ Same for ASN and Transfer In
  bin_location,
  carton_id,
  qty_change,
  qty_before,
  qty_after
) VALUES (...)
```

---

## ✅ Verification Checklist

### ASN Putaway
- ✅ Gets warehouse from `tabAdvanceShippingNotice.warehouse`
- ✅ Updates `tabStockLedger` with warehouse CODE
- ✅ Creates `tabStockTransaction` record
- ✅ Updates `tabCartonStock` (if enabled)

### Transfer In Putaway
- ✅ Gets warehouse from `tabTransferIn.to_warehouse` (FIXED)
- ✅ Updates `tabStockLedger` with warehouse CODE (SAME LOGIC)
- ✅ Creates `tabStockTransaction` record (SAME LOGIC)
- ✅ Updates `tabCartonStock` (if enabled) (SAME LOGIC)

---

## 📝 Summary

✅ **Both ASN and Transfer In use the same API**: `POST /api/putaway/complete`  
✅ **Both use the same stock update logic**: MOVE pattern (decrease from staging, increase at target)  
✅ **Both update the same tables**: `tabStockLedger`, `tabStockTransaction`, `tabCartonStock`  
✅ **Both normalize warehouse to CODE**: Ensures consistency  
✅ **Fixed warehouse retrieval**: Transfer In now uses `to_warehouse` field correctly  

**Result**: Stock, stock ledger, and stock history now update correctly for both ASN and Transfer In Putaway! 🎉
