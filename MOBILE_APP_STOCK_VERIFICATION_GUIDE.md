# Mobile App Stock Verification Guide

## 🔍 Issue

Stock quantity is still incorrect. This guide helps verify stock from the mobile app and identify where the problem occurs.

---

## 📱 APIs for Stock Verification

### 1. **Check Item Stock at Warehouse Level**

**Endpoint:** `GET /api/stock/item/:item_code/warehouse/:warehouse`

**Purpose:** Get total stock quantity for an item in a warehouse (sum of all bins)

**Request:**
```http
GET /api/stock/item/SKU-HAT-301-BLU-OS/warehouse/WH-MAIN
Authorization: Bearer <token>
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "item_code": "SKU-HAT-301-BLU-OS",
    "warehouse": "WH-MAIN",
    "total_qty": 98.00,
    "bin_breakdown": [
      {
        "bin_location": "A1-R01-L3-B1",
        "qty": 98.00,
        "carton_id": "CTN-555444"
      }
    ]
  }
}
```

**When to Use:**
- Before picking: Verify available stock
- After picking: Verify stock was reduced correctly
- After dispatch: Verify stock is still correct (should not change)

---

### 2. **Check Stock Ledger by Location**

**Endpoint:** `GET /api/stock-ledger/ledger?bin_location=:bin_location&item_code=:item_code&warehouse=:warehouse`

**Purpose:** Get stock quantity for an item at a specific bin location

**Request:**
```http
GET /api/stock-ledger/ledger?bin_location=A1-R01-L3-B1&item_code=SKU-HAT-301-BLU-OS&warehouse=WH-MAIN
Authorization: Bearer <token>
```

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "warehouse": "WH-MAIN",
      "bin_location": "A1-R01-L3-B1",
      "qty": 98.00,
      "carton_id": "CTN-555444",
      "qty_before": 100.00,
      "qty_reduced": -2.00,
      "last_transaction_type": "Picking",
      "last_transaction_ref": "MR-123461"
    }
  ]
}
```

**When to Use:**
- Verify stock at specific bin location
- Check transaction history
- Debug stock discrepancies

---

### 3. **Check Carton Stock**

**Endpoint:** `GET /api/stock-ledger/ledger?carton_id=:carton_id&item_code=:item_code&warehouse=:warehouse`

**Purpose:** Get stock quantity for an item in a specific carton

**Request:**
```http
GET /api/stock-ledger/ledger?carton_id=CTN-555444&item_code=SKU-HAT-301-BLU-OS&warehouse=WH-MAIN
Authorization: Bearer <token>
```

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "warehouse": "WH-MAIN",
      "bin_location": "A1-R01-L3-B1",
      "carton_id": "CTN-555444",
      "qty": 98.00
    }
  ]
}
```

**When to Use:**
- Verify stock in a specific carton
- Check if carton stock matches bin stock
- Debug carton-level discrepancies

---

## 🧪 Testing Workflow

### Step 1: Before Picking - Check Initial Stock

**API Call:**
```http
GET /api/stock/item/SKU-HAT-301-BLU-OS/warehouse/WH-MAIN
```

**Expected:** Should show current stock (e.g., 100.00)

**Verify:**
- `total_qty` matches expected stock
- `bin_breakdown` shows correct bin locations
- `carton_id` is correct if applicable

---

### Step 2: Pick Items

**API Call:**
```http
POST /api/material-requests/MR-123461/pick-items
Content-Type: application/json
Authorization: Bearer <token>

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

**Response:**
```json
{
  "ok": true,
  "message": "Material Request items picked successfully",
  "data": {
    "material_request": "MR-123461",
    "status": "In Progress",
    "total_picked_qty": 2,
    "items_picked": 1,
    "carton_stock_updated": true,
    "stock_updates": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "carton_id": "CTN-555444",
        "source_bin": "A1-R01-L3-B1",
        "qty_reduced": 2,
        "qty_before": 100,
        "qty_after": 98,
        "carton_stock_updated": true
      }
    ]
  }
}
```

**Verify:**
- `qty_before` = 100 (initial stock)
- `qty_after` = 98 (reduced by 2)
- `carton_stock_updated` = true

---

### Step 3: After Picking - Verify Stock Reduced

**API Call:**
```http
GET /api/stock/item/SKU-HAT-301-BLU-OS/warehouse/WH-MAIN
```

**Expected:** Should show 98.00 (reduced from 100)

**Verify:**
- `total_qty` = 98.00
- `bin_breakdown[0].qty` = 98.00
- Matches `qty_after` from pick-items response

---

### Step 4: Check Bin-Level Stock

**API Call:**
```http
GET /api/stock-ledger/ledger?bin_location=A1-R01-L3-B1&item_code=SKU-HAT-301-BLU-OS&warehouse=WH-MAIN
```

**Expected:** Should show 98.00 at this bin

**Verify:**
- `qty` = 98.00
- `qty_before` = 100.00
- `qty_reduced` = -2.00
- `last_transaction_type` = "Picking"
- `last_transaction_ref` = "MR-123461"

---

### Step 5: Check Carton Stock

**API Call:**
```http
GET /api/stock-ledger/ledger?carton_id=CTN-555444&item_code=SKU-HAT-301-BLU-OS&warehouse=WH-MAIN
```

**Expected:** Should show 98.00 in this carton

**Verify:**
- `qty` = 98.00
- `bin_location` = "A1-R01-L3-B1"
- Matches bin-level stock

---

### Step 6: After Dispatch - Verify Stock NOT Reduced Again

**API Call:**
```http
POST /api/transfer-cartons/dispatch
Content-Type: application/json
Authorization: Bearer <token>

{
  "tc_id": "TC-MR-123461-...",
  "dispatched_by": "USER-150526"
}
```

**Then Check Stock:**
```http
GET /api/stock/item/SKU-HAT-301-BLU-OS/warehouse/WH-MAIN
```

**Expected:** Should still show 98.00 (NOT reduced again)

**Verify:**
- `total_qty` = 98.00 (same as before dispatch)
- Stock was NOT reduced during dispatch

---

## 🐛 Troubleshooting

### Issue 1: Stock Shows 198 Instead of 98

**Possible Causes:**
1. Duplicate records in `tabCartonStock`
2. Item Location Breakdown summing duplicates
3. Stock not properly updated during picking

**Fix:**
1. Run: `SCRIPTS/FixDuplicateCartonStockRecords.sql`
2. Run: `SCRIPTS/CheckDuplicateStockRecords.sql`
3. Verify stock via API: `GET /api/stock/item/:item_code/warehouse/:warehouse`

---

### Issue 2: Stock Not Reduced After Picking

**Check:**
1. Verify `carton_id` is sent in pick-items request
2. Verify `source_bin` is sent in pick-items request
3. Check API response for `carton_stock_updated: true`
4. Check API response for `qty_after` value

**Fix:**
- Ensure mobile app sends `carton_id` and `source_bin` for each item
- Verify API response shows stock was updated

---

### Issue 3: Stock Reduced Twice (After Dispatch)

**Check:**
1. Verify stock before dispatch
2. Verify stock after dispatch
3. Stock should NOT change during dispatch

**Fix:**
- This is already fixed in the API (dispatch no longer reduces stock for Material Requests)
- If still happening, check if transfer carton is a Material Request

---

## 📋 Mobile App Checklist

**Before Picking:**
- [ ] Check initial stock: `GET /api/stock/item/:item_code/warehouse/:warehouse`
- [ ] Verify stock is sufficient for picking

**During Picking:**
- [ ] Send `carton_id` for each item
- [ ] Send `source_bin` for each item
- [ ] Send `warehouse` in request body
- [ ] Send `user_id` or `created_by` in request body

**After Picking:**
- [ ] Check stock again: `GET /api/stock/item/:item_code/warehouse/:warehouse`
- [ ] Verify `qty_after` matches API response
- [ ] Verify stock was reduced correctly

**After Dispatch:**
- [ ] Check stock again: `GET /api/stock/item/:item_code/warehouse/:warehouse`
- [ ] Verify stock did NOT change (same as after picking)

---

## 🔗 API Endpoints Summary

| Purpose | Endpoint | Method |
|---------|----------|--------|
| **Check total stock** | `/api/stock/item/:item_code/warehouse/:warehouse` | GET |
| **Check bin-level stock** | `/api/stock-ledger/ledger?bin_location=:bin&item_code=:item&warehouse=:wh` | GET |
| **Check carton stock** | `/api/stock-ledger/ledger?carton_id=:carton&item_code=:item&warehouse=:wh` | GET |
| **Pick items** | `/api/material-requests/:title/pick-items` | POST |
| **Dispatch carton** | `/api/transfer-cartons/dispatch` | POST |

---

**Status:** ✅ **VERIFICATION GUIDE**  
**Date:** 2026-01-13
