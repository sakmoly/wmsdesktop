# Material Request Stock Reduction API

## Overview

When submitting a Material Request, stock must be reduced at **both** item level (`tabItem.stock_qty`) and **bin level** (`tabStockLedger` with `bin_location`).

---

## API Endpoints for Stock Reduction

### 1. **POST /api/material-requests/:title/pick-items**

**Purpose:** Pick items for Material Request (reduces stock at bin level)

**Endpoint:** `POST /api/material-requests/:title/pick-items`

**Authentication:** Required (Bearer Token)

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

**Required Fields:**
- `items` (array) - Array of items to pick
- `items[].item_code` (string) - Item code
- `items[].picked_qty` (number) - Quantity to pick (positive for picking, negative for decreasing)
- `items[].source_bin` (string) - **CRITICAL: Bin location (location_id) where item is picked from**
- `items[].warehouse` (string, optional) - Warehouse code (defaults to Material Request's `from_warehouse`)

**What it does:**
1. ✅ Updates `tabMaterialRequestItem.picked_qty`
2. ✅ **Reduces stock from `tabStockLedger` at bin level** (`bin_location = source_bin`)
3. ✅ Updates `tabCartonStock` if `carton_id` provided
4. ✅ Updates `tabItem.stock_qty` (aggregated total)
5. ✅ Creates stock transaction log entry

**Stock Reduction:**
- Reduces `tabStockLedger.qty` at `bin_location = source_bin`
- Updates `qty_before` and `qty_reduced` columns
- Sets `last_transaction_type = 'Picking'`
- Sets `last_transaction_ref = material_request_title`

**Response:**
```json
{
  "ok": true,
  "message": "Items picked successfully",
  "data": {
    "material_request": "MR-123457",
    "items_updated": 1,
    "total_picked_qty": 2.00
  }
}
```

**Error Response (Missing source_bin):**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "source_bin is required for bin-level stock reduction. Item: SKU-JACKET-201-BLK-L",
    "details": {
      "item_code": "SKU-JACKET-201-BLK-L",
      "source_bin": null,
      "note": "Please provide the bin location (location_id) where the item is being picked from"
    }
  }
}
```

---

### 2. **POST /api/transfer-cartons/dispatch**

**Purpose:** Dispatch transfer carton (reduces stock at bin level for Material Requests)

**Endpoint:** `POST /api/transfer-cartons/dispatch`

**Authentication:** Required (Bearer Token)

**Request Body:**
```json
{
  "tc_id": "TC-MR-123457-1768306175846",
  "dispatched_by": "USER-001"
}
```

**Required Fields:**
- `tc_id` (string) - Transfer carton ID
- `dispatched_by` (string) - User ID who dispatched

**What it does:**
1. ✅ Validates transfer carton is "Sealed"
2. ✅ Gets items from transfer carton (from `tabWmsScanEvent`)
3. ✅ Gets `source_bin` from packing events (`source_bin`, `location_id`, `rack`, or `bin`)
4. ✅ **Reduces stock from `tabStockLedger` at bin level** (`bin_location = sourceBin`)
5. ✅ Updates `tabItem.stock_qty` (aggregated total)
6. ✅ Creates stock transaction log entry
7. ✅ Updates transfer carton status to "Dispatched"

**Stock Reduction:**
- Reduces `tabStockLedger.qty` at `bin_location = sourceBin`
- Updates `qty_before` and `qty_reduced` columns
- Sets `last_transaction_type = 'Dispatch'`
- Sets `last_transaction_ref = tc_id`

**Response:**
```json
{
  "ok": true,
  "message": "Transfer carton dispatched successfully"
}
```

**Note:** Stock reduction only happens if `source_bin` is found in packing events. If not found, a warning is logged but dispatch continues.

---

## Critical Requirements

### 1. **`source_bin` Must Always Be Provided**

**For Picking API:**
- ✅ `source_bin` is now **required** (validation added)
- ✅ Must be a valid `location_id` (e.g., "A1-R01-L3-B1")
- ✅ Error returned if missing

**For Dispatch API:**
- ✅ Tries to find `source_bin` from packing events
- ✅ Priority: `source_bin` > `location_id` > `rack` + `bin` > `rack` > `bin`
- ⚠️ If not found, stock reduction is skipped (warning logged)

### 2. **Mobile App Must Send `source_bin`**

**When Picking Items:**
```javascript
// Mobile app must include source_bin when picking
const pickItems = async (materialRequest, items) => {
  const response = await fetch(`${API_BASE_URL}/api/material-requests/${materialRequest}/pick-items`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      items: items.map(item => ({
        item_code: item.code,
        picked_qty: item.qty,
        source_bin: item.location_id, // ← CRITICAL: Must include location_id
        warehouse: item.warehouse
      }))
    })
  });
};
```

**When Packing Items:**
```javascript
// Mobile app must include source_bin in packing events
const packItem = async (item, tcId, locationId) => {
  await fetch(`${API_BASE_URL}/api/events/batch`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      events: [{
        event_type: 'PACK_ITEM_TO_TC',
        tc_id: tcId,
        item_code: item.code,
        qty: item.qty,
        source_bin: locationId, // ← CRITICAL: Must include source_bin
        location_id: locationId, // ← Alternative: location_id
        warehouse: item.warehouse
      }]
    })
  });
};
```

---

## Verification

### Check Stock Reduction in Database

```sql
-- Check stock ledger for item at specific bin
SELECT 
  item_code,
  warehouse,
  bin_location,
  qty,
  qty_before,
  qty_reduced,
  last_transaction_type,
  last_transaction_ref,
  last_transaction_date
FROM tabStockLedger
WHERE item_code = 'SKU-JACKET-201-BLK-L'
  AND warehouse = 'WH-MAIN'
  AND bin_location = 'A1-R01-L3-B1'
ORDER BY last_transaction_date DESC;
```

**Expected After Picking:**
- `qty` should be reduced (e.g., 150.00 → 148.00)
- `qty_reduced` should be negative (e.g., -2.00)
- `qty_before` should show previous quantity (e.g., 150.00)
- `last_transaction_type` should be 'Picking'
- `last_transaction_ref` should be Material Request title (e.g., 'MR-123457')
- `bin_location` should NOT be NULL

**Expected After Dispatch:**
- `qty` should be further reduced (e.g., 148.00 → 146.00)
- `qty_reduced` should be negative (e.g., -2.00)
- `last_transaction_type` should be 'Dispatch'
- `last_transaction_ref` should be Transfer Carton ID (e.g., 'TC-MR-123457-...')

---

## Item Location Breakdown

After stock reduction, the Item Location Breakdown should show:
- ✅ Reduced quantity at the specific bin (e.g., 148.00 instead of 150.00)
- ✅ Total quantity matches the reduced stock
- ✅ All bins with stock are displayed

**If quantities don't match:**
1. Check if `source_bin` was provided in the request
2. Check database to verify stock was reduced at bin level
3. Click "Refresh" button in Item Location Breakdown to reload data

---

**Status:** ✅ **IMPLEMENTED** (with validation)  
**Date:** 2026-01-13
