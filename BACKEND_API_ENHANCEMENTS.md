# Backend API Enhancements

## 1. Enhanced POST /api/material-requests/{title}/pick-items

### Changes Applied

**Before:** The API was setting `picked_qty` to the provided value (absolute update).

**After:** The API now **always increments** `picked_qty` (adds to existing value).

### Implementation

```sql
-- Always increment (simpler approach)
UPDATE tabMaterialRequestItem 
SET picked_qty = picked_qty + ?,  -- Add to existing (incremental)
    scan_qty = picked_qty + ?,    -- Keep scan_qty = picked_qty
    status = ?,
    updated_at = NOW()
WHERE parent_title = ? AND item_code = ?;
```

### Key Features

1. ✅ **Incremental Updates**: Always adds to existing `picked_qty`, never sets to absolute value
2. ✅ **Multiple Scans Support**: Handles multiple scans of the same item correctly
3. ✅ **scan_qty Tracking**: Sets `scan_qty = picked_qty` (if column exists)
4. ✅ **Validation**: Prevents picking more than requested quantity
5. ✅ **Status Updates**: Automatically updates item status (Pending → In Progress → Picked)

### Request Format

```json
POST /api/material-requests/MR-123459/pick-items

{
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "picked_qty": 1.0,  // This will be ADDED to existing picked_qty
      "source_bin": "A1-R02-L1-B2",
      "carton_id": "PAW-ASN365425473-1768138301111"
    }
  ],
  "warehouse": "WH-MAIN"
}
```

### Behavior

- **First scan:** `picked_qty: 0` → `picked_qty: 1` (adds 1)
- **Second scan:** `picked_qty: 1` → `picked_qty: 2` (adds 1)
- **Third scan:** `picked_qty: 2` → `picked_qty: 3` (adds 1)

### Response

```json
{
  "ok": true,
  "message": "Items picked successfully",
  "picked_count": 1
}
```

---

## 2. New POST /api/transfer-cartons/{tc_id}/add-items

### Endpoint Details

**URL:** `POST /api/transfer-cartons/{tc_id}/add-items`

**Purpose:** Add items to an existing Transfer Carton by creating `PACK_ITEM_TO_TC` events.

### Request Format

```json
{
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 2.0,
      "carton_id": "PAW-ASN365425473-1768138301111",
      "source_bin": "A1-R02-L1-B2"
    }
  ],
  "user_id": "USER-150526"
}
```

### Required Fields

- `items` - Array of items to add (required)
- `user_id` - User ID making the addition (required)
- `item_code` - Item code (required)
- `qty` - Quantity to add (required, must be > 0)
- `carton_id` - Source carton ID (optional, but required for carton-level inventory)
- `source_bin` - Source bin location (optional, but recommended for validation)

### Response

```json
{
  "ok": true,
  "message": "Items added to transfer carton successfully",
  "added_count": 1,
  "failed_count": 0,
  "total_count": 1,
  "added_items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 2.0,
      "carton_id": "PAW-ASN365425473-1768138301111"
    }
  ]
}
```

### Validation

1. ✅ **Transfer Carton Exists**: Validates `tc_id` exists
2. ✅ **Status Check**: Cannot add items if status is `Sealed`, `Dispatched`, or `Completed`
3. ✅ **Carton Validation**: Validates `carton_id` exists at `source_bin` (if carton-level inventory enabled)
4. ✅ **Required Fields**: Validates `item_code`, `qty`, and `user_id`

### How It Works

1. Creates `PACK_ITEM_TO_TC` events in `tabWmsScanEvent` table
2. Events are automatically included when querying Transfer Carton contents
3. Supports both bin-level and carton-level inventory modes
4. Dynamically handles optional columns (`material_request`, `source_bin`)

### Example Usage

```javascript
// Add items to transfer carton
const response = await fetch(`${API_URL}/api/transfer-cartons/${tcId}/add-items`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    items: [
      {
        item_code: 'SKU-HAT-301-BLU-OS',
        qty: 2.0,
        carton_id: 'PAW-ASN365425473-1768138301111',
        source_bin: 'A1-R02-L1-B2'
      }
    ],
    user_id: 'USER-150526'
  })
});
```

### Error Responses

**Transfer Carton Not Found:**
```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Transfer Carton TC-XXX not found"
  }
}
```

**Invalid Status:**
```json
{
  "ok": false,
  "error": {
    "code": "INVALID_STATUS",
    "message": "Cannot add items to Transfer Carton TC-XXX. Current status: Sealed"
  }
}
```

**Carton Validation Failed:**
```json
{
  "ok": true,
  "added_count": 0,
  "failed_count": 1,
  "errors": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "error": "Carton PAW-XXX not found in bin A1-R02-L1-B2 for item SKU-HAT-301-BLU-OS. Please verify the carton exists at this location."
    }
  ]
}
```

---

## Summary

### ✅ Changes Completed

1. **Enhanced pick-items endpoint:**
   - ✅ Always increments `picked_qty` (never sets to absolute value)
   - ✅ Sets `scan_qty = picked_qty` (if column exists)
   - ✅ Supports multiple scans of the same item
   - ✅ Maintains validation and status updates

2. **New add-items endpoint:**
   - ✅ `POST /api/transfer-cartons/{tc_id}/add-items`
   - ✅ Creates `PACK_ITEM_TO_TC` events
   - ✅ Validates transfer carton status
   - ✅ Validates carton existence (if carton-level mode)
   - ✅ Dynamically handles optional columns

### Testing

Both endpoints are ready for testing. The pick-items endpoint now correctly increments quantities, and the add-items endpoint allows adding items to existing transfer cartons.

---

**Status:** ✅ **COMPLETED**  
**Date:** 2026-01-12  
**Files Changed:**
- `wms-api/src/modules/material-request/materialRequestController.js`
- `wms-api/src/modules/transfer-cartons/transferCartonController.js`
- `wms-api/src/routes/transferCartonRoutes.js`
