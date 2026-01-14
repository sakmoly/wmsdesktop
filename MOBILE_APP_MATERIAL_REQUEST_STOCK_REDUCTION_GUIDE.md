# Mobile App Material Request Stock Reduction - Complete Guide

## 🎯 Overview

When picking items for a Material Request, stock must be reduced at **bin level** (not just item level). This guide provides exact steps and API URLs.

---

## 📋 Complete Workflow

### Step 1: Start Picking (Update Status to "In Progress")

**API:** `POST /api/material-requests/:title/update-status`

**URL:** `POST http://YOUR_API_BASE_URL/api/material-requests/MR-123457/update-status`

**Request:**
```json
{
  "status": "In Progress"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Material Request status updated successfully"
}
```

**When to Call:**
- User clicks "Start Picking" button
- Before allowing user to scan items

---

### Step 2: Pick Items (REDUCE STOCK AT BIN LEVEL)

**API:** `POST /api/material-requests/:title/pick-items`

**URL:** `POST http://YOUR_API_BASE_URL/api/material-requests/MR-123457/pick-items`

**Request:**
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

**CRITICAL FIELDS:**
- ✅ `source_bin` - **REQUIRED**: Bin location (location_id) where item is picked from
- ✅ `picked_qty` - Quantity to pick (positive number)
- ✅ `item_code` - Item code
- ✅ `warehouse` - Warehouse code (optional, defaults to MR's from_warehouse)

**What This API Does:**
1. ✅ Updates `tabMaterialRequestItem.picked_qty`
2. ✅ **Reduces stock from `tabStockLedger` at bin level** (`bin_location = source_bin`)
3. ✅ Updates `tabItem.stock_qty` (aggregated total)
4. ✅ Creates transaction log in `tabStockTransaction`

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

**Error (Missing source_bin):**
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

**When to Call:**
- After user scans an item
- After user scans a bin location
- When user confirms picking quantity
- Can be called multiple times (incremental picking)

**Mobile App Flow:**
```javascript
// 1. User scans item barcode
const itemCode = scannedBarcode; // e.g., "SKU-JACKET-201-BLK-L"

// 2. User scans bin location barcode
const binLocation = scannedBinLocation; // e.g., "A1-R01-L3-B1"

// 3. User enters quantity
const pickedQty = enteredQuantity; // e.g., 2.00

// 4. Call API to pick item
const response = await fetch(`${API_BASE_URL}/api/material-requests/${materialRequest}/pick-items`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    items: [{
      item_code: itemCode,
      picked_qty: pickedQty,
      source_bin: binLocation, // ← CRITICAL: Must include bin location
      warehouse: 'WH-MAIN'
    }]
  })
});
```

---

### Step 3: Complete Picking (Update Status to "Picked")

**API:** `POST /api/material-requests/:title/update-status`

**URL:** `POST http://YOUR_API_BASE_URL/api/material-requests/MR-123457/update-status`

**Request:**
```json
{
  "status": "Picked"
}
```

**Validation:**
- ✅ Only allowed if ALL items are fully picked
- ✅ Returns error if some items are not fully picked

**When to Call:**
- After user completes picking all items
- User clicks "Complete Picking" button

---

### Step 4: Create Transfer Carton

**API:** `POST /api/transfer-cartons/create`

**URL:** `POST http://YOUR_API_BASE_URL/api/transfer-cartons/create`

**Request:**
```json
{
  "tc_id": "TC-MR-123457-1768306175846",
  "asn_no": null,
  "to_no": "MR-123457",
  "store": "STORE-002",
  "user_id": "USER-150526",
  "material_request": "MR-123457"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Transfer carton created successfully",
  "data": {
    "tc_id": "TC-MR-123457-1768306175846",
    "status": "Created"
  }
}
```

**When to Call:**
- After status is "Picked"
- User clicks "Create Transfer Carton" button
- Before packing items

**Note:** This does NOT reduce stock. Stock is already reduced during picking (Step 2).

---

### Step 5: Pack Items to Transfer Carton

**API:** `POST /api/events/batch`

**URL:** `POST http://YOUR_API_BASE_URL/api/events/batch`

**Request:**
```json
{
  "events": [
    {
      "event_type": "PACK_ITEM_TO_TC",
      "tc_id": "TC-MR-123457-1768306175846",
      "item_code": "SKU-JACKET-201-BLK-L",
      "qty": 2.00,
      "source_bin": "A1-R01-L3-B1",
      "location_id": "A1-R01-L3-B1",
      "warehouse": "WH-MAIN",
      "user_id": "USER-150526"
    }
  ]
}
```

**CRITICAL FIELDS:**
- ✅ `source_bin` or `location_id` - **REQUIRED**: Bin location where item was picked from
- ✅ `tc_id` - Transfer carton ID
- ✅ `item_code` - Item code
- ✅ `qty` - Quantity packed

**When to Call:**
- When user packs items into transfer carton
- After scanning item and confirming quantity

**Note:** This does NOT reduce stock again. Stock was already reduced during picking (Step 2).

---

### Step 6: Seal Transfer Carton

**API:** `POST /api/transfer-cartons/:tc_id/seal`

**URL:** `POST http://YOUR_API_BASE_URL/api/transfer-cartons/TC-MR-123457-1768306175846/seal`

**Request:**
```json
{
  "sealed_by": "USER-150526"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Transfer carton sealed successfully"
}
```

**When to Call:**
- After all items are packed
- User clicks "Seal Transfer Carton" button

**Note:** This does NOT reduce stock. Stock was already reduced during picking (Step 2).

---

### Step 7: Dispatch Transfer Carton (OPTIONAL - Additional Stock Reduction)

**API:** `POST /api/transfer-cartons/dispatch`

**URL:** `POST http://YOUR_API_BASE_URL/api/transfer-cartons/dispatch`

**Request:**
```json
{
  "tc_id": "TC-MR-123457-1768306175846",
  "dispatched_by": "USER-150526"
}
```

**What This API Does:**
- ✅ Gets items from transfer carton (from packing events)
- ✅ Gets `source_bin` from packing events
- ✅ **Reduces stock from `tabStockLedger` at bin level** (if `source_bin` found)
- ✅ Updates `tabItem.stock_qty` (aggregated total)

**When to Call:**
- When transfer carton is physically dispatched/sent out
- This is an ADDITIONAL stock reduction (stock was already reduced during picking)

**Note:** If `source_bin` is not found in packing events, stock reduction is skipped (warning logged).

---

## 🔍 Stock Reduction Summary

### When Stock is Reduced:

1. **During Picking (Step 2):** ✅ **PRIMARY REDUCTION**
   - API: `POST /api/material-requests/:title/pick-items`
   - Reduces stock at bin level (`bin_location = source_bin`)
   - Updates `tabStockLedger` and `tabItem.stock_qty`

2. **During Dispatch (Step 7):** ⚠️ **ADDITIONAL REDUCTION** (if source_bin found)
   - API: `POST /api/transfer-cartons/dispatch`
   - Reduces stock at bin level (if `source_bin` found in packing events)
   - Updates `tabStockLedger` and `tabItem.stock_qty`

### Stock Reduction Logic:

**For Bin-Level Stock:**
```sql
-- Updates existing record (same bin_location)
UPDATE tabStockLedger 
SET qty = qty - picked_qty,
    qty_before = old_qty,
    qty_reduced = -picked_qty,
    last_transaction_type = 'Picking',
    last_transaction_ref = 'MR-123457'
WHERE item_code = 'SKU-JACKET-201-BLK-L'
  AND warehouse = 'WH-MAIN'
  AND bin_location = 'A1-R01-L3-B1';
```

**For Item-Level Stock:**
```sql
-- Updates aggregated total
UPDATE tabItem 
SET stock_qty = (SELECT SUM(qty) FROM tabStockLedger WHERE item_code = 'SKU-JACKET-201-BLK-L')
WHERE code = 'SKU-JACKET-201-BLK-L';
```

---

## ⚠️ Common Issues and Solutions

### Issue 1: Stock Not Reduced at Bin Level

**Problem:** Stock reduced at item level but not at bin level

**Cause:** `source_bin` not provided or is NULL

**Solution:**
- ✅ Always include `source_bin` in picking request
- ✅ Always include `source_bin` or `location_id` in packing events
- ✅ Validate `source_bin` is not empty before calling API

### Issue 2: Stock Ledger Replacing Previous Transaction

**Problem:** Stock ledger shows only latest transaction, not history

**Cause:** `tabStockLedger` has UNIQUE KEY on `(item_code, warehouse, bin_location)`, so it updates existing record

**Solution:**
- ✅ This is CORRECT behavior - `tabStockLedger` shows CURRENT stock at each bin
- ✅ Transaction history is in `tabStockTransaction` table
- ✅ To see history, query `tabStockTransaction` table

### Issue 3: Item Location Breakdown Not Updated

**Problem:** Item Location Breakdown shows old quantities

**Solution:**
- ✅ Click "Refresh" button in Item Location Breakdown
- ✅ Verify stock was reduced in database:
  ```sql
  SELECT * FROM tabStockLedger 
  WHERE item_code = 'SKU-JACKET-201-BLK-L' 
    AND bin_location = 'A1-R01-L3-B1';
  ```

---

## 📱 Mobile App Implementation Checklist

- [ ] Step 1: Call `POST /api/material-requests/:title/update-status` with status "In Progress"
- [ ] Step 2: For each item picked:
  - [ ] Scan item barcode → Get `item_code`
  - [ ] Scan bin location barcode → Get `source_bin` (location_id)
  - [ ] Enter quantity → Get `picked_qty`
  - [ ] Call `POST /api/material-requests/:title/pick-items` with `source_bin`
- [ ] Step 3: Call `POST /api/material-requests/:title/update-status` with status "Picked"
- [ ] Step 4: Call `POST /api/transfer-cartons/create` to create transfer carton
- [ ] Step 5: For each item packed:
  - [ ] Call `POST /api/events/batch` with `source_bin` or `location_id`
- [ ] Step 6: Call `POST /api/transfer-cartons/:tc_id/seal` to seal transfer carton
- [ ] Step 7: (Optional) Call `POST /api/transfer-cartons/dispatch` when dispatched

---

## 🔗 API Base URL

Replace `YOUR_API_BASE_URL` with your actual API server URL:
- Development: `http://localhost:3000`
- Production: `http://192.168.103.219:3000` (or your server IP)

---

**Status:** ✅ **COMPLETE GUIDE**  
**Date:** 2026-01-13
