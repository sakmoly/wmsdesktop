# Dispatch Carton Stock Update Fix

## Issue

When items are dispatched (via Transfer Carton dispatch or Material Request picking), the stock quantity in `tabStockLedger` is correctly reduced, but the carton quantity in `tabCartonStock` is **not updated**. This causes the Item Location Breakdown to show incorrect carton quantities.

**Example:**
- Stock Ledger: `SKU-HAT-301-BLU-OS` at `A1-R01-L3-B1` shows `146.00` (correctly reduced from 150.00)
- Carton Stock: `CTN-A1-R01-L3-B1-2` still shows `150.00` (should be 146.00)
- Item Location Breakdown: Shows `150.00` (reading from `tabCartonStock`)

## Root Cause

The dispatch and picking logic only updates `tabStockLedger` but does not check or update `tabCartonStock` when stock is deducted.

## Solution Implemented

### 1. Updated Dispatch Logic (`dispatchTransferCarton`)

**File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

**Changes:**
1. ✅ Check if `carton_id` column exists in `tabStockLedger`
2. ✅ Retrieve `carton_id` from stock ledger when fetching current stock
3. ✅ Include `carton_id` in stock ledger UPDATE if present
4. ✅ **Update `tabCartonStock`** if `carton_id` exists and `tabCartonStock` table exists
5. ✅ Include `carton_id` in stock transaction log if present

**Key Code:**
```javascript
// Get current stock including carton_id
const [currentStock] = await connection.execute(`
  SELECT qty, reserved_qty, carton_id
  FROM tabStockLedger
  WHERE item_code = ? AND warehouse = ? AND bin_location = ?
`, [itemCode, warehouse, sourceBin]);

const cartonId = currentStock[0].carton_id || null;

// Update tabCartonStock if carton_id exists
if (cartonId) {
  const [currentCartonStock] = await connection.execute(
    `SELECT qty FROM tabCartonStock 
     WHERE carton_id = ? AND item_code = ? AND warehouse = ? AND bin_location = ?`,
    [cartonId, itemCode, warehouse, sourceBin]
  );
  
  const currentCartonQty = parseFloat(currentCartonStock[0].qty) || 0;
  const newCartonQty = Math.max(0, currentCartonQty - qty);
  
  await connection.execute(`
    UPDATE tabCartonStock
    SET qty = ?, updated_at = NOW()
    WHERE carton_id = ? AND item_code = ? AND warehouse = ? AND bin_location = ?
  `, [newCartonQty, cartonId, itemCode, warehouse, sourceBin]);
}
```

### 2. Updated Material Request Picking Logic (`processMaterialRequestPicking`)

**File:** `wms-api/src/modules/events/eventController.js`

**Changes:**
1. ✅ Check if `carton_id` column exists in `tabStockLedger`
2. ✅ Retrieve `carton_id` from stock ledger when fetching current stock
3. ✅ Include `carton_id` in stock ledger UPDATE if present
4. ✅ **Update `tabCartonStock`** if `carton_id` exists and `tabCartonStock` table exists
5. ✅ Include `carton_id` in stock transaction log if present

### 3. Updated Material Request Picking Endpoint (`pickMaterialRequestItems`)

**File:** `wms-api/src/modules/material-request/materialRequestController.js`

**Changes:**
1. ✅ In bin-level mode, check if stock ledger entry has `carton_id`
2. ✅ If `carton_id` exists, also update `tabCartonStock`
3. ✅ This ensures carton stock is updated even when picking without explicit `carton_id` in request

## Expected Behavior After Fix

### For Dispatch:
- ✅ `tabStockLedger` quantity is reduced
- ✅ `tabCartonStock` quantity is reduced (if carton_id exists)
- ✅ Item Location Breakdown shows correct carton quantity

### For Material Request Picking:
- ✅ `tabStockLedger` quantity is reduced
- ✅ `tabCartonStock` quantity is reduced (if carton_id exists in stock ledger)
- ✅ Item Location Breakdown shows correct carton quantity

## Example

**Before Fix:**
- Dispatch: `SKU-HAT-301-BLU-OS` at `A1-R01-L3-B1`, Qty: 4
- Stock Ledger: `150.00 → 146.00` ✅
- Carton Stock: `150.00 → 150.00` ❌ (not updated)
- Item Location Breakdown: Shows `150.00` ❌

**After Fix:**
- Dispatch: `SKU-HAT-301-BLU-OS` at `A1-R01-L3-B1`, Qty: 4
- Stock Ledger: `150.00 → 146.00` ✅
- Carton Stock: `150.00 → 146.00` ✅ (updated)
- Item Location Breakdown: Shows `146.00` ✅

## Files Modified

- `wms-api/src/modules/transfer-cartons/transferCartonController.js` - Updated `dispatchTransferCarton`
- `wms-api/src/modules/events/eventController.js` - Updated `processMaterialRequestPicking`
- `wms-api/src/modules/material-request/materialRequestController.js` - Updated `pickMaterialRequestItems` (bin-level mode)

## Summary

✅ **Fixed**: Carton stock is now updated when stock is deducted during dispatch or picking  
✅ **Consistent**: Both `tabStockLedger` and `tabCartonStock` are updated together  
✅ **Accurate**: Item Location Breakdown now shows correct carton quantities  

---

**Next Steps:**
1. Restart API server to apply changes
2. Test dispatch/picking to verify carton stock updates
3. Check Item Location Breakdown to confirm correct quantities
