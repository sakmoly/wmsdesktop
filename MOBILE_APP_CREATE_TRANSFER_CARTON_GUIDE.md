# Mobile App - Create Transfer Carton Guide

## 🐛 Error

**Error Message:**
```
Error creating Transfer Carton: Error: Missing source_bin for item SKU-HAT-301-BLU-OS. 
Please ensure bin location is scanned during picking.
```

---

## ✅ Correct Workflow

### Step 1: Pick Items (source_bin REQUIRED here)

**API:** `POST /api/material-requests/:title/pick-items`

**Request:**
```json
{
  "warehouse": "WH-MAIN",
  "user_id": "USER-150526",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "picked_qty": 2,
      "source_bin": "A1-R01-L3-B1",  // ← REQUIRED here
      "carton_id": "CTN-555444"      // ← REQUIRED here
    }
  ]
}
```

**When to Call:** When user scans items during picking

---

### Step 2: Create Transfer Carton (source_bin NOT required)

**API:** `POST /api/transfer-cartons/create`

**Request:**
```json
{
  "tc_id": "TC-MR-123461-1768306175846",
  "asn_no": null,
  "to_no": "MR-123461",
  "store": "SHOWROOM-001",
  "user_id": "USER-150526",
  "material_request": "MR-123461"
}
```

**Note:** `source_bin` is **NOT required** when creating the transfer carton. The transfer carton is just a container - items are added later via packing events.

**When to Call:** After picking is complete, when user clicks "Create Transfer Carton"

---

### Step 3: Pack Items to Transfer Carton (source_bin REQUIRED here)

**Option A: Use Packing Events API**

**API:** `POST /api/events/batch`

**Request:**
```json
{
  "events": [
    {
      "event_type": "PACK_ITEM_TO_TC",
      "tc_id": "TC-MR-123461-1768306175846",
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 2,
      "carton_id": "CTN-555444",
      "source_bin": "A1-R01-L3-B1",  // ← REQUIRED here
      "user_id": "USER-150526"
    }
  ]
}
```

**Option B: Use Add Items API**

**API:** `POST /api/transfer-cartons/:tc_id/add-items`

**Request:**
```json
{
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 2,
      "carton_id": "CTN-555444",
      "source_bin": "A1-R01-L3-B1"  // ← REQUIRED here
    }
  ],
  "user_id": "USER-150526"
}
```

**When to Call:** When user packs items into the transfer carton

---

## 🔍 Why the Error Occurs

The mobile app is likely trying to validate `source_bin` when creating the transfer carton (Step 2), but `source_bin` is only needed when:
1. **Picking items** (Step 1) - to reduce stock from the correct bin
2. **Packing items** (Step 3) - to record where items came from

**The transfer carton creation (Step 2) is just creating an empty container** - it doesn't need `source_bin` because no items are being moved yet.

---

## ✅ Mobile App Fix

### Option 1: Remove source_bin Validation from Create Transfer Carton

**In Mobile App Code:**
- Remove any validation that requires `source_bin` when calling `POST /api/transfer-cartons/create`
- `source_bin` should only be validated when:
  - Picking items (`POST /api/material-requests/:title/pick-items`)
  - Packing items (`POST /api/events/batch` or `POST /api/transfer-cartons/:tc_id/add-items`)

### Option 2: Don't Send source_bin in Create Transfer Carton Request

**Current (Wrong):**
```json
{
  "tc_id": "TC-MR-123461-...",
  "to_no": "MR-123461",
  "store": "SHOWROOM-001",
  "user_id": "USER-150526",
  "items": [  // ← Don't send items here
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "source_bin": "A1-R01-L3-B1"  // ← Not needed
    }
  ]
}
```

**Correct:**
```json
{
  "tc_id": "TC-MR-123461-...",
  "to_no": "MR-123461",
  "store": "SHOWROOM-001",
  "user_id": "USER-150526"
  // ← No items needed - just create the container
}
```

---

## 📋 Complete Workflow

### 1. Pick Items
```http
POST /api/material-requests/MR-123461/pick-items
{
  "warehouse": "WH-MAIN",
  "user_id": "USER-150526",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "picked_qty": 2,
      "source_bin": "A1-R01-L3-B1",  // ← REQUIRED
      "carton_id": "CTN-555444"       // ← REQUIRED
    }
  ]
}
```

### 2. Create Transfer Carton
```http
POST /api/transfer-cartons/create
{
  "tc_id": "TC-MR-123461-1768306175846",
  "asn_no": null,
  "to_no": "MR-123461",
  "store": "SHOWROOM-001",
  "user_id": "USER-150526",
  "material_request": "MR-123461"
  // ← No items, no source_bin needed
}
```

### 3. Pack Items (Optional - if not already packed during picking)
```http
POST /api/events/batch
{
  "events": [
    {
      "event_type": "PACK_ITEM_TO_TC",
      "tc_id": "TC-MR-123461-1768306175846",
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 2,
      "carton_id": "CTN-555444",
      "source_bin": "A1-R01-L3-B1",  // ← REQUIRED
      "user_id": "USER-150526"
    }
  ]
}
```

**Note:** If items were already packed during picking (via packing events), Step 3 might not be needed.

---

## 🎯 Summary

**Error:** Mobile app requires `source_bin` when creating transfer carton

**Fix:** 
- ✅ Remove `source_bin` validation from create transfer carton step
- ✅ `source_bin` is only needed when picking items or packing items
- ✅ Transfer carton creation is just creating an empty container

**API Endpoints:**
- `POST /api/transfer-cartons/create` - Does NOT require `source_bin`
- `POST /api/material-requests/:title/pick-items` - Requires `source_bin`
- `POST /api/events/batch` - Requires `source_bin` (for packing events)
- `POST /api/transfer-cartons/:tc_id/add-items` - Requires `source_bin`

---

**Status:** 📱 **MOBILE APP FIX REQUIRED**  
**Date:** 2026-01-13
