# Transfer Carton Source Carton Fix

## Problem

In the Transfer Carton Details window, the "Source Carton" column was showing the original supplier CTN IDs (like `CTN-001`, `CTN-444`, `CTN-555`) instead of the actual box IDs created during sorting (like `BOX-STORE001-507086`, `BOX-STORE002-509599`, etc.).

### Example Issue:
- **ASN-AAA** received 3 cartons: `CTN-001`, `CTN-444`, `CTN-555`
- Items were sorted into boxes:
  - `STORE-001` → `BOX-STORE001-507086` (TC-1767007776234)
  - `STORE-002` → `BOX-STORE002-509599`
  - `STORE-003` → `BOX-STORE003-512516`
  - `WH-MAIN` → `BOX-WHMAIN-514364`
- **Transfer Carton Details** showed:
  - ❌ Source Carton: `CTN-001` (wrong - original supplier carton)
  - ✅ Should show: `BOX-STORE001-507086` (correct - actual box)

---

## Root Cause

The API was using `carton_id` from `PACK_BOX_TO_TC` events for the source carton, but:
- `carton_id` = Original supplier carton ID (e.g., `CTN-001`)
- `box_id` = Actual box ID created during sorting (e.g., `BOX-STORE001-507086`)

When items are packed from boxes into transfer cartons, the `box_id` field contains the correct source (the box), not the original supplier carton.

---

## Solution

Updated both the **API** and **C# Service** to use `box_id` as the source carton, with fallback to `carton_id` if `box_id` is not available.

### 1. ✅ Fixed API Endpoint

**File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

**Changes:**
- Added `box_id` to the SQL SELECT query
- Changed source carton logic to prefer `box_id` over `carton_id`

**Before:**
```javascript
SELECT 
  item_code,
  carton_id,  // ❌ Only selecting carton_id
  qty,
  user_id,
  event_time
FROM tabWmsScanEvent
WHERE tc_id = ?
  AND event_type = 'PACK_BOX_TO_TC'
  AND item_code IS NOT NULL

// Using carton_id
source_carton: event.carton_id || null,  // ❌ Wrong
```

**After:**
```javascript
SELECT 
  item_code,
  box_id,      // ✅ Added box_id
  carton_id,
  qty,
  user_id,
  event_time
FROM tabWmsScanEvent
WHERE tc_id = ?
  AND event_type = 'PACK_BOX_TO_TC'
  AND item_code IS NOT NULL

// Prefer box_id, fallback to carton_id
const sourceCarton = event.box_id || event.carton_id || null;  // ✅ Correct
source_carton: sourceCarton,
```

### 2. ✅ Fixed C# Service

**File:** `Services/TransferCartonService.cs`

**Changes:**
- Already selecting `box_id` in SQL query
- Updated logic to use `box_id` as source carton, with fallback to `carton_id`

**Before:**
```csharp
var key = (itemCode, cartonId);  // ❌ Using cartonId

itemDict[key] = new TransferCartonItem
{
    ItemCode = itemCode,
    SourceCartonId = cartonId,  // ❌ Wrong
    // ...
};
```

**After:**
```csharp
// Use box_id as source carton (the actual box), fallback to carton_id if box_id not available
var sourceCartonId = !string.IsNullOrEmpty(boxId) ? boxId : cartonId;  // ✅ Correct
var key = (itemCode, sourceCartonId);

itemDict[key] = new TransferCartonItem
{
    ItemCode = itemCode,
    SourceCartonId = sourceCartonId,  // ✅ Correct
    // ...
};
```

---

## How It Works Now

### Data Flow:

1. **Sorting Phase:**
   - Items sorted from supplier cartons (`CTN-001`, `CTN-444`, `CTN-555`) into boxes
   - `SORT_TO_BOX` events created with:
     - `carton_id` = Original supplier carton (e.g., `CTN-001`)
     - `box_id` = New box ID (e.g., `BOX-STORE001-507086`)

2. **Packing Phase:**
   - Boxes packed into transfer cartons
   - `PACK_BOX_TO_TC` events created with:
     - `box_id` = Box ID (e.g., `BOX-STORE001-507086`) ✅
     - `carton_id` = Original supplier carton (e.g., `CTN-001`) (for reference)
     - `tc_id` = Transfer carton ID (e.g., `TC-1767007776234`)

3. **Display Phase:**
   - Transfer Carton Details API queries `PACK_BOX_TO_TC` events
   - Uses `box_id` as source carton (the actual box)
   - Shows: `BOX-STORE001-507086` ✅

---

## Testing

### Test Case: ASN-AAA

**Setup:**
- ASN-AAA with 3 cartons: `CTN-001`, `CTN-444`, `CTN-555`
- Items sorted to boxes:
  - `BOX-STORE001-507086` → TC-1767007776234
  - `BOX-STORE002-509599` → TC-1767007802961
  - `BOX-STORE003-512516` → TC-1767007813349
  - `BOX-WHMAIN-514364` → TC-1767007841096

**Expected Result:**
- Transfer Carton Details should show:
  - Source Carton: `BOX-STORE001-507086` (not `CTN-001`)
  - Source Carton: `BOX-STORE002-509599` (not `CTN-444`)
  - Source Carton: `BOX-STORE003-512516` (not `CTN-555`)
  - Source Carton: `BOX-WHMAIN-514364` (not `CTN-001`)

**API Call:**
```http
GET /api/transfer-cartons/TC-1767007776234
```

**Expected Response:**
```json
{
  "ok": true,
  "data": {
    "tc_id": "TC-1767007776234",
    "status": "Sealed",
    "store": "STORE-001",
    "contents": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "source_carton": "BOX-STORE001-507086",  // ✅ Box ID, not CTN-001
        "qty": 25,
        "packed_by": "USER-837060",
        "packed_on": "2025-12-29T11:29:00.000Z"
      }
    ]
  }
}
```

---

## Files Modified

1. ✅ `wms-api/src/modules/transfer-cartons/transferCartonController.js`
   - Added `box_id` to SELECT query
   - Changed source carton logic to prefer `box_id`

2. ✅ `Services/TransferCartonService.cs`
   - Updated source carton logic to prefer `box_id`

---

## Summary

✅ **Fixed:** Transfer Carton Details now shows the correct box ID as source carton
✅ **Logic:** Prefers `box_id` (actual box) over `carton_id` (original supplier carton)
✅ **Fallback:** Uses `carton_id` if `box_id` is not available (for backward compatibility)

**Result:** Transfer Carton Details will now correctly display box IDs like `BOX-STORE001-507086` instead of original supplier carton IDs like `CTN-001`.

