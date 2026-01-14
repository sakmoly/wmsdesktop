# Material Request Bin-Level Stock Reduction Fix

## Issue

**Problem:** When submitting Material Request, stock is reduced at item level (`tabItem.stock_qty`) but NOT at bin level (`tabStockLedger` with `bin_location`).

**Expected Behavior:**
- Stock should be reduced from the specific bin location (`bin_location` in `tabStockLedger`)
- Item Location Breakdown should show updated quantities at each bin

---

## Current Stock Reduction Points

### 1. **POST /api/material-requests/:title/pick-items** (During Picking)

**Endpoint:** `POST /api/material-requests/:title/pick-items`

**Request Body:**
```json
{
  "items": [
    {
      "item_code": "SKU-JACKET-201-BLK-L",
      "picked_qty": 2.00,
      "source_bin": "A1-R01-L3-B1",
      "warehouse": "WH-MAIN"
    }
  ]
}
```

**What it does:**
- ✅ Updates `tabMaterialRequestItem.picked_qty`
- ✅ Reduces stock from `tabStockLedger` at bin level (line 1226-1233)
- ✅ Updates `tabCartonStock` if carton_id provided
- ✅ Updates `tabItem.stock_qty` (aggregated)

**Stock Reduction Code:**
```javascript
// Update stock ledger (decrease from source bin)
await connection.execute(`
  INSERT INTO tabStockLedger 
    (item_code, warehouse, bin_location, qty, reserved_qty, qty_before, qty_reduced, ...)
  VALUES (?, ?, ?, ?, ?, ?, ?, ...)
  ON DUPLICATE KEY UPDATE
    qty = ?,
    qty_before = ?,
    qty_reduced = ?,
    ...
`, [item_code, warehouse, source_bin, newQty, ...]);
```

**✅ This correctly reduces stock at bin level IF `source_bin` is provided.**

---

### 2. **POST /api/transfer-cartons/dispatch** (During Dispatch)

**Endpoint:** `POST /api/transfer-cartons/dispatch`

**Request Body:**
```json
{
  "tc_id": "TC-MR-123457-1768306175846",
  "dispatched_by": "USER-001"
}
```

**What it does:**
- ✅ Gets items from transfer carton (from `tabWmsScanEvent`)
- ✅ Gets source bins from packing events
- ✅ Reduces stock from `tabStockLedger` at bin level (line 955-965)
- ✅ Updates `tabItem.stock_qty` (aggregated)

**Stock Reduction Code:**
```javascript
// Update stock ledger (decrease from source bin)
await connection.execute(`
  INSERT INTO tabStockLedger 
    (item_code, warehouse, bin_location, qty, reserved_qty, qty_before, qty_reduced, ...)
  VALUES (?, ?, ?, ?, ?, ?, ?, ...)
  ON DUPLICATE KEY UPDATE
    qty = ?,
    qty_before = ?,
    qty_reduced = ?,
    ...
`, [itemCode, warehouse, sourceBin, newQty, ...]);
```

**✅ This correctly reduces stock at bin level IF `sourceBin` is found from events.**

---

## Problem Analysis

### Issue 1: `source_bin` Not Provided During Picking

**If `source_bin` is NULL or missing in the request:**
- Stock reduction might happen but `bin_location` will be NULL
- Item Location Breakdown won't show the reduction (only shows bins with `bin_location IS NOT NULL`)

**Solution:** Ensure mobile app always sends `source_bin` when picking items.

### Issue 2: `source_bin` Not Found During Dispatch

**If `source_bin` is not found in packing events:**
- Code tries to find it from `source_bin`, `location_id`, `rack`, or `bin` columns
- If none found, stock reduction is skipped (line 1109-1113)

**Solution:** Ensure packing events include `source_bin` or `location_id`.

---

## Verification Steps

### Step 1: Check if `source_bin` is being sent

**Test Picking API:**
```bash
POST /api/material-requests/MR-123457/pick-items
Authorization: Bearer <token>
Content-Type: application/json

{
  "items": [
    {
      "item_code": "SKU-JACKET-201-BLK-L",
      "picked_qty": 2.00,
      "source_bin": "A1-R01-L3-B1",  // ← Make sure this is included
      "warehouse": "WH-MAIN"
    }
  ]
}
```

### Step 2: Check Database After Picking

```sql
-- Check stock ledger for the item at the bin
SELECT 
  item_code,
  warehouse,
  bin_location,
  qty,
  qty_before,
  qty_reduced,
  last_transaction_type,
  last_transaction_ref
FROM tabStockLedger
WHERE item_code = 'SKU-JACKET-201-BLK-L'
  AND warehouse = 'WH-MAIN'
  AND bin_location = 'A1-R01-L3-B1'
ORDER BY last_transaction_date DESC;
```

**Expected:**
- `qty` should be reduced (e.g., 150 → 148)
- `qty_reduced` should be negative (e.g., -2.00)
- `last_transaction_type` should be 'Picking'
- `bin_location` should NOT be NULL

### Step 3: Check Item Location Breakdown

After picking, open Item Location Breakdown for the item:
- Bin `A1-R01-L3-B1` should show reduced quantity (e.g., 148.00 instead of 150.00)
- Total should match the reduced stock

---

## API Endpoints Summary

### 1. **POST /api/material-requests/:title/pick-items**

**Purpose:** Pick items for Material Request (reduces stock at bin level)

**Required Fields:**
- `items[].item_code` - Item code
- `items[].picked_qty` - Quantity to pick
- `items[].source_bin` - **CRITICAL: Bin location where item is picked from**
- `items[].warehouse` - Warehouse (optional, defaults to MR's from_warehouse)

**Stock Reduction:**
- ✅ Reduces `tabStockLedger.qty` at `bin_location = source_bin`
- ✅ Updates `tabCartonStock` if `carton_id` provided
- ✅ Updates `tabItem.stock_qty` (aggregated)

---

### 2. **POST /api/transfer-cartons/dispatch**

**Purpose:** Dispatch transfer carton (reduces stock at bin level for Material Requests)

**Required Fields:**
- `tc_id` - Transfer carton ID
- `dispatched_by` - User ID

**Stock Reduction:**
- ✅ Gets items from `tabWmsScanEvent` (PACK_BOX_TO_TC, PACK_ITEM_TO_TC)
- ✅ Gets `source_bin` from events (`source_bin`, `location_id`, `rack`, or `bin`)
- ✅ Reduces `tabStockLedger.qty` at `bin_location = sourceBin`
- ✅ Updates `tabItem.stock_qty` (aggregated)

**Note:** Stock reduction only happens if `source_bin` is found in packing events.

---

## Fix Required

### Ensure `source_bin` is Always Provided

**Mobile App Changes:**
1. When picking items, always include `source_bin` in the request
2. When packing items, include `source_bin` or `location_id` in packing events

**Backend Verification:**
1. Add validation to ensure `source_bin` is provided
2. Add logging to track when `source_bin` is missing
3. Return clear error if `source_bin` is missing

---

## Testing

### Test 1: Pick Items with `source_bin`

```bash
POST /api/material-requests/MR-123457/pick-items
{
  "items": [
    {
      "item_code": "SKU-JACKET-201-BLK-L",
      "picked_qty": 2.00,
      "source_bin": "A1-R01-L3-B1",
      "warehouse": "WH-MAIN"
    }
  ]
}
```

**Expected Result:**
- ✅ Stock reduced in `tabStockLedger` at bin `A1-R01-L3-B1`
- ✅ Item Location Breakdown shows updated quantity

### Test 2: Dispatch Transfer Carton

```bash
POST /api/transfer-cartons/dispatch
{
  "tc_id": "TC-MR-123457-1768306175846",
  "dispatched_by": "USER-001"
}
```

**Expected Result:**
- ✅ Stock reduced in `tabStockLedger` at source bins
- ✅ Item Location Breakdown shows updated quantities

---

**Status:** ⚠️ **VERIFICATION NEEDED**  
**Date:** 2026-01-13

**Next Steps:**
1. Verify mobile app sends `source_bin` when picking
2. Verify packing events include `source_bin` or `location_id`
3. Test stock reduction and check Item Location Breakdown
