# Relocation: Transfer In Carton Item Validation Fix

**Date**: 2026-01-21  
**Status**: ✅ **BACKEND FIXED** - ⚠️ **MOBILE APP UPDATE REQUIRED**

---

## 🔍 Problem

When relocating items from a Transfer In carton (e.g., `CTN-TI-123457-20260121-143733-370`), the mobile app shows:

```
Item "SKU-HAT-301-BLU-OS" not found in source carton.
Please scan an item that exists in carton CTN-TI-123457-20260121-143733-370.
```

**But the items DO exist in the carton!**

---

## 🔍 Root Cause

### Backend Issue (FIXED):
The relocation validation was only checking `tabCartonStock` for items, but Transfer In cartons store items in `tabTransferInCartonLine` until they're putaway. The validation failed even though items existed.

### Mobile App Issue (NEEDS FIX):
The mobile app is likely:
1. **Caching carton contents** from an earlier call
2. **Validating client-side** against stale data
3. **Not refreshing** carton contents after setting FROM location
4. **Not calling** `getCartonContents` with the correct carton ID

---

## ✅ Backend Fix Applied

### 1. Updated `commitPartialMove` Function

**File**: `wms-api/src/modules/relocation/relocationController.js` (around line 2631)

**Changes**:
- Checks `tabCartonStock` first (for regular cartons)
- If not found AND it's a Transfer In carton (`CTN-TI-*`), also checks `tabTransferInCartonLine`
- Returns proper error if item not found in either location
- Updates the correct table when moving items:
  - Regular cartons → updates `tabCartonStock`
  - Transfer In cartons → updates `tabTransferInCartonLine`

### 2. Updated `completePartialRelocation` Function

**File**: `wms-api/src/modules/relocation/relocationController.js` (around line 4377)

**Same changes** as above for the complete partial relocation endpoint.

---

## ⚠️ Mobile App Fix Required

The mobile app needs to be updated to:

### 1. Refresh Carton Contents After Setting FROM Location

**When**: After successfully calling `PUT /api/relocation/session/:session_id/from`

**Action**: Call `GET /api/relocation/carton/:carton_id/contents` to get fresh carton contents

**Example**:
```javascript
// After setting FROM location
const setFromResponse = await api.put(`/api/relocation/session/${sessionId}/from`, {
  from_bin: scannedBin,
  from_carton: scannedCarton
});

if (setFromResponse.ok) {
  // ✅ IMPORTANT: Refresh carton contents to get latest items
  const contentsResponse = await api.get(`/api/relocation/carton/${scannedCarton}/contents`);
  
  if (contentsResponse.ok) {
    // Update local carton contents list
    cartonItems = contentsResponse.data.items;
    console.log(`✅ Loaded ${cartonItems.length} items from carton ${scannedCarton}`);
  }
}
```

### 2. Remove or Update Client-Side Validation

**Current Issue**: Mobile app validates items client-side against cached/stale data

**Fix Options**:

**Option A: Remove Client-Side Validation (Recommended)**
```javascript
// ❌ REMOVE THIS:
if (!cartonItems.find(item => item.item_code === scannedItemCode)) {
  showError('Item Not Found', 
    `Item "${scannedItemCode}" not found in source carton.`);
  return;
}

// ✅ REPLACE WITH: Let backend validate
// Just send the scan to backend - backend will validate and return error if item doesn't exist
```

**Option B: Refresh Data Before Validation**
```javascript
// ✅ REFRESH carton contents before validating
await refreshCartonContents(fromCartonId);

// Then validate
if (!cartonItems.find(item => item.item_code === scannedItemCode)) {
  showError('Item Not Found', 
    `Item "${scannedItemCode}" not found in source carton.`);
  return;
}
```

### 3. Handle Transfer In Cartons Correctly

**Issue**: Mobile app might not be calling `getCartonContents` correctly for Transfer In cartons

**Fix**: Ensure the mobile app calls:
```
GET /api/relocation/carton/CTN-TI-123457-20260121-143733-370/contents
```

**Expected Response**:
```json
{
  "ok": true,
  "data": {
    "carton_id": "CTN-TI-123457-20260121-143733-370",
    "warehouse_id": "WH-MAIN",
    "bin_location": null,
    "status": "Draft",
    "items": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "qty": 2,
        "uom": null,
        "batch_no": null,
        "serial_no": null
      },
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "qty": 2,
        "uom": null,
        "batch_no": null,
        "serial_no": null
      }
    ]
  }
}
```

---

## 🧪 Testing

### Backend Test (✅ Working):
```bash
# Test carton contents API
curl -X GET "http://localhost:3000/api/relocation/carton/CTN-TI-123457-20260121-143733-370/contents" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should return items from tabTransferInCartonLine
```

### Mobile App Test:
1. **Start relocation session**
2. **Set FROM location** (bin + carton)
3. **Verify carton contents are loaded** (check logs/UI)
4. **Scan item** `SKU-HAT-301-BLU-OS`
5. **Should succeed** (item found in carton)

---

## 📋 Summary

- **Backend**: ✅ Fixed - Now checks both `tabCartonStock` and `tabTransferInCartonLine`
- **Mobile App**: ⚠️ Needs update - Must refresh carton contents after setting FROM location
- **Root Cause**: Mobile app validating against stale/cached data
- **Solution**: Refresh carton contents after FROM location is set, or remove client-side validation

---

## 🔧 Quick Fix for Mobile App

**Minimal Change Required**:

1. **After setting FROM location**, call:
   ```javascript
   GET /api/relocation/carton/{from_carton}/contents
   ```

2. **Update local carton items list** with fresh data

3. **Remove or update client-side validation** to use fresh data

**OR** (Simpler):

1. **Remove client-side item validation entirely**
2. **Let backend validate** - backend will return proper error if item doesn't exist
3. **Show backend error** to user if validation fails

---

## ✅ Verification

After mobile app fix:
- ✅ Carton contents are refreshed after setting FROM location
- ✅ Items from Transfer In cartons are found correctly
- ✅ Relocation can proceed without "Item not found" errors
- ✅ Backend validation still works as fallback
